import "server-only";
import {loadActiveLegacyOccasionIds} from "@/lib/customer/discovery/active-legacy-occasion-guard";
import {verifiedPublicPackageV2} from "@/lib/customer/discovery/verified-package-v2";
import {readServicePortfolio} from "@/lib/provider/service-portfolio";

import {ADDON_PRICING_TYPES, FIRESTORE_COLLECTIONS} from "@feasta/shared-types";
import {
  FieldPath,
  Filter,
  Timestamp,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {adminDb} from "@/lib/firebase/admin";
import {countFirestoreQuery} from "@/lib/firebase/count-query";
import {computeTotalPages} from "@/lib/pagination";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";
import {
  isMediaPackageCategory,
  isPublicProviderId,
  mediaPackageHref,
} from "@/lib/customer/providers/provider-route-policy";

import type {
  PackageCursor,
  PackageDiscoveryFilters,
  PackageDiscoveryPage,
  PublicPackage,
} from "./marketplace-types";
import {normalizePublicPackage} from "./public-package-normalization";

export const PACKAGE_PAGE_SIZE = 12;
export const PACKAGE_CANDIDATE_READ_LIMIT = 48;
const MEDIA_PACKAGE_CANDIDATE_LIMIT = 60;
const MEDIA_PACKAGE_RESULT_LIMIT = 20;

export async function getPublicPackagePage(
  filters: PackageDiscoveryFilters,
  pageSize = PACKAGE_PAGE_SIZE,
): Promise<PackageDiscoveryPage> {
  const safePageSize = Math.min(
    Math.max(Math.trunc(pageSize), 1),
    PACKAGE_PAGE_SIZE,
  );
  const cursor = decodePackageCursor(filters.cursor);
  let query: Query<DocumentData> = adminDb
    .collection(FIRESTORE_COLLECTIONS.packages)
    .where("isActive", "==", true)
    .where("isPublished", "==", true)
    .where("providerPubliclyVisible", "==", true)
    .where("status", "==", "published")
    .where("isDeleted", "==", false);



  if (filters.eventType !== "all") {
    query =
      query.where(Filter.or(Filter.where("eventType", "==", filters.eventType),
        Filter.where("occasionMatchIds", "array-contains", filters.eventType)));
  }
  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  const countQuery = query;

  if (cursor) {
    const timestamp = new Timestamp(
      cursor.createdAtSeconds,
      cursor.createdAtNanoseconds,
    );
    query = cursor.direction === "previous"
      ? query
        .endBefore(timestamp, cursor.packageId)
        .limitToLast(PACKAGE_CANDIDATE_READ_LIMIT)
      : query
        .startAfter(timestamp, cursor.packageId)
        .limit(PACKAGE_CANDIDATE_READ_LIMIT);
  } else {
    query = query.limit(PACKAGE_CANDIDATE_READ_LIMIT);
  }

  const [snapshot, totalCount] = await Promise.all([
    query.get(),
    countFirestoreQuery(countQuery),
  ]);
  const publicCandidates = (await normalizePackageCandidates(snapshot.docs)).filter(({packageRecord: p}) =>
    filters.eventType === "all" || (p.occasionMatchIds ?? [p.eventType]).includes(filters.eventType));
  const previousDirection = cursor?.direction === "previous";
  const selected = previousDirection
    ? publicCandidates.slice(-safePageSize)
    : publicCandidates.slice(0, safePageSize);
  const candidateLimitReached = snapshot.docs.length ===
    PACKAGE_CANDIDATE_READ_LIMIT;
  const hasPrevious = previousDirection
    ? publicCandidates.length > safePageSize || candidateLimitReached
    : cursor !== null;
  const hasNext = previousDirection
    ? true
    : publicCandidates.length > safePageSize || candidateLimitReached;
  const previousAnchor = selected[0]?.document ??
    (hasPrevious ? snapshot.docs[0] ?? null : null);
  const nextAnchor = selected.at(-1)?.document ??
    (hasNext ? snapshot.docs.at(-1) ?? null : null);
  const currentPage = !hasPrevious
    ? 1
    : cursor?.page ?? (previousDirection ? 1 : 2);

  const cateringPackages = selected.map((candidate) => candidate.packageRecord);
  // Media addons (photographer/videographer) live in `addons`, not `packages`.
  // Include them on the first marketplace page using the same storefront rules.
  const mediaPackages = cursor === null
    ? await loadPublicMediaMarketplacePackages(filters)
    : [];

  return {
    packages: [...cateringPackages, ...mediaPackages],
    previousCursor: hasPrevious && previousAnchor
      ? encodePackageCursor("previous", previousAnchor, Math.max(1, currentPage - 1))
      : null,
    nextCursor: hasNext && nextAnchor
      ? encodePackageCursor("next", nextAnchor, currentPage + 1)
      : null,
    pageSize: safePageSize,
    currentPage,
    totalCount,
    totalPages: computeTotalPages(totalCount, safePageSize),
  };
}

async function loadPublicMediaMarketplacePackages(
  filters: PackageDiscoveryFilters,
): Promise<PublicPackage[]> {
  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.addons)
    .where("isActive", "==", true)
    .where("isAvailable", "==", true)
    .limit(MEDIA_PACKAGE_CANDIDATE_LIMIT)
    .get();

  const candidates = snapshot.docs.flatMap((document) => {
    const data = document.data();
    if (data.isDeleted === true || data.status !== "published" ||
        data.isPublished !== true || data.isActive !== true ||
        data.isAvailable !== true) {
      return [];
    }
    const providerId = typeof data.providerId === "string" &&
      isPublicProviderId(data.providerId) ? data.providerId : null;
    if (!providerId || typeof data.name !== "string" || !data.name.trim()) {
      return [];
    }
    if (!isMediaPackageCategory(
      typeof data.category === "string" ? data.category : undefined,
    )) {
      return [];
    }
    return [{documentId: document.id, providerId, data}];
  });
  if (candidates.length === 0) return [];

  const providerIds = [...new Set(candidates.map((row) => row.providerId))];
  const providerSnapshots = await adminDb.getAll(...providerIds.map(
    (providerId) => adminDb.collection(FIRESTORE_COLLECTIONS.providers).doc(providerId),
  ));
  const ownerIds = [...new Set(providerSnapshots.flatMap((snapshot) => {
    const ownerId = snapshot.data()?.ownerId;
    return typeof ownerId === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/u.test(ownerId)
      ? [ownerId]
      : [];
  }))];
  const ownerSnapshots = ownerIds.length > 0
    ? await adminDb.getAll(...ownerIds.map((ownerId) => adminDb
      .collection(FIRESTORE_COLLECTIONS.users)
      .doc(ownerId)))
    : [];
  const owners = new Map(ownerSnapshots.map((snapshot) => [
    snapshot.id,
    snapshot.exists ? snapshot.data() ?? {} : {},
  ]));
  const providers = new Map(providerSnapshots.flatMap((snapshot) => {
    if (!snapshot.exists) return [];
    const data = snapshot.data() ?? {};
    const ownerId = data.ownerId;
    if (typeof ownerId !== "string") return [];
    const provider = normalizePublicProvider(
      snapshot.id,
      data,
      owners.get(ownerId) ?? {},
    );
    if (!provider) return [];
    if (provider.serviceType !== "addon" && provider.serviceType !== "both") {
      return [];
    }
    return [[provider.id, {provider, ownerId, providerData: data}] as const];
  }));

  return candidates.flatMap((candidate) => {
    const loaded = providers.get(candidate.providerId);
    if (!loaded) return [];
    const {provider, ownerId, providerData} = loaded;
    if (candidate.data.ownerId !== ownerId) return [];
    if (filters.eventType !== "all" &&
        !provider.eventTypes.includes(filters.eventType)) {
      return [];
    }
    if (typeof candidate.data.category !== "string" ||
        !provider.categories.includes(candidate.data.category as never) ||
        !isMediaPackageCategory(candidate.data.category)) {
      return [];
    }

    const pricingType = ADDON_PRICING_TYPES.find(
      (type) => type === candidate.data.pricingType,
    );
    const price = typeof candidate.data.price === "number" &&
      Number.isFinite(candidate.data.price) &&
      candidate.data.price >= 0
      ? candidate.data.price
      : null;
    const portfolio = providerData.businessRegistrationType === "individual"
      ? readServicePortfolio(candidate.data.portfolio)
      : null;
    const cover = portfolio?.photos.find(
      ({id}) => id === portfolio.coverAssetId,
    );
    const fullPayment = pricingType === "fixed" &&
      price !== null && price > 0 &&
      Number.isSafeInteger(candidate.data.revision) &&
      candidate.data.revision >= 0;
    const priceSuffix = pricingType === "per_hour" ? "per hour"
      : pricingType === "per_guest" ? "per guest"
        : pricingType === "per_unit" ? "per unit"
          : undefined;

    const record: PublicPackage = {
      id: candidate.documentId,
      providerId: provider.id,
      providerName: provider.businessName,
      name: candidate.data.name.trim().slice(0, 160),
      description: typeof candidate.data.description === "string"
        ? candidate.data.description.trim().slice(0, 600)
        : null,
      imageUrl: cover?.thumbnailUrl ??
        (typeof candidate.data.imageUrl === "string"
          ? candidate.data.imageUrl
          : null),
      eventType: provider.eventTypes[0] ?? null,
      occasionMatchIds: provider.eventTypes,
      minimumGuests: provider.minimumGuests,
      maximumGuests: provider.maximumGuests,
      price: pricingType === "custom_quote" ? null : price,
      paymentPolicy: fullPayment ? "full_payment" : null,
      inclusions: [],
      detailHref: mediaPackageHref(provider.id, candidate.documentId),
      ...(priceSuffix ? {priceSuffix} : {}),
      ...(pricingType === "custom_quote"
        ? {unknownPriceLabel: "Request a quote"}
        : {}),
    };
    return [record];
  })
    .sort((left, right) => left.name.localeCompare(right.name, "en", {
      sensitivity: "base",
    }))
    .slice(0, MEDIA_PACKAGE_RESULT_LIMIT);
}

async function normalizePackageCandidates(
  documents: readonly QueryDocumentSnapshot<DocumentData>[],
): Promise<readonly {
  document: QueryDocumentSnapshot<DocumentData>;
  packageRecord: PublicPackage;
}[]> {
  const providerIds = [...new Set(documents.flatMap((document) => {
    const providerId = document.data().providerId;
    return typeof providerId === "string" && isPublicProviderId(providerId)
      ? [providerId]
      : [];
  }))];
  if (providerIds.length === 0) return [];

  const providerSnapshots = await adminDb.getAll(...providerIds.map(
    (providerId) => adminDb
      .collection(FIRESTORE_COLLECTIONS.providers)
      .doc(providerId),
  ));
  const ownerIds = [...new Set(providerSnapshots.flatMap((snapshot) => {
    const ownerId = snapshot.data()?.ownerId;
    return typeof ownerId === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/u.test(ownerId)
      ? [ownerId]
      : [];
  }))];
  const ownerSnapshots = ownerIds.length > 0
    ? await adminDb.getAll(...ownerIds.map((ownerId) => adminDb
      .collection(FIRESTORE_COLLECTIONS.users)
      .doc(ownerId)))
    : [];
  const owners = new Map(ownerSnapshots.map((snapshot) => [
    snapshot.id,
    snapshot.exists ? snapshot.data() ?? {} : {},
  ]));
  const publicProviders = new Map(providerSnapshots.flatMap((snapshot) => {
    const data = snapshot.data() ?? {};
    const ownerId = data.ownerId;
    const provider = snapshot.exists && typeof ownerId === "string"
      ? normalizePublicProvider(
        snapshot.id,
        data,
        owners.get(ownerId) ?? {},
      )
      : null;
    return provider ? [[provider.id, provider] as const] : [];
  }));
  const providerNames = new Map([...publicProviders].map(
    ([providerId, provider]) => [providerId, provider.businessName],
  ));

  const activeLegacyIds = await loadActiveLegacyOccasionIds(
    documents.map((document) => document.data()),
  );

  const candidates = await Promise.all(documents.map(async (document) => {
    const original = document.data();
    const v2 = original.occasionSchemaVersion === 2;
    const data = v2 ? await verifiedPublicPackageV2(document.id) : original;
    if (!data ||
        (!v2 && !activeLegacyIds.has(String(data.eventType)))) return [];
    const packageRecord = normalizePublicPackage(document.id, data, providerNames, v2);
    return packageRecord ? [{document, packageRecord}] : [];
  }));
  return candidates.flat();
}

function encodePackageCursor(
  direction: PackageCursor["direction"],
  document: QueryDocumentSnapshot<DocumentData>,
  page?: number,
): string | null {
  const createdAt = document.data().createdAt;
  if (!(createdAt instanceof Timestamp)) return null;
  return Buffer.from(JSON.stringify({
    direction,
    createdAtSeconds: createdAt.seconds,
    createdAtNanoseconds: createdAt.nanoseconds,
    packageId: document.id,
    ...(typeof page === "number" && Number.isSafeInteger(page) && page >= 1
      ? {page}
      : {}),
  } satisfies PackageCursor), "utf8").toString("base64url");
}

function decodePackageCursor(value: string | null): PackageCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PackageCursor>;
    if (
      (decoded.direction !== "next" && decoded.direction !== "previous") ||
      typeof decoded.createdAtSeconds !== "number" ||
      !Number.isSafeInteger(decoded.createdAtSeconds) ||
      decoded.createdAtSeconds < 0 ||
      typeof decoded.createdAtNanoseconds !== "number" ||
      !Number.isSafeInteger(decoded.createdAtNanoseconds) ||
      decoded.createdAtNanoseconds < 0 ||
      decoded.createdAtNanoseconds >= 1_000_000_000 ||
      typeof decoded.packageId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/u.test(decoded.packageId)
    ) return null;
    const page = typeof decoded.page === "number" &&
      Number.isSafeInteger(decoded.page) &&
      decoded.page >= 1
      ? decoded.page
      : undefined;
    return {
      direction: decoded.direction,
      createdAtSeconds: decoded.createdAtSeconds,
      createdAtNanoseconds: decoded.createdAtNanoseconds,
      packageId: decoded.packageId,
      ...(page !== undefined ? {page} : {}),
    };
  } catch {
    return null;
  }
}
