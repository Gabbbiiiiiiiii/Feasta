export type CateringScheduleMode = "drop_off_time" | "event_range";

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/u;
const TIERS = ["drop_off", "buffet_setup", "full_service"] as const;

export type CateringServiceTier = (typeof TIERS)[number];

export function parseCateringServiceTier(
  value: unknown,
): CateringServiceTier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (TIERS as readonly string[]).includes(normalized)
    ? (normalized as CateringServiceTier)
    : null;
}

export function cateringScheduleMode(
  serviceTier: unknown,
): CateringScheduleMode {
  return parseCateringServiceTier(serviceTier) === "drop_off"
    ? "drop_off_time"
    : "event_range";
}

export function isCanonicalClockTime(value: unknown): value is string {
  return typeof value === "string" && canonicalizeClock(value) !== null;
}

function canonicalizeClock(value: string): string | null {
  const match = CLOCK.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

export type NormalizedCateringSchedule = {
  eventTime: string;
  eventEndTime: string | null;
};

/**
 * Drop-Off, Buffet Setup, and Full-Service all require a same-day range
 * with end > start. Labels differ by tier in the client UI.
 */
export function normalizeCateringSchedule(input: {
  serviceTier?: unknown;
  eventTime: unknown;
  eventEndTime?: unknown;
}):
  | {ok: true; value: NormalizedCateringSchedule}
  | {ok: false; field: "eventTime" | "eventEndTime"; message: string} {
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

export function isCanonicalDropOffTime(eventTime: unknown): boolean {
  return isCanonicalClockTime(eventTime);
}

/**
 * Prefer a real end clock when present.
 * Historical Drop-Off rows without end keep point occupancy.
 */
export function parseOccupancyWindow(
  eventTime: unknown,
  eventEndTime: unknown,
  options: {dropOff?: boolean} = {},
): {startMinutes: number; endMinutes: number} | null {
  const startMinutes = parseClockMinutes(eventTime);
  if (startMinutes === null) return null;

  const endMinutes = parseClockMinutes(eventEndTime);
  if (endMinutes !== null && endMinutes > startMinutes) {
    return {startMinutes, endMinutes};
  }

  if (
    options.dropOff &&
    (eventEndTime == null ||
      eventEndTime === "" ||
      endMinutes === startMinutes)
  ) {
    return {startMinutes, endMinutes: startMinutes};
  }

  return null;
}

function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = CLOCK.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function rangesOverlap(
  left: {startMinutes: number; endMinutes: number},
  right: {startMinutes: number; endMinutes: number},
): boolean {
  if (
    left.startMinutes === left.endMinutes &&
    right.startMinutes === right.endMinutes
  ) {
    return left.startMinutes === right.startMinutes;
  }
  if (left.startMinutes === left.endMinutes) {
    return (
      left.startMinutes >= right.startMinutes &&
      left.startMinutes < right.endMinutes
    );
  }
  if (right.startMinutes === right.endMinutes) {
    return (
      right.startMinutes >= left.startMinutes &&
      right.startMinutes < left.endMinutes
    );
  }
  return (
    left.startMinutes < right.endMinutes &&
    left.endMinutes > right.startMinutes
  );
}
