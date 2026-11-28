/** Transaction-only admission/recovery. This module never uploads or deletes. */
import {HttpsError} from "firebase-functions/v2/https";
import {parseEditorDraftMediaManifestV1} from "./editor-draft-media-manifest-v1.js";
import {
  assertEditorDraftMediaOwnershipV1,
  type EditorDraftMediaOwnerV1,
  type VerifiedEditorDraftAssetV1,
} from "./editor-draft-media-ownership-v1.js";
import {
  validatePackageEditorProgress, type ProgressRecord,
} from "./package-editor-progress-v2.js";

function reject(): never {
  throw new HttpsError("failed-precondition", "UNVERIFIED_EDITOR_DRAFT_MEDIA",
    {reason: "UNVERIFIED_EDITOR_DRAFT_MEDIA"});
}

/** Arrays are reconstructed in manifest order, never Firestore query order. */
export async function resolveEditorDraftProgressMediaV1(
  tx: FirebaseFirestore.Transaction,
  draftRef: FirebaseFirestore.DocumentReference,
  owner: EditorDraftMediaOwnerV1,
  progress: ProgressRecord,
) {
  // Also validate stored/replayed progress; recovery must not trust saved URLs.
  let parsed;
  try {
    parsed = validatePackageEditorProgress(progress, {
      maxSpecificOccasions: 100, maxThemeImages: 4,
    });
  } catch { return reject(); }
  const themes = (parsed.themes ?? []) as {
    editorThemeId: string; assetIds: string[];
  }[];
  let manifest;
  try {
    manifest = parseEditorDraftMediaManifestV1({
      packageAssetIds: parsed.marketingAssetIds ?? [],
      themes: themes.map((theme) => ({
        themeId: theme.editorThemeId, assetIds: theme.assetIds,
      })),
    });
  } catch { return reject(); }
  const ids = [...manifest.packageAssetIds,
    ...manifest.themes.flatMap((theme) => theme.assetIds)];
  if (!ids.length) return undefined;
  const records: FirebaseFirestore.DocumentData[] = [];
  // At most 56 assets / 112 point reads; no unbounded subcollection scan.
  const snapshots = await Promise.all(ids.map((id) => Promise.all([
    tx.get(draftRef.collection("mediaAssets").doc(id)),
    tx.get(draftRef.collection("mediaUploadReservations").doc(id)),
  ])));
  for (const [index, id] of ids.entries()) {
    const [assetSnapshot, reservationSnapshot] = snapshots[index];
    const asset = assetSnapshot.data();
    const reservation = reservationSnapshot.data();
    if (!asset || !reservation || asset.assetId !== id ||
        reservation.state !== "registered" ||
        reservation.assetId !== id ||
        reservation.ownerUid !== owner.ownerUid ||
        reservation.providerId !== owner.providerId ||
        reservation.editorDraftId !== owner.editorDraftId ||
        !Number.isSafeInteger(reservation.draftRevision) || reservation.draftRevision < 1 ||
        !Number.isSafeInteger(reservation.issuedAtMs) || reservation.issuedAtMs < 1 ||
        !Number.isSafeInteger(reservation.expiresAtMs) ||
        reservation.expiresAtMs <= reservation.issuedAtMs ||
        reservation.kind !== asset.kind || reservation.themeId !== asset.themeId ||
        reservation.cloudinaryPublicId !== asset.cloudinaryPublicId ||
        reservation.registeredUrl !== asset.url ||
        typeof asset.cloudinaryAssetId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/u.test(asset.cloudinaryAssetId) ||
        !Number.isSafeInteger(asset.cloudinaryVersion) || asset.cloudinaryVersion < 1 ||
        reservation.cloudinaryAssetId !== asset.cloudinaryAssetId ||
        reservation.cloudinaryVersion !== asset.cloudinaryVersion) return reject();
    // Registry data is server-owned, but malformed or legacy URLs still fail closed.
    try {
      const url = new URL(asset.url);
      const extension = url.pathname.match(/\.(jpg|jpeg|png|webp)$/u)?.[1];
      const cloud = url.pathname.split("/")[1];
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" ||
          url.username || url.password || url.port || url.search || url.hash ||
          !/^[A-Za-z0-9_-]{1,128}$/u.test(cloud) || !extension ||
          url.pathname !== `/${cloud}/image/upload/v${asset.cloudinaryVersion}/` +
            `${asset.cloudinaryPublicId}.${extension}`) return reject();
    } catch { return reject(); }
    records.push(asset);
  }
  try {
    assertEditorDraftMediaOwnershipV1(manifest, owner,
      records as VerifiedEditorDraftAssetV1[]);
  } catch { return reject(); }
  const byId = new Map(records.map((record) => [record.assetId, record]));
  const media = (id: string) => {
    const record = byId.get(id)!;
    return {assetId: id, url: record.url as string,
      kind: record.kind as "package" | "theme", themeId: record.themeId as string | null};
  };
  return {
    packageAssets: manifest.packageAssetIds.map(media),
    themes: manifest.themes.map((theme) => ({
      themeId: theme.themeId, assets: theme.assetIds.map(media),
    })),
  };
}
