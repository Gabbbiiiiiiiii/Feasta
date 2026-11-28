/**
 * Testable Cloudinary lookup adapter.
 * Caller must supply a trusted server-side resource lookup.
 */
import {
  assertEditorDraftCloudinaryProofV1,
} from "./editor-draft-cloudinary-proof-v1.js";

export class EditorDraftMediaLookupError extends Error {
  constructor() {
    super("EDITOR_DRAFT_MEDIA_LOOKUP_FAILED");
    this.name = "EditorDraftMediaLookupError";
  }
}

type Scope = Parameters<typeof assertEditorDraftCloudinaryProofV1>[0];
type Resource = Parameters<typeof assertEditorDraftCloudinaryProofV1>[2];

const ID = /^[A-Za-z0-9_-]{1,128}$/u;

function valid(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function fail(): never {
  throw new EditorDraftMediaLookupError();
}

export async function lookupVerifiedEditorDraftCloudinaryV1(
  scope: Scope,
  cloudName: string,
  lookup: (publicId: string) => Promise<Resource>,
) {
  if (
    !scope ||
    !valid(scope.ownerUid) ||
    !valid(scope.providerId) ||
    !valid(scope.editorDraftId) ||
    !valid(scope.assetId) ||
    !valid(cloudName) ||
    typeof lookup !== "function" ||
    (scope.kind !== "package" && scope.kind !== "theme") ||
    (scope.kind === "package" && scope.themeId !== null) ||
    (scope.kind === "theme" && !valid(scope.themeId))
  ) {
    return fail();
  }

  const prefix =
    `feasta/providers/${scope.ownerUid}/editor-drafts/${scope.editorDraftId}`;

  const publicId = scope.kind === "package"
    ? `${prefix}/package/${scope.assetId}`
    : `${prefix}/themes/${scope.themeId}/${scope.assetId}`;

  let resource: Resource;

  try {
    resource = await lookup(publicId);
  } catch {
    return fail();
  }

  return assertEditorDraftCloudinaryProofV1(
    scope,
    cloudName,
    resource,
  );
}
