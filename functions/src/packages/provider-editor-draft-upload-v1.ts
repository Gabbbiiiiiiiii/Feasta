/**
 * Candidate callable, deliberately absent from index.ts.
 * Do not export/deploy until reservation cleanup, registration and canonical
 * reference protection are integrated. Existing progress gate is insufficient.
 */
import {Timestamp} from "firebase-admin/firestore";
import {editorDraftUploadPlanV1} from "./editor-draft-upload-plan-v1.js";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireMaintenanceOpen} from "../shared/maintenance.js";
import {
  cloudinarySecrets, createEditorDraftUploadSignatureV1,
} from "../shared/cloudinary.js";
import {
  assertRegistrationAccess,
} from "./provider-editor-draft-media-registration-v1.js";

function fail(reason: string,
  code: ConstructorParameters<typeof HttpsError>[0] = "failed-precondition",
): never {
  throw new HttpsError(code, reason, {reason});
}

export function parseEditorDraftUploadRequestV1(raw: unknown) {
  const fields = ["editorDraftId", "expectedRevision", "kind", "themeId"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) {
    fail("INVALID_EDITOR_DRAFT_MEDIA", "invalid-argument");
  }
  const data = raw as Record<string, unknown>;
  const descriptors = Object.getOwnPropertyDescriptors(data);
  if (Reflect.ownKeys(data).length !== fields.length ||
      Reflect.ownKeys(data).some((key) =>
        typeof key !== "string" || !fields.includes(key)) ||
      Object.values(descriptors).some((d) => !("value" in d) || !d.enumerable)) {
    fail("INVALID_EDITOR_DRAFT_MEDIA", "invalid-argument");
  }
  const id = (v: unknown): v is string =>
    typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(v);
  if (!id(data.editorDraftId) ||
      !Number.isSafeInteger(data.expectedRevision) ||
      (data.expectedRevision as number) < 1 ||
      (data.kind !== "package" && data.kind !== "theme") ||
      (data.kind === "package" && data.themeId !== null) ||
      (data.kind === "theme" && !id(data.themeId))) {
    fail("INVALID_EDITOR_DRAFT_MEDIA", "invalid-argument");
  }
  return {
    editorDraftId: data.editorDraftId,
    expectedRevision: data.expectedRevision as number,
    kind: data.kind as "package" | "theme",
    themeId: data.themeId as string | null,
  };
}

export const prepareProviderEditorDraftUploadV1 = onCall({
  ...appCheckCallableOptions, secrets: cloudinarySecrets,
}, async (request) => {
  const actor = requireAuth(request);
  // No emulator exemption for this candidate media boundary.
  if (!request.app) fail("APP_CHECK_REQUIRED", "unauthenticated");
  await requireRole(actor.uid, [USER_ROLES.provider]);
  await enforceCallableRateLimit(request, {
    scope: "packages.prepareProviderEditorDraftUploadV1",
    limit: 40, windowSeconds: 3600,
  });
  const input = parseEditorDraftUploadRequestV1(request.data);
  const draftRef = db.collection("providerPackageEditorDrafts")
    .doc(input.editorDraftId);
  // Allocate once outside retries; no client controls the asset identity.
  const reservation = draftRef.collection("mediaUploadReservations").doc();
  const issuedAtMs = Date.now();
  const scope = await db.runTransaction(async (tx) => {
    const providerId = await assertRegistrationAccess(tx, {
      ...input, actorUid: actor.uid, assetId: reservation.id,
    });
    const policy = (await tx.get(
      db.doc("contractPolicies/providerPackageV2"),
    )).data();
    // Independent, absent-by-default release barrier. Never set by this code.
    if (policy?.featureGates?.packageEditorMediaWrites !== true) {
      fail("FEATURE_DISABLED");
    }
    const draft = (await tx.get(draftRef)).data();
    // Legacy drafts need an explicit inventory audit; never infer protection.
    if (draft?.mediaLifecycleVersion !== 1) fail("MEDIA_REFERENCE_RECONCILIATION_REQUIRED");
    if (input.kind === "theme" &&
        !draft?.progress?.themes?.some((theme: {editorThemeId?: unknown}) =>
          theme.editorThemeId === input.themeId)) {
      fail("INVALID_EDITOR_DRAFT_MEDIA", "invalid-argument");
    }
    // Bound only live upload capabilities. Expired/consumed records remain as
    // durable reconciliation evidence, never proof of Cloudinary absence.
    const nowMs = Date.now();
    if (nowMs >= issuedAtMs + 60 * 60 * 1000) fail("REVISION_CONFLICT", "aborted");
    const outstanding = await tx.get(
      draftRef.collection("mediaUploadReservations")
        .where("state", "==", "reserved").where("expiresAtMs", ">", nowMs).limit(57),
    );
    if (outstanding.size >= 56) fail("EDITOR_DRAFT_MEDIA_LIMIT");
    await requireMaintenanceOpen(tx, db, "publication");
    const ownerScope = {
      ownerUid: actor.uid, providerId, editorDraftId: input.editorDraftId,
      assetId: reservation.id, kind: input.kind, themeId: input.themeId,
    };
    tx.create(reservation, {
      ...ownerScope, state: "reserved", draftRevision: input.expectedRevision,
      canonicalProtection: {version: 1, state: "draft_only", packageId: null, operationId: null},
      issuedAtMs, expiresAtMs: issuedAtMs + 60 * 60 * 1000,
      cloudinaryPublicId: editorDraftUploadPlanV1(
        ownerScope, Math.floor(issuedAtMs / 1000),
      ).public_id,
      createdAt: Timestamp.now(),
    });
    // Contend on the owning draft as well as the bounded query, including
    // concurrent reservations against an initially empty collection.
    tx.update(draftRef, {mediaReservationUpdatedAt: Timestamp.now()});
    return ownerScope;
  });
  // No Cloudinary call/signature inside a retryable Firestore transaction.
  // Failure leaves a bounded reservation for future orphan reconciliation.
  return {assetId: scope.assetId, ...createEditorDraftUploadSignatureV1(
    scope, Math.floor(issuedAtMs / 1000),
  )};
});
