import {lookupVerifiedEditorDraftCloudinaryV1} from "../packages/editor-draft-cloudinary-lookup-v1.js";
import {
  editorDraftUploadPlanV1,
  type EditorDraftUploadScopeV1,
} from "../packages/editor-draft-upload-plan-v1.js";
import {
  v2 as cloudinary,
} from "cloudinary";
import {
  defineSecret,
} from "firebase-functions/params";
import {
  HttpsError,
} from "firebase-functions/v2/https";

const cloudinaryCloudName = defineSecret(
  "CLOUDINARY_CLOUD_NAME",
);

const cloudinaryApiKey = defineSecret(
  "CLOUDINARY_API_KEY",
);

const cloudinaryApiSecret = defineSecret(
  "CLOUDINARY_API_SECRET",
);

export const cloudinarySecrets = [
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
];

/** Internal only; callers must first persist an authorized upload reservation. */
export function createEditorDraftUploadSignatureV1(
  scope: EditorDraftUploadScopeV1,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const parameters = editorDraftUploadPlanV1(
    scope, timestamp,
  );
  const configuration = configureCloudinary();
  return {
    apiKey: configuration.apiKey,
    cloudName: configuration.cloudName,
    parameters,
    signature: cloudinary.utils.api_sign_request(
      parameters, configuration.apiSecret,
    ),
  };
}

export type ProviderMediaType =
  | "logo"
  | "cover";

export function createProviderUploadSignature(
  ownerId: string,
  mediaType: ProviderMediaType,
): {
  apiKey: string;
  cloudName: string;
  invalidate: true;
  overwrite: true;
  publicId: string;
  signature: string;
  timestamp: number;
} {
  const configuration =
    configureCloudinary();

  const timestamp = Math.floor(
    Date.now() / 1000,
  );

  const publicId = providerMediaPublicId(
    ownerId,
    mediaType,
  );

  const parameters = {
    invalidate: true,
    overwrite: true,
    public_id: publicId,
    timestamp,
  };

  const signature =
    cloudinary.utils.api_sign_request(
      parameters,
      configuration.apiSecret,
    );

  return {
    apiKey: configuration.apiKey,
    cloudName: configuration.cloudName,
    invalidate: true,
    overwrite: true,
    publicId,
    signature,
    timestamp,
  };
}

export async function deleteProviderMedia(
  ownerId: string,
  mediaType: ProviderMediaType,
): Promise<{
  deleted: boolean;
  publicId: string;
}> {
  configureCloudinary();

  const publicId = providerMediaPublicId(
    ownerId,
    mediaType,
  );

  const result =
    await cloudinary.uploader.destroy(
      publicId,
      {
        invalidate: true,
        resource_type: "image",
      },
    );

  if (
    result.result !== "ok" &&
    result.result !== "not found"
  ) {
    throw new HttpsError(
      "internal",
      "The provider image could not be removed.",
    );
  }

  return {
    deleted: result.result === "ok",
    publicId,
  };
}

export async function verifyProviderMedia(
  input: {
    ownerId: string;
    mediaType: ProviderMediaType;
    url: unknown;
    publicId: unknown;
    maximumBytes: number;
  },
): Promise<void> {
  if (
    input.url === null &&
    input.publicId === null
  ) {
    return;
  }

  if (
    typeof input.url !== "string" ||
    typeof input.publicId !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      `The ${input.mediaType} asset is invalid.`,
    );
  }

  const expectedPublicId =
    providerMediaPublicId(
      input.ownerId,
      input.mediaType,
    );

  if (input.publicId !== expectedPublicId) {
    throw new HttpsError(
      "permission-denied",
      `The ${input.mediaType} asset does not belong to this provider.`,
    );
  }

  configureCloudinary();

  let resource: {
    bytes?: unknown;
    format?: unknown;
    resource_type?: unknown;
    secure_url?: unknown;
  };

  try {
    resource = await cloudinary.api.resource(
      input.publicId,
      {
        resource_type: "image",
        type: "upload",
      },
    );
  } catch {
    throw new HttpsError(
      "failed-precondition",
      `The uploaded business ${input.mediaType} was not found.`,
    );
  }

  const bytes = resource.bytes;
  const format = resource.format;

  if (
    resource.resource_type !== "image" ||
    typeof resource.secure_url !==
      "string" ||
    resource.secure_url !== input.url
  ) {
    throw new HttpsError(
      "failed-precondition",
      `The uploaded business ${input.mediaType} is invalid.`,
    );
  }

  if (
    typeof format !== "string" ||
    ![
      "jpg",
      "jpeg",
      "png",
      "webp",
    ].includes(format.toLowerCase())
  ) {
    throw new HttpsError(
      "failed-precondition",
      `The uploaded business ${input.mediaType} type is not allowed.`,
    );
  }

  if (
    typeof bytes !== "number" ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > input.maximumBytes
  ) {
    throw new HttpsError(
      "failed-precondition",
      `The uploaded business ${input.mediaType} size is invalid.`,
    );
  }
}
export function providerMediaPublicId(
  ownerId: string,
  mediaType: ProviderMediaType,
): string {
  requireCloudinaryIdentifier(
    ownerId,
    "provider owner ID",
  );

  return [
    "feasta",
    "providers",
    ownerId,
    "onboarding",
    mediaType,
  ].join("/");
}

export function providerServiceImagePublicId(
  ownerId: string,
  serviceId: string,
): string {
  requireCloudinaryIdentifier(
    ownerId,
    "provider owner ID",
  );

  requireCloudinaryIdentifier(
    serviceId,
    "service ID",
  );

  return [
    "feasta",
    "providers",
    ownerId,
    "services",
    serviceId,
    "image",
  ].join("/");
}

export function createProviderServiceImageUploadSignature(
  ownerId: string,
  serviceId: string,
): {
  apiKey: string;
  cloudName: string;
  invalidate: true;
  overwrite: true;
  publicId: string;
  signature: string;
  timestamp: number;
} {
  const configuration =
    configureCloudinary();

  const timestamp = Math.floor(
    Date.now() / 1000,
  );

  const publicId =
    providerServiceImagePublicId(
      ownerId,
      serviceId,
    );

  const parameters = {
    invalidate: true,
    overwrite: true,
    public_id: publicId,
    timestamp,
  };

  const signature =
    cloudinary.utils.api_sign_request(
      parameters,
      configuration.apiSecret,
    );

  return {
    apiKey: configuration.apiKey,
    cloudName: configuration.cloudName,
    invalidate: true,
    overwrite: true,
    publicId,
    signature,
    timestamp,
  };
}

function portfolioPublicId(ownerId: string, serviceId: string, assetId: string): string {
  if (!/^[a-f0-9-]{36}$/u.test(assetId)) {
    throw new HttpsError("invalid-argument", "The portfolio asset ID is invalid.");
  }
  return providerServiceImagePublicId(ownerId, serviceId) + "/portfolio/" + assetId;
}

export function signServicePortfolioUpload(ownerId: string, serviceId: string, assetId: string) {
  const configuration = configureCloudinary();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = portfolioPublicId(ownerId, serviceId, assetId);
  const parameters = {public_id: publicId, timestamp, overwrite: false, type: "authenticated"};
  return {apiKey: configuration.apiKey, cloudName: configuration.cloudName, publicId, timestamp,
    signature: cloudinary.utils.api_sign_request(parameters, configuration.apiSecret)};
}

export async function verifyServicePortfolioImage(ownerId: string, serviceId: string, assetId: string) {
  const publicId = portfolioPublicId(ownerId, serviceId, assetId);
  configureCloudinary();
  const resource = await cloudinary.api.resource(publicId, {resource_type: "image", type: "authenticated"})
    .catch(() => { throw new HttpsError("failed-precondition", "A portfolio photo could not be verified."); });
  const {bytes, format, width, height, version} = resource;
  if (resource.public_id !== publicId || resource.resource_type !== "image" ||
      !["jpg", "jpeg", "png", "webp"].includes(format) || !Number.isSafeInteger(bytes) ||
      bytes < 1 || bytes > 20 * 1024 * 1024 ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width * height > 100_000_000 || !Number.isSafeInteger(version)) {
    throw new HttpsError("invalid-argument", "Portfolio photos must be JPEG, PNG or WebP and within the upload limits.");
  }
  const url = (targetWidth: number) => cloudinary.url(publicId, {
    secure: true, sign_url: true, type: "authenticated", resource_type: "image",
    version, transformation: [{width: targetWidth, crop: "limit", quality: "auto"}],
  });
  return {publicId, url: url(1600), thumbnailUrl: url(480), width: Number(width), height: Number(height)};
}

export async function verifyProviderServiceImage(
  input: {
    ownerId: string;
    serviceId: string;
    url: unknown;
    publicId: unknown;
    maximumBytes: number;
  },
): Promise<void> {
  if (
    input.url === null &&
    input.publicId === null
  ) {
    return;
  }

  if (
    typeof input.url !== "string" ||
    typeof input.publicId !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The service image is invalid.",
    );
  }

  const expectedPublicId =
    providerServiceImagePublicId(
      input.ownerId,
      input.serviceId,
    );

  if (input.publicId !== expectedPublicId) {
    throw new HttpsError(
      "permission-denied",
      "The service image does not belong to this provider.",
    );
  }

  configureCloudinary();

  let resource: {
    bytes?: unknown;
    format?: unknown;
    resource_type?: unknown;
    secure_url?: unknown;
  };

  try {
    resource =
      await cloudinary.api.resource(
        input.publicId,
        {
          resource_type: "image",
          type: "upload",
        },
      );
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "The uploaded service image was not found.",
    );
  }

  const bytes = resource.bytes;
  const format = resource.format;

  if (
    resource.resource_type !== "image" ||
    typeof resource.secure_url !==
      "string" ||
    resource.secure_url !== input.url
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The uploaded service image is invalid.",
    );
  }

  if (
    typeof format !== "string" ||
    ![
      "jpg",
      "jpeg",
      "png",
      "webp",
    ].includes(format.toLowerCase())
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The uploaded service image type is not allowed.",
    );
  }

  if (
    typeof bytes !== "number" ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > input.maximumBytes
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The uploaded service image size is invalid.",
    );
  }
}

/**
 * Server-only Cloudinary verification for private editor media.
 * Does not authorize upload, registration, deletion or publication.
 */
export async function verifyEditorDraftCloudinaryAssetV1(
  scope: Parameters<typeof lookupVerifiedEditorDraftCloudinaryV1>[0],
) {
  const configuration = configureCloudinary();

  try {
    return await lookupVerifiedEditorDraftCloudinaryV1(
      scope,
      configuration.cloudName,
      (publicId) => cloudinary.api.resource(publicId, {
        resource_type: "image",
        type: "upload",
      }),
    );
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "EDITOR_DRAFT_MEDIA_VERIFICATION_FAILED",
      {reason: "EDITOR_DRAFT_MEDIA_VERIFICATION_FAILED"},
    );
  }
}

export async function deleteProviderServiceImage(
  ownerId: string,
  serviceId: string,
): Promise<{
  deleted: boolean;
  publicId: string;
}> {
  configureCloudinary();

  const publicId =
    providerServiceImagePublicId(
      ownerId,
      serviceId,
    );

  const result =
    await cloudinary.uploader.destroy(
      publicId,
      {
        invalidate: true,
        resource_type: "image",
      },
    );

  if (
    result.result !== "ok" &&
    result.result !== "not found"
  ) {
    throw new HttpsError(
      "internal",
      "The service image could not be removed.",
    );
  }

  return {
    deleted:
      result.result === "ok",

    publicId,
  };
}

/** Trusted cleanup lookup: only an authenticated Admin API 404 means missing. */
export async function lookupEditorDraftCleanupResourceV1(publicId: string) {
  const pattern = new RegExp("^feasta/providers/[A-Za-z0-9_-]+/editor-drafts/" +
    "[A-Za-z0-9_-]+/(?:package|themes/[A-Za-z0-9_-]+)/[A-Za-z0-9_-]+$", "u");
  if (!pattern.test(publicId)) throw new Error("INVALID_EDITOR_DRAFT_CLEANUP_SCOPE");
  configureCloudinary();
  try {
    const value = await cloudinary.api.resource(publicId,
      {resource_type: "image", type: "upload", timeout: 5000});
    if (value.public_id !== publicId || value.resource_type !== "image" ||
        value.type !== "upload" ||
        typeof value.asset_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.asset_id) ||
        !Number.isSafeInteger(value.version) || value.version < 1) {
      throw new Error("INVALID_EDITOR_DRAFT_CLEANUP_RESOURCE");
    }
    return {publicId, assetId: value.asset_id as string, version: value.version as number};
  } catch (error) {
    if ((error as {error?: {http_code?: number}; http_code?: number})?.error?.http_code === 404 ||
        (error as {http_code?: number})?.http_code === 404) return null;
    throw error;
  }
}

/** Immutable asset ID deletion; never destroy an unchecked public ID. */
export async function deleteEditorDraftCleanupResourceV1(assetId: string, publicId: string) {
  requireCloudinaryIdentifier(assetId, "asset ID");
  configureCloudinary();
  const response = await cloudinary.api.delete_resources_by_asset_ids([assetId],
    {invalidate: true, timeout: 5000}) as unknown as {
      deleted?: Record<string, unknown>; partial?: boolean;
    };
  const deleted = response.deleted as Record<string, unknown> | undefined;
  if (!deleted || Object.keys(deleted).length !== 1 || response.partial === true ||
      !["deleted", "not_found"].includes((deleted[publicId] ?? deleted[assetId]) as string)) {
    throw new Error("EDITOR_DRAFT_MEDIA_DELETE_NOT_CONFIRMED");
  }
}

function requireCloudinaryIdentifier(
  value: string,
  label: string,
): void {
  if (
    !/^[A-Za-z0-9_-]{1,128}$/u.test(
      value,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      `The ${label} is invalid.`,
    );
  }
}


function configureCloudinary(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  const cloudName =
    cloudinaryCloudName.value().trim();

  const apiKey =
    cloudinaryApiKey.value().trim();

  const apiSecret =
    cloudinaryApiSecret.value().trim();

  if (
    cloudName.length < 3 ||
    apiKey.length < 3 ||
    apiSecret.length < 8
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Cloudinary is not configured.",
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return {
    cloudName,
    apiKey,
    apiSecret,
  };
}
