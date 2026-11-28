import type {
  CustomerBooking,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";

type AggregateResponseCounts = Pick<
  CustomerBooking,
  | "providerRequestCount"
  | "pendingProviderRequestCount"
  | "acceptedProviderRequestCount"
  | "waitingPaymentProviderRequestCount"
  | "paymentProcessingProviderRequestCount"
  | "confirmedProviderRequestCount"
  | "rejectedProviderRequestCount"
  | "completedProviderRequestCount"
>;

type ProviderResponseFields = Pick<
  CustomerBookingProviderRequest,
  | "respondedAt"
  | "acceptedAt"
  | "rejectedAt"
  | "replacementStatus"
>;

type ProviderPaymentConfirmationFields = Pick<
  CustomerBookingProviderRequest,
  | "paidAt"
  | "refundedAt"
>;

export function normalizeCustomerBookingAggregateCounts(
  data: Record<string, unknown>,
): AggregateResponseCounts {
  return {
    providerRequestCount: safeCount(data.providerRequestCount),
    pendingProviderRequestCount: safeCount(data.pendingProviderRequestCount),
    acceptedProviderRequestCount: safeCount(data.acceptedProviderRequestCount),
    waitingPaymentProviderRequestCount: safeCount(
      data.waitingPaymentProviderRequestCount,
    ),
    paymentProcessingProviderRequestCount: safeCount(
      data.paymentProcessingProviderRequestCount,
    ),
    confirmedProviderRequestCount: safeCount(data.confirmedProviderRequestCount),
    rejectedProviderRequestCount: safeCount(data.rejectedProviderRequestCount),
    completedProviderRequestCount: safeCount(data.completedProviderRequestCount),
  };
}

export function normalizeCustomerBookingProviderResponseFields(
  data: Record<string, unknown>,
): ProviderResponseFields {
  return {
    respondedAt: safeIsoDate(data.respondedAt),
    acceptedAt: safeIsoDate(data.acceptedAt),
    rejectedAt: safeIsoDate(data.rejectedAt),
    replacementStatus: safeOptionalString(data.replacementStatus, 80),
  };
}

export function normalizeCustomerBookingProviderPaymentConfirmationFields(
  data: Record<string, unknown>,
): ProviderPaymentConfirmationFields {
  return {
    paidAt: safeIsoDate(data.paidAt),
    refundedAt: safeIsoDate(data.refundedAt),
  };
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ?
    value :
    0;
}

function safeIsoDate(value: unknown): string | null {
  const date = safeDate(value);
  return date ? date.toISOString() : null;
}

function safeDate(value: unknown): Date | null {
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
    try {
      const candidate = value.toDate();
      return candidate instanceof Date && Number.isFinite(candidate.getTime()) ?
        candidate :
        null;
    } catch {
      return null;
    }
  }

  return null;
}

function safeOptionalString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maximumLength);
  return normalized || null;
}
