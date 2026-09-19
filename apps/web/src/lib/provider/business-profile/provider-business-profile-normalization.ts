import {
  PROVIDER_EVENT_TYPES,
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  normalizePhilippinePhone,
  normalizeProviderEmail,
  serviceCategoryMatchesProviderType,
} from "@feasta/shared-types";

import type {
  ProviderBusinessMedia,
  ProviderBusinessProfile,
} from "./provider-business-profile-types";

type UnknownRecord = Readonly<Record<string, unknown>>;

export function normalizeProviderBusinessProfile(input: {
  providerId: string;
  trustedOwnerId: string;
  data: UnknownRecord;
}): ProviderBusinessProfile | null {
  const {data} = input;
  const providerId = safeDocumentId(input.providerId);
  const ownerId = safeDocumentId(data.ownerId);
  const providerServiceType = allowedValue(
    data.providerServiceType,
    PROVIDER_SERVICE_TYPES,
  );
  const primaryServiceCategory = allowedValue(
    data.providerCategory,
    PROVIDER_SERVICE_CATEGORIES,
  );
  const serviceCategories = allowedList(
    data.serviceCategories,
    PROVIDER_SERVICE_CATEGORIES,
    50,
  );

  if (
    !providerId ||
    !ownerId ||
    ownerId !== input.trustedOwnerId ||
    data.verificationStatus !== "approved" ||
    data.isActive !== true ||
    data.isSuspended === true ||
    data.isDeleted === true ||
    !providerServiceType ||
    !primaryServiceCategory ||
    !serviceCategories ||
    serviceCategories.length === 0 ||
    !serviceCategoryMatchesProviderType(
      primaryServiceCategory,
      providerServiceType,
    ) ||
    serviceCategories.some(
      (category) => !serviceCategoryMatchesProviderType(
        category,
        providerServiceType,
      ),
    )
  ) {
    return null;
  }

  const businessName = requiredText(data.businessName, 2, 120);
  const businessEmail = normalizeProviderEmail(data.businessEmail);
  const businessPhone = normalizePhilippinePhone(data.businessPhone);
  const description = requiredText(data.description, 20, 2000);
  const address = requiredText(data.address, 3, 250);
  const city = requiredText(data.city, 2, 100);
  const province = requiredText(data.province, 2, 100);
  const serviceAreas = textList(data.serviceAreas, 50, 100);
  const eventTypesSupported = allowedList(
    data.eventTypesSupported,
    PROVIDER_EVENT_TYPES,
    50,
  );
  const logo = providerMedia(data, ownerId, "logo");
  const coverImage = providerMedia(data, ownerId, "cover");

  if (
    !businessName ||
    !businessEmail ||
    !businessPhone ||
    !description ||
    !address ||
    !city ||
    !province ||
    !serviceAreas ||
    serviceAreas.length === 0 ||
    !eventTypesSupported ||
    eventTypesSupported.length === 0 ||
    logo === undefined ||
    coverImage === undefined
  ) {
    return null;
  }

  return {
    providerId,
    businessName,
    businessEmail,
    businessPhone,
    description,
    address,
    city,
    province,
    providerServiceType,
    primaryServiceCategory,
    serviceCategories,
    serviceAreas,
    eventTypesSupported,
    maxServiceDistanceKm: optionalNumber(data.maxServiceDistanceKm, 1, 1000),
    logo,
    coverImage,
    updatedAt: timestampIso(data.updatedAt),
  };
}

function providerMedia(
  data: UnknownRecord,
  ownerId: string,
  mediaType: "logo" | "cover",
): ProviderBusinessMedia | null | undefined {
  const rawUrl = mediaType === "logo" ? data.logoUrl : data.coverImageUrl;
  const rawPublicId = mediaType === "logo"
    ? data.logoPublicId
    : data.coverPublicId;

  if (
    (rawUrl === null || rawUrl === undefined || rawUrl === "") &&
    (rawPublicId === null || rawPublicId === undefined || rawPublicId === "")
  ) {
    return null;
  }

  const url = requiredText(rawUrl, 1, 1000);
  const publicId = requiredText(rawPublicId, 1, 500);
  const expectedPublicId = `feasta/providers/${ownerId}/onboarding/${mediaType}`;

  if (!url || publicId !== expectedPublicId) return undefined;

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
      return undefined;
    }

    return {url: parsed.toString(), publicId};
  } catch {
    return undefined;
  }
}

function requiredText(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= minimumLength && normalized.length <= maximumLength
    ? normalized
    : null;
}

function textList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const normalized = value.map((item) => requiredText(item, 1, maximumLength));
  return normalized.some((item) => item === null)
    ? null
    : [...new Set(normalized as string[])];
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
  maximumItems: number,
): readonly TValue[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  if (value.some((item) => allowedValue(item, allowed) === null)) return null;
  return [...new Set(value as TValue[])];
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function safeDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,160}$/u.test(normalized) ? normalized : null;
}

function timestampIso(value: unknown): string | null {
  const date = dateValue(value);
  return date ? date.toISOString() : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const parsed = value.toDate();
    return parsed instanceof Date && Number.isFinite(parsed.getTime())
      ? parsed
      : null;
  }
  return null;
}
