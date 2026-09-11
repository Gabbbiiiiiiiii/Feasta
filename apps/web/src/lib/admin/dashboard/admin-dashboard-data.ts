import "server-only";

import {
  AggregateField,
  Timestamp,
} from "firebase-admin/firestore";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import { adminDb } from "@/lib/firebase/admin";

export type PaymentVolumeRange =
  | "7D"
  | "1M"
  | "3M"
  | "1Y";

export type PaymentVolumePoint = {
  label: string;
  volumeInCentavos: number;
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
    confirmedPaymentVolumeInCentavos: number;
    activeAccounts: number;
    activeBookings: number;
    verificationQueue: number;
  };

  paymentVolumeByRange: Record<
    PaymentVolumeRange,
    PaymentVolumePoint[]
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
    activeCustomerAccounts: number;
    activeProviderAccounts: number;
    bookingsNeedingAttention: number;
    pendingProcessingPayments: number;
    failedExpiredPayments: number;
    openComplaints: number;
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
async function getPaymentVolumeByRange(): Promise<
  Record<
    PaymentVolumeRange,
    PaymentVolumePoint[]
  >
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
    .select("amountInCentavos", "paidAt")
    .get();

  const volumeByDay =
    new Map<string, number>();

  const volumeByMonth =
    new Map<string, number>();

  for (const document of snapshot.docs) {
    const data = document.data();
    const paidAt = timestampToDate(data.paidAt);
    const amountInCentavos =
      finiteNumber(data.amountInCentavos);

    if (
      !paidAt ||
      !Number.isSafeInteger(amountInCentavos) ||
      amountInCentavos <= 0
    ) {
      continue;
    }

    const dayKey = createDayKey(paidAt);
    const monthKey = createMonthKey(paidAt);

    volumeByDay.set(
      dayKey,
      (volumeByDay.get(dayKey) ?? 0) +
        amountInCentavos,
    );

    volumeByMonth.set(
      monthKey,
      (volumeByMonth.get(monthKey) ?? 0) +
        amountInCentavos,
    );
  }

  const last30Days = dayRanges.map(
    (range): PaymentVolumePoint => ({
      label: range.label,
      volumeInCentavos:
        volumeByDay.get(
          createDayKey(range.start),
        ) ?? 0,
    }),
  );

  const last12Months = monthRanges.map(
    (range): PaymentVolumePoint => ({
      label: range.label,
      volumeInCentavos:
        volumeByMonth.get(
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
    confirmedPaymentVolumeSnapshot,
    activeCustomersSnapshot,
    activeProvidersSnapshot,
    activeBookingsSnapshot,
    verificationSnapshot,
    openComplaintsSnapshot,
    pendingPaymentsSnapshot,
    failedExpiredPaymentsSnapshot,
    providersSnapshot,
    activitiesSnapshot,
    paymentVolumeByRange,
  ] = await Promise.all([
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.appSettings,
      )
      .doc("adminDashboard")
      .get(),

    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.payments,
      )
      .where("status", "==", "paid")
      .aggregate({
        totalInCentavos:
          AggregateField.sum(
            "amountInCentavos",
          ),
      })
      .get(),

    // activeCustomersSnapshot
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.users,
      )
      .where("role", "==", "customer")
      .where("isActive", "==", true)
      .count()
      .get(),

    // activeProvidersSnapshot
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.users,
      )
      .where("role", "==", "provider")
      .where("isActive", "==", true)
      .count()
      .get(),


    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.mainEvents,
      )
      .where("status", "in", [
        "pending_provider_approval",
        "needs_provider_replacement",
        "waiting_for_down_payment",
        "confirmed",
        "in_progress",
      ])
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
      .where("status", "in", [
        "submitted",
        "under_review",
        "awaiting_customer",
        "awaiting_provider",
        "escalated",
      ])
      .count()
      .get(),

    // pendingPaymentsSnapshot
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.payments,
      )
      .where("status", "in", [
        "pending",
        "processing",
      ])
      .count()
      .get(),

    // failedExpiredPaymentsSnapshot
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.payments,
      )
      .where("status", "in", [
        "failed",
        "expired",
      ])
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

    getPaymentVolumeByRange(),
  ]);

  const settings =
    settingsSnapshot.data() ?? {};

  const confirmedPaymentVolumeInCentavos =
    finiteNumber(
    confirmedPaymentVolumeSnapshot
      .data()
      .totalInCentavos,
  );

  const activeCustomerAccounts =
    activeCustomersSnapshot.data().count;

  const activeProviderAccounts =
    activeProvidersSnapshot.data().count;

  const activeAccounts =
    activeCustomerAccounts +
    activeProviderAccounts;

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
      confirmedPaymentVolumeInCentavos,
      activeAccounts,
      activeBookings:
        activeBookingsSnapshot.data().count,
      verificationQueue:
        verificationSnapshot.data().count,
    },

    paymentVolumeByRange,

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
      activeCustomerAccounts,
      activeProviderAccounts,

      bookingsNeedingAttention:
        activeBookingsSnapshot.data().count,

      pendingProcessingPayments:
        pendingPaymentsSnapshot.data().count,

      failedExpiredPayments:
        failedExpiredPaymentsSnapshot
          .data()
          .count,

      openComplaints:
        openComplaintsSnapshot.data().count,
    },
  };
}