import {Timestamp} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
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
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {correlationIdFromCallable} from "../shared/security-events.js";
import {
  parseCapabilityChange,
  occasionIds,
  validateCapabilityDelta,
} from "./occasion-v2-validation.js";
import {authorityRevision, nextEligibilityRevision} from "./setup-gallery-v2-authority.js";
import {digest, fail} from "./occasion-suggestion-v2-core.js";
import {exact, plainText} from "./v2-validation.js";

/** Reuse capability validation, operation journals and audits for absence-only
 * initialization. Ordinary updates remain unexported and require fully archived
 * inventory. Neither path treats revision increments as coordinated withdrawal.
 */
function capabilityCallable(initialize: boolean) {
return onCall(
  appCheckCallableOptions, async (request) => {
  const {uid} = requireAuth(request);
  if (!request.app) fail("APP_CHECK_REQUIRED", "unauthenticated");
  await requireRole(uid, ["admin"]);
  await enforceCallableRateLimit(request, {
    scope: "providerOccasionCapabilities.update", limit: 30, windowSeconds: 3600,
  });
  const bootstrap = initialize ? exact(request.data,
    ["providerId", "approveOccasionIds", "approvedCategoryCodes", "approvalEvidence",
      "expectedProviderEligibilityRevision", "expectedCatalogRevision", "reason", "idempotencyKey"],
    [], "INVALID_CAPABILITY_CHANGE") : null;
  if (bootstrap && (bootstrap.expectedProviderEligibilityRevision !== 0 ||
      !Array.isArray(bootstrap.approvedCategoryCodes) || !bootstrap.approvedCategoryCodes.length ||
      !bootstrap.approvedCategoryCodes.every(isServiceCategoryCode) ||
      new Set(bootstrap.approvedCategoryCodes).size !== bootstrap.approvedCategoryCodes.length)) {
    fail("INVALID_CAPABILITY_CHANGE", "invalid-argument");
  }
  const approvalEvidence = bootstrap ?
    plainText(bootstrap.approvalEvidence, 10, 1000, "INVALID_CAPABILITY_CHANGE") : null;
  const input = parseCapabilityChange(bootstrap ? {
    providerId: bootstrap.providerId, approveOccasionIds: bootstrap.approveOccasionIds,
    revokeOccasionIds: [], expectedProviderEligibilityRevision: 1,
    expectedCatalogRevision: bootstrap.expectedCatalogRevision,
    reason: bootstrap.reason, idempotencyKey: bootstrap.idempotencyKey,
  } : request.data);
  const operation = initialize ? "initializeProviderOccasionCapabilities" : "updateProviderOccasionCapabilities";
  const hash = bootstrap ? digest({input,
    approvedCategoryCodes: bootstrap.approvedCategoryCodes, approvalEvidence}) : digest(input);
  const op = db.collection("providerOccasionCapabilityOperations")
    .doc(digest([uid, operation, input.idempotencyKey]));
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
    if (initialize) {
      const ownerAuth = await getAuth().getUser(provider.ownerId);
      if (ownerAuth.disabled) fail("PROVIDER_NOT_APPROVED");
    }
    const owner = (await tx.get(db.collection("users").doc(provider.ownerId))).data();
    if (owner?.providerId !== ref.id || owner.role !== "provider") fail("PROVIDER_NOT_APPROVED");
    const authority = db.collection("providerEligibilityAuthorities").doc(ref.id);
    const evidence = (await tx.get(authority)).data();
    // Zero is an absence precondition, never a valid stored revision.
    if (initialize && evidence) fail("REVISION_CONFLICT", "aborted");
    const revision = initialize ? undefined : authorityRevision(evidence?.revision);
    const catalog = (await tx.get(db.collection("occasionCatalog").doc("current"))).data();
    const catalogRevision = authorityRevision(catalog?.revision);
    if (catalog?.activationState !== "stable") fail("CONFIG_UNAVAILABLE");
    if ((!initialize && revision !== input.expectedProviderEligibilityRevision) ||
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
    if (bootstrap) {
      const requested = bootstrap.approvedCategoryCodes as string[];
      if (requested.some((code) => !categories.includes(code))) fail("INVALID_SERVICE_CATEGORY");
      categories = requested;
    }
    validateCapabilityDelta(input, {catalog: occasions, heldOccasionIds: held,
      approvedActiveCategoryCodes: categories,
      providerOperationallyApproved:
        ["approved", "verified"].includes(provider.verificationStatus) &&
        provider.isActive === true && provider.isBlocked !== true &&
        provider.isSuspended !== true && provider.isDeleted !== true &&
        resolveBackendAccountState({authDisabled: false, profile: owner,
          allowedRoles: ["provider"]}).kind === "active"});
    // A bounded transaction query includes archived history and fences changes
    // to this provider's package inventory. Never infer privacy from status alone.
    // Exceeding the verified inventory bound fails closed.
    const packages = await tx.get(db.collection("packages")
      .where("providerId", "==", ref.id).limit(41));
    if (packages.size > 40 || !Array.isArray(packages.docs) ||
      packages.docs.length !== packages.size) {
      fail("GALLERY_REVALIDATION_REQUIRED");
    }
    for (const packageDoc of packages.docs) {
      const packageData = packageDoc.data();
      // Legacy packages never consume this sidecar. First-time grants leave them untouched.
      // Existing V2/V3 inventory requires coordinated revalidation, even if archived.
      if (initialize && packageData?.providerId === ref.id &&
          ["sharedContractVersion", "occasionSchemaVersion", "offerSchemaVersion"].every(
            (field) => !Object.hasOwn(packageData, field) || packageData[field] === 1) &&
          (!Object.hasOwn(packageData, "offerStructure") || packageData.offerStructure === "fixed") &&
          !["occasionIds", "occasionScope", "providerEligibilityRevision", "foodChoiceGroups",
            "individualFoodItems", "individualFoodDraft"].some((field) =>
            Object.hasOwn(packageData, field))) continue;
      if (initialize || !packageData || packageData.providerId !== ref.id ||
        packageData.status !== "archived" ||
        packageData.isActive !== false ||
        packageData.isPublished !== false ||
        packageData.providerPubliclyVisible !== false ||
        packageData.publishedAt !== null) {
        fail("GALLERY_REVALIDATION_REQUIRED");
      }
    }
    const gallery = (await tx.get(ref.collection("catalog").doc("setups"))).data();
    if (gallery && (!Array.isArray(gallery.setups) || gallery.setups.some((s: unknown) => {
      if (!s || typeof s !== "object" || Array.isArray(s)) return true;
      const row = s as Record<string, unknown>;
      return Object.keys(row).some((k) => !["id", "title", "description", "eventType",
        "themeTags", "imageUrls", "isPublished", "setupOccasionSchemaVersion"].includes(k)) ||
        (row.setupOccasionSchemaVersion !== undefined && row.setupOccasionSchemaVersion !== 1) ||
        !["birthday", "wedding", "debut", "corporate", "anniversary", "other"].includes(
          row.eventType as string) || typeof row.isPublished !== "boolean" ||
        row.isPublished === true;
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
    if (initialize) tx.create(authority, {revision: next, approvedOccasionIds: full,
      approvedCategoryCodes: categories, capabilityApprovalOperationId: op.id,
      approvedBy: uid, approvedAt: now, approvalEvidence, createdAt: now, updatedAt: now});
    else tx.update(authority, {revision: next, approvedOccasionIds: full,
      ...(approving ? {approvedCategoryCodes: categories} : {}),
      capabilityApprovalOperationId: op.id, updatedAt: now});
    // Preserve the legacy V1 eventTypesSupported field.
    // Explicit V2 occasion grants live only in the protected authority sidecar.
    tx.create(op, {hash, result, actorUid: uid, createdAt: now});
    tx.create(db.collection("providerOccasionCapabilityAudits").doc(op.id), {
      actorUid: uid, providerId: ref.id, reason: input.reason,
      correlationId: correlationIdFromCallable(request),
      before: held, after: full, beforeRevision: revision ?? 0, afterRevision: next,
      ...(initialize ? {operation, approvalEvidence,
        providerVerificationStatus: provider.verificationStatus,
        providerOwnerId: provider.ownerId, verifiedServiceCategories: provider.serviceCategories} : {}),
      occasionEvidence: occasions.map((occasion) => ({id: occasion.id,
        revision: occasion.revision, active: occasion.active,
        moderationState: occasion.moderationState,
        applicableServiceCategoryCodes: occasion.applicableServiceCategoryCodes})),
      catalogRevision, approvedCategoryCodes: categories, createdAt: now});
    tx.create(db.collection("providerOccasionCapabilityRevalidations").doc(op.id), {
      providerId: ref.id, state: "completed", affectedPackageCount: 0,
      providerEligibilityRevision: next, catalogRevision, createdAt: now});
    return result;
  });
});
}

export const updateProviderOccasionCapabilities = capabilityCallable(false);
// Only missing-authority bootstrap is exposed; ordinary changes retain their release gate.
export const initializeProviderOccasionCapabilities = capabilityCallable(true);
