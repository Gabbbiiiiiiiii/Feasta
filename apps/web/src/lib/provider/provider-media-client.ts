"use client";

import {httpsCallable} from "firebase/functions";

import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  auth,
  functions,
} from "@/lib/firebase/client";

export type ProviderMediaType =
  | "logo"
  | "cover";

export type ProviderOnboardingMedia = {
  url: string;
  publicId: string;
};

type ProviderMediaUploadSignature = {
  apiKey: string;
  cloudName: string;
  invalidate: true;
  overwrite: true;
  publicId: string;
  signature: string;
  timestamp: number;
};

type CloudinaryUploadResponse = {
  public_id?: unknown;
  resource_type?: unknown;
  secure_url?: unknown;
  bytes?: unknown;
  format?: unknown;
};

export async function uploadProviderOnboardingImage(
  mediaType: ProviderMediaType,
  file: File,
): Promise<ProviderOnboardingMedia> {
  requireProviderAuthUser();
  validateProviderImage(mediaType, file);

  const signature =
    await call<ProviderMediaUploadSignature>(
      "createProviderMediaUploadSignature",
      {mediaType},
    );

  validateUploadSignature(
    signature,
    mediaType,
  );

  const form = new FormData();

  form.set("file", file);
  form.set("api_key", signature.apiKey);
  form.set(
    "timestamp",
    String(signature.timestamp),
  );
  form.set(
    "signature",
    signature.signature,
  );
  form.set(
    "public_id",
    signature.publicId,
  );
  form.set(
    "overwrite",
    String(signature.overwrite),
  );
  form.set(
    "invalidate",
    String(signature.invalidate),
  );

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${
      encodeURIComponent(signature.cloudName)
    }/image/upload`,
    {
      method: "POST",
      body: form,
    },
  );

  const body = await readCloudinaryResponse(
    response,
  );

  if (!response.ok) {
    throw new WebAuthenticationError(
      cloudinaryUploadError(body),
      "upload_failed",
    );
  }

  const uploaded = body as
    CloudinaryUploadResponse;

  if (
    uploaded.resource_type !== "image" ||
    uploaded.public_id !==
      signature.publicId ||
    typeof uploaded.secure_url !==
      "string" ||
    !isCloudinaryImageUrl(
      uploaded.secure_url,
    ) ||
    typeof uploaded.bytes !== "number" ||
    !Number.isSafeInteger(uploaded.bytes) ||
    uploaded.bytes <= 0 ||
    !isAllowedFormat(uploaded.format)
  ) {
    throw new WebAuthenticationError(
      "Cloudinary returned an invalid provider image.",
      "upload_failed",
    );
  }

  const maximumBytes =
    maximumProviderImageBytes(mediaType);

  if (uploaded.bytes > maximumBytes) {
    await deleteProviderOnboardingImage(
      mediaType,
    ).catch(() => undefined);

    throw new WebAuthenticationError(
      `The ${mediaType} must be no larger than ${
        mediaType === "logo" ? "5" : "10"
      } MB.`,
      "validation",
    );
  }

  return {
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
  };
}

export async function deleteProviderOnboardingImage(
  mediaType: ProviderMediaType,
): Promise<void> {
  requireProviderAuthUser();

  await call<{
    deleted: boolean;
    publicId: string;
  }>(
    "deleteProviderOnboardingMedia",
    {mediaType},
  );
}

function validateProviderImage(
  mediaType: ProviderMediaType,
  file: File,
): void {
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  if (!allowed.has(file.type)) {
    throw new WebAuthenticationError(
      "Choose a JPEG, PNG, or WebP image.",
      "validation",
    );
  }

  if (
    file.size <= 0 ||
    file.size >
      maximumProviderImageBytes(mediaType)
  ) {
    throw new WebAuthenticationError(
      `The ${mediaType} must be no larger than ${
        mediaType === "logo" ? "5" : "10"
      } MB.`,
      "validation",
    );
  }
}

function validateUploadSignature(
  value: ProviderMediaUploadSignature,
  mediaType: ProviderMediaType,
): void {
  if (
    typeof value.apiKey !== "string" ||
    value.apiKey.length < 3 ||
    typeof value.cloudName !== "string" ||
    value.cloudName.length < 3 ||
    value.invalidate !== true ||
    value.overwrite !== true ||
    typeof value.publicId !== "string" ||
    !value.publicId.endsWith(
      `/onboarding/${mediaType}`,
    ) ||
    typeof value.signature !== "string" ||
    value.signature.length < 20 ||
    typeof value.timestamp !== "number" ||
    !Number.isSafeInteger(value.timestamp)
  ) {
    throw new WebAuthenticationError(
      "The provider image upload could not be initialized.",
      "configuration",
    );
  }
}

function maximumProviderImageBytes(
  mediaType: ProviderMediaType,
): number {
  return mediaType === "logo"
    ? 5 * 1024 * 1024
    : 10 * 1024 * 1024;
}

function isCloudinaryImageUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname ===
        "res.cloudinary.com" &&
      url.pathname.includes(
        "/image/upload/",
      ) &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isAllowedFormat(
  value: unknown,
): boolean {
  return (
    typeof value === "string" &&
    [
      "jpg",
      "jpeg",
      "png",
      "webp",
    ].includes(value.toLowerCase())
  );
}

async function readCloudinaryResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const value: unknown =
      await response.json();

    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    )
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function cloudinaryUploadError(
  body: Record<string, unknown>,
): string {
  const error =
    typeof body.error === "object" &&
    body.error !== null
      ? body.error as
          Record<string, unknown>
      : null;

  return typeof error?.message === "string"
    ? "The provider image could not be uploaded. Please try again."
    : "The provider image upload failed. Please try again.";
}

function requireProviderAuthUser() {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }

  return auth.currentUser;
}

async function call<T>(
  name: string,
  data: Record<string, unknown>,
): Promise<T> {
  const callable = httpsCallable<
    Record<string, unknown>,
    T
  >(
    functions,
    name,
  );

  const response = await callable(data);

  return response.data;
}