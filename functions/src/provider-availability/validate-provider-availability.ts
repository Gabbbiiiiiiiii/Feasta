import {originalInitialPaymentDeadline, HISTORICAL_INITIAL_PAYMENT_HOLD_MS} from "../payments/initial-payment-deadline.js";
import {
  cateringScheduleMode,
  parseOccupancyWindow,
  rangesOverlap,
} from "../bookings/catering-schedule.js";
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
 * Occupancy includes unpaid hold expiry and protected payment reconciliation.
 * A counted status is not itself a booking conflict.
 */
export const AVAILABILITY_COUNTED_REQUEST_STATUSES = [
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
  "completed",
] as const satisfies readonly ProviderRequestStatus[];

/**
 * Same window acceptProviderRequest stores on expiresAt when payment
 * becomes required. A lineup-incomplete accepted request has no
 * expiresAt yet, so its hold ends this long after acceptedAt.
 */
export const PROVIDER_PAYMENT_HOLD_WINDOW_MS = HISTORICAL_INITIAL_PAYMENT_HOLD_MS;

const COMMITTED_REQUEST_STATUSES = [
  "confirmed",
  "in_progress",
  "completed",
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
  mainEventId?: unknown;
  type: ProviderRequestType;
  eventDate: Date;
  eventTime: string;
  /** Required for new Drop-Off and on-site bookings; may be empty on historical Drop-Off rows. */
  eventEndTime?: string | null;
  serviceTier?: unknown;
  guestCount: number;
  services?: unknown;
};

type AvailabilityPaymentEvidence = {
  [key: string]: unknown;
  paymentId?: unknown;
  initialPaymentId?: unknown;
  initialPaymentDispatchReservedAt?: unknown;
  paymentStatus?: unknown;
  initialPaymentReview?: unknown;
  reconciliationRequired?: unknown;
  lifecycleReconciliationRequired?: unknown;
};

export type ExistingProviderBooking = AvailabilityPaymentEvidence & {
  providerRequestId: string;
  status: unknown;
  eventTime: unknown;
  eventEndTime: unknown;
  serviceTier?: unknown;
  expiresAt?: unknown;
  acceptedAt?: unknown;
};

/**
 * Whether a stored provider request currently occupies its event slot.
 *
 * Pending, rejected, cancelled, and expired requests do not reserve capacity.
 * Accepted requests retain their slot until an authoritative status transition.
 * The checkout deadline independently controls payment eligibility.
 */
export function providerRequestAvailabilityState(input: AvailabilityPaymentEvidence & {
  status: unknown;
  expiresAt?: unknown;
  acceptedAt?: unknown;
  now: Date;
}): "committed" | "payment_reconciliation" | "temporary_hold" | "released" {
  const status = parseProviderRequestStatus(input.status);
  const nowMs = input.now.getTime();

  if (!status || !Number.isFinite(nowMs)) return "released";

  if (COMMITTED_REQUEST_STATUSES.includes(
    status as (typeof COMMITTED_REQUEST_STATUSES)[number],
  )) {
    return "committed";
  }

  if (!TEMPORARY_HOLD_REQUEST_STATUSES.includes(
    status as (typeof TEMPORARY_HOLD_REQUEST_STATUSES)[number],
  )) {
    return "released";
  }

  // A gateway expiry or elapsed booking hold is not terminal payment authority.
  // Keep capacity reserved until verified settlement or authorized reconciliation
  // transitions the request. This never renews expiresAt or authorizes a charge.
  if (status === "payment_processing" || input.paymentId != null || input.initialPaymentId != null ||
    input.initialPaymentDispatchReservedAt != null || input.initialPaymentReview != null ||
    input.paymentStatus === "processing" || input.paymentStatus === "paid" ||
    input.reconciliationRequired === true || input.lifecycleReconciliationRequired === true) {
    return "payment_reconciliation";
  }

  if (input.initialPaymentDeadlinePolicyVersion != null) {
    try {
      originalInitialPaymentDeadline(input);
    } catch {
      return "payment_reconciliation";
    }
  }
  return "temporary_hold";
}

export function providerRequestOccupiesAvailability(
  input: Parameters<typeof providerRequestAvailabilityState>[0],
): boolean {
  return providerRequestAvailabilityState(input) !== "released";
}

type ValidateProviderAvailabilityInput = {
  providerData: Readonly<Record<string, unknown>>;
  request: ProviderAvailabilityRequest;
  existingBookings: readonly ExistingProviderBooking[];
  now?: Date;
  preserveExistingReservation?: boolean;
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
      ...booking,
      status: booking.status,
      expiresAt: booking.expiresAt,
      acceptedAt: booking.acceptedAt,
      now,
    })
  );

  const eventAlreadyReserved = typeof input.request.mainEventId === "string" &&
    input.request.mainEventId !== "" &&
    occupyingBookings.some((booking) => booking.mainEventId === input.request.mainEventId);
  const occupiedSlots = countOnlineEvents(occupyingBookings) +
    walkInReservationCount(input.providerData, eventDateKey);
  const capacityReached = !input.preserveExistingReservation && !eventAlreadyReserved &&
    occupiedSlots >= dailyEventCapacity(input.providerData);
  const dropOff = cateringScheduleMode(input.request.serviceTier) === "drop_off_time";
  const requestedRange = parseOccupancyWindow(
    input.request.eventTime,
    input.request.eventEndTime,
    {dropOff},
  );

  if (!requestedRange) {
    issues.push(issue(
      "EVENT_TIME_INVALID",
      dropOff
        ? "The estimated drop-off time range is invalid."
        : "The event time range is invalid.",
      "eventTime",
    ));
  } else if (
    // Drop-Off uses daily capacity only; do not invent delivery-window conflicts.
    !dropOff &&
    capacityReached &&
    dailyEventCapacity(input.providerData) === 1 &&
    occupyingBookings.some((booking) => {
    const existingDropOff =
      cateringScheduleMode(booking.serviceTier) === "drop_off_time" ||
      !booking.eventEndTime ||
      booking.eventEndTime === booking.eventTime;
    const existingRange = parseOccupancyWindow(
      booking.eventTime,
      booking.eventEndTime,
      {dropOff: existingDropOff},
    );

    return existingRange !== null &&
      rangesOverlap(requestedRange, existingRange);
  })) {
    issues.push(issue(
      "TIME_CONFLICT",
      "The event time overlaps another active booking.",
      "eventTime",
    ));
  }

  if (
    requestedRange !== null &&
    capacityReached &&
    !issues.some((item) => item.code === "TIME_CONFLICT")
  ) {
    issues.push(issue(
      "MAX_EVENTS_REACHED",
      "This provider has reached daily booking capacity.",
      "eventDate",
    ));
  }

  return result(issues);
}

export function hasWalkInReservation(
  provider: Readonly<Record<string, unknown>>, dateKey: string,
): boolean {
  return walkInReservationCount(provider, dateKey) > 0;
}

export function dailyEventCapacity(provider: Readonly<Record<string, unknown>>): number {
  return boundedInteger(provider.maxEventsPerDay, 1, 100) ?? 1;
}

export function walkInReservationCount(
  provider: Readonly<Record<string, unknown>>, dateKey: string,
): number {
  const counts = provider.walkInReservedCounts;
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    return boundedInteger((counts as Record<string, unknown>)[dateKey], 1, 100) ?? 0;
  }
  return Array.isArray(provider.walkInReservedDates) &&
    provider.walkInReservedDates.includes(dateKey) ? 1 : 0;
}

export function countOnlineEvents(bookings: readonly Record<string, unknown>[]): number {
  const eventIds = new Set<string>();
  let legacyBookings = 0;
  for (const booking of bookings) {
    if (typeof booking.mainEventId === "string" && booking.mainEventId) {
      eventIds.add(booking.mainEventId);
    } else {
      legacyBookings++;
    }
  }
  return eventIds.size + legacyBookings;
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
  return parseOccupancyWindow(eventTime, eventEndTime) !== null;
}

/** Drop-Off point time, or a same-day start/end range. */
export function isCanonicalCateringSchedule(
  eventTime: string,
  eventEndTime: string | null | undefined,
  serviceTier?: unknown,
): boolean {
  const dropOff = cateringScheduleMode(serviceTier) === "drop_off_time";
  return parseOccupancyWindow(eventTime, eventEndTime, {dropOff}) !== null;
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
