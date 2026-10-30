/**
 * Bounded, all-or-nothing Occasion lifecycle operation.
 *
 * No intermediate lock exists: package withdrawal, Setup Gallery withdrawal,
 * occasion state change, catalog revision and immutable audit commit together.
 * A single transaction protects concurrent legacy package and gallery writers
 * which read occasionCatalog/current inside their publication transaction.
 *
 * This deliberately refuses inventories beyond the proven transactional bounds.
 * It does not re-publish a withdrawn package, grant provider eligibility,
 * rewrite a booking or authorize publication of any V2 offer.
 */
import {createHash} from "node:crypto";
import {FieldPath} from "firebase-admin/firestore";
import type {DocumentReference, Transaction} from "firebase-admin/firestore";
import {scanOccasionPackageInventory} from "../packages/occasion-transition-inventory-scan.js";
import {withdrawOccasionPackageBatchInTransaction,
  withdrawalBatchOperationId} from "../packages/occasion-withdrawal-batch.js";

const MAX_PACKAGES = 40;
const MAX_GALLERIES = 40;
type Action = "activate" | "deactivate";
export interface LifecycleInput {
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
  operationRef: DocumentReference;
  auditRef: DocumentReference;
}

export function occasionLifecycleOperationId(input: Pick<LifecycleInput,
  "actorUid" | "action" | "idempotencyKey">): string {
  return createHash("sha256").update(JSON.stringify([
    input.actorUid, "occasion_lifecycle_atomic_v1", input.action, input.idempotencyKey,
  ])).digest("hex");
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function refuse(code: string): never { throw new Error(code); }
function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value > 0 && value < Number.MAX_SAFE_INTEGER;
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}
function validPackageId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}
function validInput(input: LifecycleInput) {
  if (!input || !["activate", "deactivate"].includes(input.action) ||
    !validId(input.occasionId) || !validRevision(input.expectedCatalogRevision) ||
    !validRevision(input.expectedOccasionRevision) ||
    typeof input.actorUid !== "string" || !validPackageId(input.actorUid) ||
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{10,128}$/u.test(input.idempotencyKey) ||
    typeof input.reason !== "string" || input.reason.trim().length < 10 ||
    input.reason.length > 500) refuse("INVALID_OCCASION_LIFECYCLE_REQUEST");
  const op = occasionLifecycleOperationId(input);
  for (const [ref, expected] of [
    [input.catalogRef, "occasionCatalog/current"],
    [input.occasionRef, `occasions/${input.occasionId}`],
    [input.adminRef, `users/${input.actorUid}`],
    [input.operationRef, `occasionLifecycleOperations/${op}`],
    [input.auditRef, `occasionLifecycleAudits/${op}`],
  ] as const) {
    if (ref?.path !== expected) refuse("INVALID_OCCASION_LIFECYCLE_REFERENCES");
  }
}
export interface GalleryChange {
  ref: DocumentReference;
  nextSetups: Record<string, unknown>[];
  withdrawnIds: string[];
  priorRevision: number;
}

/** Exported pure planner, exercised by offline contract tests. */
export function planOccasionGalleryWithdrawal(input: {
  docs: readonly {ref: DocumentReference; data: Record<string, unknown>}[];
  occasionId: string;
  action: Action;
}): GalleryChange[] {
  if (!validId(input.occasionId) ||
    !["activate", "deactivate"].includes(input.action) ||
    input.docs.length > MAX_GALLERIES) refuse("GALLERY_INVENTORY_TOO_LARGE");
  const changes: GalleryChange[] = [];
  for (const doc of input.docs) {
    const path = doc.ref.path;
    if (!/^providers\/[A-Za-z0-9_-]{1,128}\/catalog\/setups$/u.test(path)) {
      // Other catalog docs may coexist; they are not Setup Gallery records.
      continue;
    }
    const stored = doc.data;
    if (!stored || !Array.isArray(stored.setups) ||
      !Number.isSafeInteger(stored.revision) ||
      (stored.revision as number) < 0 ||
      (stored.revision as number) >= Number.MAX_SAFE_INTEGER) {
      refuse("GALLERY_INVENTORY_REQUIRES_REVIEW");
    }
    const seen = new Set<string>();
    const legacySetupTypes = new Set(["birthday", "wedding", "debut",
      "anniversary", "reunion", "corporate", "baptism", "graduation", "other"]);
    const legacySetupKeys = new Set(["id", "title", "description", "eventType",
      "themeTags", "imageUrls", "isPublished", "setupOccasionSchemaVersion"]);
    const withdrawnIds: string[] = [];
    const nextSetups = (stored.setups as unknown[]).map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        refuse("GALLERY_INVENTORY_REQUIRES_REVIEW");
      }
      const entry = raw as Record<string, unknown>;
      if (typeof entry.isPublished !== "boolean" ||
        typeof entry.id !== "string" || !validPackageId(entry.id) ||
        seen.has(entry.id)) refuse("GALLERY_INVENTORY_REQUIRES_REVIEW");
      seen.add(entry.id);
      const opaque = (entry.setupOccasionSchemaVersion !== undefined &&
        entry.setupOccasionSchemaVersion !== 1) ||
        Object.keys(entry).some((key) => !legacySetupKeys.has(key));
      const unknown = !legacySetupTypes.has(entry.eventType as string);
      // Ambiguous public V2 and malformed records are withdrawn, never trusted.
      const affected = entry.eventType === input.occasionId || opaque || unknown;
      if (entry.isPublished && affected) {
        withdrawnIds.push(entry.id);
        return {...entry, isPublished: false};
      }
      return {...entry};
    });
    if (withdrawnIds.length) changes.push({ref: doc.ref,
      priorRevision: stored.revision as number, nextSetups, withdrawnIds});
  }
  return changes;
}

/** Entire public withdrawal and finalization happen in this one transaction. */
export async function completeAtomicOccasionLifecycle(tx: Transaction,
  input: LifecycleInput) {
  validInput(input);
  const opId = occasionLifecycleOperationId(input);
  const fingerprint = hash([input.action, input.occasionId, input.expectedCatalogRevision,
    input.expectedOccasionRevision, input.actorUid, input.reason]);
  const [adminSnap, catalogSnap, occasionSnap, opSnap, auditSnap] = await Promise.all([
    tx.get(input.adminRef), tx.get(input.catalogRef), tx.get(input.occasionRef),
    tx.get(input.operationRef), tx.get(input.auditRef),
  ]);
  const admin = adminSnap.data();
  if (admin?.role !== "admin" || admin.accountStatus !== "active" ||
    admin.isActive !== true || admin.isBlocked !== false) refuse("ADMIN_REQUIRED");
  const previous = opSnap.data();
  const savedAudit = auditSnap.data();
  if (!!previous !== !!savedAudit) refuse("OCCASION_LIFECYCLE_AUDIT_MISSING");
  if (previous) {
    if (previous.hash !== fingerprint || savedAudit?.hash !== fingerprint ||
      previous.operationId !== opId || savedAudit?.operationId !== opId ||
      previous.actorUid !== input.actorUid ||
      previous.action !== input.action || previous.state !== "completed" ||
      savedAudit?.action !== `occasion_${input.action}` ||
      savedAudit?.occasionId !== input.occasionId ||
      previous.result?.operationId !== opId ||
      previous.result?.state !== "completed" ||
      previous.result?.occasionId !== input.occasionId ||
      previous.result?.action !== input.action) refuse("IDEMPOTENCY_CONFLICT");
    return {...previous.result, idempotentReplay: true};
  }
  const catalog = catalogSnap.data();
  const occasion = occasionSnap.data();
  if (!catalog || !validRevision(catalog.revision) ||
    catalog.activationState !== "stable" || !occasion ||
    occasion.id !== input.occasionId ||
    occasion.moderationState !== "approved" ||
    !validRevision(occasion.revision) ||
    occasion.active !== (input.action === "deactivate") ||
    catalog.revision !== input.expectedCatalogRevision ||
    occasion.revision !== input.expectedOccasionRevision) {
    refuse("OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT");
  }
  const codes = occasion.applicableServiceCategoryCodes;
  if (!Array.isArray(codes) || codes.length < 1 || codes.length > 100 ||
    !codes.every(validId) || new Set(codes).size !== codes.length) {
    refuse("OCCASION_LIFECYCLE_CATEGORY_INVALID");
  }
  // Read all authority, package and gallery evidence before the worker's first write.
  const categorySnaps = [];
  for (const code of codes as string[]) categorySnaps.push(await tx.get(
    input.catalogRef.firestore.collection("serviceCategories").doc(code)));
  for (let i = 0; i < codes.length; i++) {
    const row = categorySnaps[i].data();
    if (row?.code !== codes[i] || row.status !== "active" ||
      !["catering", "addon"].includes(row.serviceType)) {
      refuse("OCCASION_LIFECYCLE_CATEGORY_INACTIVE");
    }
  }
  const packagesSnap = await tx.get(input.catalogRef.firestore.collection("packages")
    .orderBy(FieldPath.documentId()).limit(MAX_PACKAGES + 1));
  if (packagesSnap.docs.length > MAX_PACKAGES) refuse("PACKAGE_INVENTORY_TOO_LARGE");
  const packageRows = packagesSnap.docs.map((doc) => ({id: doc.id,
    data: doc.data() as Record<string, unknown>}));
  if (packageRows.some((row, i) => !validPackageId(row.id) ||
    (i > 0 && packageRows[i - 1].id >= row.id))) {
    refuse("PACKAGE_INVENTORY_REQUIRES_REVIEW");
  }
  const inventory = await scanOccasionPackageInventory({
    action: input.action, occasionId: input.occasionId,
    applicableCategoryCodes: codes as string[],
    readPage: async (after, limit) => packageRows
      .filter((row) => after === null || row.id > after).slice(0, limit),
  });
  const gallerySnapshot = await tx.get(input.catalogRef.firestore
    .collectionGroup("catalog").limit(MAX_GALLERIES + 1));
  if (gallerySnapshot.docs.length > MAX_GALLERIES) {
    refuse("GALLERY_INVENTORY_TOO_LARGE");
  }
  const galleries = planOccasionGalleryWithdrawal({
    occasionId: input.occasionId, action: input.action,
    docs: gallerySnapshot.docs.map((doc) => ({ref: doc.ref,
      data: doc.data() as Record<string, unknown>})),
  });
  const refs = inventory.candidatePackageIds.map((id) =>
    input.catalogRef.firestore.collection("packages").doc(id));
  const batchId = refs.length ? withdrawalBatchOperationId(input) : null;
  let withdrawnPackages: string[] = [];
  if (refs.length && batchId) {
    const batch = await withdrawOccasionPackageBatchInTransaction(tx, {
      action: input.action, occasionId: input.occasionId,
      expectedCatalogRevision: input.expectedCatalogRevision,
      expectedOccasionRevision: input.expectedOccasionRevision,
      applicableCategoryCodes: codes as string[], packageRefs: refs,
      catalogRef: input.catalogRef, occasionRef: input.occasionRef,
      adminRef: input.adminRef,
      operationRef: input.catalogRef.firestore
        .collection("occasionWithdrawalBatchOperations").doc(batchId),
      auditRef: input.catalogRef.firestore
        .collection("occasionWithdrawalBatchAudits").doc(batchId),
      actorUid: input.actorUid, idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    });
    if (batch.withdrawnPackageIds.length + batch.alreadyPrivatePackageIds.length !== refs.length) {
      refuse("WITHDRAWAL_INCOMPLETE");
    }
    withdrawnPackages = batch.withdrawnPackageIds;
  }
  const now = new Date();
  const beforeActive = occasion.active as boolean;
  for (const gallery of galleries) tx.update(gallery.ref, {
    setups: gallery.nextSetups, revision: gallery.priorRevision + 1,
    updatedAt: now,
  });
  const result = {operationId: opId, action: input.action,
    occasionId: input.occasionId, active: input.action === "activate",
    occasionRevision: occasion.revision + 1,
    catalogRevision: catalog.revision + 1,
    withdrawnPackageIds: withdrawnPackages,
    withdrawnGallerySetupIds: galleries.flatMap((gallery) => gallery.withdrawnIds),
    state: "completed" as const, idempotentReplay: false};
  tx.update(input.occasionRef, {active: result.active,
    revision: result.occasionRevision, updatedAt: now});
  tx.update(input.catalogRef, {revision: result.catalogRevision, updatedAt: now});
  tx.create(input.operationRef, {operationId: opId, hash: fingerprint,
    actorUid: input.actorUid, action: input.action, state: "completed", result,
    createdAt: now});
  tx.create(input.auditRef, {operationId: opId, hash: fingerprint,
    action: `occasion_${input.action}`, actorUid: input.actorUid,
    occasionId: input.occasionId, reason: input.reason,
    beforeActive, afterActive: result.active,
    beforeOccasionRevision: occasion.revision,
    afterOccasionRevision: result.occasionRevision,
    beforeCatalogRevision: catalog.revision,
    afterCatalogRevision: result.catalogRevision,
    withdrawnPackageIds: withdrawnPackages,
    withdrawalBatchOperationId: batchId,
    withdrawnGallerySetupIds: result.withdrawnGallerySetupIds,
    galleryWithdrawalLedger: galleries.map((gallery) => ({
      path: gallery.ref.path, previousRevision: gallery.priorRevision,
      setupIds: gallery.withdrawnIds,
    })),
    // No prior private record or historical booking is restored or mutated.
    restorationPerformed: false, createdAt: now});
  return result;
}
