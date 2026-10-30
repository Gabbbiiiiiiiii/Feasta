/** Admin-only atomic lifecycle endpoint; no browser-supplied release evidence. */
import {onCall} from "firebase-functions/v2/https";
import {FieldPath} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {fail} from "../packages/occasion-suggestion-v2-core.js";
import {occasionId} from "../packages/occasion-v2-validation.js";
import {scanOccasionPackageInventory} from "../packages/occasion-transition-inventory-scan.js";
import {exact, mutationKey, plainText, positiveRevision}
  from "../packages/v2-validation.js";
import {requireOccasionLifecycleActor, requireOccasionLifecycleAdmin,
  readOccasionReadiness, parseOccasionReadinessInput} from "./occasion-activation-readiness.js";
import {completeAtomicOccasionLifecycle, planOccasionGalleryWithdrawal,
  occasionLifecycleOperationId,
  type LifecycleInput} from "./occasion-lifecycle-atomic.js";

type Action = "activate" | "deactivate";
export function parseAdminLifecycleMutation(value: unknown) {
  const request = exact(value, ["occasionId", "expectedOccasionRevision",
    "expectedCatalogRevision", "idempotencyKey", "reason"], [], "INVALID_REVIEW_TARGET");
  return {occasionId: occasionId(request.occasionId),
    expectedOccasionRevision: positiveRevision(request.expectedOccasionRevision,
      "INVALID_REVIEW_TARGET"),
    expectedCatalogRevision: positiveRevision(request.expectedCatalogRevision,
      "INVALID_REVIEW_TARGET"),
    idempotencyKey: mutationKey(request.idempotencyKey, "INVALID_REVIEW_TARGET"),
    reason: plainText(request.reason, 10, 500, "INVALID_REVIEW_REASON")};
}

async function execute(request: Parameters<typeof requireOccasionLifecycleActor>[0],
  action: Action) {
  const actorUid = await requireOccasionLifecycleActor(request, `adminOccasions.${action}.execute`);
  const input = parseAdminLifecycleMutation(request.data);
  const id = occasionLifecycleOperationId({actorUid, action,
    idempotencyKey: input.idempotencyKey});
  const complete: LifecycleInput = {...input, actorUid, action,
    catalogRef: db.collection("occasionCatalog").doc("current"),
    occasionRef: db.collection("occasions").doc(input.occasionId),
    adminRef: db.collection("users").doc(actorUid),
    operationRef: db.collection("occasionLifecycleOperations").doc(id),
    auditRef: db.collection("occasionLifecycleAudits").doc(id)};
  try {
    return await db.runTransaction(async (tx) => {
      // A completed retry returns its immutable result through the atomic
      // helper's actor, fingerprint and audit checks. It performs no mutation
      // and must not require the pre-transition revisions to still be current.
      const previous = await tx.get(complete.operationRef);
      if (previous.data()) return completeAtomicOccasionLifecycle(tx, complete);
      // The previous readiness contract records release evidence which the
      // bounded inventory alone cannot establish (writer coverage, old clients,
      // deployed indexes and security policy). Revalidate inside the same
      // transaction before any lifecycle writes.
      const readiness = await readOccasionReadiness(tx, input, action);
      if (readiness.status === "BLOCKED" || readiness.blockers.length > 0) {
        fail("OCCASION_LIFECYCLE_RELEASE_UNVERIFIED", "failed-precondition");
      }
      return completeAtomicOccasionLifecycle(tx, complete);
    });
  } catch (error) {
    if (error instanceof Error && [
      "INVALID_OCCASION_LIFECYCLE_REQUEST", "INVALID_OCCASION_LIFECYCLE_REFERENCES",
      "ADMIN_REQUIRED", "IDEMPOTENCY_CONFLICT", "OCCASION_LIFECYCLE_AUDIT_MISSING",
      "OCCASION_LIFECYCLE_RELEASE_UNVERIFIED",
      "OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT",
      "OCCASION_LIFECYCLE_CATEGORY_INVALID", "OCCASION_LIFECYCLE_CATEGORY_INACTIVE",
      "PACKAGE_INVENTORY_TOO_LARGE", "PACKAGE_INVENTORY_REQUIRES_REVIEW",
      "GALLERY_INVENTORY_TOO_LARGE", "GALLERY_INVENTORY_REQUIRES_REVIEW",
      "WITHDRAWAL_INCOMPLETE", "INVALID_OCCASION_INVENTORY_PAGE",
      "UNSORTED_OR_MALFORMED_OCCASION_INVENTORY", "WITHDRAWAL_AUTHORITY_UNAVAILABLE",
      "WITHDRAWAL_REVISION_CONFLICT", "WITHDRAWAL_PACKAGE_CHANGED",
      "UNRELATED_WITHDRAWAL_PACKAGE", "AMBIGUOUS_PRIVATE_PROJECTION",
    ].includes(error.message)) {
      fail(error.message, error.message === "ADMIN_REQUIRED" ?
        "permission-denied" : "failed-precondition");
    }
    throw error;
  }
}

export const activateAdminOccasion = onCall(appCheckCallableOptions,
  (request) => execute(request, "activate"));
export const deactivateAdminOccasion = onCall(appCheckCallableOptions,
  (request) => execute(request, "deactivate"));

/** Read-only advisory preview; execution rechecks all evidence in its transaction. */
export const inspectAdminOccasionAtomicReadiness = onCall(appCheckCallableOptions,
  async (request) => {
    const uid = await requireOccasionLifecycleActor(request,
      "adminOccasions.atomic.readiness");
    const data = exact(request.data, ["occasionId", "action",
      "expectedOccasionRevision", "expectedCatalogRevision"], [], "INVALID_REVIEW_TARGET");
    if (data.action !== "activate" && data.action !== "deactivate") {
      fail("INVALID_REVIEW_TARGET", "invalid-argument");
    }
    const input = parseOccasionReadinessInput({occasionId: data.occasionId,
      expectedOccasionRevision: data.expectedOccasionRevision,
      expectedCatalogRevision: data.expectedCatalogRevision});
    return db.runTransaction(async (tx) => {
      await requireOccasionLifecycleAdmin(tx, uid);
      const basic = await readOccasionReadiness(tx, input, data.action as Action);
      // Never omit the ten mandatory release conditions from the returned
      // status. Preliminary catalog checks only decide if an inventory preview
      // can be gathered; they do NOT authorize activation or deactivation.
      const checks = basic.checks;
      const blockers = [...basic.blockers];
      const canInspectInventory = checks.slice(0, 7)
        .every((check) => check.status === "SATISFIED");
      let packageCount: number | null = null;
      let galleryCount: number | null = null;
      let affectedPackages: number | null = null;
      let affectedGallerySetups: number | null = null;
      if (canInspectInventory) {
        const occasion = (await tx.get(db.collection("occasions").doc(input.occasionId))).data();
        const packages = await tx.get(db.collection("packages")
          .orderBy(FieldPath.documentId()).limit(41));
        packageCount = packages.docs.length;
        if (packageCount > 40) blockers.push("PACKAGE_INVENTORY_TOO_LARGE");
        else {
          try {
            const dataRows = packages.docs.map((doc) => ({id: doc.id, data: doc.data()}));
            const inventory = await scanOccasionPackageInventory({
              action: data.action as Action, occasionId: input.occasionId,
              applicableCategoryCodes: occasion?.applicableServiceCategoryCodes ?? [],
              readPage: async (after, limit) => dataRows
                .filter((row) => after === null || row.id > after).slice(0, limit),
            });
            affectedPackages = inventory.candidatePackageIds.length;
          } catch {blockers.push("PACKAGE_INVENTORY_REQUIRES_REVIEW");}
        }
        const galleries = await tx.get(db.collectionGroup("catalog").limit(41));
        galleryCount = galleries.docs.length;
        if (galleryCount > 40) blockers.push("GALLERY_INVENTORY_TOO_LARGE");
        else {
          try {
            const changes = planOccasionGalleryWithdrawal({
              action: data.action as Action, occasionId: input.occasionId,
              docs: galleries.docs.map((doc) => ({ref: doc.ref, data: doc.data()})),
            });
            affectedGallerySetups = changes.reduce((count, item) =>
              count + item.withdrawnIds.length, 0);
          } catch {blockers.push("GALLERY_INVENTORY_REQUIRES_REVIEW");}
        }
      }
      return {occasionId: input.occasionId, action: data.action,
        status: blockers.length ? "BLOCKED" as const : "ELIGIBLE_FOR_TRANSACTION" as const,
        lifecycleAvailable: blockers.length === 0,
        occasionRevision: basic.occasionRevision,
        catalogRevision: basic.catalogRevision, checks,
        blockers, packageCount, galleryCount, affectedPackages, affectedGallerySetups,
        disclaimer: "Read-only advisory. Final transaction repeats all checks. " +
          "Affected public content is withdrawn, not automatically restored."};
    });
  });
