import {
  verificationQueueServiceTypes,
  verificationQueueStatuses,
  type ProviderVerificationQueueFilters,
  type VerificationQueueServiceType,
  type VerificationQueueStatus,
} from "./provider-verification-types.ts";

type SearchValue = string | string[] | undefined;
type QueueSearchParams = Record<string, SearchValue>;

function first(value: SearchValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : "";
}

export function parseProviderVerificationQueueFilters(
  searchParams: QueueSearchParams,
): ProviderVerificationQueueFilters {
  const statusValue = first(searchParams.status);
  const serviceTypeValue = first(searchParams.serviceType);
  const direction = first(searchParams.direction);
  return {
    search: first(searchParams.q).trim().slice(0, 80),
    status: (
      verificationQueueStatuses as readonly string[]
    ).includes(statusValue)
      ? statusValue as VerificationQueueStatus
      : "all",
    serviceType: (
      verificationQueueServiceTypes as readonly string[]
    ).includes(serviceTypeValue)
      ? serviceTypeValue as VerificationQueueServiceType
      : "all",
    from: validDate(first(searchParams.from)),
    to: validDate(first(searchParams.to)),
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
