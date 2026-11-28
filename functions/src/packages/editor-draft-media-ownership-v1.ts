/**
 * Step 4.1B-3: validate private-editor media ownership.
 *
 * SECURITY BOUNDARY:
 * The caller MUST obtain records from a trusted server-owned
 * registry, never from client-supplied request data.
 *
 * This contract does not query Cloudinary or Firestore.
 * It does not authorize upload, publication, or deletion.
 */

import {
  parseEditorDraftMediaManifestV1,
  type EditorDraftMediaManifestV1,
} from "./editor-draft-media-manifest-v1.js";

export class EditorDraftMediaOwnershipError extends Error {
  constructor() {
    super("UNVERIFIED_EDITOR_DRAFT_MEDIA");
    this.name = "EditorDraftMediaOwnershipError";
  }
}

export type EditorDraftMediaOwnerV1 = {
  ownerUid: string;
  providerId: string;
  editorDraftId: string;
};

export type VerifiedEditorDraftAssetV1 = {
  assetId: string;
  ownerUid: string;
  providerId: string;
  editorDraftId: string;
  kind: "package" | "theme";
  themeId: string | null;
  cloudinaryPublicId: string;
  state: "verified";
};

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/u;

function fail(): never {
  throw new EditorDraftMediaOwnershipError();
}

function validId(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function expectedPublicId(
  ownerUid: string,
  editorDraftId: string,
  assetId: string,
  kind: "package" | "theme",
  themeId: string | null,
): string {
  const prefix =
    `feasta/providers/${ownerUid}/editor-drafts/${editorDraftId}`;

  return kind === "package"
    ? `${prefix}/package/${assetId}`
    : `${prefix}/themes/${themeId}/${assetId}`;
}

function requiredAssets(manifest: EditorDraftMediaManifestV1) {
  return [
    ...manifest.packageAssetIds.map((assetId) => ({
      assetId,
      kind: "package" as const,
      themeId: null,
    })),
    ...manifest.themes.flatMap((theme) =>
      theme.assetIds.map((assetId) => ({
        assetId,
        kind: "theme" as const,
        themeId: theme.themeId,
      })),
    ),
  ];
}

export function assertEditorDraftMediaOwnershipV1(
  rawManifest: unknown,
  owner: EditorDraftMediaOwnerV1,
  registryRecords: readonly VerifiedEditorDraftAssetV1[],
): EditorDraftMediaManifestV1 {
  if (
    !owner ||
    !validId(owner.ownerUid) ||
    !validId(owner.providerId) ||
    !validId(owner.editorDraftId) ||
    !Array.isArray(registryRecords)
  ) {
    return fail();
  }

  const manifest = parseEditorDraftMediaManifestV1(rawManifest);
  const required = requiredAssets(manifest);

  if (registryRecords.length !== required.length) {
    return fail();
  }

  const records = new Map<string, VerifiedEditorDraftAssetV1>();

  for (const record of registryRecords) {
    if (
      !record ||
      !validId(record.assetId) ||
      records.has(record.assetId) ||
      record.ownerUid !== owner.ownerUid ||
      record.providerId !== owner.providerId ||
      record.editorDraftId !== owner.editorDraftId ||
      record.state !== "verified"
    ) {
      return fail();
    }

    records.set(record.assetId, record);
  }

  for (const item of required) {
    const record = records.get(item.assetId);

    if (
      !record ||
      record.kind !== item.kind ||
      record.themeId !== item.themeId ||
      record.cloudinaryPublicId !== expectedPublicId(
        owner.ownerUid,
        owner.editorDraftId,
        item.assetId,
        item.kind,
        item.themeId,
      )
    ) {
      return fail();
    }
  }

  return manifest;
}