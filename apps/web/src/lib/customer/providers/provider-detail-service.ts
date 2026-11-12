import {readServicePortfolio} from "@/lib/provider/service-portfolio";
import {readFreelanceServiceDetails, supportsServicePackageDetails} from "@feasta/shared-types/freelance-service-details";
import "server-only";
import {loadActiveLegacyOccasionIds} from "@/lib/customer/discovery/active-legacy-occasion-guard";
import {verifiedPublicPackageV2} from "@/lib/customer/discovery/verified-package-v2";

import {ADDON_PRICING_TYPES, FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
import {adminDb} from "@/lib/firebase/admin";
import {providerContentCapabilities} from "@/lib/provider/provider-content-capabilities";
import {publicMenuImages} from "@/lib/provider/provider-menu";
import {publicProviderSetups} from "@/lib/provider/provider-setup-gallery";

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
  const activeLegacyIds = await loadActiveLegacyOccasionIds(
    packageSnapshot.docs.map((document) => document.data()),
  );
  const providerNames = new Map([[provider.id, provider.businessName]]);
  const candidates = await Promise.all(packageSnapshot.docs.map(async (document) => {
    const original = document.data();
    const v2 = original.occasionSchemaVersion === 2;
    const data = v2 ? await verifiedPublicPackageV2(document.id) : original;
    if (!data ||
        (!v2 && !activeLegacyIds.has(String(data.eventType)))) return [];
    const packageRecord = normalizePublicPackage(document.id, data, providerNames, v2);
    return packageRecord ? [packageRecord] : [];
  }));
  const packages = candidates.flat();

  const capabilities = providerContentCapabilities(provider.serviceType, provider.categories);
  const menuSnapshot = capabilities.catering
    ? await providerSnapshot.ref.collection("catalog").doc("menu").get()
    : null;
  const menuImages = publicMenuImages(menuSnapshot?.data()?.images, ownerId);
  const setupSnapshot = capabilities.catering
    ? await providerSnapshot.ref.collection("catalog").doc("setups").get()
    : null;
  const setups = publicProviderSetups(setupSnapshot?.data()?.setups, ownerId);
  const services = [] as NonNullable<PublicProviderDetail["services"]>[number][];
  if (provider.serviceType === "addon" || provider.serviceType === "both") {
    const offerings = await adminDb.collection(FIRESTORE_COLLECTIONS.addons)
      .where("providerId", "==", provider.id).limit(20).get();
    for (const document of offerings.docs) {
      const data = document.data();
      if (data.providerId !== provider.id || data.ownerId !== ownerId || data.status !== "published" ||
        data.isPublished !== true || data.isActive !== true || data.isAvailable !== true || data.isDeleted === true ||
        typeof data.name !== "string" || !data.name.trim()) continue;
      const freelanceDetails = supportsServicePackageDetails(providerData.businessRegistrationType, data.category)
        ? readFreelanceServiceDetails(data.freelanceDetails) : null;
      const portfolio = providerData.businessRegistrationType === "individual"
        ? readServicePortfolio(data.portfolio) : null;
      const pricingType = ADDON_PRICING_TYPES.find((type) => type === data.pricingType);
      const price = typeof data.price === "number" && Number.isFinite(data.price) && data.price >= 0
        ? data.price : undefined;
      services.push({id: document.id,
        ...(pricingType ? {pricingType} : {}),
        ...(price !== undefined && pricingType !== "custom_quote" ? {price} : {}),
        ...(portfolio?.photos.length ? {portfolio} : {}), name: data.name.trim().slice(0, 160),
        ...(freelanceDetails ? {freelanceDetails} : {}),
        description: typeof data.description === "string" ? data.description.trim().slice(0, 600) : null});
    }
  }
  return {provider, packages, menuImages, setups, services};
}

function safeDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 128);
  return normalized && !normalized.includes("/") ? normalized : null;
}
