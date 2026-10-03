import type {
  PublicPackage,
  PublicPackageCustomization,
} from "./marketplace-types";
import {
  normalizePackageServiceOptions,
  normalizePackageThemeOptions,
  packageStartingPrice,
} from "@/lib/catering/package-offer-configuration";

type UnknownRecord = Readonly<Record<string, unknown>>;

export function normalizePublicPackageCustomization(
  value: UnknownRecord,
): PublicPackageCustomization {
  return {
    foods: safeTextList(
      [value.foodInclusions],
      50,
      120,
    ),
    decorations: safeTextList(
      [value.decorInclusions],
      50,
      120,
    ),
    furniture: safeTextList(
      [value.furnitureInclusions],
      50,
      120,
    ),
    services: safeTextList(
      [value.serviceInclusions],
      50,
      120,
    ),
  };
}

export function normalizePublicPackage(
  id: string,
  value: UnknownRecord,
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

  const minimumGuests = safeInteger(value.minimumGuests, 1, 1_000_000);
  const maximumGuests = safeInteger(value.maximumGuests, 1, 1_000_000);
  const validGuestRange = minimumGuests === null || maximumGuests === null ||
    minimumGuests <= maximumGuests;
  const inclusions = safeTextList([
    value.foodInclusions,
    value.decorInclusions,
    value.furnitureInclusions,
    value.serviceInclusions,
  ], 8, 120);

  const imageUrls = Array.isArray(value.imageUrls)
    ? value.imageUrls.slice(0, 8).flatMap((entry) => { const url = safeHttpsUrl(entry); return url ? [url] : []; })
    : [];
  const legacyImage = safeHttpsUrl(value.imageUrl);
  if (imageUrls.length === 0 && legacyImage) imageUrls.push(legacyImage);

  const serviceOptions =
    normalizePackageServiceOptions(
      value.serviceOptions,
    );
  const startingPrice =
    packageStartingPrice(
      serviceOptions,
    );
  const legacyPrice =
    safeMoney(value.price);

  return {
    id,
    providerId,
    providerName: providerNames.get(providerId)!,
    name,
    description: safeText(value.description, 600),
    eventType: safeText(value.eventType, 80),
    price:
      startingPrice !== null &&
      legacyPrice === startingPrice
        ? startingPrice
        : Object.keys(serviceOptions)
            .length === 0
          ? legacyPrice
          : null,
    serviceOptions,
    themeOptions:
      normalizePackageThemeOptions(
        value.themeOptions,
      ),
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    minimumGuests: validGuestRange ? minimumGuests : null,
    maximumGuests: validGuestRange ? maximumGuests : null,
    inclusions,
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

function safeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= minimum &&
      value <= maximum
    ? value
    : null;
}

function safeTextList(
  values: readonly unknown[],
  maximumItems: number,
  maximumLength: number,
): readonly string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const normalized = safeText(item, maximumLength);
      if (normalized) result.add(normalized);
      if (result.size === maximumItems) return [...result];
    }
  }
  return [...result];
}

function safeHttpsUrl(value: unknown): string | null {
  const text = safeText(value, 1000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" &&
        url.username === "" &&
        url.password === "" &&
        url.port === "" &&
        url.hash === ""
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
