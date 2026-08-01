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
  if (
    !/^[A-Za-z0-9_-]{1,128}$/u.test(
      ownerId,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The provider owner ID is invalid.",
    );
  }

  return [
    "feasta",
    "providers",
    ownerId,
    "onboarding",
    mediaType,
  ].join("/");
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