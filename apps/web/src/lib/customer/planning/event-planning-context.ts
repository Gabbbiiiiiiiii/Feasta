import {
  PROVIDER_SERVICE_TYPES,
  type ProviderServiceType,
} from "@feasta/shared-types";

export const MAX_EVENT_GUESTS = 10_000;

export const CUSTOMER_PLANNING_EVENT_TYPES = [
  "birthday",
  "wedding",
  "debut",
  "corporate",
  "anniversary",
  "other",
] as const;

export type CustomerPlanningEventType =
  (typeof CUSTOMER_PLANNING_EVENT_TYPES)[number];

export type CustomerEventVenue = {
  label: string;
  address: string;
  city: string;
  province: string;
  placeId: string;
  latitude: number;
  longitude: number;
};

export type CustomerPlanningContext = {
  eventType?: CustomerPlanningEventType;
  eventDate?: string;
  guestCount?: number;
  eventVenue?: CustomerEventVenue;
};

export type CustomerEventContext = {
  eventDate: string;
  eventTime: string;
  eventEndTime: string;
  guestCount: number;
  serviceType: ProviderServiceType | "all";
};

export type CustomerEventContextDraft = {
  eventDate: string;
  eventTime: string;
  eventEndTime: string;
  guestCount: string;
  serviceType: string;
};

export type CustomerEventContextErrors = Partial<
  Record<keyof CustomerEventContextDraft, string>
>;

type SearchParameters = Record<string, string | string[] | undefined>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const PLACE_ID_PATTERN = /^(?:places\/)?[A-Za-z0-9_-]{4,200}$/u;

export function parseCustomerPlanningContext(
  parameters: SearchParameters,
  minimumDate = manilaDateValue(),
): CustomerPlanningContext | null {
  const eventTypeValue = first(parameters.eventType).trim();
  const eventType = (
    CUSTOMER_PLANNING_EVENT_TYPES as readonly string[]
  ).includes(eventTypeValue)
    ? eventTypeValue as CustomerPlanningEventType
    : undefined;
  const eventDateValue = first(parameters.eventDate).trim();
  const eventDate = isCanonicalDate(eventDateValue) &&
    eventDateValue >= minimumDate
    ? eventDateValue
    : undefined;
  const guestCountValue = first(parameters.guestCount).trim();
  const guestCountNumber = Number(guestCountValue);
  const guestCount = /^\d{1,5}$/u.test(guestCountValue) &&
    Number.isSafeInteger(guestCountNumber) &&
    guestCountNumber >= 1 &&
    guestCountNumber <= MAX_EVENT_GUESTS
    ? guestCountNumber
    : undefined;
  const eventVenue = parseEventVenue(parameters);

  if (!eventType && !eventDate && !guestCount && !eventVenue) return null;

  return {
    ...(eventType ? {eventType} : {}),
    ...(eventDate ? {eventDate} : {}),
    ...(guestCount ? {guestCount} : {}),
    ...(eventVenue ? {eventVenue} : {}),
  };
}

export function appendCustomerPlanningContext(
  parameters: URLSearchParams,
  context: CustomerPlanningContext | null | undefined,
): URLSearchParams {
  if (!context) return parameters;
  if (context.eventType) parameters.set("eventType", context.eventType);
  if (context.eventDate) parameters.set("eventDate", context.eventDate);
  if (context.guestCount) {
    parameters.set("guestCount", String(context.guestCount));
  }
  if (context.eventVenue) {
    parameters.set("eventVenueLabel", context.eventVenue.label);
    parameters.set("eventVenueAddress", context.eventVenue.address);
    if (context.eventVenue.city) {
      parameters.set("eventVenueCity", context.eventVenue.city);
    }
    if (context.eventVenue.province) {
      parameters.set("eventVenueProvince", context.eventVenue.province);
    }
    parameters.set("eventVenuePlaceId", context.eventVenue.placeId);
    parameters.set("eventVenueLat", String(context.eventVenue.latitude));
    parameters.set("eventVenueLng", String(context.eventVenue.longitude));
  }
  return parameters;
}

export function parseCustomerEventContext(
  parameters: SearchParameters,
  minimumDate = manilaDateValue(),
): CustomerEventContext | null {
  const draft: CustomerEventContextDraft = {
    eventDate: first(parameters.eventDate),
    eventTime: first(parameters.eventTime),
    eventEndTime: first(parameters.eventEndTime),
    guestCount: first(parameters.guestCount),
    serviceType: first(parameters.serviceType),
  };
  const validation = validateCustomerEventContext(draft, minimumDate);
  return validation.context;
}

export function validateCustomerEventContext(
  draft: CustomerEventContextDraft,
  minimumDate = manilaDateValue(),
): {
  context: CustomerEventContext | null;
  errors: CustomerEventContextErrors;
} {
  const errors: CustomerEventContextErrors = {};
  const eventDate = draft.eventDate.trim();
  const eventTime = draft.eventTime.trim();
  const eventEndTime = draft.eventEndTime.trim();
  const guestCountText = draft.guestCount.trim();
  const guestCount = Number(guestCountText);
  const serviceType = providerServiceType(draft.serviceType);

  if (!isCanonicalDate(eventDate) || eventDate < minimumDate) {
    errors.eventDate = "Choose today or a future event date.";
  }
  if (!TIME_PATTERN.test(eventTime)) {
    errors.eventTime = "Choose a valid start time.";
  }
  if (!TIME_PATTERN.test(eventEndTime)) {
    errors.eventEndTime = "Choose a valid end time.";
  } else if (TIME_PATTERN.test(eventTime) && eventEndTime <= eventTime) {
    errors.eventEndTime = "End time must be later than start time.";
  }
  if (
    !/^\d{1,5}$/u.test(guestCountText) ||
    !Number.isSafeInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > MAX_EVENT_GUESTS
  ) {
    errors.guestCount = `Enter a whole number from 1 to ${MAX_EVENT_GUESTS.toLocaleString("en-PH")}.`;
  }
  if (!serviceType) {
    errors.serviceType = "Choose a valid service type.";
  }

  return {
    context: Object.keys(errors).length === 0 && serviceType
      ? {
          eventDate,
          eventTime,
          eventEndTime,
          guestCount,
          serviceType,
        }
      : null,
    errors,
  };
}

export function appendCustomerEventContext(
  parameters: URLSearchParams,
  context: CustomerEventContext | null,
): URLSearchParams {
  if (!context) return parameters;
  parameters.set("eventDate", context.eventDate);
  parameters.set("eventTime", context.eventTime);
  parameters.set("eventEndTime", context.eventEndTime);
  parameters.set("guestCount", String(context.guestCount));
  if (context.serviceType !== "all") {
    parameters.set("serviceType", context.serviceType);
  }
  return parameters;
}

export function customerEventContextQuery(
  context: CustomerEventContext | null,
): string {
  return appendCustomerEventContext(new URLSearchParams(), context).toString();
}

export function customerEventContextFromHref(
  href: string,
  minimumDate?: string,
): CustomerEventContext | null {
  const queryIndex = href.indexOf("?");
  if (queryIndex === -1) return null;
  const parameters = new URLSearchParams(href.slice(queryIndex + 1));
  return parseCustomerEventContext({
    eventDate: parameters.getAll("eventDate"),
    eventTime: parameters.getAll("eventTime"),
    eventEndTime: parameters.getAll("eventEndTime"),
    guestCount: parameters.getAll("guestCount"),
    serviceType: parameters.has("serviceType")
      ? parameters.getAll("serviceType")
      : parameters.getAll("service"),
  }, minimumDate);
}

export function manilaDateValue(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function formatCustomerEventDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
}

export function formatCustomerEventTime(value: string): string {
  const [hour = "0", minute = "0"] = value.split(":");
  const date = new Date(Date.UTC(2020, 0, 1, Number(hour), Number(minute)));
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

function isCanonicalDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return !Number.isNaN(parsed.getTime()) && manilaDateValue(parsed) === value;
}

function parseEventVenue(
  parameters: SearchParameters,
): CustomerEventVenue | undefined {
  const label = boundedText(first(parameters.eventVenueLabel), 120);
  const address = boundedText(first(parameters.eventVenueAddress), 240);
  const city = boundedText(first(parameters.eventVenueCity), 100);
  const province = boundedText(first(parameters.eventVenueProvince), 100);
  const placeId = first(parameters.eventVenuePlaceId).trim();
  const latitude = Number(first(parameters.eventVenueLat));
  const longitude = Number(first(parameters.eventVenueLng));
  const inPhilippines = Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 4 &&
    latitude <= 22 &&
    longitude >= 116 &&
    longitude <= 127;

  return label &&
    address &&
    PLACE_ID_PATTERN.test(placeId) &&
    inPhilippines
    ? {
        label,
        address,
        city,
        province,
        placeId,
        latitude,
        longitude,
      }
    : undefined;
}

function boundedText(value: string, maximum: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, maximum);
}

function providerServiceType(value: string): ProviderServiceType | "all" | null {
  const normalized = value.trim() || "all";
  return normalized === "all" ||
    (PROVIDER_SERVICE_TYPES as readonly string[]).includes(normalized)
    ? normalized as ProviderServiceType | "all"
    : null;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
