import "server-only";

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  requireApprovedProvider,
} from "@/lib/auth/session";
import {
  adminDb,
} from "@/lib/firebase/admin";

import type {
  ProviderCalendarData,
  ProviderCalendarEvent,
  ProviderCalendarEventStatus,
} from "./provider-calendar-types";

export const ACTIVE_EVENT_STATUSES:
readonly ProviderCalendarEventStatus[] = [
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
  "completed",
];

const CALENDAR_STATUSES = [...ACTIVE_EVENT_STATUSES, "pending", "cancelled", "expired"] as const;

export async function getProviderCalendarData(month?: string):
Promise<ProviderCalendarData> {
  // The Philippines does not observe daylight saving time (UTC+08:00).
  const currentMonth = new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString().slice(0, 7);
  const selectedMonth = month && /^(20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)
    ? month : currentMonth;
  const [year, monthNumber] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(`${selectedMonth}-01T00:00:00+08:00`);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 1) - 8 * 60 * 60 * 1000);
  // Include the adjacent days needed by a week that crosses a month boundary.
  const margins = 6 * 86_400_000;
  const start = new Date(monthStart.getTime() - margins);
  const end = new Date(monthEnd.getTime() + margins);

  const account =
    await requireApprovedProvider();

  const providerId =
    requireDocumentId(
      account.providerId,
      "providerId",
    );

    const providerReference =
  adminDb
    .collection("providers")
    .doc(providerId);

const [
  providerSnapshot,
  requestsSnapshot,
  walkInsSnapshot,
] = await Promise.all([
  providerReference.get(),

  adminDb
    .collection("providerRequests")
    .where(
      "providerId",
      "==",
      providerId,
    )
    .where(
      "eventDate",
      ">=",
      Timestamp.fromDate(start),
    )
    .where(
      "eventDate",
      "<",
      Timestamp.fromDate(end),
    )
    .where(
      "status",
      "in",
      [...CALENDAR_STATUSES],
    )
    .get(),
  providerReference.collection("walkInBookings")
    .where("eventDate", ">=", Timestamp.fromDate(start))
    .where("eventDate", "<", Timestamp.fromDate(end))
    .get(),
]);

if (!providerSnapshot.exists) {
  throw new Error(
    "The provider account could not be loaded.",
  );
}

const provider =
  providerSnapshot.data() ?? {};

if (
  provider.ownerId !== account.uid
) {
  throw new Error(
    "The provider account ownership is invalid.",
  );
}

const onlineEvents = requestsSnapshot.docs
  .map((document) => mapCalendarEvent(document.id, document.data()));
const walkInEvents = walkInsSnapshot.docs.flatMap((document) => {
  const data = document.data();
  if (data.status !== "confirmed" && data.status !== "completed" && data.status !== "cancelled") return [];
  return [mapCalendarEvent(document.id, {
    ...data,
    packageName: data.serviceName,
  }, "walk_in")];
});
const events = [...onlineEvents, ...walkInEvents]
  .filter((event): event is ProviderCalendarEvent => event !== null)
  .sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate) ||
    (left.event.eventTime ?? "").localeCompare(right.event.eventTime ?? ""));

  return {
    providerId,
    ownerId: account.uid,
    month: selectedMonth,

    settings: {
      operatingDays:
        normalizeStringList(
          provider.operatingDays,
        ),

      bookingLeadTimeDays:
        normalizeNonNegativeInteger(
          provider.bookingLeadTimeDays,
          0,
        ),

      unavailableDates:
        normalizeIsoDates(
          provider.unavailableDates,
        ),

      acceptsMultipleEventsPerDay: dailyEventCapacity(provider) > 1,
      maxEventsPerDay: dailyEventCapacity(provider),
    },

    events,
  };
}

export function dailyEventCapacity(data: Record<string, unknown>): number {
  const value = data.maxEventsPerDay;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100
    ? value : 1;
}

// Deadlines govern checkout; only a lifecycle transition releases capacity.
export function calendarRequestOccupies(data: Record<string, unknown>): boolean {
  return ACTIVE_EVENT_STATUSES.some((status) => status === data.status);
}

function mapCalendarEvent(
  id: string,
  data: Record<string, unknown>,
  source: ProviderCalendarEvent["source"] = "online",
): ProviderCalendarEvent | null {
  const eventDate =
    timestampToIsoDate(
      data.eventDate,
    );

  if (!eventDate) {
    return null;
  }

  const status =
    normalizeStatus(
      data.status,
    );

  if (!status) {
    return null;
  }

  const eventLocation = stringOrNull(data.eventLocation);
  const eventAddress = stringOrNull(data.eventAddress);

  const submittedVenue = [
    eventLocation,
    eventAddress,
  ].filter(Boolean).join(", ");

  return {
    id,
    source,

    mainEventId:
      stringOrNull(
        data.mainEventId,
      ),

    customer: {
      name:
        customerName(data),
    },

    event: {
      eventType:
        stringOrNull(
          data.eventType,
        ) ?? "event",

      eventDate,

      eventTime:
        stringOrNull(
          data.eventTime,
        ),

      eventEndTime:
        stringOrNull(
          data.eventEndTime,
        ),

      guestCount:
        integerOrNull(
          data.guestCount,
        ),

      venueAddress:
        submittedVenue ||
        stringOrNull(data.venueAddress),

      city:
        submittedVenue
          ? null
          : stringOrNull(data.city),
    },

    packageName:
      stringOrNull(
        data.packageName,
      ),

    status,
  };
}

function customerName(
  data: Record<string, unknown>,
): string {
  const storedName = [
    stringOrNull(data.customerFirstName),
    stringOrNull(data.customerLastName),
  ].filter(Boolean).join(" ").trim();

  if (storedName) {
    return storedName;
  }

  const directName =
    stringOrNull(
      data.customerName,
    );

  if (directName) {
    return directName;
  }

  const customer =
    data.customer;

  if (
    typeof customer === "object" &&
    customer !== null
  ) {
    const record =
      customer as
        Record<string, unknown>;

    const nestedName =
      stringOrNull(
        record.name,
      );

    if (nestedName) {
      return nestedName;
    }

    const firstName =
      stringOrNull(
        record.firstName,
      );

    const lastName =
      stringOrNull(
        record.lastName,
      );

    const fullName =
      [
        firstName,
        lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (fullName) {
      return fullName;
    }
  }

  return "Customer";
}

function normalizeStatus(
  value: unknown,
): ProviderCalendarEventStatus | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  return CALENDAR_STATUSES.includes(
    value as ProviderCalendarEventStatus,
  )
    ? value as ProviderCalendarEventStatus
    : null;
}

export function timestampToIsoDate(
  value: unknown,
): string | null {
  if (
    !(value instanceof Timestamp)
  ) {
    return null;
  }

  return manilaDateKey(
    value.toDate(),
  );
}

function manilaDateKey(
  date: Date,
): string {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone:
          "Asia/Manila",
      },
    ).formatToParts(date);

  const year =
    parts.find(
      (part) =>
        part.type === "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type === "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type === "day",
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function normalizeIsoDates(
  value: unknown,
): string[] {
  return normalizeStringList(
    value,
  )
    .filter(isIsoDate)
    .sort();
}

function normalizeStringList(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
        .map(
          (item) =>
            item.trim(),
        )
        .filter(Boolean),
    ),
  ];
}

function normalizeNonNegativeInteger(
  value: unknown,
  fallback: number,
): number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  )
    ? value
    : fallback;
}

function integerOrNull(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isInteger(value)
  )
    ? value
    : null;
}

function stringOrNull(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function isIsoDate(
  value: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() ===
      day
  );
}

function requireDocumentId(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `The provider ${field} is invalid.`,
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 160 ||
    normalized.includes("/")
  ) {
    throw new Error(
      `The provider ${field} is invalid.`,
    );
  }

  return normalized;
}