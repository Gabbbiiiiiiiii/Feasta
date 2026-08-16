import {
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  type ProviderServiceCategory,
  type ProviderServiceType,
} from "@feasta/shared-types";

import {
  PUBLIC_PROVIDER_MARKETPLACE_PATH,
  PUBLIC_PACKAGE_MARKETPLACE_PATH,
  isPublicProviderId,
} from "./provider-route-policy";
import {
  parsePackageDirectoryReturnHref,
} from "@/lib/customer/discovery/package-query";
import type {ProviderDiscoveryFilters} from "./provider-types";

type SearchParameters = Record<string, string | string[] | undefined>;

export function parseProviderDiscoveryFilters(
  parameters: SearchParameters,
): ProviderDiscoveryFilters {
  const search = boundedText(first(parameters.q), 80);
  return {
    search: search.length >= 2 ? search : "",
    serviceType: enumValue(
      first(parameters.service),
      PROVIDER_SERVICE_TYPES,
      "all",
    ),
    category: enumValue(
      first(parameters.category),
      PROVIDER_SERVICE_CATEGORIES,
      "all",
    ),
    cursor: providerCursorValue(first(parameters.cursor)),
  };
}

export function providerDiscoveryHref(
  filters: ProviderDiscoveryFilters,
  cursor: string | null = null,
): string {
  const parameters = new URLSearchParams();
  if (filters.search) parameters.set("q", filters.search);
  if (filters.serviceType !== "all") {
    parameters.set("service", filters.serviceType);
  }
  if (filters.category !== "all") {
    parameters.set("category", filters.category);
  }
  if (cursor) parameters.set("cursor", cursor);
  const query = parameters.toString();
  return query ? `/customer/providers?${query}` : "/customer/providers";
}

export function parseProviderDirectoryReturnHref(
  value: string | string[] | undefined,
): string {
  const candidate = first(value);
  if (
    candidate.length === 0 ||
    candidate.length > 1024 ||
    candidate.includes("#") ||
    /[\u0000-\u001F\u007F]/u.test(candidate)
  ) {
    return PUBLIC_PROVIDER_MARKETPLACE_PATH;
  }

  const queryIndex = candidate.indexOf("?");
  const pathname = queryIndex === -1
    ? candidate
    : candidate.slice(0, queryIndex);
  if (pathname !== PUBLIC_PROVIDER_MARKETPLACE_PATH) {
    return PUBLIC_PROVIDER_MARKETPLACE_PATH;
  }

  const parameters = new URLSearchParams(
    queryIndex === -1 ? "" : candidate.slice(queryIndex + 1),
  );
  const filters = parseProviderDiscoveryFilters({
    q: parameters.getAll("q"),
    service: parameters.getAll("service"),
    category: parameters.getAll("category"),
    cursor: parameters.getAll("cursor"),
  });
  return providerDiscoveryHref(filters, filters.cursor);
}

export function providerProfileHref(
  providerId: string,
  returnHref: string = PUBLIC_PROVIDER_MARKETPLACE_PATH,
): string {
  if (!isPublicProviderId(providerId)) {
    return PUBLIC_PROVIDER_MARKETPLACE_PATH;
  }

  const profilePath =
    `${PUBLIC_PROVIDER_MARKETPLACE_PATH}/${encodeURIComponent(providerId)}`;
  const safeReturnHref = parseMarketplaceReturnHref(returnHref);
  if (safeReturnHref === PUBLIC_PROVIDER_MARKETPLACE_PATH) {
    return profilePath;
  }

  const parameters = new URLSearchParams({returnTo: safeReturnHref});
  return `${profilePath}?${parameters.toString()}`;
}

export function parseMarketplaceReturnHref(
  value: string | string[] | undefined,
): string {
  const candidate = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const queryIndex = candidate.indexOf("?");
  const pathname = queryIndex === -1
    ? candidate
    : candidate.slice(0, queryIndex);
  return pathname === PUBLIC_PACKAGE_MARKETPLACE_PATH
    ? parsePackageDirectoryReturnHref(candidate)
    : parseProviderDirectoryReturnHref(candidate);
}

export function normalizedSearchToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .slice(0, 80);
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function boundedText(value: string, maximum: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, maximum);
}

function enumValue<
  TValue extends ProviderServiceType | ProviderServiceCategory,
>(
  value: string,
  allowed: readonly TValue[],
  fallback: "all",
): TValue | "all" {
  return (allowed as readonly string[]).includes(value)
    ? value as TValue
    : fallback;
}

function providerCursorValue(value: string): string | null {
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{1,512}$/u.test(trimmed) ? trimmed : null;
}
