import {
  CATERING_PACKAGE_SERVICE_TIERS,
  type CateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";

export type PackageServiceOption = {
  price: number;
  includedServices: readonly string[];
};

export type PackageServiceOptions =
  Partial<
    Record<
      CateringPackageServiceTier,
      PackageServiceOption
    >
  >;

export type PackageThemeOption = {
  id: string;
  name: string;
  description: string;
  imageUrls: readonly string[];
};

export type PackageVisualStyle = PackageThemeOption;

export function packageStartingPrice(
  options: PackageServiceOptions,
): number | null {
  const prices =
    CATERING_PACKAGE_SERVICE_TIERS
      .map((tier) => options[tier]?.price)
      .filter(
        (value): value is number =>
          typeof value === "number" &&
          Number.isFinite(value),
      );

  return prices.length > 0
    ? Math.min(...prices)
    : null;
}

export function normalizePackageServiceOptions(
  value: unknown,
): PackageServiceOptions {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  const data =
    value as Record<string, unknown>;

  const result: PackageServiceOptions = {};

  for (
    const tier of
      CATERING_PACKAGE_SERVICE_TIERS
  ) {
    const raw = data[tier];

    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      continue;
    }

    const option =
      raw as Record<string, unknown>;

    const price = safeMoney(option.price);

    if (price === null) {
      continue;
    }

    result[tier] = {
      price,
      includedServices:
        safeTextList(
          option.includedServices,
          50,
          10_000,
        ),
    };
  }

  return result;
}

export function normalizePackageThemeOptions(
  value: unknown,
): PackageThemeOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: PackageThemeOption[] = [];

  for (const raw of value.slice(0, 12)) {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      continue;
    }

    const item =
      raw as Record<string, unknown>;

    const id = safeId(item.id);
    const name = safeText(item.name, 80);

    if (!id || !name) {
      continue;
    }

    /*
     * Legacy package documents may still contain:
     * additionalPrice, furnitureInclusions, setupInclusions.
     * They are intentionally ignored. Theme choice is now free,
     * while logistical details belong in the package description.
     */
    result.push({
      id,
      name,
      description:
        safeText(item.description, 500) ?? "",
      imageUrls:
        safeHttpsUrlList(
          item.imageUrls,
          4,
        ),
    });
  }

  return result;
}

function safeMoney(
  value: unknown,
): number | null {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 10_000_000
    ? value
    : null;
}

function safeText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().replace(/\s+/gu, " ");

  if (
    normalized.length === 0 ||
    normalized.length > maximumLength
  ) {
    return null;
  }

  return normalized;
}

function safeId(
  value: unknown,
): string | null {
  const text = safeText(value, 80);

  return text &&
      /^[A-Za-z0-9_-]+$/u.test(text)
    ? text
    : null;
}

function safeHttpsUrlList(
  value: unknown,
  maximumItems: number,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim();

    if (normalized.length === 0 || normalized.length > 1000) {
      continue;
    }

    try {
      const url = new URL(normalized);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.hash
      ) {
        continue;
      }
      const serialized = url.toString();
      if (!result.includes(serialized)) {
        result.push(serialized);
      }
    } catch {
      continue;
    }

    if (result.length >= maximumItems) {
      break;
    }
  }

  return result;
}

function safeTextList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];

  for (const item of value) {
    const normalized =
      safeText(item, maximumLength);

    if (
      normalized &&
      !result.includes(normalized)
    ) {
      result.push(normalized);
    }

    if (result.length >= maximumItems) {
      break;
    }
  }

  return result;
}