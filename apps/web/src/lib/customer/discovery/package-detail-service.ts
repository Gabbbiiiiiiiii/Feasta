import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import {adminDb} from "@/lib/firebase/admin";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";
import {isPublicProviderId} from "@/lib/customer/providers/provider-route-policy";

import type {
  PublicPackageDetail,
} from "./marketplace-types";
import {
  normalizePublicPackage,
  normalizePublicPackageCustomization,
} from "./public-package-normalization";

export async function getPublicPackageDetail(
  packageId: string,
): Promise<PublicPackageDetail | null> {
  const normalizedPackageId =
    safeDocumentId(packageId);

  if (!normalizedPackageId) {
    return null;
  }

  const packageSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.packages)
    .doc(normalizedPackageId)
    .get();

  if (!packageSnapshot.exists) {
    return null;
  }

  const packageData =
    packageSnapshot.data() ?? {};

  const providerId = safeDocumentId(
    packageData.providerId,
  );

  if (
    !providerId ||
    !isPublicProviderId(providerId)
  ) {
    return null;
  }

  const providerSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.providers)
    .doc(providerId)
    .get();

  if (!providerSnapshot.exists) {
    return null;
  }

  const providerData =
    providerSnapshot.data() ?? {};

  const ownerId = safeDocumentId(
    providerData.ownerId,
  );

  if (!ownerId) {
    return null;
  }

  const ownerSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.users)
    .doc(ownerId)
    .get();

  const provider = normalizePublicProvider(
    providerSnapshot.id,
    providerData,
    ownerSnapshot.exists
      ? ownerSnapshot.data() ?? {}
      : {},
  );

  if (!provider) {
    return null;
  }

  const providerNames = new Map([
    [
      provider.id,
      provider.businessName,
    ],
  ]);

  const packageRecord =
    normalizePublicPackage(
      packageSnapshot.id,
      packageData,
      providerNames,
    );

  if (!packageRecord) {
    return null;
  }

  return {
    packageRecord,
    provider,
    customization:
      normalizePublicPackageCustomization(
        packageData,
      ),
  };
}

function safeDocumentId(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .slice(0, 128);

  return normalized &&
      !normalized.includes("/")
    ? normalized
    : null;
}