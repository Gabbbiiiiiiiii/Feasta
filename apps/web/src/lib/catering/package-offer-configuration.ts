import {
  CATERING_PACKAGE_SERVICE_TIERS,
  type CateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";

export type PackageServiceOption = {
  price: number;
  includedServices: readonly string[];
};

export type PackageServiceOptions = Partial<
  Record<CateringPackageServiceTier, PackageServiceOption>
>;

export type PackageThemeOption = {
  id: string;
  name: string;
  description: string;
  imageUrls: readonly string[];
};

export function packageStartingPrice(
  options: PackageServiceOptions,
): number | null {
  const prices = CATERING_PACKAGE_SERVICE_TIERS
    .map((tier) => options[tier]?.price)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );

  return prices.length > 0 ? Math.min(...prices) : null;
}

export function normalizePackageServiceOptions(
  value: unknown,
): PackageServiceOptions {
  if (!isRecord(value)) {
    return {};
  }

  const result: PackageServiceOptions = {};

  for (const tier of CATERING_PACKAGE_SERVICE_TIERS) {
    const option = value[tier];
    if (!isRecord(option)) {
      continue;
    }

    const price = safeMoney(option.price);
    if (price === null) {
      continue;
    }

    result[tier] = {
      price,
      includedServices: safeTextList(
        option.includedServices,
        50,
        160,
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
  const ids = new Set<string>();

  for (const raw of value.slice(0, 12)) {
    if (!isRecord(raw)) {
      continue;
    }

    const id = safeId(raw.id);
    const name = safeText(raw.name, 80);
    if (!id || !name || ids.has(id)) {
      continue;
    }

    ids.add(id);
    result.push({
      id,
      name,
      description: safeText(raw.description, 500) ?? "",
      imageUrls: safeHttpsUrlList(raw.imageUrls, 4),
    });
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeMoney(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10_000_000 &&
    Math.abs(value * 100 - Math.round(value * 100)) <= 1e-8
    ? Math.round((value + Number.EPSILON) * 100) / 100
    : null;
}

function safeText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maximumLength
    ? normalized
    : null;
}

function safeId(value: unknown): string | null {
  const text = safeText(value, 80);
  return text && /^[A-Za-z0-9_-]{2,80}$/u.test(text) ? text : null;
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
    const normalized = safeText(item, maximumLength);
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
    if (result.length === maximumItems) {
      break;
    }
  }
  return result;
}

function safeHttpsUrlList(value: unknown, maximumItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2048) {
      continue;
    }

    try {
      const url = new URL(item.trim());
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
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

    if (result.length === maximumItems) {
      break;
    }
  }
  return result;
}
