import type {CustomerBookingStatusFilter} from "@/lib/customer/bookings/customer-booking-types";

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

const BOOKING_STATUS_OPTIONS: ReadonlyArray<{
  value: CustomerBookingStatusFilter;
  label: string;
}> = [
  {value: "all", label: "All booking statuses"},
  {value: "draft", label: "Draft"},
  {value: "pending_provider_approval", label: "Pending provider approval"},
  {value: "needs_provider_replacement", label: "Needs provider replacement"},
  {value: "waiting_for_down_payment", label: "Waiting for down payment"},
  {value: "confirmed", label: "Confirmed"},
  {value: "in_progress", label: "In progress"},
  {value: "completed", label: "Completed"},
  {value: "cancelled", label: "Cancelled"},
  {value: "expired", label: "Expired"},
];

function formatBookingDate(value: string | null): string {
  if (!value) return "Date not provided";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not provided"
    : dateFormatter.format(date);
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
  return currencyFormatter.format(Number.isFinite(value) && value >= 0 ? value : 0);
}

function formatCount(value: number): string {
  return numberFormatter.format(Number.isInteger(value) && value >= 0 ? value : 0);
}

function formatPercentage(value: number): string {
  const safeValue = Number.isFinite(value) && value >= 0 ? Math.min(value, 100) : 0;
  return `${new Intl.NumberFormat("en-PH", {maximumFractionDigits: 2}).format(safeValue)}%`;
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
  return BOOKING_STATUS_OPTIONS.find((option) => option.value === status)?.label
    ?? status
      .split("_")
      .filter(Boolean)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(" ");
}

export {
  BOOKING_STATUS_OPTIONS,
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
  formatPercentage,
};
