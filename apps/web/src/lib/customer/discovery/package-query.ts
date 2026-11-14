import {
  PROVIDER_EVENT_TYPES,
  type ProviderEventType,
} from "@feasta/shared-types";

import {PUBLIC_PACKAGE_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";

import type {PackageDiscoveryFilters} from "./marketplace-types";

type SearchParameters = Record<string, string | string[] | undefined>;

export function parsePackageDiscoveryFilters(
  parameters: SearchParameters,
): PackageDiscoveryFilters {
  const eventType = first(parameters.event).trim();
  return {
    eventType: (PROVIDER_EVENT_TYPES as readonly string[]).includes(eventType)
      ? eventType as ProviderEventType
      : "all",
    cursor: packageCursorValue(first(parameters.cursor)),
  };
}

export function packageDiscoveryHref(
  filters: PackageDiscoveryFilters,
  cursor: string | null = null,
): string {
  const parameters = new URLSearchParams();
  if (filters.eventType !== "all") {
    parameters.set("event", filters.eventType);
  }
  if (cursor) parameters.set("cursor", cursor);
  const query = parameters.toString();
  return query
    ? `${PUBLIC_PACKAGE_MARKETPLACE_PATH}?${query}`
    : PUBLIC_PACKAGE_MARKETPLACE_PATH;
}

export function parsePackageDirectoryReturnHref(
  value: string | string[] | undefined,
): string {
  const candidate = first(value);
  if (
    candidate.length === 0 ||
    candidate.length > 1024 ||
    candidate.includes("#") ||
    /[\u0000-\u001F\u007F]/u.test(candidate)
  ) return PUBLIC_PACKAGE_MARKETPLACE_PATH;

  const queryIndex = candidate.indexOf("?");
  const pathname = queryIndex === -1
    ? candidate
    : candidate.slice(0, queryIndex);
  if (pathname !== PUBLIC_PACKAGE_MARKETPLACE_PATH) {
    return PUBLIC_PACKAGE_MARKETPLACE_PATH;
  }

  const parameters = new URLSearchParams(
    queryIndex === -1 ? "" : candidate.slice(queryIndex + 1),
  );
  const filters = parsePackageDiscoveryFilters({
    event: parameters.getAll("event"),
    cursor: parameters.getAll("cursor"),
  });
  return packageDiscoveryHref(filters, filters.cursor);
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function packageCursorValue(value: string): string | null {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,512}$/u.test(normalized) ? normalized : null;
}
