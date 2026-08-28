import {
  PROVIDER_SERVICE_TYPES,
  type ProviderServiceType,
} from "@feasta/shared-types";

export const MAX_EVENT_GUESTS = 10_000;

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
  });
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
