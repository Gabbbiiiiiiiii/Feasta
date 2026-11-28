/** Planning/pinning only. No copy, canonical write, callable, or gate activation. */
import {db} from "../shared/firestore.js";
import {Timestamp} from "firebase-admin/firestore";
import {assertRegistrationAccess} from "./provider-editor-draft-media-registration-v1.js";
import {resolveEditorDraftProgressMediaV1} from "./editor-draft-media-progress-v1.js";
import {
  assertCanonicalMediaUnusedV1, assertMediaLifecycleDraftV1, mediaLifecycleFailure,
  mediaOperationHash, requireMediaLifecyclePolicyV1,
} from "./editor-draft-media-cleanup-v1.js";

export async function prepareEditorDraftMediaPromotionV1(input: {
  actorUid: string; editorDraftId: string; expectedRevision: number; idempotencyKey: string;
}) {
  const id = /^[A-Za-z0-9_-]{1,128}$/u;
  if (!id.test(input.actorUid) || !id.test(input.editorDraftId) ||
      !/^[A-Za-z0-9_-]{16,128}$/u.test(input.idempotencyKey) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    mediaLifecycleFailure();
  }
  const operationId = mediaOperationHash([input.actorUid, "mediaPromotion", input.idempotencyKey]);
  const opRef = db.collection("providerPackageEditorMediaPromotions").doc(operationId);
  const target = db.collection("packages").doc(); // Allocate once outside transaction retries.
  return db.runTransaction(async (tx) => {
    await requireMediaLifecyclePolicyV1(tx, "packageEditorMediaPromotionWrites");
    const providerId = await assertRegistrationAccess(tx,
      {...input, assetId: "promotion", kind: "package", themeId: null}, operationId);
    const draftRef = db.collection("providerPackageEditorDrafts").doc(input.editorDraftId);
    const draft = (await tx.get(draftRef)).data()!;
    const prior = (await tx.get(opRef)).data();
    const media = await resolveEditorDraftProgressMediaV1(tx, draftRef,
      {ownerUid: input.actorUid, providerId, editorDraftId: input.editorDraftId}, draft.progress);
    if (!media) mediaLifecycleFailure();
    const requestHash = mediaOperationHash([input.actorUid, input.editorDraftId,
      input.expectedRevision, input.idempotencyKey, providerId, media]);
    if (prior) {
      if (prior.requestHash !== requestHash || prior.ownerUid !== input.actorUid ||
          prior.providerId !== providerId || prior.editorDraftId !== input.editorDraftId ||
          prior.state !== "planned" || draft.mediaPromotionOperationId !== operationId) {
        mediaLifecycleFailure("MEDIA_PROMOTION_CONFLICT");
      }
      if ((await tx.get(db.collection("packages").doc(prior.packageId))).exists) {
        mediaLifecycleFailure("MEDIA_PROMOTION_CONFLICT");
      }
      const pinned = [...media.packageAssets, ...media.themes.flatMap((theme) => theme.assets)];
      for (const asset of pinned) {
        const reservation = (await tx.get(draftRef.collection("mediaUploadReservations")
          .doc(asset.assetId))).data();
        if (reservation?.canonicalProtection?.state !== "promotion_pending" ||
            reservation.canonicalProtection.operationId !== operationId ||
            reservation.canonicalProtection.packageId !== prior.packageId) mediaLifecycleFailure();
      }
      return {operationId, packageId: prior.packageId as string, state: "planned" as const};
    }
    assertMediaLifecycleDraftV1(draft);
    if (draft.state !== "incomplete" || (draft.mediaCleanupPendingCount ?? 0) !== 0) {
      mediaLifecycleFailure();
    }
    const assets = [...media.packageAssets, ...media.themes.flatMap((theme) => theme.assets)];
    const reservations = [];
    const identities = new Map<string, FirebaseFirestore.DocumentData>();
    for (const asset of assets) {
      const ref = draftRef.collection("mediaUploadReservations").doc(asset.assetId);
      const reservation = (await tx.get(ref)).data()!;
      await assertCanonicalMediaUnusedV1(tx, reservation);
      reservations.push(ref);
      identities.set(asset.assetId, (await tx.get(draftRef.collection("mediaAssets")
        .doc(asset.assetId))).data()!);
    }
    if ((await tx.get(target)).exists) mediaLifecycleFailure("MEDIA_PROMOTION_CONFLICT");
    const plan = assets.map((asset) => ({...asset,
      sourceAssetId: identities.get(asset.assetId)!.cloudinaryAssetId,
      sourceVersion: identities.get(asset.assetId)!.cloudinaryVersion,
      sourcePublicId: identities.get(asset.assetId)!.cloudinaryPublicId,
      overwrite: false,
      // Immutable, operation-scoped target. A future copy must use overwrite=false.
      targetPublicId: `feasta/providers/${input.actorUid}/packages/${target.id}/` +
        `promotions/${operationId}/` + (asset.kind === "package" ?
          `package/${asset.assetId}` : `themes/${asset.themeId}/${asset.assetId}`),
    }));
    tx.create(opRef, {ownerUid: input.actorUid, providerId,
      editorDraftId: input.editorDraftId, draftRevision: input.expectedRevision,
      packageId: target.id, requestHash, state: "planned", media, plan,
      createdAt: Timestamp.now()});
    for (const ref of reservations) tx.update(ref, {canonicalProtection: {
      version: 1, state: "promotion_pending", packageId: target.id, operationId,
    }});
    tx.update(draftRef, {mediaPromotionOperationId: operationId});
    return {operationId, packageId: target.id, state: "planned" as const};
  });
}

/** Only an untouched plan can be cancelled. Copying/reconciliation needs a future saga. */
export async function cancelEditorDraftMediaPromotionV1(input: {
  actorUid: string; editorDraftId: string; expectedRevision: number; idempotencyKey: string;
}) {
  const id = /^[A-Za-z0-9_-]{1,128}$/u;
  if (!id.test(input.actorUid) || !id.test(input.editorDraftId) ||
      !/^[A-Za-z0-9_-]{16,128}$/u.test(input.idempotencyKey) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    mediaLifecycleFailure();
  }
  const operationId = mediaOperationHash([input.actorUid, "mediaPromotion", input.idempotencyKey]);
  return db.runTransaction(async (tx) => {
    const providerId = await assertRegistrationAccess(tx,
      {...input, assetId: "promotion", kind: "package", themeId: null}, operationId);
    const draftRef = db.collection("providerPackageEditorDrafts").doc(input.editorDraftId);
    const draft = (await tx.get(draftRef)).data()!;
    const opRef = db.collection("providerPackageEditorMediaPromotions").doc(operationId);
    const op = (await tx.get(opRef)).data();
    if (!op || op.ownerUid !== input.actorUid || op.providerId !== providerId ||
        op.editorDraftId !== input.editorDraftId || op.draftRevision !== input.expectedRevision) {
      mediaLifecycleFailure();
    }
    if (op.state === "cancelled") return {state: "cancelled" as const};
    if (op.state !== "planned" || draft.mediaPromotionOperationId !== operationId) {
      mediaLifecycleFailure();
    }
    const media = await resolveEditorDraftProgressMediaV1(tx, draftRef,
      {ownerUid: input.actorUid, providerId, editorDraftId: input.editorDraftId}, draft.progress);
    if (!media) mediaLifecycleFailure();
    const refs = [];
    for (const asset of [...media.packageAssets, ...media.themes.flatMap((t) => t.assets)]) {
      const ref = draftRef.collection("mediaUploadReservations").doc(asset.assetId);
      const protection = (await tx.get(ref)).data()?.canonicalProtection;
      if (protection?.state !== "promotion_pending" || protection.operationId !== operationId ||
          protection.packageId !== op.packageId) mediaLifecycleFailure();
      refs.push(ref);
    }
    for (const ref of refs) tx.update(ref, {canonicalProtection: {
      version: 1, state: "draft_only", packageId: null, operationId: null,
    }});
    tx.update(draftRef, {mediaPromotionOperationId: null});
    tx.update(opRef, {state: "cancelled", cancelledAt: Timestamp.now()});
    return {state: "cancelled" as const};
  });
}
