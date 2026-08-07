import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import {adminDb} from "@/lib/firebase/admin";
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";

import type {
  CustomerMarketplaceHome,
  PublicPackage,
} from "./marketplace-types";

export const HOMEPAGE_PROVIDER_LIMIT = 6;
export const HOMEPAGE_PACKAGE_LIMIT = 4;

export async function getCustomerMarketplaceHome(): Promise<CustomerMarketplaceHome> {
  const providerPage = await getPublicProviderPage({
    search: "",
    serviceType: "all",
    category: "all",
    cursor: null,
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
  const packages = packageSnapshot.docs.flatMap((document) => {
    const packageRecord = normalizePublicPackage(
      document.id,
      document.data(),
      providerNames,
    );
    return packageRecord ? [packageRecord] : [];
  });

  return {providers: providerPage.providers, packages};
}

export function normalizePublicPackage(
  id: string,
  value: Readonly<Record<string, unknown>>,
  providerNames: ReadonlyMap<string, string>,
): PublicPackage | null {
  const providerId = safeText(value.providerId, 128);
  const name = safeText(value.name, 160);
  if (
    !providerId ||
    !name ||
    !providerNames.has(providerId) ||
    value.isActive !== true ||
    value.isPublished !== true ||
    value.providerPubliclyVisible !== true ||
    value.status !== "published" ||
    value.isDeleted === true
  ) return null;

  return {
    id,
    providerId,
    providerName: providerNames.get(providerId)!,
    name,
    description: safeText(value.description, 600),
    eventType: safeText(value.eventType, 80),
    price: safeMoney(value.price),
  };
}

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, maximum);
  return normalized || null;
}

function safeMoney(value: unknown): number | null {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100_000_000
    ? value
    : null;
}
