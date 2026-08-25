import type {MainEventStatus} from "@feasta/shared-types";

import {
  CUSTOMER_BOOKING_STATUS_OPTIONS,
  customerBookingStatusFilterLabel,
  isCustomerBookingStatusFilter,
} from "@/lib/customer/bookings/customer-booking-status";
import type {CustomerBooking} from "@/lib/customer/bookings/customer-booking-types";

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
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
  booking: Pick<CustomerBooking, "status" | "paymentStatus">,
): string {
  switch (booking.status) {
    case "draft":
      return "Open details to review this draft booking.";
    case "pending_provider_approval":
      return "Wait for the provider to review your request.";
    case "needs_provider_replacement":
      return "Open details to review the provider update.";
    case "waiting_for_down_payment":
      return booking.paymentStatus === "paid" ?
        "Payment was received. Wait for booking confirmation." :
        "Open details to pay the required down payment.";
    case "confirmed":
      return "Your booking is confirmed. Review the event schedule.";
    case "in_progress":
      return "Your event is currently in progress.";
    case "completed":
      return "Review this completed booking.";
    case "cancelled":
    case "expired":
      return "Review this booking record for details.";
  }
}

export {
  BOOKING_STATUS_OPTIONS,
  bookingNextStep,
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
  formatPercentage,
};
