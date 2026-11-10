"use client";

import {httpsCallable} from "firebase/functions";
import {auth, functions, initializeBrowserFirebase} from "@/lib/firebase/client";

export type FixedRecoveryPreview = {
  packageId: string;
  original: unknown;
  proposed: unknown;
  sourceFingerprint: string;
  proposalFingerprint: string | null;
  eligible: boolean;
  blockers: string[];
};
type Confirmation = {
  packageId: string;
  sourceFingerprint: string;
  proposalFingerprint: string;
  confirmed: true;
  idempotencyKey: string;
};
const fingerprint = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const inventory = (value: unknown) =>
  Array.isArray(value) && value[0] === "map" && Array.isArray(value[1]);
const slot = (id: string) => `feasta-fixed-recovery:${auth.currentUser?.uid}:${id}`;
async function ready() {
  initializeBrowserFirebase();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("AUTHENTICATION_REQUIRED");
}
export function hasPendingFixedRecovery(id: string) {
  return typeof window !== "undefined" && sessionStorage.getItem(slot(id)) !== null;
}
export async function previewFixedRecovery(packageId: string): Promise<FixedRecoveryPreview> {
  await ready();
  const {data} = await httpsCallable<{packageId: string}, FixedRecoveryPreview>(
    functions, "previewFixedPackageV2Recovery")({packageId});
  if (!data || data.packageId !== packageId || !fingerprint(data.sourceFingerprint) ||
      !inventory(data.original) ||
      typeof data.eligible !== "boolean" || !Array.isArray(data.blockers) ||
      !data.blockers.every(item => typeof item === "string") ||
      data.eligible && (!fingerprint(data.proposalFingerprint) || !inventory(data.proposed) ||
        data.blockers.length > 0)) throw new Error("INVALID_RECOVERY_RESPONSE");
  return data;
}
async function send(input: Confirmation) {
  await ready();
  const key = slot(input.packageId);
  const encoded = JSON.stringify(input);
  const pending = sessionStorage.getItem(key);
  if (pending && pending !== encoded) throw new Error("PENDING_FIXED_RECOVERY");
  sessionStorage.setItem(key, encoded);
  try {
    const {data} = await httpsCallable<Confirmation, {
      success: boolean; packageId: string; packageRevision: number;
      sharedContractVersion: number; status: string;
    }>(functions, "recoverFixedPackageV2Draft")(input);
    if (!data || data.success !== true || data.packageId !== input.packageId ||
        data.packageRevision !== 1 || data.sharedContractVersion !== 2 ||
        data.status !== "draft") throw new Error("INVALID_RECOVERY_RESPONSE");
    sessionStorage.removeItem(key);
    return data;
  } catch (error) {
    const code = (error as {code?: string}).code?.replace("functions/", "");
    if (["invalid-argument", "failed-precondition", "permission-denied", "unauthenticated",
      "aborted", "already-exists", "not-found", "resource-exhausted"].includes(code ?? "")) {
      sessionStorage.removeItem(key);
    }
    throw error;
  }
}
export async function confirmFixedRecovery(preview: FixedRecoveryPreview) {
  if (!preview.eligible || !fingerprint(preview.proposalFingerprint) ||
      !fingerprint(preview.sourceFingerprint) || preview.blockers.length) {
    throw new Error("RECOVERY_CONFIRMATION_REQUIRED");
  }
  return send({packageId: preview.packageId, sourceFingerprint: preview.sourceFingerprint,
    proposalFingerprint: preview.proposalFingerprint, confirmed: true,
    idempotencyKey: crypto.randomUUID()});
}
export async function retryFixedRecovery(packageId: string) {
  await ready();
  const raw = sessionStorage.getItem(slot(packageId));
  if (!raw) throw new Error("NO_PENDING_FIXED_RECOVERY");
  const input = JSON.parse(raw) as Confirmation;
  if (input.packageId !== packageId || input.confirmed !== true ||
      !fingerprint(input.sourceFingerprint) || !fingerprint(input.proposalFingerprint) ||
      typeof input.idempotencyKey !== "string") throw new Error("INVALID_RECOVERY_RESPONSE");
  return send(input);
}
export function fixedRecoveryError(error: unknown) {
  const reason = (error as {details?: {reason?: string}})?.details?.reason;
  if (reason === "RECOVERY_SOURCE_CHANGED" || reason === "RECOVERY_PREVIEW_STALE") {
    return "The saved draft or proposed contract changed. Refresh the preview and review it again.";
  }
  return "Recovery was not confirmed. Your saved draft is retained. Refresh the preview to review any blockers, or retry an unconfirmed request.";
}

/** Decode the server's collision-safe inventory into a readable field representation. */
export function recoveryInventory(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const [type, data, nanos] = value;
  if (type === "timestamp") return `${data} seconds + ${nanos} nanoseconds (UTC epoch)`;
  if (type === "reference") return `Document reference: ${data}`;
  if (type === "geopoint") return `Coordinates: ${data}, ${nanos}`;
  if (type === "bytes") return `Bytes (base64): ${data}`;
  if (type === "null") return null;
  if (type === "array" && Array.isArray(data)) return data.map(recoveryInventory);
  if (type === "map" && Array.isArray(data)) return Object.fromEntries(data.map(
    ([key, child]: [string, unknown]) => [key, recoveryInventory(child)]));
  return data;
}
