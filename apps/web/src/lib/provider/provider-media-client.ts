"use client";

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import {auth, storage} from "@/lib/firebase/client";

export type ProviderMediaType = "logo" | "cover";

export async function uploadProviderOnboardingImage(
  mediaType: ProviderMediaType,
  file: File,
): Promise<{storagePath: string; previewUrl: string}> {
  const user = requireProviderAuthUser();
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  const maximumBytes = mediaType === "logo"
    ? 5 * 1024 * 1024
    : 10 * 1024 * 1024;
  if (!allowed.has(file.type)) {
    throw new WebAuthenticationError(
      "Choose a JPEG, PNG, or WebP image.",
      "validation",
    );
  }
  if (file.size <= 0 || file.size > maximumBytes) {
    throw new WebAuthenticationError(
      `The ${mediaType} must be no larger than ${
        mediaType === "logo" ? "5" : "10"
      } MB.`,
      "validation",
    );
  }
  const extension = safeImageExtension(file.type);
  const storagePath =
    `providers/${user.uid}/${mediaType}/` +
    `onboarding-${mediaType}${extension}`;
  const reference = ref(storage, storagePath);
  await uploadBytes(reference, file, {contentType: file.type});
  return {storagePath, previewUrl: await getDownloadURL(reference)};
}

export async function providerMediaPreviewUrl(
  storagePath: string,
): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

export async function deleteProviderOnboardingImage(
  storagePath: string,
): Promise<void> {
  const user = requireProviderAuthUser();
  const expectedPrefix = `providers/${user.uid}/`;
  if (
    !storagePath.startsWith(expectedPrefix) ||
    !/^providers\/[^/]+\/(?:logo|cover)\/[^/]+$/u.test(storagePath)
  ) {
    throw new WebAuthenticationError(
      "The provider image path is invalid.",
      "validation",
    );
  }
  await deleteObject(ref(storage, storagePath));
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

function safeImageExtension(contentType: string): string {
  const expected: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return expected[contentType];
}
