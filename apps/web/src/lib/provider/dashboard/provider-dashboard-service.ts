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
  ProviderDashboardActivityPoint,
  ProviderDashboardData,
} from "./provider-dashboard-types";

const COLLECTIONS = {
  providerRequests: "providerRequests",
  packages: "packages",
} as const;

const ACTIVITY_DAYS = 7;
const MAX_ACTIVITY_REQUESTS = 100;

const ACTIVE_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
] as const;

const CONFIRMED_EVENT_STATUSES = [
  "accepted",
  "confirmed",
  "in_progress",
] as const;

export async function getProviderDashboardData():
Promise<ProviderDashboardData> {
  const account =
    await requireApprovedProvider();

  const providerId =
    requireDocumentId(
      account.providerId,
      "providerId",
    );

  const [
    activeRequestsSnapshot,
    publishedPackagesSnapshot,
    confirmedEventsSnapshot,
    recentRequestsSnapshot,
  ] = await Promise.all([
    adminDb
      .collection(
        COLLECTIONS.providerRequests,
      )
      .where(
        "providerId",
        "==",
        providerId,
      )
      .where(
        "status",
        "in",
        [...ACTIVE_REQUEST_STATUSES],
      )
      .count()
      .get(),

    adminDb
      .collection(
        COLLECTIONS.packages,
      )
      .where(
        "providerId",
        "==",
        providerId,
      )
      .where(
        "status",
        "==",
        "published",
      )
      .where(
        "isActive",
        "==",
        true,
      )
      .count()
      .get(),

    adminDb
      .collection(
        COLLECTIONS.providerRequests,
      )
      .where(
        "providerId",
        "==",
        providerId,
      )
      .where(
        "status",
        "in",
        [...CONFIRMED_EVENT_STATUSES],
      )
      .count()
      .get(),

    adminDb
      .collection(
        COLLECTIONS.providerRequests,
      )
      .where(
        "providerId",
        "==",
        providerId,
      )
      .orderBy(
        "createdAt",
        "desc",
      )
      .limit(
        MAX_ACTIVITY_REQUESTS,
      )
      .get(),
  ]);

  return {
    summary: {
      activeRequests:
        activeRequestsSnapshot
          .data()
          .count,

      publishedPackages:
        publishedPackagesSnapshot
          .data()
          .count,

      confirmedEvents:
        confirmedEventsSnapshot
          .data()
          .count,
    },

    bookingActivity:
      buildBookingActivity(
        recentRequestsSnapshot.docs.map(
          (document) => ({
            status:
              typeof document.data().status ===
              "string"
                ? document.data().status
                : "",

            createdAt:
              document.data().createdAt,
          }),
        ),
      ),
  };
}

function buildBookingActivity(
  requests: readonly {
    status: string;
    createdAt: unknown;
  }[],
): ProviderDashboardActivityPoint[] {
  const days =
    createActivityDays();

  const counts =
    new Map(
      days.map(
        (day) => [
          day.date,
          0,
        ],
      ),
    );

  for (const request of requests) {
    if (
      !CONFIRMED_EVENT_STATUSES.includes(
        request.status as
          (typeof CONFIRMED_EVENT_STATUSES)[number],
      )
    ) {
      continue;
    }

    const date =
      timestampDate(
        request.createdAt,
      );

    if (!date) {
      continue;
    }

    const key =
      manilaDateKey(date);

    if (!counts.has(key)) {
      continue;
    }

    counts.set(
      key,
      (counts.get(key) ?? 0) + 1,
    );
  }

  return days.map(
    (day) => ({
      ...day,
      confirmed:
        counts.get(day.date) ?? 0,
    }),
  );
}

function createActivityDays():
ProviderDashboardActivityPoint[] {
  const now =
    new Date();

  const result:
    ProviderDashboardActivityPoint[] =
    [];

  for (
    let offset =
      ACTIVITY_DAYS - 1;
    offset >= 0;
    offset -= 1
  ) {
    const date =
      new Date(
        now.getTime() -
          offset *
            24 *
            60 *
            60 *
            1000,
      );

    result.push({
      date:
        manilaDateKey(date),

      label:
        new Intl.DateTimeFormat(
          "en-PH",
          {
            weekday: "short",
            timeZone:
              "Asia/Manila",
          },
        ).format(date),

      confirmed: 0,
    });
  }

  return result;
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

function timestampDate(
  value: unknown,
): Date | null {
  if (
    value instanceof Timestamp
  ) {
    return value.toDate();
  }

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime(),
    )
  ) {
    return value;
  }

  return null;
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