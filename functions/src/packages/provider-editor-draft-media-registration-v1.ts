/**
 * Internal server-side registry for verified private editor assets.
 *
 * This service is intentionally NOT exported as a callable.
 * The eventual callable must derive actorUid from Firebase Auth.
 *
 * Cloudinary verification occurs outside Firestore transactions.
 * Draft authorization and revision are rechecked before writing.
 *
 * Draft discard, package completion and media cleanup must be
 * integrated before this service can be enabled for providers.
 */

import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {db} from "../shared/firestore.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {USER_ROLES} from "../shared/constants.js";
import {
  requireMaintenanceOpen,
} from "../shared/maintenance.js";
import {
  verifyEditorDraftCloudinaryAssetV1,
} from "../shared/cloudinary.js";
import {
  authorizeProviderForPackageManagement,
} from "./package-domain.js";
import {
  planEditorDraftMediaRegistrationV1,
  type DraftMediaRegistryRecordV1,
} from "./editor-draft-media-registry-v1.js";

type RegistrationInput = {
  actorUid: string;
  editorDraftId: string;
  expectedRevision: number;
  assetId: string;
  kind: "package" | "theme";
  themeId: string | null;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const DRAFTS = "providerPackageEditorDrafts";
const POLICY = "contractPolicies/providerPackageV2";

function fail(
  reason: string,
  code: ConstructorParameters<typeof HttpsError>[0] =
    "failed-precondition",
): never {
  throw new HttpsError(code, reason, {reason});
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function validateInput(input: RegistrationInput): void {
  if (
    !input ||
    !validId(input.actorUid) ||
    !validId(input.editorDraftId) ||
    !validId(input.assetId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    (input.kind !== "package" && input.kind !== "theme") ||
    (input.kind === "package" && input.themeId !== null) ||
    (input.kind === "theme" && !validId(input.themeId))
  ) {
    fail("INVALID_EDITOR_DRAFT_MEDIA", "invalid-argument");
  }
}

export async function assertRegistrationAccess(
  tx: FirebaseFirestore.Transaction,
  input: RegistrationInput,
  allowedPromotionOperationId?: string,
): Promise<string> {
  const userSnapshot = await tx.get(
    db.collection("users").doc(input.actorUid),
  );

  const user = userSnapshot.data();

  if (
    user?.role !== USER_ROLES.provider ||
    !validId(user.providerId)
  ) {
    fail("PROVIDER_NOT_APPROVED");
  }

  if (resolveBackendAccountState({authDisabled: false, profile: user,
    allowedRoles: [USER_ROLES.provider]}).kind !== "active") {
    fail("ACCOUNT_ACCESS_DENIED", "permission-denied");
  }

  const providerSnapshot = await tx.get(
    db.collection("providers").doc(user.providerId),
  );

  const providerId = authorizeProviderForPackageManagement({
    actorUid: input.actorUid,
    providerSnapshot,
  }).providerId;

  const draftSnapshot = await tx.get(
    db.collection(DRAFTS).doc(input.editorDraftId),
  );

  const draft = draftSnapshot.data();

  if (
    !draft ||
    draft.ownerUid !== input.actorUid ||
    draft.providerId !== providerId ||
    draft.editorSchemaVersion !== 2 ||
    draft.state !== "incomplete" ||
    draft.packageId !== null ||
    draft.basePackageRevision !== null
  ) {
    fail("RESOURCE_NOT_FOUND", "not-found");
  }

  if (draft.revision !== input.expectedRevision) {
    fail("REVISION_CONFLICT", "aborted");
  }
  if (draft.mediaPromotionOperationId &&
      draft.mediaPromotionOperationId !== allowedPromotionOperationId) {
    fail("EDITOR_DRAFT_MEDIA_BUSY");
  }

  const policySnapshot = await tx.get(db.doc(POLICY));
  const policy = policySnapshot.data();
  const project =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;

  if (
    !project ||
    !policy ||
    policy.effectiveEnvironment !== project ||
    !Number.isSafeInteger(policy.revision) ||
    policy.revision < 1 ||
    policy.featureGates?.packageEditorProgressWrites !== true
  ) {
    fail("FEATURE_DISABLED");
  }

  return providerId;
}

/**
 * Durable states: reserved -> registered (atomic with registry admission).
 * Expired is derived from expiresAtMs, never a deletion authorization.
 * Reserved includes unknown upload outcome; verification failure writes nothing.
 * Revoked/cleanup_pending/retired are terminal for admission and owned by the
 * cleanup coordinator. Never recycle asset IDs or delete reservation evidence
 * merely because a signing request, browser upload or lookup was interrupted.
 * No in-flight lease: a failed lookup leaves the reservation retryable.
 */
export type EditorDraftUploadReservationStateV1 =
  "reserved" | "registered" | "revoked" | "cleanup_pending" | "retired";

async function readReservation(
  tx: FirebaseFirestore.Transaction,
  input: RegistrationInput,
  providerId: string,
) {
  const ref = db.collection(DRAFTS).doc(input.editorDraftId)
    .collection("mediaUploadReservations").doc(input.assetId);
  const value = (await tx.get(ref)).data();
  const prefix = `feasta/providers/${input.actorUid}` +
    `/editor-drafts/${input.editorDraftId}`;
  const publicId = input.kind === "package" ?
    `${prefix}/package/${input.assetId}` :
    `${prefix}/themes/${input.themeId}/${input.assetId}`;
  if (!value || value.ownerUid !== input.actorUid ||
      value.providerId !== providerId ||
      value.editorDraftId !== input.editorDraftId ||
      value.assetId !== input.assetId || value.kind !== input.kind ||
      value.themeId !== input.themeId ||
      value.cloudinaryPublicId !== publicId ||
      value.draftRevision !== input.expectedRevision ||
      !Number.isSafeInteger(value.expiresAtMs) ||
      !Number.isSafeInteger(value.issuedAtMs) ||
      value.expiresAtMs <= value.issuedAtMs ||
      (value.state !== "reserved" && value.state !== "registered")) {
    fail("EDITOR_DRAFT_MEDIA_RESERVATION_CONFLICT");
  }
  if (value.state === "reserved" && value.expiresAtMs <= Date.now()) {
    fail("EDITOR_DRAFT_MEDIA_RESERVATION_EXPIRED");
  }
  return {ref, value};
}

/**
 * Internal registration entry point.
 *
 * Call only after a trusted Firebase callable has authenticated
 * the actor and obtained actorUid from its verified auth context.
 *
 * No client-provided URL, public ID, or verification result
 * is accepted by this API.
 */
export async function registerEditorDraftMediaV1(
  input: RegistrationInput,
) {
  validateInput(input);

  // Early authorization prevents unauthorized Cloudinary lookups.
  const providerId = await db.runTransaction(
    async (tx) => {
      const id = await assertRegistrationAccess(tx, input);
      await readReservation(tx, input, id);
      return id;
    },
  );

  const proof = await verifyEditorDraftCloudinaryAssetV1({
    ownerUid: input.actorUid,
    providerId,
    editorDraftId: input.editorDraftId,
    assetId: input.assetId,
    kind: input.kind,
    themeId: input.themeId,
  });

  // Firestore transaction protects against draft changes between
  // Cloudinary verification and registry creation.
  return db.runTransaction(async (tx) => {
    const currentProviderId =
      await assertRegistrationAccess(tx, input);

    if (currentProviderId !== providerId) {
      fail("REVISION_CONFLICT", "aborted");
    }

    await requireMaintenanceOpen(
      tx,
      db,
      "publication",
    );

    const assetRef = db
      .collection(DRAFTS)
      .doc(input.editorDraftId)
      .collection("mediaAssets")
      .doc(input.assetId);

    const reservation = await readReservation(tx, input, providerId);
    const existingSnapshot = await tx.get(assetRef);

    const existing = existingSnapshot.exists ?
      existingSnapshot.data() as DraftMediaRegistryRecordV1 :
      null;

    const plan = planEditorDraftMediaRegistrationV1(
      {
        ownerUid: input.actorUid,
        providerId,
        editorDraftId: input.editorDraftId,
      },
      proof,
      existing,
    );

    if (proof.record.assetId !== input.assetId ||
        !validId(proof.cloudinaryAssetId) ||
        !Number.isSafeInteger(proof.cloudinaryVersion) ||
        proof.cloudinaryVersion < 1 ||
        proof.record.kind !== input.kind ||
        proof.record.themeId !== input.themeId ||
        proof.record.cloudinaryPublicId !==
          reservation.value.cloudinaryPublicId ||
        (reservation.value.state === "registered" &&
          (plan.action !== "unchanged" ||
            reservation.value.cloudinaryAssetId !== proof.cloudinaryAssetId ||
            reservation.value.cloudinaryVersion !== proof.cloudinaryVersion ||
            reservation.value.registeredUrl !== plan.record.url)) ||
        (reservation.value.state === "reserved" && existing !== null)) {
      fail("EDITOR_DRAFT_MEDIA_RESERVATION_CONFLICT");
    }
    if (plan.action === "create") {
      tx.create(assetRef, {
        ...plan.record,
        cloudinaryAssetId: proof.cloudinaryAssetId,
        cloudinaryVersion: proof.cloudinaryVersion,
        createdAt: Timestamp.now(),
      });
      tx.update(reservation.ref, {
        state: "registered", registeredUrl: plan.record.url,
        cloudinaryAssetId: proof.cloudinaryAssetId,
        cloudinaryVersion: proof.cloudinaryVersion,
        registeredAt: Timestamp.now(),
      });
    }

    return {
      assetId: plan.record.assetId,
      url: plan.record.url,
      kind: plan.record.kind,
      themeId: plan.record.themeId,
      state: "verified" as const,
      action: plan.action,
    };
  });
}
