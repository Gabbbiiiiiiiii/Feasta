import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";
import {
  FieldPath,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {adminDb} from "@/lib/firebase/admin";

import {normalizePublicProvider} from "./provider-normalization";
import {normalizedSearchToken} from "./provider-query";
import type {
  ProviderCursor,
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
} from "./provider-types";

export const PROVIDER_PAGE_SIZE = 12;
export const PROVIDER_READ_LIMIT = PROVIDER_PAGE_SIZE + 1;

export async function getPublicProviderPage(
  filters: ProviderDiscoveryFilters,
  pageSize = PROVIDER_PAGE_SIZE,
): Promise<ProviderDiscoveryPage> {
  const safePageSize = Math.min(Math.max(Math.trunc(pageSize), 1), PROVIDER_PAGE_SIZE);
  const cursor = decodeProviderCursor(filters.cursor);
  let query: Query<DocumentData> = adminDb
    .collection(FIRESTORE_COLLECTIONS.providers)
    .where("verificationStatus", "==", "approved")
    .where("publiclyVisible", "==", true)
    .where("isActive", "==", true)
    .where("isSuspended", "==", false)
    .where("isDeleted", "==", false);

  if (filters.serviceType !== "all") {
    query = query.where("providerServiceType", "==", filters.serviceType);
  }
  if (filters.category !== "all") {
    query = query.where("providerCategory", "==", filters.category);
  }
  const searchToken = normalizedSearchToken(filters.search);
  if (searchToken.length >= 2) {
    query = query.where("searchTokens", "array-contains", searchToken);
  }

  query = query
    .orderBy("favoriteCount", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  if (cursor) {
    query = cursor.direction === "previous"
      ? query
        .endBefore(cursor.favoriteCount, cursor.providerId)
        .limitToLast(safePageSize + 1)
      : query
        .startAfter(cursor.favoriteCount, cursor.providerId)
        .limit(safePageSize + 1);
  } else {
    query = query.limit(safePageSize + 1);
  }

  const snapshot = await query.get();
  const rawDocuments = snapshot.docs;
  const hasDirectionalExtra = rawDocuments.length > safePageSize;
  const pageDocuments = cursor?.direction === "previous"
    ? rawDocuments.slice(hasDirectionalExtra ? 1 : 0)
    : rawDocuments.slice(0, safePageSize);
  const ownerIds = [...new Set(pageDocuments
    .map((document) => stringValue(document.data().ownerId))
    .filter((value): value is string => value !== null))];
  const ownerSnapshots = ownerIds.length > 0
    ? await adminDb.getAll(...ownerIds.map((ownerId) =>
      adminDb.collection(FIRESTORE_COLLECTIONS.users).doc(ownerId)
    ))
    : [];
  const owners = new Map(ownerSnapshots.map((owner) => [
    owner.id,
    owner.exists ? owner.data() ?? {} : {},
  ]));
  const providers = pageDocuments.flatMap((document) => {
    const data = document.data();
    const ownerId = stringValue(data.ownerId);
    const provider = normalizePublicProvider(
      document.id,
      data,
      ownerId ? owners.get(ownerId) ?? {} : {},
    );
    return provider ? [provider] : [];
  });

  const firstDocument = pageDocuments[0] ?? null;
  const lastDocument = pageDocuments.at(-1) ?? null;
  const hasPrevious = cursor?.direction === "next"
    ? true
    : cursor?.direction === "previous" && hasDirectionalExtra;
  const hasNext = cursor?.direction === "previous"
    ? true
    : hasDirectionalExtra;

  return {
    providers,
    previousCursor: hasPrevious && firstDocument
      ? encodeDocumentCursor("previous", firstDocument)
      : null,
    nextCursor: hasNext && lastDocument
      ? encodeDocumentCursor("next", lastDocument)
      : null,
    pageSize: safePageSize,
  };
}

function encodeDocumentCursor(
  direction: ProviderCursor["direction"],
  document: QueryDocumentSnapshot<DocumentData>,
): string {
  return Buffer.from(JSON.stringify({
    direction,
    favoriteCount: nonnegativeNumber(document.data().favoriteCount),
    providerId: document.id,
  } satisfies ProviderCursor), "utf8").toString("base64url");
}

function decodeProviderCursor(value: string | null): ProviderCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ProviderCursor>;
    if (
      (decoded.direction !== "next" && decoded.direction !== "previous") ||
      typeof decoded.favoriteCount !== "number" ||
      !Number.isFinite(decoded.favoriteCount) ||
      decoded.favoriteCount < 0 ||
      typeof decoded.providerId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/u.test(decoded.providerId)
    ) return null;
    return {
      direction: decoded.direction,
      favoriteCount: decoded.favoriteCount,
      providerId: decoded.providerId,
    };
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 128)
    : null;
}

function nonnegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}
