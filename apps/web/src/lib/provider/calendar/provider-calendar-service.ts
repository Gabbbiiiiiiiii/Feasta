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

const ACTIVE_EVENT_STATUSES:
readonly ProviderCalendarEventStatus[] = [
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
];

const MAX_CALENDAR_EVENTS = 200;

export async function getProviderCalendarData():
Promise<ProviderCalendarData> {
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
      "status",
      "in",
      [...ACTIVE_EVENT_STATUSES],
    )
    .limit(
      MAX_CALENDAR_EVENTS,
    )
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

const events =
  requestsSnapshot.docs
    .map(
      (document) =>
        mapCalendarEvent(
          document.id,
          document.data(),
        ),
    )
      .filter(
        (
          event,
        ): event is ProviderCalendarEvent =>
          event !== null,
      )
      .sort(
        (left, right) =>
          left.event.eventDate.localeCompare(
            right.event.eventDate,
          ),
      );

  return {
    providerId,

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

      acceptsMultipleEventsPerDay:
        provider
          .acceptsMultipleEventsPerDay ===
        true,

      maxEventsPerDay:
        provider
          .acceptsMultipleEventsPerDay ===
        true
          ? Math.max(
              1,
              normalizeNonNegativeInteger(
                provider.maxEventsPerDay,
                1,
              ),
            )
          : 1,
    },

    events,
  };
}

function mapCalendarEvent(
  id: string,
  data: Record<string, unknown>,
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

  return {
    id,

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

      guestCount:
        integerOrNull(
          data.guestCount,
        ),

      venueAddress:
        stringOrNull(
          data.venueAddress,
        ),

      city:
        stringOrNull(
          data.city,
        ),
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

  return ACTIVE_EVENT_STATUSES.includes(
    value as ProviderCalendarEventStatus,
  )
    ? value as ProviderCalendarEventStatus
    : null;
}

function timestampToIsoDate(
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