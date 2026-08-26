import {
  MAIN_EVENT_STATUSES,
  type MainEventStatus,
} from "@feasta/shared-types";

import type {
  CustomerBookingTimelineActorRole,
  CustomerBookingTimelineEntry,
} from "@/lib/customer/bookings/customer-booking-types";

const CUSTOMER_TIMELINE_TYPES = [
  "provider_accepted",
  "provider_rejected",
  "in_progress",
  "completed",
  "payment_confirmed",
  "payment_failed",
  "payment_expired",
  "payment_refunded",
  "payment_updated",
] as const;
const MAX_TIMELINE_TITLE_LENGTH = 200;
const MAX_TIMELINE_DESCRIPTION_LENGTH = 1_000;
const MAX_PROVIDER_REJECTION_REASON_LENGTH = 500;

type CustomerTimelineType =
  (typeof CUSTOMER_TIMELINE_TYPES)[number];

export function normalizeCustomerBookingTimelineData(
  id: string,
  data: Record<string, unknown>,
  providerNames: ReadonlyMap<string, string> = new Map(),
): CustomerBookingTimelineEntry | null {
  const createdAt = isoDateValue(data.createdAt);

  if (!createdAt) return null;

  const type = normalizeTimelineType(data.type);
  const storedTitle = boundedString(data.title, MAX_TIMELINE_TITLE_LENGTH);
  const storedDescription =
    boundedString(data.description, MAX_TIMELINE_DESCRIPTION_LENGTH) ||
    boundedString(data.message, MAX_TIMELINE_DESCRIPTION_LENGTH) ||
    null;
  const rejectionReason = type === "provider_rejected" ?
    boundedString(data.reason, MAX_PROVIDER_REJECTION_REASON_LENGTH) :
    "";
  const description = rejectionReason ?
    boundedString(
      `${storedDescription ?? "The provider declined this request."} Provider explanation: ${rejectionReason}`,
      MAX_TIMELINE_DESCRIPTION_LENGTH,
    ) :
    storedDescription;
  const providerRequestId = nullableString(data.providerRequestId);

  return {
    id,
    type,
    status: optionalMainEventStatus(data.status),
    title: storedTitle || customerTimelineTitle(type),
    description,
    actorRole: customerTimelineActorRole(data.createdByRole, type),
    providerName: providerRequestId ?
      providerNames.get(providerRequestId) ?? null :
      null,
    createdAt,
  };
}

export function compareCustomerBookingTimelineEntries(
  left: CustomerBookingTimelineEntry,
  right: CustomerBookingTimelineEntry,
): number {
  const byTime = left.createdAt.localeCompare(right.createdAt);
  return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
}

function normalizeTimelineType(value: unknown): CustomerTimelineType | null {
  const normalized = stringValue(value).toLowerCase();

  return (
    CUSTOMER_TIMELINE_TYPES as readonly string[]
  ).includes(normalized) ?
    normalized as CustomerTimelineType :
    null;
}

function customerTimelineTitle(type: CustomerTimelineType | null): string {
  switch (type) {
    case "payment_confirmed":
      return "Payment confirmed";
    case "payment_failed":
      return "Payment failed";
    case "payment_expired":
      return "Payment expired";
    case "payment_refunded":
      return "Payment refunded";
    case "payment_updated":
      return "Payment updated";
    case "provider_accepted":
      return "Provider accepted request";
    case "provider_rejected":
      return "Provider declined request";
    case "in_progress":
      return "Event service started";
    case "completed":
      return "Event service completed";
    case null:
      return "Booking updated";
  }
}

function customerTimelineActorRole(
  value: unknown,
  type: CustomerTimelineType | null,
): CustomerBookingTimelineActorRole | null {
  const normalized = stringValue(value).toLowerCase();

  if (["customer", "provider", "system"].includes(normalized)) {
    return normalized as CustomerBookingTimelineActorRole;
  }

  return type?.startsWith("payment_") ? "system" : null;
}

function optionalMainEventStatus(value: unknown): MainEventStatus | null {
  const normalized = stringValue(value).toLowerCase();

  return (MAIN_EVENT_STATUSES as readonly string[]).includes(normalized) ?
    normalized as MainEventStatus :
    null;
}

function isoDateValue(value: unknown): string | null {
  const date = dateValue(value);
  return date ? date.toISOString() : null;
}

function dateValue(value: unknown): Date | null {
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
    const candidate = value.toDate();
    return candidate instanceof Date && Number.isFinite(candidate.getTime()) ?
      candidate :
      null;
  }

  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedString(value: unknown, maximumLength: number): string {
  return stringValue(value).slice(0, maximumLength);
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized || null;
}
