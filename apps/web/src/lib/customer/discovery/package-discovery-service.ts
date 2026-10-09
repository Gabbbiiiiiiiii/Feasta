import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";
import {
  FieldPath,
  Timestamp,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {adminDb} from "@/lib/firebase/admin";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";
import {isPublicProviderId} from "@/lib/customer/providers/provider-route-policy";

import type {
  PackageCursor,
  PackageDiscoveryFilters,
  PackageDiscoveryPage,
  PublicPackage,
} from "./marketplace-types";
import {normalizePublicPackage} from "./public-package-normalization";

export const PACKAGE_PAGE_SIZE = 12;
export const PACKAGE_CANDIDATE_READ_LIMIT = 48;

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
    query = query.where("eventType", "==", filters.eventType);
  }

  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

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

  const snapshot = await query.get();
  const publicCandidates = await normalizePackageCandidates(snapshot.docs);
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

  return {
    packages: selected.map((candidate) => candidate.packageRecord),
    previousCursor: hasPrevious && previousAnchor
      ? encodePackageCursor("previous", previousAnchor)
      : null,
    nextCursor: hasNext && nextAnchor
      ? encodePackageCursor("next", nextAnchor)
      : null,
    pageSize: safePageSize,
  };
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

  return documents.flatMap((document) => {
    const packageRecord = normalizePublicPackage(
      document.id,
      document.data(),
      providerNames,
    );
    return packageRecord ? [{document, packageRecord}] : [];
  });
}

function encodePackageCursor(
  direction: PackageCursor["direction"],
  document: QueryDocumentSnapshot<DocumentData>,
): string | null {
  const createdAt = document.data().createdAt;
  if (!(createdAt instanceof Timestamp)) return null;
  return Buffer.from(JSON.stringify({
    direction,
    createdAtSeconds: createdAt.seconds,
    createdAtNanoseconds: createdAt.nanoseconds,
    packageId: document.id,
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
    return decoded as PackageCursor;
  } catch {
    return null;
  }
}
