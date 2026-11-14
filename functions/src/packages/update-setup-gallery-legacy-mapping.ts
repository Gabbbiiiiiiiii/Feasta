import {Timestamp} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {correlationIdFromCallable} from "../shared/security-events.js";
import {occasionId} from "./occasion-v2-validation.js";
import {digest, fail} from "./occasion-suggestion-v2-core.js";
import {exact, mutationKey, plainText, positiveRevision} from "./v2-validation.js";
import type {SetupGalleryLegacyEventType, UpdateSetupGalleryLegacyMappingRequest,
  UpdateSetupGalleryLegacyMappingResponse} from "./setup-gallery-extension-v1.js";

const values = ["birthday", "wedding", "debut", "corporate", "anniversary", "other"];
function mapping(value: unknown): SetupGalleryLegacyEventType | null {
  if (value !== null && (typeof value !== "string" || !values.includes(value))) {
    fail("INVALID_LEGACY_MAPPING", "invalid-argument");
  }
  return value as SetupGalleryLegacyEventType | null;
}
export function parseLegacyMapping(value: unknown): UpdateSetupGalleryLegacyMappingRequest {
  const r = "INVALID_REVIEW_TARGET";
  const v = exact(value, ["occasionId", "setupGalleryLegacyEventType",
    "expectedOccasionRevision", "expectedCatalogRevision", "reason", "idempotencyKey"], [], r);
  return {occasionId: occasionId(v.occasionId, r),
    setupGalleryLegacyEventType: mapping(v.setupGalleryLegacyEventType),
    expectedOccasionRevision: positiveRevision(v.expectedOccasionRevision, r),
    expectedCatalogRevision: positiveRevision(v.expectedCatalogRevision, r),
    reason: plainText(v.reason, 10, 500, "INVALID_REVIEW_REASON"),
    idempotencyKey: mutationKey(v.idempotencyKey, r)};
}

/** Local implementation only: intentionally not exported from index.ts. */
export const updateSetupGalleryLegacyMapping = onCall(appCheckCallableOptions, async (request) => {
  const {uid} = requireAuth(request);
  await requireRole(uid, ["admin"]);
  await enforceCallableRateLimit(request,
    {scope: "setupGalleryLegacyMapping.update", limit: 60, windowSeconds: 3600});
  const input = parseLegacyMapping(request.data);
  const op = db.collection("setupGalleryLegacyMappingOperations")
    .doc(digest([uid, "updateSetupGalleryLegacyMapping", input.idempotencyKey]));
  const hash = digest(input);
  return db.runTransaction(async (tx) => {
    const user = (await tx.get(db.collection("users").doc(uid))).data();
    if (resolveBackendAccountState({authDisabled: false, profile: user,
      allowedRoles: ["admin"]}).kind !== "active") fail("ADMIN_REQUIRED", "permission-denied");
    const previous = (await tx.get(op)).data();
    if (previous) {
      if (previous.hash !== hash) fail("IDEMPOTENCY_CONFLICT", "already-exists");
      return previous.result as UpdateSetupGalleryLegacyMappingResponse;
    }
    const ref = db.collection("occasions").doc(input.occasionId);
    const before = (await tx.get(ref)).data();
    if (!before) fail("OCCASION_NOT_FOUND", "not-found");
    if (before.id !== ref.id || before.moderationState !== "approved" ||
      typeof before.active !== "boolean") fail("CONFIG_UNAVAILABLE");
    const oldMapping = before.setupGalleryLegacyEventType === undefined ? null :
      mapping(before.setupGalleryLegacyEventType);
    const catalog = db.collection("occasionCatalog").doc("current");
    const generation = (await tx.get(catalog)).data();
    const occasionRevision = positiveRevision(before.revision, "CONFIG_UNAVAILABLE");
    const catalogRevision = positiveRevision(generation?.revision, "CONFIG_UNAVAILABLE");
    if (generation?.activationState !== "stable" ||
      occasionRevision === Number.MAX_SAFE_INTEGER || catalogRevision === Number.MAX_SAFE_INTEGER) {
      fail("CONFIG_UNAVAILABLE");
    }
    if (occasionRevision !== input.expectedOccasionRevision ||
      catalogRevision !== input.expectedCatalogRevision) fail("REVISION_CONFLICT", "aborted");
    // No withdrawal/revalidation protocol exists. Prove the local V1-only prerequisite
    // in this transaction; never accept a caller flag or asynchronous revalidation.
    // Bound the scan and fail closed when its completeness cannot be established.
    const galleries = (await tx.get(db.collectionGroup("catalog").limit(501))).docs;
    if (galleries.length > 500) fail("GALLERY_REVALIDATION_REQUIRED");
    const fields = ["id", "title", "description", "eventType", "themeTags", "imageUrls",
      "isPublished", "setupOccasionSchemaVersion"];
    for (const doc of galleries) {
      if (doc.id !== "setups") continue;
      const setups = doc.data().setups;
      if (!Array.isArray(setups) || setups.some((s) => !s || typeof s !== "object" ||
        Array.isArray(s) || Object.keys(s).some((k) => !fields.includes(k)) ||
        (s.setupOccasionSchemaVersion !== undefined && s.setupOccasionSchemaVersion !== 1) ||
        !values.includes(s.eventType) || typeof s.isPublished !== "boolean")) {
        fail("GALLERY_REVALIDATION_REQUIRED");
      }
    }
    const result: UpdateSetupGalleryLegacyMappingResponse = {extensionVersion: 1,
      occasionId: ref.id, setupGalleryLegacyEventType: input.setupGalleryLegacyEventType,
      occasionRevision: occasionRevision + 1, catalogRevision: catalogRevision + 1,
      operationId: op.id};
    const now = Timestamp.now();
    tx.update(ref, {setupGalleryLegacyEventType: input.setupGalleryLegacyEventType,
      revision: result.occasionRevision, updatedAt: now});
    tx.update(catalog, {revision: result.catalogRevision, updatedAt: now});
    tx.create(db.collection("setupGalleryLegacyMappingAudits").doc(op.id), {
      extensionVersion: 1, operationId: op.id, actorUid: uid,
      correlationId: correlationIdFromCallable(request), reason: input.reason,
      occasionId: ref.id, beforeMapping: oldMapping,
      afterMapping: input.setupGalleryLegacyEventType,
      beforeOccasionRevision: occasionRevision, afterOccasionRevision: result.occasionRevision,
      beforeCatalogRevision: catalogRevision, afterCatalogRevision: result.catalogRevision,
      compatibilityBarrier: "verified_v1_only", createdAt: now,
    });
    tx.create(op, {hash, result, actorUid: uid, revision: 1, createdAt: now, updatedAt: now,
      retainUntil: Timestamp.fromMillis(now.toMillis() + 30 * 86400000)});
    return result;
  });
});
