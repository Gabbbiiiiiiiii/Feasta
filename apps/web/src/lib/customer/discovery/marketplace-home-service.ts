import "server-only";
import {loadActiveLegacyOccasionIds} from "@/lib/customer/discovery/active-legacy-occasion-guard";
import {verifiedPublicPackageV2} from "@/lib/customer/discovery/verified-package-v2";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import {adminDb} from "@/lib/firebase/admin";
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";

import type {
  CustomerMarketplaceHome,
} from "./marketplace-types";
import {normalizePublicPackage} from "./public-package-normalization";

export const HOMEPAGE_PROVIDER_LIMIT = 6;
export const HOMEPAGE_PACKAGE_LIMIT = 4;

export async function getCustomerMarketplaceHome(): Promise<CustomerMarketplaceHome> {
  const providerPage = await getPublicProviderPage({
    search: "",
    serviceType: "all",
    category: "all",
    cursor: null,
    eventContext: null,
  }, HOMEPAGE_PROVIDER_LIMIT);
  const providerIds = providerPage.providers.map((provider) => provider.id);
  if (providerIds.length === 0) {
    return {providers: [], packages: []};
  }

  const packageSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.packages)
    .where("providerId", "in", providerIds)
    .where("isActive", "==", true)
    .where("isPublished", "==", true)
    .where("providerPubliclyVisible", "==", true)
    .where("status", "==", "published")
    .where("isDeleted", "==", false)
    .orderBy("createdAt", "desc")
    .limit(HOMEPAGE_PACKAGE_LIMIT)
    .get();
  const providerNames = new Map(
    providerPage.providers.map((provider) => [provider.id, provider.businessName]),
  );
  const activeLegacyIds = await loadActiveLegacyOccasionIds(
    packageSnapshot.docs.map((document) => document.data()),
  );

  const candidates = await Promise.all(packageSnapshot.docs.map(async (document) => {
    const original = document.data();
    const v2 = original.occasionSchemaVersion === 2;
    const data = v2 ? await verifiedPublicPackageV2(document.id) : original;
    if (!data || (!v2 && !activeLegacyIds.has(String(data.eventType)))) return [];
    const packageRecord = normalizePublicPackage(
      document.id,
      data,
      providerNames,
      v2,
    );
    return packageRecord ? [packageRecord] : [];
  }));
  const packages = candidates.flat();

  return {providers: providerPage.providers, packages};
}
