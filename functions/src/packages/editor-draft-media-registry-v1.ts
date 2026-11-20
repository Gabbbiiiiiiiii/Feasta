/**
 * Private draft media registry admission rules.
 *
 * SECURITY:
 * Proof must come from the trusted server-side Cloudinary
 * verification bridge, never directly from request.data.
 *
 * This module is pure. It does not access Firestore,
 * create upload signatures, publish, or delete assets.
 */

import type {
  VerifiedEditorDraftAssetV1,
  EditorDraftMediaOwnerV1,
} from "./editor-draft-media-ownership-v1.js";

export class EditorDraftMediaRegistryError extends Error {
  constructor() {
    super("EDITOR_DRAFT_MEDIA_REGISTRY_CONFLICT");
    this.name = "EditorDraftMediaRegistryError";
  }
}

export type DraftMediaRegistryRecordV1 =
  VerifiedEditorDraftAssetV1 & {
    url: string;
  };

export type DraftMediaVerifiedProofV1 = {
  url: string;
  record: VerifiedEditorDraftAssetV1;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/u;

function fail(): never {
  throw new EditorDraftMediaRegistryError();
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function expectedPath(
  record: VerifiedEditorDraftAssetV1,
): string {
  const prefix =
    `feasta/providers/${record.ownerUid}` +
    `/editor-drafts/${record.editorDraftId}`;

  if (record.kind === "package") {
    if (record.themeId !== null) {
      return fail();
    }

    return `${prefix}/package/${record.assetId}`;
  }

  if (record.kind === "theme" && validId(record.themeId)) {
    return `${prefix}/themes/${record.themeId}/${record.assetId}`;
  }

  return fail();
}

function sameRecord(
  a: DraftMediaRegistryRecordV1,
  b: DraftMediaRegistryRecordV1,
): boolean {
  return (
    a.assetId === b.assetId &&
    a.ownerUid === b.ownerUid &&
    a.providerId === b.providerId &&
    a.editorDraftId === b.editorDraftId &&
    a.kind === b.kind &&
    a.themeId === b.themeId &&
    a.cloudinaryPublicId === b.cloudinaryPublicId &&
    a.state === b.state &&
    a.url === b.url
  );
}

export function planEditorDraftMediaRegistrationV1(
  owner: EditorDraftMediaOwnerV1,
  proof: DraftMediaVerifiedProofV1,
  existing: DraftMediaRegistryRecordV1 | null,
): {
  action: "create" | "unchanged";
  record: DraftMediaRegistryRecordV1;
} {
  if (
    !owner ||
    !proof ||
    !proof.record ||
    !validId(owner.ownerUid) ||
    !validId(owner.providerId) ||
    !validId(owner.editorDraftId)
  ) {
    return fail();
  }

  const value = proof.record;

  if (
    !validId(value.assetId) ||
    value.ownerUid !== owner.ownerUid ||
    value.providerId !== owner.providerId ||
    value.editorDraftId !== owner.editorDraftId ||
    value.state !== "verified" ||
    (value.kind !== "package" && value.kind !== "theme")
  ) {
    return fail();
  }

  // Cloudinary public IDs contain slashes.
  // Verify the EXACT expected path, not a simple ID regex
  // or a permissive string-prefix check.
  const expectedPublicId = expectedPath(value);

  if (
    typeof value.cloudinaryPublicId !== "string" ||
    value.cloudinaryPublicId !== expectedPublicId ||
    typeof proof.url !== "string" ||
    !proof.url.startsWith("https://res.cloudinary.com/")
  ) {
    return fail();
  }

  const proposed: DraftMediaRegistryRecordV1 = {
    assetId: value.assetId,
    ownerUid: value.ownerUid,
    providerId: value.providerId,
    editorDraftId: value.editorDraftId,
    kind: value.kind,
    themeId: value.themeId,
    cloudinaryPublicId: value.cloudinaryPublicId,
    state: "verified",
    url: proof.url,
  };

  if (existing === null) {
    return {
      action: "create",
      record: proposed,
    };
  }

  if (!sameRecord(existing, proposed)) {
    return fail();
  }

  return {
    action: "unchanged",
    record: proposed,
  };
}
