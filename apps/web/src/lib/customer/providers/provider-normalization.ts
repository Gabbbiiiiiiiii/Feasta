import {
  PROVIDER_EVENT_TYPES,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  type ProviderEventType,
  type ProviderOperatingDay,
} from "@feasta/shared-types";

import type {PublicProvider} from "./provider-types";

type UnknownRecord = Readonly<Record<string, unknown>>;

export function isPublicProviderRecord(
  id: string,
  provider: UnknownRecord,
  owner: UnknownRecord,
): boolean {
  const ownerId = safeText(provider.ownerId, 128);
  return provider.verificationStatus === "approved" &&
    provider.publiclyVisible === true &&
    provider.isActive === true &&
    provider.isSuspended !== true &&
    provider.isDeleted !== true &&
    ownerId !== null &&
    owner.role === "provider" &&
    owner.providerId === id &&
    owner.accountStatus === "active" &&
    owner.isActive !== false &&
    owner.isBlocked !== true;
}

export function normalizePublicProvider(
  id: string,
  provider: UnknownRecord,
  owner: UnknownRecord,
): PublicProvider | null {
  if (!isPublicProviderRecord(id, provider, owner)) return null;

  const businessName = safeText(provider.businessName, 160);
  const serviceType = allowedValue(
    provider.providerServiceType,
    PROVIDER_SERVICE_TYPES,
  );
  if (!businessName || !serviceType) return null;

  const city = safeText(provider.city, 100);
  const province = safeText(provider.province, 100);
  const address = safeText(provider.address, 250);
  const primaryCategory = allowedValue(
    provider.providerCategory,
    PROVIDER_SERVICE_CATEGORIES,
  );
  const categories = allowedList(
    provider.serviceCategories,
    PROVIDER_SERVICE_CATEGORIES,
    20,
  );

  return {
    id,
    businessName,
    description: safeText(provider.description, 1200),
    serviceType,
    primaryCategory,
    categories: categories.length > 0
      ? categories
      : primaryCategory ? [primaryCategory] : [],
    location: [city, province].filter(Boolean).join(", ") || address,
    serviceAreas: safeTextList(provider.serviceAreas, 12, 100),
    eventTypes: allowedList<ProviderEventType>(
      provider.eventTypesSupported,
      PROVIDER_EVENT_TYPES,
      12,
    ),
    operatingDays: allowedList<ProviderOperatingDay>(
      provider.operatingDays,
      PROVIDER_OPERATING_DAYS,
      7,
    ),
    bookingLeadTimeDays: safeInteger(provider.bookingLeadTimeDays, 0, 365),
    minimumGuests: safeInteger(provider.minGuestsPerEvent, 1, 1_000_000),
    maximumGuests: safeInteger(provider.maxGuestsPerEvent, 1, 1_000_000),
    logoUrl: providerImageUrl(provider, "logo"),
    coverImageUrl: providerImageUrl(provider, "cover"),
    approvalLabel: "Approved",
  };
}

export function providerImageUrl(
  provider: UnknownRecord,
  mediaType: "logo" | "cover",
): string | null {
  const url = safeText(
    mediaType === "logo" ? provider.logoUrl : provider.coverImageUrl,
    1000,
  );
  const publicId = safeText(
    mediaType === "logo" ? provider.logoPublicId : provider.coverPublicId,
    300,
  );
  const ownerId = safeText(provider.ownerId, 128);
  if (!url || !publicId || !ownerId || !/^[A-Za-z0-9_-]{1,128}$/u.test(ownerId)) {
    return null;
  }

  const expectedPublicId = `feasta/providers/${ownerId}/onboarding/${mediaType}`;
  if (publicId !== expectedPublicId) return null;

  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "res.cloudinary.com" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      !parsed.pathname.includes("/image/upload/") ||
      !parsed.pathname.includes(`/${expectedPublicId}.`) ||
      !/\.(?:jpe?g|png|webp)$/iu.test(parsed.pathname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, maximum);
  return normalized || null;
}

function safeTextList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): readonly string[] {
  if (!Array.isArray(value)) return [];
  const values = new Set<string>();
  for (const item of value) {
    const normalized = safeText(item, maximumLength);
    if (normalized) values.add(normalized);
    if (values.size === maximumItems) break;
  }
  return [...values];
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

function allowedValue<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): TValue | null {
  return typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ? value as TValue
    : null;
}

function allowedList<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  maximum: number,
): readonly TValue[] {
  if (!Array.isArray(value)) return [];
  const values = new Set<TValue>();
  for (const item of value) {
    const normalized = allowedValue(item, allowed);
    if (normalized) values.add(normalized);
    if (values.size === maximum) break;
  }
  return [...values];
}
