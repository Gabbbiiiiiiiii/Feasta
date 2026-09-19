import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";
import {FieldValue} from "firebase-admin/firestore";

import {adminDb} from "@/lib/firebase/admin";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";
import {isPublicProviderId} from "@/lib/customer/providers/provider-route-policy";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";

export const FAVORITES_PAGE_LIMIT = 48;

export function favoriteDocumentId(
  customerId: string,
  providerId: string,
): string {
  const normalizedCustomerId = safeCustomerId(customerId);
  if (!normalizedCustomerId || !isPublicProviderId(providerId)) {
    throw new Error("A valid favorite relationship is required.");
  }
  return `${normalizedCustomerId}_${providerId}`;
}

export async function getCustomerFavoriteProviderIds(
  customerId: string,
  providerIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const normalizedCustomerId = safeCustomerId(customerId);
  if (!normalizedCustomerId) return new Set();

  const uniqueProviderIds = [...new Set(
    providerIds.filter(isPublicProviderId),
  )].slice(0, FAVORITES_PAGE_LIMIT);
  if (uniqueProviderIds.length === 0) return new Set();

  const snapshots = await adminDb.getAll(...uniqueProviderIds.map(
    (providerId) => adminDb
      .collection(FIRESTORE_COLLECTIONS.favorites)
      .doc(favoriteDocumentId(normalizedCustomerId, providerId)),
  ));

  return new Set(snapshots.flatMap((snapshot) => {
    const data = snapshot.data();
    return snapshot.exists &&
      data?.customerId === normalizedCustomerId &&
      typeof data.providerId === "string" &&
      isPublicProviderId(data.providerId)
      ? [data.providerId]
      : [];
  }));
}

export async function getCustomerFavoriteProviders(
  customerId: string,
): Promise<readonly PublicProvider[]> {
  const normalizedCustomerId = safeCustomerId(customerId);
  if (!normalizedCustomerId) return [];

  const favoriteSnapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.favorites)
    .where("customerId", "==", normalizedCustomerId)
    .orderBy("createdAt", "desc")
    .limit(FAVORITES_PAGE_LIMIT)
    .get();
  const providerIds = [...new Set(favoriteSnapshot.docs.flatMap((document) => {
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
  const providerData = new Map(providerSnapshots.flatMap((snapshot) =>
    snapshot.exists ? [[snapshot.id, snapshot.data() ?? {}] as const] : [],
  ));
  const ownerIds = [...new Set(providerSnapshots.flatMap((snapshot) => {
    const ownerId = snapshot.data()?.ownerId;
    return typeof ownerId === "string" && safeCustomerId(ownerId)
      ? [ownerId]
      : [];
  }))];
  const ownerSnapshots = ownerIds.length > 0
    ? await adminDb.getAll(...ownerIds.map((ownerId) => adminDb
      .collection(FIRESTORE_COLLECTIONS.users)
      .doc(ownerId)))
    : [];
  const owners = new Map(ownerSnapshots.flatMap((snapshot) =>
    snapshot.exists ? [[snapshot.id, snapshot.data() ?? {}] as const] : [],
  ));

  return providerIds.flatMap((providerId) => {
    const data = providerData.get(providerId);
    const ownerId = data?.ownerId;
    const provider = data && typeof ownerId === "string"
      ? normalizePublicProvider(providerId, data, owners.get(ownerId) ?? {})
      : null;
    return provider ? [provider] : [];
  });
}

export async function setCustomerProviderFavorite({
  customerId,
  providerId,
  favorite,
}: {
  customerId: string;
  providerId: string;
  favorite: boolean;
}): Promise<boolean> {
  const normalizedCustomerId = safeCustomerId(customerId);
  if (
    !normalizedCustomerId ||
    !isPublicProviderId(providerId) ||
    typeof favorite !== "boolean"
  ) {
    throw new Error("A valid favorite relationship is required.");
  }

  const providerReference = adminDb
    .collection(FIRESTORE_COLLECTIONS.providers)
    .doc(providerId);
  const favoriteReference = adminDb
    .collection(FIRESTORE_COLLECTIONS.favorites)
    .doc(favoriteDocumentId(normalizedCustomerId, providerId));

  return adminDb.runTransaction(async (transaction) => {
    const providerSnapshot = await transaction.get(providerReference);
    const providerData = providerSnapshot.data() ?? null;
    const ownerId = providerData?.ownerId;
    const ownerSnapshot = typeof ownerId === "string"
      ? await transaction.get(adminDb
        .collection(FIRESTORE_COLLECTIONS.users)
        .doc(ownerId))
      : null;
    const favoriteSnapshot = await transaction.get(favoriteReference);

    if (favorite) {
      const publicProvider = providerSnapshot.exists && providerData && ownerSnapshot
        ? normalizePublicProvider(
          providerId,
          providerData,
          ownerSnapshot.data() ?? {},
        )
        : null;
      if (!publicProvider || !providerData) {
        throw new Error("This provider is not available for public discovery.");
      }
      if (favoriteSnapshot.exists) {
        const existing = favoriteSnapshot.data();
        if (
          existing?.customerId !== normalizedCustomerId ||
          existing?.providerId !== providerId
        ) {
          throw new Error("The favorite relationship is invalid.");
        }
        return true;
      }

      transaction.create(favoriteReference, {
        customerId: normalizedCustomerId,
        providerId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(providerReference, {
        favoriteCount: safeFavoriteCount(providerData.favoriteCount) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    }

    if (!favoriteSnapshot.exists) return false;
    const existing = favoriteSnapshot.data();
    if (
      existing?.customerId !== normalizedCustomerId ||
      existing?.providerId !== providerId
    ) {
      throw new Error("The favorite relationship is invalid.");
    }

    transaction.delete(favoriteReference);
    if (providerSnapshot.exists && providerData) {
      transaction.update(providerReference, {
        favoriteCount: Math.max(
          0,
          safeFavoriteCount(providerData.favoriteCount) - 1,
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return false;
  });
}

function safeCustomerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= 128 &&
    !normalized.includes("/")
    ? normalized
    : null;
}

function safeFavoriteCount(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : 0;
}
