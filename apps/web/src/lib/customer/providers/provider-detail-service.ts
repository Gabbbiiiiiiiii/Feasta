import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
import {adminDb} from "@/lib/firebase/admin";

import {normalizePublicProvider} from "./provider-normalization";
import {isPublicProviderId} from "./provider-route-policy";
import type {PublicProviderDetail} from "./provider-detail-types";

export const PROVIDER_DETAIL_PACKAGE_LIMIT = 12;

export async function getPublicProviderDetail(
  providerId: string,
): Promise<PublicProviderDetail | null> {
  if (!isPublicProviderId(providerId)) return null;

  const providerSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.providers)
    .doc(providerId)
    .get();
  if (!providerSnapshot.exists) return null;

  const providerData = providerSnapshot.data() ?? {};
  const ownerId = safeDocumentId(providerData.ownerId);
  if (!ownerId) return null;

  const ownerSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.users)
    .doc(ownerId)
    .get();
  const provider = normalizePublicProvider(
    providerSnapshot.id,
    providerData,
    ownerSnapshot.exists ? ownerSnapshot.data() ?? {} : {},
  );
  if (!provider) return null;

  const packageSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.packages)
    .where("providerId", "==", provider.id)
    .where("isActive", "==", true)
    .where("isPublished", "==", true)
    .where("providerPubliclyVisible", "==", true)
    .where("status", "==", "published")
    .where("isDeleted", "==", false)
    .orderBy("createdAt", "desc")
    .limit(PROVIDER_DETAIL_PACKAGE_LIMIT)
    .get();
  const providerNames = new Map([[provider.id, provider.businessName]]);
  const packages = packageSnapshot.docs.flatMap((document) => {
    const packageRecord = normalizePublicPackage(
      document.id,
      document.data(),
      providerNames,
    );
    return packageRecord ? [packageRecord] : [];
  });

  return {provider, packages};
}

function safeDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 128);
  return normalized && !normalized.includes("/") ? normalized : null;
}
