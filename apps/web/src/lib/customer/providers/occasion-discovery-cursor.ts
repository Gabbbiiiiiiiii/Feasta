import "server-only";

import {createHash} from "node:crypto";

export type OccasionCursorDirection = "next" | "previous";

export type OccasionDiscoveryCursor = {
  version: 1;
  direction: OccasionCursorDirection;
  favoriteCount: number;
  providerId: string;
  scope: string;
};

export type OccasionDiscoveryScope = {
  occasionId: string;
  search: string;
  serviceType: string;
  categories: readonly string[];
};

const idPattern = /^[a-z][a-z0-9_]{1,63}$/u;
const providerIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

export function occasionDiscoveryScopeKey(
  filters: OccasionDiscoveryScope,
): string {
  if (!idPattern.test(filters.occasionId)) {
    throw new Error("Invalid occasion ID.");
  }

  const canonical = JSON.stringify({
    occasionId: filters.occasionId,
    search: filters.search.trim().toLowerCase(),
    serviceType: filters.serviceType,
    categories: [...new Set(filters.categories)].sort(),
  });

  return createHash("sha256")
    .update(canonical)
    .digest("hex");
}

export function encodeOccasionDiscoveryCursor(
  cursor: Omit<OccasionDiscoveryCursor, "version">,
): string {
  if (
    !Number.isFinite(cursor.favoriteCount) ||
    cursor.favoriteCount < 0 ||
    !providerIdPattern.test(cursor.providerId) ||
    !/^[a-f0-9]{64}$/u.test(cursor.scope) ||
    (cursor.direction !== "next" && cursor.direction !== "previous")
  ) {
    throw new Error("Invalid occasion cursor.");
  }

  return Buffer.from(JSON.stringify({
    version: 1,
    ...cursor,
  }), "utf8").toString("base64url");
}

export function decodeOccasionDiscoveryCursor(
  value: string | null,
  expectedScope: string,
): OccasionDiscoveryCursor | null {
  if (!value) return null;

  try {
    if (value.length > 1024 ||
        !/^[A-Za-z0-9_-]+$/u.test(value)) return null;

    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );

    if (!parsed || typeof parsed !== "object") return null;

    const cursor = parsed as Partial<OccasionDiscoveryCursor>;

    if (
      cursor.version !== 1 ||
      (cursor.direction !== "next" && cursor.direction !== "previous") ||
      typeof cursor.favoriteCount !== "number" ||
      !Number.isFinite(cursor.favoriteCount) ||
      cursor.favoriteCount < 0 ||
      typeof cursor.providerId !== "string" ||
      !providerIdPattern.test(cursor.providerId) ||
      cursor.scope !== expectedScope
    ) {
      return null;
    }

    return cursor as OccasionDiscoveryCursor;
  } catch {
    return null;
  }
}