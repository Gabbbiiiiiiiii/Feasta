import {
  isApprovedProviderForOperations,
  parseProviderRequestStatus,
  parseProviderServiceType,
  providerCapacityCapabilities,
  PROVIDER_OPERATING_DAYS,
  type ProviderRequestStatus,
  type ProviderRequestType,
} from "../shared/constants.js";
import {
  isServiceCategoryCode,
  type ServiceCategoryCode,
} from "../shared/service-category-code.js";

/**
 * Statuses that may occupy a slot and must be read with the event date.
 * Occupancy is decided by providerRequestOccupiesAvailability, including
 * hold expiry. A counted status is not itself a booking conflict.
 */
export const AVAILABILITY_COUNTED_REQUEST_STATUSES = [
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
] as const satisfies readonly ProviderRequestStatus[];

/**
 * Same window acceptProviderRequest stores on expiresAt when payment
 * becomes required. A lineup-incomplete accepted request has no
 * expiresAt yet, so its hold ends this long after acceptedAt.
 */
export const PROVIDER_PAYMENT_HOLD_WINDOW_MS = 24 * 60 * 60 * 1_000;

const COMMITTED_REQUEST_STATUSES = [
  "confirmed",
  "in_progress",
] as const satisfies readonly ProviderRequestStatus[];

const TEMPORARY_HOLD_REQUEST_STATUSES = [
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
] as const satisfies readonly ProviderRequestStatus[];

export type ProviderAvailabilityIssueCode =
  | "PROVIDER_NOT_OPERATIONAL"
  | "PROVIDER_SCHEDULE_INVALID"
  | "SERVICE_CATEGORY_NOT_SUPPORTED"
  | "EVENT_DATE_INVALID"
  | "EVENT_TIME_INVALID"
  | "OUTSIDE_OPERATING_DAY"
  | "BLOCKED_DATE"
  | "LEAD_TIME_NOT_MET"
  | "MAX_EVENTS_REACHED"
  | "TIME_CONFLICT"
  | "GUEST_CAPACITY_BELOW_MINIMUM"
  | "GUEST_CAPACITY_EXCEEDED";

export type ProviderAvailabilityIssue = {
  code: ProviderAvailabilityIssueCode;
  field?: string;
  message: string;
};

export type ProviderAvailabilityResult = {
  available: boolean;
  issues: ProviderAvailabilityIssue[];
};

export type ProviderAvailabilityRequest = {
  providerRequestId: string;
  type: ProviderRequestType;
  eventDate: Date;
  eventTime: string;
  eventEndTime: string;
  guestCount: number;
  services?: unknown;
};

export type ExistingProviderBooking = {
  providerRequestId: string;
  status: unknown;
  eventTime: unknown;
  eventEndTime: unknown;
  expiresAt?: unknown;
  acceptedAt?: unknown;
};

/**
 * Whether a stored provider request currently occupies its event slot.
 *
 * Pending, rejected, cancelled, expired, and completed requests do not.
 * Confirmed and in-progress requests do. An accepted unpaid request
 * occupies only while its stored expiresAt is still ahead of now. A
 * lineup-incomplete accepted request has no expiresAt, so that hold
 * instead ends one payment window after acceptedAt.
 */
export function providerRequestOccupiesAvailability(input: {
  status: unknown;
  expiresAt?: unknown;
  acceptedAt?: unknown;
  now: Date;
}): boolean {
  const status = parseProviderRequestStatus(input.status);
  const nowMs = input.now.getTime();

  if (!status || !Number.isFinite(nowMs)) return false;

  if (COMMITTED_REQUEST_STATUSES.includes(
    status as (typeof COMMITTED_REQUEST_STATUSES)[number],
  )) {
    return true;
  }

  if (!TEMPORARY_HOLD_REQUEST_STATUSES.includes(
    status as (typeof TEMPORARY_HOLD_REQUEST_STATUSES)[number],
  )) {
    return false;
  }

  const explicitDeadline = timestampMillis(input.expiresAt);

  if (explicitDeadline !== null) {
    return explicitDeadline > nowMs;
  }

  if (status !== "accepted") return false;

  const acceptedAt = timestampMillis(input.acceptedAt);

  return acceptedAt !== null &&
    acceptedAt + PROVIDER_PAYMENT_HOLD_WINDOW_MS > nowMs;
}

type ValidateProviderAvailabilityInput = {
  providerData: Readonly<Record<string, unknown>>;
  request: ProviderAvailabilityRequest;
  existingBookings: readonly ExistingProviderBooking[];
  now?: Date;
};

const OPERATING_DAY_BY_UTC_DAY = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function validateProviderAvailability(
  input: ValidateProviderAvailabilityInput,
): ProviderAvailabilityResult {
  const issues: ProviderAvailabilityIssue[] = [];
  const providerCategories = providerServiceCategories(input.providerData);
  const requiresGuestCapacity = providerRequiresGuestCapacity(
    input.providerData,
    providerCategories,
  );
  const eventDate = validDate(input.request.eventDate);
  const now = validDate(input.now ?? new Date());

  if (!isApprovedProviderForOperations(input.providerData)) {
    issues.push(issue(
      "PROVIDER_NOT_OPERATIONAL",
      "The provider is not available for booking operations.",
    ));
  }

  if (!requestMatchesProviderCapabilities(
    input.request.type,
    input.request.services,
    input.providerData,
    providerCategories,
  )) {
    issues.push(issue(
      "SERVICE_CATEGORY_NOT_SUPPORTED",
      "The requested service is not supported by this provider.",
      "serviceCategory",
    ));
  }

  if (!eventDate || !now) {
    issues.push(issue(
      "EVENT_DATE_INVALID",
      "The event date is invalid.",
      "eventDate",
    ));

    return result(issues);
  }

  const eventDateKey = manilaDateKey(eventDate);
  const todayKey = manilaDateKey(now);

  if (!eventDateKey || !todayKey) {
    issues.push(issue(
      "EVENT_DATE_INVALID",
      "The event date is invalid.",
      "eventDate",
    ));

    return result(issues);
  }

  const operatingDays = providerOperatingDays(input.providerData.operatingDays);
  const operatingDay = operatingDayForDateKey(eventDateKey);

  if (operatingDays.length === 0 || !operatingDay) {
    issues.push(issue(
      "PROVIDER_SCHEDULE_INVALID",
      "The provider schedule is not configured correctly.",
      "operatingDays",
    ));
  } else if (!operatingDays.includes(operatingDay)) {
    issues.push(issue(
      "OUTSIDE_OPERATING_DAY",
      "The provider does not operate on the requested day.",
      "eventDate",
    ));
  }

  if (providerUnavailableDates(input.providerData.unavailableDates)
    .includes(eventDateKey)) {
    issues.push(issue(
      "BLOCKED_DATE",
      "The provider is unavailable on the requested date.",
      "eventDate",
    ));
  }

  const leadTimeDays = boundedInteger(
    input.providerData.bookingLeadTimeDays,
    0,
    365,
  );

  if (leadTimeDays === null) {
    issues.push(issue(
      "PROVIDER_SCHEDULE_INVALID",
      "The provider schedule is not configured correctly.",
      "bookingLeadTimeDays",
    ));
  } else if (calendarDayDifference(todayKey, eventDateKey) < leadTimeDays) {
    issues.push(issue(
      "LEAD_TIME_NOT_MET",
      "The event does not meet the provider's booking lead time.",
      "eventDate",
    ));
  }

  if (requiresGuestCapacity) {
    validateGuestCapacity(
      input.providerData,
      input.request.guestCount,
      issues,
    );
  }

  const occupyingBookings = input.existingBookings.filter((booking) =>
    booking.providerRequestId !== input.request.providerRequestId &&
    providerRequestOccupiesAvailability({
      status: booking.status,
      expiresAt: booking.expiresAt,
      acceptedAt: booking.acceptedAt,
      now,
    })
  );

  /*
   * Callers load requests for one Asia/Manila event date. A conflict
   * is an overlap of the stored HH:mm eventTime and eventEndTime.
   * Touching endpoints do not overlap. Daily event counts are not used.
   */
  const requestedRange = parseTimeRange(
    input.request.eventTime,
    input.request.eventEndTime,
  );

  if (!requestedRange) {
    issues.push(issue(
      "EVENT_TIME_INVALID",
      "The event time range is invalid.",
      "eventTime",
    ));
  } else if (occupyingBookings.some((booking) => {
    const existingRange = parseTimeRange(
      booking.eventTime,
      booking.eventEndTime,
    );

    return existingRange !== null &&
      requestedRange.startMinutes < existingRange.endMinutes &&
      requestedRange.endMinutes > existingRange.startMinutes;
  })) {
    issues.push(issue(
      "TIME_CONFLICT",
      "The event time overlaps another active booking.",
      "eventTime",
    ));
  }

  return result(issues);
}

export function manilaDateRange(date: Date): {
  dateKey: string;
  start: Date;
  end: Date;
} | null {
  const dateKey = manilaDateKey(date);

  if (!dateKey) return null;

  const start = new Date(`${dateKey}T00:00:00+08:00`);

  if (!validDate(start)) return null;

  return {
    dateKey,
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1_000),
  };
}

export function manilaDateFromKey(value: string): Date | null {
  if (!isIsoDate(value)) return null;

  const date = new Date(`${value}T00:00:00+08:00`);
  return validDate(date);
}

export function isCanonicalEventTimeRange(
  eventTime: string,
  eventEndTime: string,
): boolean {
  return parseTimeRange(eventTime, eventEndTime) !== null;
}

export function manilaDateKey(date: Date): string {
  if (!validDate(date)) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
}

function requestMatchesProviderCapabilities(
  requestType: ProviderRequestType,
  services: unknown,
  provider: Readonly<Record<string, unknown>>,
  providerCategories: readonly ServiceCategoryCode[],
): boolean {
  const providerType = parseProviderServiceType(provider.providerServiceType);

  if (
    !providerType ||
    providerCategories.length === 0 ||
    (requestType === "catering" && providerType === "addon") ||
    (requestType === "addon" && providerType === "catering")
  ) {
    return false;
  }

  if (requestType === "catering") {
    return true;
  }

  const requestedCategories = requestServiceCategories(services);

  return requestedCategories.every((category) =>
    providerCategories.includes(category)
  );
}

function requestServiceCategories(value: unknown): ServiceCategoryCode[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value.flatMap((service) => {
        if (
          !service ||
          typeof service !== "object" ||
          Array.isArray(service)
        ) {
          return [];
        }

        const category =
          (service as Record<string, unknown>).category;

        return isServiceCategoryCode(category)
          ? [category]
          : [];
      }),
    ),
  ];
}

function providerServiceCategories(
  provider: Readonly<Record<string, unknown>>,
): ServiceCategoryCode[] {
  const values = Array.isArray(provider.serviceCategories)
    ? provider.serviceCategories
    : [provider.providerCategory];

  return [
    ...new Set(
      values.filter(
        (value): value is ServiceCategoryCode =>
          isServiceCategoryCode(value),
      ),
    ),
  ];
}

function providerRequiresGuestCapacity(
  provider: Readonly<Record<string, unknown>>,
  providerCategories: readonly ServiceCategoryCode[],
): boolean {
  const value = provider.capacityCapabilities;

  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const record = value as Record<string, unknown>;

    if (
      typeof record.requiresGuestCapacity === "boolean" &&
      typeof record.usesStaffCapacity === "boolean" &&
      typeof record.usesEquipmentCapacity === "boolean"
    ) {
      return record.requiresGuestCapacity;
    }
  }

  return providerCapacityCapabilities(providerCategories)
    .requiresGuestCapacity;
}

function providerOperatingDays(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter(
    (day): day is string =>
      typeof day === "string" &&
      PROVIDER_OPERATING_DAYS.includes(
        day as (typeof PROVIDER_OPERATING_DAYS)[number],
      ),
  ))];
}

function providerUnavailableDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter(
    (date): date is string =>
      typeof date === "string" && isIsoDate(date),
  ))];
}

function validateGuestCapacity(
  provider: Readonly<Record<string, unknown>>,
  guestCount: number,
  issues: ProviderAvailabilityIssue[],
): void {
  const minimum = boundedInteger(provider.minGuestsPerEvent, 1, 100_000);
  const maximum = boundedInteger(provider.maxGuestsPerEvent, 1, 100_000);

  if (minimum === null || maximum === null || minimum > maximum) {
    issues.push(issue(
      "PROVIDER_SCHEDULE_INVALID",
      "The provider capacity is not configured correctly.",
      "guestCapacity",
    ));
    return;
  }

  if (guestCount < minimum) {
    issues.push(issue(
      "GUEST_CAPACITY_BELOW_MINIMUM",
      "The requested guest count is below the provider's supported capacity.",
      "guestCount",
    ));
  }

  if (guestCount > maximum) {
    issues.push(issue(
      "GUEST_CAPACITY_EXCEEDED",
      "The requested guest count exceeds the provider's capacity.",
      "guestCount",
    ));
  }
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const record = value as {
      toMillis?: () => unknown;
      toDate?: () => unknown;
    };

    if (typeof record.toMillis === "function") {
      const millis = record.toMillis();

      return typeof millis === "number" && Number.isFinite(millis)
        ? millis
        : null;
    }

    if (typeof record.toDate === "function") {
      const date = record.toDate();

      return date instanceof Date && Number.isFinite(date.getTime())
        ? date.getTime()
        : null;
    }
  }

  return null;
}

function parseTimeRange(
  startValue: unknown,
  endValue: unknown,
): {startMinutes: number; endMinutes: number} | null {
  const startMinutes = parseTime(startValue);
  const endMinutes = parseTime(endValue);

  return startMinutes !== null &&
    endMinutes !== null &&
    endMinutes > startMinutes
    ? {startMinutes, endMinutes}
    : null;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(value.trim());

  return match
    ? Number(match[1]) * 60 + Number(match[2])
    : null;
}

function operatingDayForDateKey(value: string): string | null {
  if (!isIsoDate(value)) return null;

  const date = new Date(`${value}T00:00:00Z`);
  return OPERATING_DAY_BY_UTC_DAY[date.getUTCDay()] ?? null;
}

function calendarDayDifference(from: string, to: string): number {
  return Math.floor(
    (
      Date.parse(`${to}T00:00:00Z`) -
      Date.parse(`${from}T00:00:00Z`)
    ) / (24 * 60 * 60 * 1_000),
  );
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
    ? value as number
    : null;
}

function validDate(value: Date): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function issue(
  code: ProviderAvailabilityIssueCode,
  message: string,
  field?: string,
): ProviderAvailabilityIssue {
  return {code, ...(field ? {field} : {}), message};
}

function result(
  issues: ProviderAvailabilityIssue[],
): ProviderAvailabilityResult {
  return {available: issues.length === 0, issues};
}
