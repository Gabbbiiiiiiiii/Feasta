import {createHash} from "node:crypto";
import type {Firestore, DocumentReference} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {
  decodeDocument, stable, type Json, type PlanningDocument,
} from "./contract.js";
import {applyPlanningCommand, type PlanningTransaction} from "./trusted-writer.js";
import {proveSubmittedSnapshots} from "./submission-proof.js";

type Input = Record<string, unknown> & {
  version: 1; requestId: string; action: string; expectedRevision: number | null;
};
export type MutationResult = {
  version: 1; revision: number; changed: boolean; migrationReviewRequired: boolean;
  removedIdentities: string[]; preservedIdentities: string[]; replayed: boolean;
};
const actionFields: Record<string, string[]> = {
  import: ["local"], add: ["entry"], update: ["entry"], remove: ["identity"], clear: [],
  schedule: ["schedule"], cleanup: ["submission", "snapshots"],
};
function argument(message = "Invalid Event List mutation."): never {
  throw new HttpsError("invalid-argument", message);
}
function conflict(reason: string, revision?: number): never {
  throw new HttpsError("aborted", "Your Event List changed. Reload before retrying.",
    {reason, ...(revision === undefined ? {} : {currentRevision: revision})});
}
function parse(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) argument();
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || typeof row.action !== "string" ||
      !Object.hasOwn(actionFields, row.action) || typeof row.requestId !== "string" ||
      /^[A-Za-z0-9_-]{16,128}$/.exec(row.requestId)?.[0] !== row.requestId) argument();
  const keys = ["version", "requestId", "action", "expectedRevision", ...actionFields[row.action]];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(k => !keys.includes(k))) {
    argument("Unexpected or missing mutation fields.");
  }
  if (row.action === "import" ? row.expectedRevision !== null :
    (!Number.isSafeInteger(row.expectedRevision) || Number(row.expectedRevision) < 0)) argument();
  try {
    if (Buffer.byteLength(JSON.stringify(row), "utf8") > 300000) argument("Request is too large.");
  } catch { argument(); }
  return row as Input;
}
function checked(value: unknown, uid: string): PlanningDocument {
  try { return decodeDocument(value, uid); } catch { return argument("Invalid planning data."); }
}
function base(uid: string): PlanningDocument {
  return checked({version: 1, ownerUid: uid, revision: 0, currency: "PHP", entries: [],
    schedule: null, migration: {version: 1, completed: true}}, uid);
}
/** Real Admin transaction boundary. No caller controls UID, owner, server revision,
 * receipt paths, or proof reads. Firestore callback retries have no external effects.
 */
export async function mutateAuthorizedEventList(
  firestore: Firestore, uid: string | null, value: unknown,
): Promise<MutationResult> {
  if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  if (/^[A-Za-z0-9_-]{1,128}$/.exec(uid)?.[0] !== uid || uid === "feasta_guest_device_v1") {
    throw new HttpsError("permission-denied", "Customer account is required.");
  }
  const input = parse(value);
  const fingerprint = createHash("sha256").update(stable(input as Json)).digest("hex");
  const listRef = firestore.collection("customerEventLists").doc(uid);
  const receiptRef = listRef.collection("operations").doc(input.requestId);
  return firestore.runTransaction(async transaction => {
    const [userSnapshot, listSnapshot, receipt] = await Promise.all([
      transaction.get(firestore.collection("users").doc(uid)),
      transaction.get(listRef), transaction.get(receiptRef),
    ]);
    const user = userSnapshot.data();
    if (!userSnapshot.exists || !user || user.role !== "customer" ||
        user.accountStatus !== "active" || user.isActive !== true || user.isBlocked !== false) {
      throw new HttpsError("permission-denied", "Active customer account is required.");
    }
    // Authorization is always fresh, including a successful request replay.
    if (receipt.exists) {
      const saved = receipt.data()!;
      if (saved.version !== 1 || saved.ownerUid !== uid || saved.fingerprint !== fingerprint ||
          !saved.result || !Number.isSafeInteger(saved.result.revision)) {
        throw new HttpsError("already-exists", "Request ID has already been used.");
      }
      return {...saved.result, replayed: true} as MutationResult;
    }
    const cloud = listSnapshot.exists ? checked(listSnapshot.data(), uid) : null;
    const adapter: PlanningTransaction = {
      readUser: async () => user,
      readList: async () => cloud,
      createList: (_, doc) => { transaction.create(listRef, doc); },
      replaceList: (_, doc) => { transaction.set(listRef, doc); },
    };
    let document: PlanningDocument;
    let cleanupReceipt: {reference: DocumentReference; data: Record<string, unknown>} | undefined;
    let migrationReviewRequired = false;
    const removedIdentities: string[] = [], preservedIdentities: string[] = [];
    if (input.action === "import") {
      const local = checked(input.local, uid);
      if (local.revision !== 0) argument("Import must use cloud revision zero.");
      const result = await applyPlanningCommand(uid, uid, {type: "initialize", local}, adapter);
      document = result.document;
      migrationReviewRequired = result.migrationReviewRequired;
    } else {
      if (!cloud) throw new HttpsError("failed-precondition", "Initialize your Event List first.");
      if (cloud.revision !== input.expectedRevision) conflict("STALE_REVISION", cloud.revision);
      if (cloud.revision >= Number.MAX_SAFE_INTEGER) {
        throw new HttpsError("failed-precondition", "Event List revision is exhausted.");
      }
      document = {...cloud, entries: [...cloud.entries], revision: cloud.revision + 1};
      if (input.action === "add" || input.action === "update") {
        const entry = checked({...base(uid), entries: [input.entry]}, uid).entries[0];
        const index = document.entries.findIndex(e => e.identity === entry.identity);
        if (input.action === "add") {
          if (index !== -1) conflict("IDENTITY_EXISTS", cloud.revision);
          if (document.entries.length >= 24) {
            throw new HttpsError("resource-exhausted", "Your Event List already has 24 entries.");
          }
          document.entries.unshift(entry);
        } else {
          if (index === -1) conflict("ENTRY_REMOVED", cloud.revision);
          document.entries[index] = entry;
        }
      } else if (input.action === "remove") {
        if (typeof input.identity !== "string" || input.identity.length > 500) argument();
        if (!document.entries.some(e => e.identity === input.identity)) {
          conflict("ENTRY_REMOVED", cloud.revision);
        }
        document.entries = document.entries.filter(e => e.identity !== input.identity);
        removedIdentities.push(input.identity);
      } else if (input.action === "clear") {
        removedIdentities.push(...document.entries.map(e => e.identity));
        document.entries = []; document.schedule = null;
      } else if (input.action === "schedule") {
        document.schedule = input.schedule as Json;
      } else if (input.action === "cleanup") {
        const snapshots = checked({...base(uid), entries: input.snapshots}, uid).entries;
        const bookingId = await proveSubmittedSnapshots(
          firestore, transaction, uid, input.submission, snapshots,
        );
        const cleanupReference = listRef.collection("submissionCleanups").doc(bookingId);
        const previousCleanup = await transaction.get(cleanupReference);
        const consumed = previousCleanup.exists ? previousCleanup.data()!.identities : [];
        if (!Array.isArray(consumed) || consumed.length > 4 ||
            !consumed.every(id => typeof id === "string") ||
            (previousCleanup.exists && (previousCleanup.data()!.version !== 1 ||
              previousCleanup.data()!.ownerUid !== uid))) {
          throw new HttpsError("failed-precondition", "Cleanup history requires review.");
        }
        const consumedIdentities = new Set<string>(consumed);
        const submitted = new Map(snapshots.map(e => [e.identity, e]));
        document.entries = document.entries.filter(entry => {
          const snapshot = submitted.get(entry.identity);
          if (!snapshot) return true;
          // Compare the entire entry, not only configuration: metadata edits survive too.
          if (consumedIdentities.has(entry.identity) || stable(entry) !== stable(snapshot)) {
            preservedIdentities.push(entry.identity); return true;
          }
          removedIdentities.push(entry.identity); return false;
        });
        snapshots.forEach(entry => consumedIdentities.add(entry.identity));
        if (consumedIdentities.size > 4) {
          throw new HttpsError("failed-precondition", "Cleanup history requires review.");
        }
        cleanupReceipt = {reference: cleanupReference,
          data: {version: 1, ownerUid: uid, identities: [...consumedIdentities]}};
      }
      if (!document.entries.length && input.action !== "schedule") document.schedule = null;
      document = checked(document, uid);
      await applyPlanningCommand(uid, uid,
        {type: "replace", expectedRevision: cloud.revision, document}, adapter);
    }
    const result: MutationResult = {version: 1, revision: document.revision,
      changed: !cloud || stable(document) !== stable(cloud), migrationReviewRequired,
      removedIdentities, preservedIdentities, replayed: false};
    if (cleanupReceipt) transaction.set(cleanupReceipt.reference, cleanupReceipt.data);
    // No TTL: deleting receipts could allow old accepted commands to execute again.
    transaction.create(receiptRef, {version: 1, ownerUid: uid, fingerprint, result});
    return result;
  });
}
