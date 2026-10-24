import {Timestamp} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import type {GlobalOccasion, ProviderCapabilityChangeResult} from
  "@feasta/shared-types/provider-package-v2";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {requireActiveServiceCategoriesInTransaction} from "../shared/service-category-policy.js";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
import {
  parseCapabilityChange,
  occasionIds,
  validateCapabilityDelta,
} from "./occasion-v2-validation.js";
import {authorityRevision, nextEligibilityRevision} from "./setup-gallery-v2-authority.js";
import {digest, fail} from "./occasion-suggestion-v2-core.js";

/** Local, unexported from the deployment entry point. Until coordinated withdrawal
 * exists, only providers with NO packages and a provably V1-only gallery may change.
 * This deliberately refuses to pretend that revision increments withdraw data.
 */
export const updateProviderOccasionCapabilities = onCall(
  appCheckCallableOptions, async (request) => {
  const {uid} = requireAuth(request);
  await requireRole(uid, ["admin"]);
  const input = parseCapabilityChange(request.data);
  const hash = digest(input);
  const op = db.collection("providerOccasionCapabilityOperations")
    .doc(digest([uid, "updateProviderOccasionCapabilities", input.idempotencyKey]));
  return db.runTransaction(async (tx): Promise<ProviderCapabilityChangeResult> => {
    const administrator = (await tx.get(db.collection("users").doc(uid))).data();
    if (resolveBackendAccountState({authDisabled: false, profile: administrator,
      allowedRoles: ["admin"]}).kind !== "active") fail("ADMIN_REQUIRED", "permission-denied");
    const prior = (await tx.get(op)).data();
    if (prior) {
      if (prior.hash !== hash) fail("IDEMPOTENCY_CONFLICT", "already-exists");
      return prior.result as ProviderCapabilityChangeResult;
    }
    const ref = db.collection("providers").doc(input.providerId);
    const provider = (await tx.get(ref)).data();
    if (!provider || typeof provider.ownerId !== "string") fail("PROVIDER_NOT_APPROVED");
    const owner = (await tx.get(db.collection("users").doc(provider.ownerId))).data();
    if (owner?.providerId !== ref.id || owner.role !== "provider") fail("PROVIDER_NOT_APPROVED");
    const authority = db.collection("providerEligibilityAuthorities").doc(ref.id);
    const evidence = (await tx.get(authority)).data();
    // Missing legacy revisions need an ordinary protected mutation first. Never
    // interpret a legacy eventTypesSupported selection as an explicit grant.
    const revision = authorityRevision(evidence?.revision);
    const catalog = (await tx.get(db.collection("occasionCatalog").doc("current"))).data();
    const catalogRevision = authorityRevision(catalog?.revision);
    if (catalog?.activationState !== "stable") fail("CONFIG_UNAVAILABLE");
    if (revision !== input.expectedProviderEligibilityRevision ||
      catalogRevision !== input.expectedCatalogRevision) fail("REVISION_CONFLICT", "aborted");
    const held = evidence?.approvedOccasionIds === undefined ? [] :
      occasionIds(evidence.approvedOccasionIds, "INVALID_CAPABILITY_CHANGE");
    const ids = [...new Set([...held, ...input.approveOccasionIds, ...input.revokeOccasionIds])];
    if (ids.length > 200) fail("CONFIG_UNAVAILABLE");
    const occasions: GlobalOccasion[] = [];
    for (const id of ids) {
      const row = (await tx.get(db.collection("occasions").doc(id))).data();
      if (!row || row.id !== id || row.moderationState !== "approved" ||
        typeof row.active !== "boolean" || !Number.isSafeInteger(row.sortOrder) ||
        !Array.isArray(row.applicableServiceCategoryCodes) ||
        !row.applicableServiceCategoryCodes.length ||
        !row.applicableServiceCategoryCodes.every(
          isServiceCategoryCode)) fail("CONFIG_UNAVAILABLE");
      authorityRevision(row.revision);
      occasions.push(row as GlobalOccasion);
    }
    const approving = input.approveOccasionIds.length > 0;
    let categories: string[] = [];
    if (approving) {
      if (!Array.isArray(provider.serviceCategories) ||
        !provider.serviceCategories.every(isServiceCategoryCode) ||
        !["catering", "addon", "both"].includes(provider.providerServiceType)) {
        fail("INVALID_SERVICE_CATEGORY");
      }
      categories = await requireActiveServiceCategoriesInTransaction(tx,
        provider.serviceCategories, provider.providerServiceType);
      // Gallery authority grants catering categories only. A mixed provider's
      // add-on categories must not confer occasion eligibility or poison loads.
      const categoryDocs = await tx.getAll(...categories.map((code) =>
        db.collection("serviceCategories").doc(code)));
      categories = categories.filter((_, index) =>
        categoryDocs[index]?.data()?.serviceType === "catering");
    }
    validateCapabilityDelta(input, {catalog: occasions, heldOccasionIds: held,
      approvedActiveCategoryCodes: categories,
      providerOperationallyApproved:
        ["approved", "verified"].includes(provider.verificationStatus) &&
        provider.isActive === true && provider.isBlocked !== true &&
        provider.isSuspended !== true && provider.isDeleted !== true &&
        resolveBackendAccountState({authDisabled: false, profile: owner,
          allowedRoles: ["provider"]}).kind === "active"});
    // Transaction query fences new package creation as well as existing packages.
    const packages = await tx.get(db.collection("packages")
      .where("providerId", "==", ref.id).limit(1));
    if (!packages.empty) fail("GALLERY_REVALIDATION_REQUIRED");
    const gallery = (await tx.get(ref.collection("catalog").doc("setups"))).data();
    if (gallery && (!Array.isArray(gallery.setups) || gallery.setups.some((s: unknown) => {
      if (!s || typeof s !== "object" || Array.isArray(s)) return true;
      const row = s as Record<string, unknown>;
      return Object.keys(row).some((k) => !["id", "title", "description", "eventType",
        "themeTags", "imageUrls", "isPublished", "setupOccasionSchemaVersion"].includes(k)) ||
        (row.setupOccasionSchemaVersion !== undefined && row.setupOccasionSchemaVersion !== 1) ||
        !["birthday", "wedding", "debut", "corporate", "anniversary", "other"].includes(
          row.eventType as string) || typeof row.isPublished !== "boolean";
    }))) fail("GALLERY_REVALIDATION_REQUIRED");
    const approved = new Set([...held, ...input.approveOccasionIds]);
    input.revokeOccasionIds.forEach((id) => approved.delete(id));
    const full = occasions.filter((o) => approved.has(o.id)).sort((a, b) =>
      a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map((o) => o.id);
    const next = nextEligibilityRevision(revision);
    const now = Timestamp.now();
    const result: ProviderCapabilityChangeResult = {operationId: op.id, providerId: ref.id,
      state: "completed", providerEligibilityRevision: next, eventTypesSupported: full,
      catalogRevision, revalidationJobId: op.id, affectedPackageCount: 0, failureReason: null};
    tx.update(authority, {revision: next, approvedOccasionIds: full,
      ...(approving ? {approvedCategoryCodes: categories} : {}),
      capabilityApprovalOperationId: op.id, updatedAt: now});
    // Preserve the legacy V1 eventTypesSupported field.
    // Explicit V2 occasion grants live only in the protected authority sidecar.
    tx.create(op, {hash, result, actorUid: uid, createdAt: now});
    tx.create(db.collection("providerOccasionCapabilityAudits").doc(op.id), {
      actorUid: uid, providerId: ref.id, reason: input.reason,
      before: held, after: full, beforeRevision: revision, afterRevision: next,
      catalogRevision, approvedCategoryCodes: categories, createdAt: now});
    tx.create(db.collection("providerOccasionCapabilityRevalidations").doc(op.id), {
      providerId: ref.id, state: "completed", affectedPackageCount: 0,
      providerEligibilityRevision: next, catalogRevision, createdAt: now});
    return result;
  });
});
