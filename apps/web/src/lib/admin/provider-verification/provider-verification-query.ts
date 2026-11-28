import {
  verificationQueueStatuses,
  type ProviderVerificationQueueFilters,
  type VerificationQueueStatus,
} from "./provider-verification-types.ts";

type SearchValue = string | string[] | undefined;
type QueueSearchParams = Record<string, SearchValue>;

const SERVICE_CATEGORY_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

function first(value: SearchValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validServiceCategory(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 2 &&
    normalized.length <= 100 &&
    SERVICE_CATEGORY_CODE_PATTERN.test(normalized)
    ? normalized
    : "all";
}

export function parseProviderVerificationQueueFilters(
  searchParams: QueueSearchParams,
): ProviderVerificationQueueFilters {
  const statusValue = first(searchParams.status);
  const serviceCategoryValue = first(searchParams.serviceCategory);
  const direction = first(searchParams.direction);
  return {
    search: first(searchParams.q).trim().slice(0, 80),
    status: (
      verificationQueueStatuses as readonly string[]
    ).includes(statusValue)
      ? statusValue as VerificationQueueStatus
      : "all",
    serviceCategory: validServiceCategory(serviceCategoryValue),
    cursor: first(searchParams.cursor).slice(0, 500) || null,
    direction: direction === "previous" ? "previous" : "next",
  };
}

export function selectedVerificationId(
  searchParams: QueueSearchParams,
): string | null {
  const value = first(searchParams.selected);
  return /^[A-Za-z0-9_-]{1,150}$/u.test(value) ? value : null;
}
