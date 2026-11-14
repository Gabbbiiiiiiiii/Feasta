/**
 * Private Phase 2B, single-transaction bounded withdrawal + catalog lock.
 *
 * This is NOT exported from functions/src/index.ts and is NOT a release entry
 * point. The server adapter remains independently disabled. No code here
 * activates an occasion, changes grants, restores packages or alters bookings.
 *
 * Only use after separately verified release authorization, full privileged
 * writer coverage and old-client compatibility. We deliberately fail closed
 * if the entire packages collection exceeds 40 documents. Cross-batch release
 * requires a separate, reviewed generation-based protocol.
 */
import {createHash} from "node:crypto";
import {FieldPath} from "firebase-admin/firestore";
import type {DocumentReference, Transaction} from "firebase-admin/firestore";
import {scanOccasionPackageInventory} from "./occasion-transition-inventory-scan.js";
import {withdrawOccasionPackageBatchInTransaction,
  withdrawalBatchOperationId} from "./occasion-withdrawal-batch.js";

type Action = "activate" | "deactivate";
type Row = Readonly<Record<string, unknown>>;
const MAX_PACKAGE_DOCUMENTS = 40;

export interface AtomicCoordinatorInput {
  action: Action;
  occasionId: string;
  expectedCatalogRevision: number;
  expectedOccasionRevision: number;
  actorUid: string;
  idempotencyKey: string;
  reason: string;
  catalogRef: DocumentReference;
  occasionRef: DocumentReference;
  adminRef: DocumentReference;
  /** Constructed by the trusted server, never supplied by a client. */
  transitionRef: DocumentReference;
  transitionAuditRef: DocumentReference;
}

export interface AtomicCoordinatorResult {
  operationId: string;
  state: "withdrawn_locked";
  candidatePackageIds: string[];
  ambiguousPackageIds: string[];
  batchOperationId: string | null;
  /** Never infer lifecycle readiness from an atomic withdrawal alone. */
  canActivate: false;
  canDeactivate: false;
  canRestore: false;
}

function deny(reason: string): never { throw new Error(reason); }
function docId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}
function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 &&
    value < Number.MAX_SAFE_INTEGER;
}
function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(docId) &&
    new Set(value).size === value.length;
}
function paths(ref: DocumentReference, collection: string, id: string) {
  return ref?.path === `${collection}/${id}` && ref.id === id;
}
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function atomicOccasionTransitionId(input: Pick<AtomicCoordinatorInput,
  "actorUid" | "action" | "occasionId" | "idempotencyKey">) {
  return digest([input.actorUid, "occasion_atomic_withdraw_lock",
    input.action, input.occasionId, input.idempotencyKey]);
}
function privatePackage(row: Row): boolean {
  return row.status === "draft" && row.isActive === false &&
    row.isPublished === false && row.providerPubliclyVisible === false &&
    row.publishedAt === null;
}
function equal(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function validInput(input: AtomicCoordinatorInput) {
  if (!input || !["activate", "deactivate"].includes(input.action) ||
    !docId(input.occasionId) || !revision(input.expectedCatalogRevision) ||
    !revision(input.expectedOccasionRevision) ||
    typeof input.actorUid !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(input.actorUid) ||
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{10,128}$/u.test(input.idempotencyKey) ||
    typeof input.reason !== "string" || input.reason.trim().length < 10 ||
    input.reason.length > 500) deny("INVALID_COORDINATOR_REQUEST");
  const opId = atomicOccasionTransitionId(input);
  if (!paths(input.catalogRef, "occasionCatalog", "current") ||
    !paths(input.occasionRef, "occasions", input.occasionId) ||
    !paths(input.adminRef, "users", input.actorUid) ||
    !paths(input.transitionRef, "occasionAtomicWithdrawalTransitions", opId) ||
    !paths(input.transitionAuditRef, "occasionAtomicWithdrawalAudits", opId)) {
    deny("INVALID_COORDINATOR_REFERENCES");
  }
}

/**
 * Reads the whole small collection in the SAME transaction used to withdraw
 * candidates and move the catalog to `transitioning`. Reading limit(41) means
 * the presence of 41 documents refuses the operation (no silent truncation).
 * This helper must only be called by independently approved internal authority;
 * it does not, on its own, prove that every privileged writer is fenced.
 */
export async function coordinateBoundedOccasionWithdrawalInTransaction(
  tx: Transaction, input: AtomicCoordinatorInput,
): Promise<AtomicCoordinatorResult> {
  validInput(input);
  const opId = atomicOccasionTransitionId(input);
  const fingerprint = digest([input.action, input.occasionId,
    input.expectedCatalogRevision, input.expectedOccasionRevision,
    input.actorUid, input.reason]);

  // All data reads, including the full small inventory, precede any writes.
  const [adminSnap, catalogSnap, occasionSnap, previousSnap, auditSnap] =
    await Promise.all([
      tx.get(input.adminRef), tx.get(input.catalogRef), tx.get(input.occasionRef),
      tx.get(input.transitionRef), tx.get(input.transitionAuditRef),
    ]);
  const admin = adminSnap.data();
  const catalog = catalogSnap.data();
  const occasion = occasionSnap.data();
  const prior = previousSnap.data();
  const priorAudit = auditSnap.data();
  if (!admin || admin.role !== "admin" || admin.accountStatus !== "active" ||
    admin.isActive !== true || admin.isBlocked !== false) deny("ACTIVE_ADMIN_REQUIRED");
  if (!occasion || occasion.id !== input.occasionId ||
    occasion.moderationState !== "approved" || !revision(occasion.revision) ||
    !stringList(occasion.applicableServiceCategoryCodes) ||
    typeof occasion.active !== "boolean") deny("OCCASION_AUTHORITY_UNAVAILABLE");
  if (occasion.revision !== input.expectedOccasionRevision ||
    occasion.active !== (input.action === "deactivate") ||
    !catalog || catalog.revision !== input.expectedCatalogRevision ||
    !revision(catalog.revision)) deny("COORDINATOR_REVISION_CONFLICT");
  if (!!prior !== !!priorAudit) deny("COORDINATOR_LEDGER_CORRUPTED");

  if (prior) {
    if (catalog.activationState !== "transitioning" ||
      catalog.transitionOperationId !== opId ||
      catalog.transitionAction !== input.action ||
      prior.operationId !== opId || prior.state !== "withdrawn_locked" ||
      prior.action !== input.action || prior.occasionId !== input.occasionId ||
      prior.hash !== fingerprint || priorAudit?.hash !== fingerprint ||
      priorAudit?.operationId !== opId ||
      !Array.isArray(prior.candidatePackageIds) ||
      !Array.isArray(prior.ambiguousPackageIds)) deny("COORDINATOR_REPLAY_CONFLICT");
    const ids = prior.candidatePackageIds as unknown[];
    if (prior.batchOperationId !== (ids.length ? withdrawalBatchOperationId(input) : null)) {
      deny("COORDINATOR_LEDGER_CORRUPTED");
    }
    if (ids.length > MAX_PACKAGE_DOCUMENTS ||
      ids.some((id) => typeof id !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/u.test(id)) ||
      new Set(ids).size !== ids.length ||
      ids.some((id, i) => i > 0 && (ids[i - 1] as string) >= (id as string))) {
      deny("COORDINATOR_LEDGER_CORRUPTED");
    }
    // A replay cannot declare the transition safe if an unfenced writer
    // published another affected record after the original lock.
    const afterFreeze = await tx.get(input.catalogRef.firestore.collection("packages")
      .orderBy(FieldPath.documentId()).limit(MAX_PACKAGE_DOCUMENTS + 1));
    if (afterFreeze.docs.length > MAX_PACKAGE_DOCUMENTS) {
      deny("COORDINATOR_REPLAY_REVALIDATION_REQUIRED");
    }
    const replayRows = afterFreeze.docs.map((row) => ({id: row.id,
      data: row.data() as Row}));
    if (replayRows.some((row, i) =>
      !/^[A-Za-z0-9_-]{1,128}$/u.test(row.id) ||
      (i > 0 && replayRows[i - 1].id >= row.id))) {
      deny("COORDINATOR_REPLAY_REVALIDATION_REQUIRED");
    }
    const changed = await scanOccasionPackageInventory({
      action: input.action, occasionId: input.occasionId,
      applicableCategoryCodes: occasion.applicableServiceCategoryCodes as string[],
      readPage: async (after, limit) => replayRows.filter((row) =>
        after === null || row.id > after).slice(0, limit),
    });
    if (changed.candidatePackageIds.length) {
      deny("COORDINATOR_REPLAY_REVALIDATION_REQUIRED");
    }
    for (const id of ids as string[]) {
      const snap = await tx.get(input.catalogRef.firestore.collection("packages").doc(id));
      if (!snap.exists || !privatePackage(snap.data() ?? {})) {
        deny("COORDINATOR_REPLAY_REVALIDATION_REQUIRED");
      }
    }
    return {operationId: opId, state: "withdrawn_locked",
      candidatePackageIds: [...ids] as string[],
      ambiguousPackageIds: [...prior.ambiguousPackageIds] as string[],
      batchOperationId: prior.batchOperationId as string | null,
      canActivate: false, canDeactivate: false, canRestore: false};
  }
  if (catalog.activationState !== "stable") deny("COORDINATOR_CATALOG_NOT_STABLE");

  const packageQuery = input.catalogRef.firestore.collection("packages")
    .orderBy(FieldPath.documentId()).limit(MAX_PACKAGE_DOCUMENTS + 1);
  const snapshot = await tx.get(packageQuery);
  const rows = snapshot.docs;
  if (rows.length > MAX_PACKAGE_DOCUMENTS) deny("COORDINATOR_INVENTORY_TOO_LARGE");
  if (!rows.every((row, i) =>
    row.ref.path === `packages/${row.id}` &&
    /^[A-Za-z0-9_-]{1,128}$/u.test(row.id) &&
    (i === 0 || rows[i - 1].id < row.id))) {
    deny("COORDINATOR_INVENTORY_CORRUPTED");
  }
  const pageRows = rows.map((row) => ({id: row.id, data: row.data() as Row}));
  const inventory = await scanOccasionPackageInventory({
    action: input.action, occasionId: input.occasionId,
    applicableCategoryCodes: occasion.applicableServiceCategoryCodes as string[],
    readPage: async (after, limit) => {
      const matches = pageRows.filter((row) => after === null || row.id > after);
      return matches.slice(0, limit);
    },
  });
  // This is transaction-local completeness ONLY. The scanner's wider release
  // blockers still apply. An empty inventory is valid only after this complete
  // bounded transaction query; it does not waive any other release condition.
  const candidatePackageIds = inventory.candidatePackageIds;
  const refs = candidatePackageIds.map((id) =>
    input.catalogRef.firestore.collection("packages").doc(id));
  const batchOperationId = withdrawalBatchOperationId(input);
  const batchOperationRef = input.catalogRef.firestore
    .collection("occasionWithdrawalBatchOperations").doc(batchOperationId);
  const batchAuditRef = input.catalogRef.firestore
    .collection("occasionWithdrawalBatchAudits").doc(batchOperationId);
  const batch = candidatePackageIds.length ? await withdrawOccasionPackageBatchInTransaction(tx, {
    action: input.action, occasionId: input.occasionId,
    expectedCatalogRevision: input.expectedCatalogRevision,
    expectedOccasionRevision: input.expectedOccasionRevision,
    applicableCategoryCodes: occasion.applicableServiceCategoryCodes as string[],
    packageRefs: refs, catalogRef: input.catalogRef,
    occasionRef: input.occasionRef, adminRef: input.adminRef,
    operationRef: batchOperationRef, auditRef: batchAuditRef,
    actorUid: input.actorUid, idempotencyKey: input.idempotencyKey,
    reason: input.reason,
  }) : {withdrawnPackageIds: [], alreadyPrivatePackageIds: []};
  if (!equal([...batch.withdrawnPackageIds, ...batch.alreadyPrivatePackageIds].sort(),
    [...candidatePackageIds].sort())) deny("COORDINATOR_WITHDRAWAL_INCOMPLETE");
  const now = new Date();
  // The catalog lock and all package withdrawals are one atomic Firestore
  // commit. No partial batches; status 'transitioning' blocks new writers.
  tx.update(input.catalogRef, {activationState: "transitioning",
    transitionOperationId: opId, transitionAction: input.action,
    updatedAt: now});
  tx.create(input.transitionRef, {operationId: opId, hash: fingerprint,
    occasionId: input.occasionId, actorUid: input.actorUid,
    action: input.action, state: "withdrawn_locked",
    catalogRevision: input.expectedCatalogRevision,
    occasionRevision: input.expectedOccasionRevision,
    batchOperationId: candidatePackageIds.length ? batchOperationId : null, candidatePackageIds,
    ambiguousPackageIds: inventory.ambiguousPackageIds,
    inventoryDocumentCount: rows.length,
    releasesVerified: false, canActivate: false, canRestore: false,
    createdAt: now});
  tx.create(input.transitionAuditRef, {operationId: opId, hash: fingerprint,
    action: "occasion_atomic_withdraw_lock", actorUid: input.actorUid,
    occasionId: input.occasionId, batchOperationId: candidatePackageIds.length ? batchOperationId : null,
    candidatePackageIds, ambiguousPackageIds: inventory.ambiguousPackageIds,
    beforeCatalogRevision: input.expectedCatalogRevision,
    afterCatalogRevision: input.expectedCatalogRevision, createdAt: now});
  return {operationId: opId, state: "withdrawn_locked",
    candidatePackageIds, ambiguousPackageIds: inventory.ambiguousPackageIds,
    batchOperationId: candidatePackageIds.length ? batchOperationId : null,
    canActivate: false, canDeactivate: false, canRestore: false};
}
