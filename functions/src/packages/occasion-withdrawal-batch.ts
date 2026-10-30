/**
 * Private Phase 2B withdrawal primitive. NOT a callable or a full transition.
 *
 * A trusted server orchestrator (not yet released) must prove complete package
 * enumeration, hold the transition generation fence, verify active Firebase
 * Auth/admin authorization, and invoke this in db.runTransaction. This module
 * only makes each bounded withdrawal batch atomic, auditable and retry-safe.
 * It never changes the occasion/catalog, provider capabilities or bookings.
 */
import {createHash} from "node:crypto";
import type {DocumentReference, Transaction} from "firebase-admin/firestore";

type RecordData = Record<string, unknown>;
type Action = "activate" | "deactivate";

const maxPackagesPerBatch = 40;
const v2Fields = [
  "occasionScope", "occasionIds", "occasionMatchIds",
  "occasionCatalogRevision", "providerEligibilityRevision",
  "occasionEligibilityState",
  "pricingModel",
] as const;
const legacyIds = new Set([
  "birthday", "wedding", "debut", "anniversary", "reunion", "corporate",
  "baptism", "graduation", "other",
]);

export interface WithdrawalBatchInput {
  action: Action;
  occasionId: string;
  expectedCatalogRevision: number;
  expectedOccasionRevision: number;
  /** Must be derived from the protected occasion document, not the browser. */
  applicableCategoryCodes: readonly string[];
  /** A bounded, SERVER-ENUMERATED batch; not evidence of complete inventory. */
  packageRefs: readonly DocumentReference[];
  catalogRef: DocumentReference;
  occasionRef: DocumentReference;
  adminRef: DocumentReference;
  operationRef: DocumentReference;
  auditRef: DocumentReference;
  actorUid: string;
  idempotencyKey: string;
  reason: string;
}

export interface WithdrawalBatchResult {
  operationId: string;
  action: Action;
  occasionId: string;
  state: "withdrawn_batch";
  withdrawnPackageIds: string[];
  alreadyPrivatePackageIds: string[];
  /** Batch success is NEVER a catalog-activation authorization. */
  canCommitCatalog: false;
  canRestorePackages: false;
}

function deny(code: string): never {
  throw new Error(code);
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}
function positiveRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function hasOwn(value: RecordData, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function uniqueIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id) &&
    new Set(value).size === value.length;
}
function isRecord(value: unknown): value is RecordData {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exactlyOneDoc(ref: DocumentReference, collection: string, name: string): boolean {
  return ref?.path === `${collection}/${name}` && ref.id === name;
}
function equalSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length &&
    [...a].sort().every((item, i) => item === [...b].sort()[i]);
}
function exposed(record: RecordData): boolean {
  return record.isPublished !== false || record.isActive !== false ||
    record.providerPubliclyVisible !== false || record.status === "published";
}
function privatelyWithdrawn(record: RecordData): boolean {
  return record.status === "draft" && record.isPublished === false &&
    record.isActive === false && record.providerPubliclyVisible === false &&
    record.publishedAt === null;
}

/** Uncertain public data is withdrawn, never presumed independent. */
function affected(record: RecordData, occasionId: string,
  categories: ReadonlySet<string>): boolean {
  if (record.occasionSchemaVersion === 2) {
    if (!uniqueIds(record.occasionIds) || !uniqueIds(record.occasionMatchIds) ||
      !["specific", "all"].includes(record.occasionScope as string) ||
      (record.occasionScope === "specific" && record.occasionIds.length === 0) ||
      (record.occasionScope === "all" && record.occasionIds.length !== 0)) return true;
    if (record.occasionIds.includes(occasionId) ||
      record.occasionMatchIds.includes(occasionId)) return true;
    if (record.occasionScope === "all") {
      return !id(record.serviceCategoryCode) ||
        categories.has(record.serviceCategoryCode);
    }
    return false;
  }
  if ((hasOwn(record, "occasionSchemaVersion") &&
    record.occasionSchemaVersion !== 1) ||
    (hasOwn(record, "offerSchemaVersion") && record.offerSchemaVersion !== 1) ||
    v2Fields.some((field) => hasOwn(record, field))) {
    return true;
  }
  if (record.eventType === occasionId) return true;
  return typeof record.eventType !== "string" || !legacyIds.has(record.eventType);
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function scopedOperationId(input: WithdrawalBatchInput): string {
  return hash([input.actorUid, "occasion_batch_withdraw", input.action,
    input.occasionId, input.idempotencyKey]);
}
function requestHash(input: WithdrawalBatchInput): string {
  return hash([input.action, input.occasionId, input.expectedCatalogRevision,
    input.expectedOccasionRevision, [...input.applicableCategoryCodes].sort(),
    input.packageRefs.map((ref) => ref.id), input.actorUid, input.reason]);
}
function assertInput(input: WithdrawalBatchInput): void {
  if (!input || !id(input.occasionId) ||
    !["activate", "deactivate"].includes(input.action) ||
    !positiveRevision(input.expectedCatalogRevision) ||
    !positiveRevision(input.expectedOccasionRevision) ||
    !Array.isArray(input.applicableCategoryCodes) ||
    !uniqueIds([...input.applicableCategoryCodes]) ||
    input.applicableCategoryCodes.length === 0 ||
    !Array.isArray(input.packageRefs) || !input.packageRefs.length ||
    input.packageRefs.length > maxPackagesPerBatch ||
    typeof input.actorUid !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(input.actorUid) ||
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{10,128}$/u.test(input.idempotencyKey) ||
    typeof input.reason !== "string" || input.reason.trim().length < 10 ||
    input.reason.length > 500) deny("INVALID_WITHDRAWAL_BATCH");
  const opId = scopedOperationId(input);
  if (!exactlyOneDoc(input.catalogRef, "occasionCatalog", "current") ||
    !exactlyOneDoc(input.occasionRef, "occasions", input.occasionId) ||
    !exactlyOneDoc(input.adminRef, "users", input.actorUid) ||
    !exactlyOneDoc(input.operationRef, "occasionWithdrawalBatchOperations", opId) ||
    !exactlyOneDoc(input.auditRef, "occasionWithdrawalBatchAudits", opId)) {
    deny("INVALID_WITHDRAWAL_REFERENCES");
  }
  const ids = input.packageRefs.map((ref) => ref.id);
  if (new Set(ids).size !== ids.length || ids.some((v, i) =>
    !/^[A-Za-z0-9_-]{1,128}$/u.test(v) ||
    !exactlyOneDoc(input.packageRefs[i], "packages", v))) {
    deny("INVALID_PACKAGE_REFERENCES");
  }
  if (ids.some((v, i) => i > 0 && ids[i - 1] >= v)) {
    deny("UNSORTED_PACKAGE_BATCH");
  }
}

/** Creates internal Firestore references; never expose them to user requests. */
export function withdrawalBatchOperationId(input: Pick<WithdrawalBatchInput,
  "actorUid" | "action" | "occasionId" | "idempotencyKey">): string {
  return hash([input.actorUid, "occasion_batch_withdraw", input.action,
    input.occasionId, input.idempotencyKey]);
}

/**
 * Must be called *inside* a trusted db.runTransaction callback. All reads are
 * completed before any write. Firestore retries transactions on changed reads;
 * there is deliberately no unverified cross-batch completion claim.
 */
export async function withdrawOccasionPackageBatchInTransaction(
  tx: Transaction, input: WithdrawalBatchInput,
): Promise<WithdrawalBatchResult> {
  assertInput(input);
  const opId = scopedOperationId(input);
  const fingerprint = requestHash(input);

  const admin = (await tx.get(input.adminRef)).data();
  if (!admin || admin.role !== "admin" || admin.accountStatus !== "active" ||
    admin.isActive !== true || admin.isBlocked !== false) {
    deny("ACTIVE_ADMIN_REQUIRED");
  }
  // Future caller MUST additionally verify Firebase Auth's disabled state and
  // App Check/admin role before entering this internal helper.
  const previousOp = (await tx.get(input.operationRef)).data();
  const previousAudit = (await tx.get(input.auditRef)).data();
  if (!!previousOp !== !!previousAudit) deny("WITHDRAWAL_LEDGER_CORRUPTED");

  const catalog = (await tx.get(input.catalogRef)).data();
  const occasion = (await tx.get(input.occasionRef)).data();
  if (!catalog || catalog.activationState !== "stable" ||
    !positiveRevision(catalog.revision) ||
    !occasion || occasion.id !== input.occasionId ||
    occasion.moderationState !== "approved" ||
    !positiveRevision(occasion.revision) ||
    typeof occasion.active !== "boolean" ||
    !uniqueIds(occasion.applicableServiceCategoryCodes) ||
    !equalSet(occasion.applicableServiceCategoryCodes, input.applicableCategoryCodes)) {
    deny("WITHDRAWAL_AUTHORITY_UNAVAILABLE");
  }
  if (catalog.revision !== input.expectedCatalogRevision ||
    occasion.revision !== input.expectedOccasionRevision ||
    occasion.active !== (input.action === "deactivate")) {
    deny("WITHDRAWAL_REVISION_CONFLICT");
  }

  const snapshots = [];
  for (const ref of input.packageRefs) snapshots.push(await tx.get(ref));
  if (snapshots.some((snap) => !snap.exists || !isRecord(snap.data()))) {
    deny("WITHDRAWAL_PACKAGE_CHANGED");
  }
  const values = snapshots.map((snapshot) => snapshot.data() as RecordData);
  const resultIdList = input.packageRefs.map((ref) => ref.id);
  if (previousOp) {
    if (previousOp.hash !== fingerprint || previousOp.state !== "withdrawn_batch" ||
      previousOp.operationId !== opId || previousAudit?.hash !== fingerprint ||
      previousAudit.operationId !== opId ||
      !Array.isArray(previousOp.withdrawnPackageIds) ||
      !Array.isArray(previousOp.alreadyPrivatePackageIds)) {
      deny("WITHDRAWAL_IDEMPOTENCY_CONFLICT");
    }
    const withdrawn = previousOp.withdrawnPackageIds as string[];
    const alreadyPrivate = previousOp.alreadyPrivatePackageIds as string[];
    if ([...withdrawn, ...alreadyPrivate].length !== resultIdList.length ||
      !equalSet([...withdrawn, ...alreadyPrivate], resultIdList) ||
      !values.every(privatelyWithdrawn)) {
      deny("WITHDRAWAL_REPLAY_NEEDS_REVALIDATION");
    }
    return {operationId: opId, action: input.action, occasionId: input.occasionId,
      state: "withdrawn_batch", withdrawnPackageIds: [...withdrawn],
      alreadyPrivatePackageIds: [...alreadyPrivate],
      canCommitCatalog: false, canRestorePackages: false};
  }

  const categories = new Set(input.applicableCategoryCodes);
  const toWithdraw: {ref: DocumentReference; before: RecordData}[] = [];
  const alreadyPrivate: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const record = values[i];
    if (!affected(record, input.occasionId, categories)) {
      // Batches must be built from a server-side plan; including unrelated
      // records is an inventory bug, never permission to withdraw them.
      deny("UNRELATED_WITHDRAWAL_PACKAGE");
    }
    if (!exposed(record)) {
      if (!privatelyWithdrawn(record)) deny("AMBIGUOUS_PRIVATE_PROJECTION");
      alreadyPrivate.push(input.packageRefs[i].id);
      continue;
    }
    toWithdraw.push({ref: input.packageRefs[i], before: record});
  }

  const withdrawnPackageIds = toWithdraw.map(({ref}) => ref.id);
  const result: WithdrawalBatchResult = {operationId: opId, action: input.action,
    occasionId: input.occasionId, state: "withdrawn_batch", withdrawnPackageIds,
    alreadyPrivatePackageIds: alreadyPrivate,
    canCommitCatalog: false, canRestorePackages: false};
  const now = new Date();
  for (const {ref} of toWithdraw) {
    tx.update(ref, {status: "draft", isActive: false, isPublished: false,
      providerPubliclyVisible: false, publishedAt: null, updatedAt: now,
      updatedBy: input.actorUid});
  }
  tx.create(input.operationRef, {operationId: opId, hash: fingerprint,
    state: "withdrawn_batch", actorUid: input.actorUid, action: input.action,
    occasionId: input.occasionId, expectedCatalogRevision: input.expectedCatalogRevision,
    expectedOccasionRevision: input.expectedOccasionRevision,
    withdrawnPackageIds, alreadyPrivatePackageIds: alreadyPrivate, createdAt: now});
  tx.create(input.auditRef, {operationId: opId, hash: fingerprint,
    action: "occasion_withdraw_batch", actorUid: input.actorUid,
    targetOccasionId: input.occasionId, transitionAction: input.action,
    reason: input.reason, createdAt: now,
    previousProjections: toWithdraw.map(({ref, before}) => ({packageId: ref.id,
      status: before.status ?? null, isActive: before.isActive ?? null,
      isPublished: before.isPublished ?? null,
      providerPubliclyVisible: before.providerPubliclyVisible ?? null,
      publishedAt: before.publishedAt ?? null})),
    alreadyPrivatePackageIds: alreadyPrivate});
  return result;
}
