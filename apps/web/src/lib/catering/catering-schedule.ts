import {
  type CateringPackageServiceTier,
  normalizeCateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";
import {formatEventTime} from "@/lib/presentation/event-time";

export type CateringScheduleMode = "drop_off_time" | "event_range";

export const DROP_OFF_TIME_LABEL = "Estimated Drop-Off Time";
export const DROP_OFF_TIME_HELPER =
  "Delivery window for your event location, for example 10:30 to 11:00.";
export const DROP_OFF_END_TIME_LABEL = "to";
export const EVENT_START_TIME_LABEL = "Event Start Time";
export const EVENT_END_TIME_LABEL = "Event End Time";

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/u;

export function cateringScheduleMode(
  serviceTier: CateringPackageServiceTier | string | null | undefined,
): CateringScheduleMode {
  const tier = normalizeCateringPackageServiceTier(serviceTier);
  return tier === "drop_off" ? "drop_off_time" : "event_range";
}

export function isCanonicalClockTime(value: unknown): value is string {
  return typeof value === "string" && canonicalizeClock(value) !== null;
}

export type NormalizedCateringSchedule = {
  eventTime: string;
  eventEndTime: string | null;
};

export type CateringScheduleValidation =
  | {ok: true; value: NormalizedCateringSchedule}
  | {ok: false; field: "eventTime" | "eventEndTime"; message: string};

/**
 * Validates and normalizes catering clocks for the selected service tier.
 * Drop-Off and on-site tiers both require a same-day range with end > start.
 */
export function normalizeCateringSchedule(input: {
  serviceTier?: CateringPackageServiceTier | string | null;
  eventTime: unknown;
  eventEndTime?: unknown;
}): CateringScheduleValidation {
  const mode = cateringScheduleMode(input.serviceTier);
  const eventTime =
    typeof input.eventTime === "string" ? input.eventTime.trim() : "";

  const normalizedStart = canonicalizeClock(eventTime);
  if (!normalizedStart) {
    return {
      ok: false,
      field: "eventTime",
      message:
        mode === "drop_off_time"
          ? "Enter the estimated drop-off time."
          : "Enter the event start time.",
    };
  }

  const eventEndTime =
    typeof input.eventEndTime === "string" ? input.eventEndTime.trim() : "";
  const normalizedEnd = canonicalizeClock(eventEndTime);

  if (!normalizedEnd) {
    return {
      ok: false,
      field: "eventEndTime",
      message:
        mode === "drop_off_time"
          ? "Enter the end time."
          : "Enter the event end time.",
    };
  }

  if (normalizedEnd <= normalizedStart) {
    return {
      ok: false,
      field: "eventEndTime",
      message: "End time must be later than the start time.",
    };
  }

  return {
    ok: true,
    value: {eventTime: normalizedStart, eventEndTime: normalizedEnd},
  };
}

function canonicalizeClock(value: string): string | null {
  const match = CLOCK.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * Whether stored clocks should render as a single Estimated Drop-Off Time.
 * Historical Drop-Off rows may omit end; new Drop-Off bookings keep a range.
 */
export function usesDropOffTimeDisplay(input: {
  serviceTier?: CateringPackageServiceTier | string | null;
  eventTime?: string | null;
  eventEndTime?: string | null;
}): boolean {
  const start = typeof input.eventTime === "string" ? input.eventTime.trim() : "";
  const end =
    typeof input.eventEndTime === "string" ? input.eventEndTime.trim() : "";

  if (cateringScheduleMode(input.serviceTier) === "drop_off_time") {
    return Boolean(start) && (!end || end === start);
  }

  // Historical / unknown-tier: single clock when end is missing or equal.
  return Boolean(start) && (!end || end === start);
}

export function formatCateringScheduleDisplay(input: {
  serviceTier?: CateringPackageServiceTier | string | null;
  eventTime?: string | null;
  eventEndTime?: string | null;
}): string {
  const start = formatEventTime(input.eventTime);
  if (!start) return "Time not provided";

  if (usesDropOffTimeDisplay(input)) {
    return start;
  }

  const end = formatEventTime(input.eventEndTime);
  return end ? `${start}–${end}` : start;
}

export function cateringScheduleFieldLabel(
  field: "eventTime" | "eventEndTime",
  serviceTier?: CateringPackageServiceTier | string | null,
): string {
  const dropOff = cateringScheduleMode(serviceTier) === "drop_off_time";
  if (field === "eventTime") {
    return dropOff ? DROP_OFF_TIME_LABEL : EVENT_START_TIME_LABEL;
  }
  return dropOff ? DROP_OFF_END_TIME_LABEL : EVENT_END_TIME_LABEL;
}
