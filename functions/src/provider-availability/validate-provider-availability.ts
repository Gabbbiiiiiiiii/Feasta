import {
  isApprovedProviderForOperations,
  parseProviderRequestStatus,
  parseProviderServiceType,
  providerCapacityCapabilities,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  type ProviderRequestStatus,
  type ProviderRequestType,
  type ProviderServiceCategory,
} from "../shared/constants.js";

export const AVAILABILITY_COUNTED_REQUEST_STATUSES = [
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
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
};

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
  const capabilities = providerCapacityCapabilities(providerCategories);
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

  if (capabilities.requiresGuestCapacity) {
    validateGuestCapacity(
      input.providerData,
      input.request.guestCount,
      issues,
    );
  }

  validateResourceConfiguration(
    input.providerData,
    capabilities,
    issues,
  );

  const activeBookings = input.existingBookings.filter((booking) =>
    booking.providerRequestId !== input.request.providerRequestId &&
    isCountedStatus(booking.status)
  );
  const maximumEvents = providerMaximumEvents(input.providerData);

  if (maximumEvents === null) {
    issues.push(issue(
      "PROVIDER_SCHEDULE_INVALID",
      "The provider schedule is not configured correctly.",
      "maxEventsPerDay",
    ));
  } else if (activeBookings.length >= maximumEvents) {
    issues.push(issue(
      "MAX_EVENTS_REACHED",
      "The provider has reached the event limit for this date.",
      "eventDate",
    ));
  }

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
  } else if (activeBookings.some((booking) => {
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
  providerCategories: readonly ProviderServiceCategory[],
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

function validateResourceConfiguration(
  provider: Readonly<Record<string, unknown>>,
  capabilities: {
    usesStaffCapacity: boolean;
    usesEquipmentCapacity: boolean;
  },
  issues: ProviderAvailabilityIssue[],
): void {
  if (
    capabilities.usesStaffCapacity &&
    boundedInteger(provider.availableStaffCount, 0, 100_000) === null
  ) {
    issues.push(issue(
      "PROVIDER_SCHEDULE_INVALID",
      "The provider capacity is not configured correctly.",
      "availableStaffCount",
    ));
  }

  if (
    capabilities.usesEquipmentCapacity &&
    boundedInteger(provider.availableEquipmentCount, 0, 100_000) === null
  ) {
    issues.push(issue(
      "PROVIDER_SCHEDULE_INVALID",
      "The provider capacity is not configured correctly.",
      "availableEquipmentCount",
    ));
  }
}

function requestServiceCategories(value: unknown): ProviderServiceCategory[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.flatMap((service) => {
    if (!service || typeof service !== "object" || Array.isArray(service)) {
      return [];
    }

    const category = (service as Record<string, unknown>).category;

    return typeof category === "string" &&
      PROVIDER_SERVICE_CATEGORIES.includes(
        category as ProviderServiceCategory,
      )
      ? [category as ProviderServiceCategory]
      : [];
  }))];
}

function providerServiceCategories(
  provider: Readonly<Record<string, unknown>>,
): ProviderServiceCategory[] {
  const values = Array.isArray(provider.serviceCategories)
    ? provider.serviceCategories
    : [provider.providerCategory];

  return [...new Set(values.filter(
    (value): value is ProviderServiceCategory =>
      typeof value === "string" &&
      PROVIDER_SERVICE_CATEGORIES.includes(value as ProviderServiceCategory),
  ))];
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

function providerMaximumEvents(
  provider: Readonly<Record<string, unknown>>,
): number | null {
  if (provider.acceptsMultipleEventsPerDay !== true) {
    return provider.maxEventsPerDay === 1 ? 1 : null;
  }

  return boundedInteger(provider.maxEventsPerDay, 1, 100);
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

function isCountedStatus(value: unknown): boolean {
  const status = parseProviderRequestStatus(value);

  return status !== null &&
    AVAILABILITY_COUNTED_REQUEST_STATUSES.includes(
      status as (typeof AVAILABILITY_COUNTED_REQUEST_STATUSES)[number],
    );
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
