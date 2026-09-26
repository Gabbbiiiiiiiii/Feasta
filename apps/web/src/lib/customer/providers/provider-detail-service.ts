import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
import {adminDb} from "@/lib/firebase/admin";
import {providerContentCapabilities} from "@/lib/provider/provider-content-capabilities";
import {publicMenuImages} from "@/lib/provider/provider-menu";

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

  const capabilities = providerContentCapabilities(provider.serviceType, provider.categories);
  const menuSnapshot = capabilities.catering
    ? await providerSnapshot.ref.collection("catalog").doc("menu").get()
    : null;
  const menuImages = publicMenuImages(menuSnapshot?.data()?.images, ownerId);
  const services = [] as {id: string; name: string; description: string | null}[];
  if (provider.serviceType === "addon" || provider.serviceType === "both") {
    const offerings = await adminDb.collection(FIRESTORE_COLLECTIONS.addons)
      .where("providerId", "==", provider.id).limit(20).get();
    for (const document of offerings.docs) {
      const data = document.data();
      if (data.providerId !== provider.id || data.ownerId !== ownerId || data.status !== "published" ||
        data.isPublished !== true || data.isActive !== true || data.isAvailable !== true || data.isDeleted === true ||
        typeof data.name !== "string" || !data.name.trim()) continue;
      services.push({id: document.id, name: data.name.trim().slice(0, 160),
        description: typeof data.description === "string" ? data.description.trim().slice(0, 600) : null});
    }
  }
  return {provider, packages, menuImages, services};
}

function safeDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 128);
  return normalized && !normalized.includes("/") ? normalized : null;
}
