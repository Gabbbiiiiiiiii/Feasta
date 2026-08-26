import type {MainEventStatus} from "@feasta/shared-types";

import {
  CUSTOMER_BOOKING_STATUS_OPTIONS,
  customerBookingStatusFilterLabel,
  isCustomerBookingStatusFilter,
} from "@/lib/customer/bookings/customer-booking-status";
import type {
  CustomerBooking,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-PH");

const BOOKING_STATUS_OPTIONS = CUSTOMER_BOOKING_STATUS_OPTIONS;

const MAIN_EVENT_STATUS_LABELS: Record<MainEventStatus, string> = {
  draft: "Draft",
  pending_provider_approval: "Awaiting provider",
  needs_provider_replacement: "Provider update needed",
  waiting_for_down_payment: "Awaiting payment",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

function formatBookingDate(value: string | null): string {
  if (!value) return "Date not provided";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ?
    "Date not provided" :
    dateFormatter.format(date);
}

function formatBookingDateTime(value: string | null): string {
  if (!value) return "Date not provided";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ?
    "Date not provided" :
    dateTimeFormatter.format(date);
}

function formatBookingTimeRange(start: string, end: string): string {
  const formattedStart = formatClockTime(start);
  const formattedEnd = formatClockTime(end);

  if (formattedStart && formattedEnd) return `${formattedStart}–${formattedEnd}`;
  return formattedStart || formattedEnd || "Time not provided";
}

function formatClockTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/u.exec(value.trim());
  if (!match) return boundedText(value, "", 20);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(
    Number.isFinite(value) && value >= 0 ? value : 0,
  );
}

function formatCount(value: number): string {
  return numberFormatter.format(
    Number.isInteger(value) && value >= 0 ? value : 0,
  );
}

function formatPercentage(value: number): string {
  const safeValue = Number.isFinite(value) && value >= 0 ?
    Math.min(value, 100) :
    0;

  return `${new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
  }).format(safeValue)}%`;
}

function boundedText(
  value: string | null | undefined,
  fallback: string,
  maximumLength = 160,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return fallback;
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}

function bookingStatusLabel(status: string): string {
  if (status in MAIN_EVENT_STATUS_LABELS) {
    return MAIN_EVENT_STATUS_LABELS[status as MainEventStatus];
  }

  if (isCustomerBookingStatusFilter(status)) {
    return customerBookingStatusFilterLabel(status);
  }

  return status
    .split("_")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function bookingNextStep(
  booking: Pick<
    CustomerBooking,
    | "status"
    | "pendingProviderRequestCount"
    | "acceptedProviderRequestCount"
    | "waitingPaymentProviderRequestCount"
    | "paymentProcessingProviderRequestCount"
    | "confirmedProviderRequestCount"
    | "rejectedProviderRequestCount"
  >,
): string {
  const awaitingPayment =
    booking.waitingPaymentProviderRequestCount +
    booking.paymentProcessingProviderRequestCount;

  switch (booking.status) {
    case "draft":
      return "Open details to review this draft booking.";
    case "pending_provider_approval":
      if (awaitingPayment > 0) {
        return "Some providers have responded. Review accepted requests while you wait for the remaining responses.";
      }
      if (
        booking.acceptedProviderRequestCount > 0 ||
        booking.confirmedProviderRequestCount > 0
      ) {
        return "Some providers have responded. Wait for the remaining provider responses.";
      }
      return "Wait for providers to review your requests.";
    case "needs_provider_replacement":
      return booking.pendingProviderRequestCount > 0 ?
        "At least one provider declined. Review the affected request while other providers respond." :
        "At least one provider declined. Review the affected provider request.";
    case "waiting_for_down_payment":
      return "Accepted provider requests require a down payment. Review each request's payment status.";
    case "confirmed":
      return "Your event booking is confirmed. Review the schedule and provider requests.";
    case "in_progress":
      return "Your event is currently in progress.";
    case "completed":
      return "Review this completed booking.";
    case "cancelled":
    case "expired":
      return "Review this booking record for details.";
  }
}

function providerResponseSummary(booking: Pick<
  CustomerBooking,
  | "providerRequestCount"
  | "pendingProviderRequestCount"
  | "acceptedProviderRequestCount"
  | "waitingPaymentProviderRequestCount"
  | "paymentProcessingProviderRequestCount"
  | "confirmedProviderRequestCount"
  | "rejectedProviderRequestCount"
  | "completedProviderRequestCount"
>): string {
  const summaries: string[] = [];
  const add = (count: number, label: string) => {
    if (count > 0 && summaries.length < 3) {
      summaries.push(`${formatCount(count)} ${label}`);
    }
  };

  add(booking.rejectedProviderRequestCount, "declined");
  add(
    booking.waitingPaymentProviderRequestCount +
      booking.paymentProcessingProviderRequestCount,
    "awaiting payment",
  );
  add(booking.pendingProviderRequestCount, "awaiting response");
  add(booking.confirmedProviderRequestCount, "confirmed");
  add(booking.acceptedProviderRequestCount, "accepted");
  add(booking.completedProviderRequestCount, "completed");

  return summaries.length > 0 ?
    summaries.join(" · ") :
    `${formatCount(booking.providerRequestCount)} provider ${booking.providerRequestCount === 1 ? "request" : "requests"}`;
}

function providerRequestServiceLabel(
  request: Pick<CustomerBookingProviderRequest, "type" | "services">,
): string {
  if (request.type === "catering") return "Catering";

  const categories = uniqueBoundedValues(
    request.services.map((service) => service.category),
  );
  if (categories.length === 1) return categories[0];
  if (categories.length > 1) {
    return boundedText(
      `${categories[0]} + ${formatCount(categories.length - 1)} more`,
      "Add-on services",
      80,
    );
  }

  if (request.services.length === 1) {
    return boundedText(request.services[0].name, "Add-on services", 80);
  }

  return "Add-on services";
}

function providerRequestOutcomeLabel(
  request: Pick<CustomerBookingProviderRequest, "providerName" | "status">,
): string {
  switch (request.status) {
    case "pending":
      return "Awaiting provider response";
    case "accepted":
      return "Accepted — confirmation pending";
    case "waiting_for_down_payment":
      return "Accepted — down payment required";
    case "payment_processing":
      return "Accepted — payment processing";
    case "confirmed":
      return "Accepted — confirmed";
    case "rejected":
      return `Declined by ${boundedText(request.providerName, "provider", 120)}`;
    case "in_progress":
      return "Service in progress";
    case "completed":
      return "Service completed";
    case "cancelled":
      return "Request cancelled";
    case "expired":
      return "Request expired";
  }
}

function providerRequestResponseTimestamp(
  request: Pick<
    CustomerBookingProviderRequest,
    "status" | "respondedAt" | "acceptedAt" | "rejectedAt"
  >,
): string | null {
  if (request.status === "rejected") {
    return request.rejectedAt ?? request.respondedAt;
  }

  if ([
    "accepted",
    "waiting_for_down_payment",
    "payment_processing",
    "confirmed",
    "in_progress",
    "completed",
  ].includes(request.status)) {
    return request.acceptedAt ?? request.respondedAt;
  }

  return null;
}

function uniqueBoundedValues(values: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const bounded = boundedText(value, "", 80);
    const key = bounded.toLocaleLowerCase("en-PH");
    if (!bounded || seen.has(key)) continue;
    seen.add(key);
    result.push(bounded);
  }

  return result;
}

export {
  BOOKING_STATUS_OPTIONS,
  bookingNextStep,
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingDateTime,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
  formatPercentage,
  providerRequestOutcomeLabel,
  providerRequestResponseTimestamp,
  providerRequestServiceLabel,
  providerResponseSummary,
};
