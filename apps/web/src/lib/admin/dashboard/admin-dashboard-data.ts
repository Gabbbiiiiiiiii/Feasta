import "server-only";

import {
  AggregateField,
  Timestamp,
} from "firebase-admin/firestore";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import { adminDb } from "@/lib/firebase/admin";

export type RevenueRange =
  | "7D"
  | "1M"
  | "3M"
  | "1Y";

export type RevenuePoint = {
  label: string;
  revenue: number;
};

type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

export type AdminDashboardData = {
  settings: {
    title: string;
    subtitle: string;
    topProvidersTitle: string;
    quickActionsTitle: string;
    platformHealthTitle: string;
    recentActivitiesTitle: string;
  };

  statistics: {
    revenue: number;
    activeUsers: number;
    totalBookings: number;
    verificationQueue: number;
  };

  revenueByRange: Record<
    RevenueRange,
    RevenuePoint[]
  >;

  topProviders: Array<{
    id: string;
    businessName: string;
    serviceType: string;
    completedBookings: number;
  }>;

  recentActivities: Array<{
    id: string;
    action: string;
    entity: string;
    actorName: string;
    createdAt: Date | null;
  }>;

  platformHealth: {
    activeUsers: number;
    pendingComplaints: number;
    pendingPayments: number;
    failedPayments: number;
  };
};

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dailyLabelFormatter =
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

const monthlyLabelFormatter =
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Manila",
  });

function timestampToDate(
  value: unknown,
): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  return null;
}

function finiteNumber(
  value: unknown,
  fallback = 0,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function stringValue(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value.trim()
    : fallback;
}

function createManilaDate(
  year: number,
  month: number,
  day: number,
): Date {
  return new Date(
    Date.UTC(year, month, day) -
      MANILA_OFFSET_MS,
  );
}

function getManilaDateParts(date: Date) {
  const shiftedDate = new Date(
    date.getTime() + MANILA_OFFSET_MS,
  );

  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth(),
    day: shiftedDate.getUTCDate(),
  };
}

function createDayKey(date: Date): string {
  const parts = getManilaDateParts(date);

  return [
    parts.year,
    String(parts.month + 1).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function createMonthKey(date: Date): string {
  const parts = getManilaDateParts(date);

  return [
    parts.year,
    String(parts.month + 1).padStart(2, "0"),
  ].join("-");
}

function getRecentDayRanges(
  dayCount: number,
  now = new Date(),
): DateRange[] {
  const currentDate = getManilaDateParts(now);

  const currentLocalDay = Date.UTC(
    currentDate.year,
    currentDate.month,
    currentDate.day,
  );

  return Array.from(
    { length: dayCount },
    (_, index) => {
      const daysAgo = dayCount - index - 1;

      const localDay = new Date(
        currentLocalDay - daysAgo * DAY_MS,
      );

      const start = createManilaDate(
        localDay.getUTCFullYear(),
        localDay.getUTCMonth(),
        localDay.getUTCDate(),
      );

      return {
        start,
        end: new Date(start.getTime() + DAY_MS),
        label: dailyLabelFormatter.format(start),
      };
    },
  );
}

function getRecentMonthRanges(
  monthCount: number,
  now = new Date(),
): DateRange[] {
  const currentDate = getManilaDateParts(now);

  return Array.from(
    { length: monthCount },
    (_, index) => {
      const monthsAgo =
        monthCount - index - 1;

      const start = createManilaDate(
        currentDate.year,
        currentDate.month - monthsAgo,
        1,
      );

      const end = createManilaDate(
        currentDate.year,
        currentDate.month - monthsAgo + 1,
        1,
      );

      return {
        start,
        end,
        label:
          monthlyLabelFormatter.format(start),
      };
    },
  );
}

/**
 * Loads paid payments once and groups them in memory.
 *
 * This replaces the previous 42 Firestore aggregation
 * requests used for the 30 daily and 12 monthly points.
 */
async function getRevenueByRange(): Promise<
  Record<RevenueRange, RevenuePoint[]>
> {
  const dayRanges = getRecentDayRanges(30);
  const monthRanges = getRecentMonthRanges(12);

  const rangeStart =
    monthRanges[0]?.start ??
    dayRanges[0]?.start ??
    new Date();

  const rangeEnd =
    monthRanges.at(-1)?.end ??
    dayRanges.at(-1)?.end ??
    new Date();

  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.payments)
    .where("status", "==", "paid")
    .where(
      "paidAt",
      ">=",
      Timestamp.fromDate(rangeStart),
    )
    .where(
      "paidAt",
      "<",
      Timestamp.fromDate(rangeEnd),
    )
    .select("amount", "paidAt")
    .get();

  const revenueByDay = new Map<string, number>();
  const revenueByMonth =
    new Map<string, number>();

  for (const document of snapshot.docs) {
    const data = document.data();
    const paidAt = timestampToDate(data.paidAt);
    const amount = finiteNumber(data.amount);

    if (!paidAt || amount <= 0) {
      continue;
    }

    const dayKey = createDayKey(paidAt);
    const monthKey = createMonthKey(paidAt);

    revenueByDay.set(
      dayKey,
      (revenueByDay.get(dayKey) ?? 0) + amount,
    );

    revenueByMonth.set(
      monthKey,
      (revenueByMonth.get(monthKey) ?? 0) +
        amount,
    );
  }

  const last30Days = dayRanges.map(
    (range): RevenuePoint => ({
      label: range.label,
      revenue:
        revenueByDay.get(
          createDayKey(range.start),
        ) ?? 0,
    }),
  );

  const last12Months = monthRanges.map(
    (range): RevenuePoint => ({
      label: range.label,
      revenue:
        revenueByMonth.get(
          createMonthKey(range.start),
        ) ?? 0,
    }),
  );

  return {
    "7D": last30Days.slice(-7),
    "1M": last30Days,
    "3M": last12Months.slice(-3),
    "1Y": last12Months,
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [
    settingsSnapshot,
    revenueSnapshot,
    activeUsersSnapshot,
    mainEventsSnapshot,
    verificationSnapshot,
    pendingComplaintsSnapshot,
    pendingPaymentsSnapshot,
    failedPaymentsSnapshot,
    providersSnapshot,
    activitiesSnapshot,
    revenueByRange,
  ] = await Promise.all([
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.appSettings,
      )
      .doc("adminDashboard")
      .get(),

    adminDb
      .collection(FIRESTORE_COLLECTIONS.payments)
      .where("status", "==", "paid")
      .aggregate({
        total: AggregateField.sum("amount"),
      })
      .get(),

    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.users,
      )
      .where(
        "role",
        "in",
        [
          "customer",
          "provider",
        ],
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
        FIRESTORE_COLLECTIONS.mainEvents,
      )
      .count()
      .get(),

    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.providerVerifications,
      )
      .where("status", "in", [
        "submitted",
        "under_review",
      ])
      .count()
      .get(),

    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.complaints,
      )
      .where("status", "==", "pending")
      .count()
      .get(),

    adminDb
      .collection(FIRESTORE_COLLECTIONS.payments)
      .where("status", "in", [
        "pending",
        "processing",
      ])
      .count()
      .get(),

    adminDb
      .collection(FIRESTORE_COLLECTIONS.payments)
      .where("status", "==", "failed")
      .count()
      .get(),

    adminDb
      .collection(FIRESTORE_COLLECTIONS.providers)
      .where("isActive", "==", true)
      .orderBy("completedBookings", "desc")
      .limit(5)
      .get(),

    adminDb
      .collection(FIRESTORE_COLLECTIONS.adminLogs)
      .orderBy("createdAt", "desc")
      .limit(8)
      .get(),

    getRevenueByRange(),
  ]);

  const settings =
    settingsSnapshot.data() ?? {};

  const totalRevenue =
    revenueSnapshot.data().total;

  return {
    settings: {
      title: stringValue(
        settings.title,
        "Admin Dashboard",
      ),

      subtitle: stringValue(
        settings.subtitle,
        "FEASTA Platform · Ormoc City",
      ),

      topProvidersTitle: stringValue(
        settings.topProvidersTitle,
        "Top Providers",
      ),

      quickActionsTitle: stringValue(
        settings.quickActionsTitle,
        "Quick Actions",
      ),

      platformHealthTitle: stringValue(
        settings.platformHealthTitle,
        "Platform Health",
      ),

      recentActivitiesTitle: stringValue(
        settings.recentActivitiesTitle,
        "Recent Activities",
      ),
    },

    statistics: {
      revenue: finiteNumber(totalRevenue),

      activeUsers:
        activeUsersSnapshot.data().count,

      totalBookings:
        mainEventsSnapshot.data().count,

      verificationQueue:
        verificationSnapshot.data().count,
    },

    revenueByRange,

    topProviders: providersSnapshot.docs.map(
      (document) => {
        const data = document.data();

        return {
          id: document.id,

          businessName: stringValue(
            data.businessName,
            "Unnamed provider",
          ),

          serviceType: stringValue(
            data.providerServiceType,
            "provider",
          ),

          completedBookings: finiteNumber(
            data.completedBookings,
          ),
        };
      },
    ),

    recentActivities:
      activitiesSnapshot.docs.map((document) => {
        const data = document.data();

        return {
          id: document.id,

          action: stringValue(
            data.action,
            "Administrative activity",
          ),

          entity: stringValue(
            data.entity,
            "platform",
          ),

          actorName: stringValue(
            data.actorName,
            "Administrator",
          ),

          createdAt: timestampToDate(
            data.createdAt,
          ),
        };
      }),

    platformHealth: {
      activeUsers:
        activeUsersSnapshot.data().count,

      pendingComplaints:
        pendingComplaintsSnapshot.data().count,

      pendingPayments:
        pendingPaymentsSnapshot.data().count,

      failedPayments:
        failedPaymentsSnapshot.data().count,
    },
  };
}