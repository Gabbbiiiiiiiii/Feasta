import "server-only";

import {
  AggregateField,
  Timestamp,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

export type RevenueRange = "7D" | "1M" | "3M" | "1Y";

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
  revenueByRange: Record<RevenueRange, RevenuePoint[]>;
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

const dailyLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});

const monthlyLabelFormatter = new Intl.DateTimeFormat(
  "en-US",
  {
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Manila",
  },
);

function timestampToDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  return null;
}

function createManilaDate(
  year: number,
  month: number,
  day: number,
) {
  return new Date(
    Date.UTC(year, month, day) - MANILA_OFFSET_MS,
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

  return Array.from({ length: dayCount }, (_, index) => {
    const daysAgo = dayCount - index - 1;
    const localDay = new Date(
      currentLocalDay - daysAgo * DAY_MS,
    );

    const start = createManilaDate(
      localDay.getUTCFullYear(),
      localDay.getUTCMonth(),
      localDay.getUTCDate(),
    );

    const end = new Date(start.getTime() + DAY_MS);

    return {
      start,
      end,
      label: dailyLabelFormatter.format(start),
    };
  });
}

function getRecentMonthRanges(
  monthCount: number,
  now = new Date(),
): DateRange[] {
  const currentDate = getManilaDateParts(now);

  return Array.from(
    { length: monthCount },
    (_, index) => {
      const monthsAgo = monthCount - index - 1;

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
        label: monthlyLabelFormatter.format(start),
      };
    },
  );
}

async function getRevenueForRange(
  range: DateRange,
): Promise<RevenuePoint> {
  const snapshot = await adminDb
    .collection("payments")
    .where("status", "==", "paid")
    .where(
      "paidAt",
      ">=",
      Timestamp.fromDate(range.start),
    )
    .where(
      "paidAt",
      "<",
      Timestamp.fromDate(range.end),
    )
    .aggregate({
      total: AggregateField.sum("amount"),
    })
    .get();

  const total = snapshot.data().total;

  return {
    label: range.label,
    revenue:
      typeof total === "number" &&
      Number.isFinite(total)
        ? total
        : 0,
  };
}

async function getRevenueSeries(
  ranges: DateRange[],
): Promise<RevenuePoint[]> {
  return Promise.all(
    ranges.map((range) => getRevenueForRange(range)),
  );
}

async function getRevenueByRange(): Promise<
  Record<RevenueRange, RevenuePoint[]>
> {
  /*
   * Query the longest daily and monthly ranges once.
   *
   * The smaller ranges are derived from these results:
   * - 7D comes from the final 7 entries of 1M.
   * - 3M comes from the final 3 entries of 1Y.
   */
  const [last30Days, last12Months] = await Promise.all([
    getRevenueSeries(getRecentDayRanges(30)),
    getRevenueSeries(getRecentMonthRanges(12)),
  ]);

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
    bookingsSnapshot,
    verificationSnapshot,
    pendingComplaintsSnapshot,
    pendingPaymentsSnapshot,
    failedPaymentsSnapshot,
    providersSnapshot,
    activitiesSnapshot,
    revenueByRange,
  ] = await Promise.all([
    adminDb
      .collection("appSettings")
      .doc("adminDashboard")
      .get(),

    adminDb
      .collection("payments")
      .where("status", "==", "paid")
      .aggregate({
        total: AggregateField.sum("amount"),
      })
      .get(),

    adminDb
      .collection("users")
      .where("isActive", "==", true)
      .count()
      .get(),

    adminDb.collection("bookings").count().get(),

    adminDb
      .collection("providerVerifications")
      .where("status", "in", [
        "submitted",
        "under_review",
      ])
      .count()
      .get(),

    adminDb
      .collection("complaints")
      .where("status", "==", "pending")
      .count()
      .get(),

    adminDb
      .collection("payments")
      .where("status", "in", [
        "pending",
        "processing",
      ])
      .count()
      .get(),

    adminDb
      .collection("payments")
      .where("status", "==", "failed")
      .count()
      .get(),

    adminDb
      .collection("providers")
      .where("isActive", "==", true)
      .limit(5)
      .get(),

    adminDb
      .collection("adminLogs")
      .orderBy("createdAt", "desc")
      .limit(8)
      .get(),

    getRevenueByRange(),
  ]);

  const settings = settingsSnapshot.data() ?? {};
  const totalRevenue = revenueSnapshot.data().total;

  return {
    settings: {
      title:
        typeof settings.title === "string"
          ? settings.title
          : "Admin Dashboard",

      subtitle:
        typeof settings.subtitle === "string"
          ? settings.subtitle
          : "FEASTA Platform · Ormoc City",

      topProvidersTitle:
        typeof settings.topProvidersTitle === "string"
          ? settings.topProvidersTitle
          : "Top Providers",

      quickActionsTitle:
        typeof settings.quickActionsTitle === "string"
          ? settings.quickActionsTitle
          : "Quick Actions",

      platformHealthTitle:
        typeof settings.platformHealthTitle === "string"
          ? settings.platformHealthTitle
          : "Platform Health",

      recentActivitiesTitle:
        typeof settings.recentActivitiesTitle === "string"
          ? settings.recentActivitiesTitle
          : "Recent Activities",
    },

    statistics: {
      revenue:
        typeof totalRevenue === "number" &&
        Number.isFinite(totalRevenue)
          ? totalRevenue
          : 0,

      activeUsers: activeUsersSnapshot.data().count,

      totalBookings: bookingsSnapshot.data().count,

      verificationQueue:
        verificationSnapshot.data().count,
    },

    revenueByRange,

    topProviders: providersSnapshot.docs.map(
      (document) => {
        const data = document.data();

        return {
          id: document.id,

          businessName:
            typeof data.businessName === "string"
              ? data.businessName
              : "Unnamed provider",

          serviceType:
            typeof data.providerServiceType === "string"
              ? data.providerServiceType
              : "provider",

          completedBookings:
            typeof data.completedBookings === "number"
              ? data.completedBookings
              : 0,
        };
      },
    ),

    recentActivities: activitiesSnapshot.docs.map(
      (document) => {
        const data = document.data();

        return {
          id: document.id,

          action:
            typeof data.action === "string"
              ? data.action
              : "Administrative activity",

          entity:
            typeof data.entity === "string"
              ? data.entity
              : "platform",

          actorName:
            typeof data.actorName === "string"
              ? data.actorName
              : "Administrator",

          createdAt: timestampToDate(data.createdAt),
        };
      },
    ),

    platformHealth: {
      activeUsers: activeUsersSnapshot.data().count,

      pendingComplaints:
        pendingComplaintsSnapshot.data().count,

      pendingPayments:
        pendingPaymentsSnapshot.data().count,

      failedPayments:
        failedPaymentsSnapshot.data().count,
    },
  };
}