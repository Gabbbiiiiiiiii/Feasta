/**
 * Step 4.1B-4: verify a draft-scoped Cloudinary resource.
 *
 * SECURITY:
 * The resource MUST come from a server-side Cloudinary
 * resource lookup. Never trust client-submitted resource data.
 *
 * This function is pure. It does not upload, fetch, attach,
 * publish, delete, or persist assets.
 */

export class EditorDraftCloudinaryProofError extends Error {
  constructor() {
    super("INVALID_EDITOR_DRAFT_CLOUDINARY_ASSET");
    this.name = "EditorDraftCloudinaryProofError";
  }
}

type AssetScope = {
  ownerUid: string;
  providerId: string;
  editorDraftId: string;
  assetId: string;
  kind: "package" | "theme";
  themeId: string | null;
};

type CloudinaryResource = {
  asset_id?: unknown;
  version?: unknown;
  public_id?: unknown;
  resource_type?: unknown;
  type?: unknown;
  format?: unknown;
  bytes?: unknown;
  secure_url?: unknown;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

function fail(): never {
  throw new EditorDraftCloudinaryProofError();
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export function assertEditorDraftCloudinaryProofV1(
  scope: AssetScope,
  cloudName: string,
  resource: CloudinaryResource,
) {
  if (
    !scope ||
    !validId(scope.ownerUid) ||
    !validId(scope.providerId) ||
    !validId(scope.editorDraftId) ||
    !validId(scope.assetId) ||
    !validId(cloudName) ||
    !resource ||
    typeof resource !== "object"
  ) {
    return fail();
  }

  if (
    scope.kind !== "package" &&
    scope.kind !== "theme"
  ) {
    return fail();
  }

  if (
    (scope.kind === "package" && scope.themeId !== null) ||
    (scope.kind === "theme" && !validId(scope.themeId))
  ) {
    return fail();
  }

  const prefix =
    `feasta/providers/${scope.ownerUid}` +
    `/editor-drafts/${scope.editorDraftId}`;

  const publicId = scope.kind === "package"
    ? `${prefix}/package/${scope.assetId}`
    : `${prefix}/themes/${scope.themeId}/${scope.assetId}`;

  if (
    !validId(resource.asset_id) ||
    !Number.isSafeInteger(resource.version) ||
    (resource.version as number) < 1 ||
    resource.public_id !== publicId ||
    resource.resource_type !== "image" ||
    resource.type !== "upload" ||
    typeof resource.format !== "string" ||
    !FORMATS.has(resource.format.toLowerCase()) ||
    typeof resource.bytes !== "number" ||
    !Number.isSafeInteger(resource.bytes) ||
    resource.bytes <= 0 ||
    resource.bytes > MAX_BYTES ||
    typeof resource.secure_url !== "string"
  ) {
    return fail();
  }

  let url: URL;

  try {
    url = new URL(resource.secure_url);
  } catch {
    return fail();
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return fail();
  }

  const base = `/${cloudName}/image/upload/`;

  if (!url.pathname.startsWith(base)) {
    return fail();
  }

  const remainder = url.pathname.slice(base.length);

  // Require delivery of the exact verified version, without transformations.
  const match = remainder.match(
    /^v([0-9]+)\/(.+)\.(jpg|jpeg|png|webp)$/u
  );

  if (!match || Number(match[1]) !== resource.version ||
      match[2] !== publicId) {
    return fail();
  }

  const actualExtension = match[3];
  const actualFormat = resource.format.toLowerCase();

  if (
    actualExtension !== actualFormat &&
    !(actualFormat === "jpg" && actualExtension === "jpeg") &&
    !(actualFormat === "jpeg" && actualExtension === "jpg")
  ) {
    return fail();
  }

  return {
    cloudinaryAssetId: resource.asset_id,
    cloudinaryVersion: resource.version as number,
    url: resource.secure_url,
    record: {
      assetId: scope.assetId,
      ownerUid: scope.ownerUid,
      providerId: scope.providerId,
      editorDraftId: scope.editorDraftId,
      kind: scope.kind,
      themeId: scope.themeId,
      cloudinaryPublicId: publicId,
      state: "verified" as const,
    },
  };
}
