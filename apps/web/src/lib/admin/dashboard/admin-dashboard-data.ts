import "server-only";

import {
  AggregateField,
  Timestamp,
} from "firebase-admin/firestore";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import { adminDb } from "@/lib/firebase/admin";
import { normalizeLedgerRow } from "@/lib/admin/reports/admin-financial-report-service";

export type RevenueRange =
  | "7D"
  | "1M"
  | "3M"
  | "1Y";

export type RevenuePoint = {
  label: string;
  revenueInCentavos: number;
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
    operationsOverviewTitle: string;
    recentActivitiesTitle: string;
  };

  statistics: {
    feastaRevenueInCentavos: number;
    totalUsers: number;
    totalBookings: number;
    verificationQueue: number;
    revenueLast30DaysInCentavos: number;
    customerAccounts: number;
    providerAccounts: number;
    activeBookings: number;
    completedBookings: number;
    submittedApprovals: number;
    underReviewApprovals: number;
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
    href: string;
  }>;

  operationsOverview: {
    pendingProcessingPayments: number;
    failedExpiredPayments: number;
    reportedReviews: number;
    openComplaints: number;
  };

  recentActivities: Array<{
    id: string;
    action: string;
    entity: string;
    actorName: string;
    createdAt: Date | null;
  }>;
};

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dailyLabelFormatter =
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

const monthlyLabelFormatter =
  new Intl.DateTimeFormat("en-PH", {
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
 * Groups immutable commission accruals and completed refund reversals.
 * Recognition follows ledger createdAt, as in Admin Financial Reports;
 * historical fees are never recalculated from current settings.
 */
async function getRevenueByRange(): Promise<
  Record<
    RevenueRange,
    RevenuePoint[]
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
    .collection("financialLedgerEntries")
    .where("createdAt", ">=", Timestamp.fromDate(rangeStart))
    .where("createdAt", "<", Timestamp.fromDate(rangeEnd))
    .select(
      "schemaVersion", "entryType", "ledgerEntryId", "paymentId",
      "ordinaryCommissionAdjustmentInCentavos", "feastaCancellationFeeEarnedInCentavos", "providerEconomicEntitlementInCentavos",
      "paymentDefaultAllocation", "customerRefundCompletedInCentavos", "commissionEarnedAfterInCentavos",
      "providerRequestId", "mainEventId", "providerId", "currency",
      "grossAmountInCentavos", "refundAmountInCentavos",
      "commissionAccruedInCentavos", "commissionReversedInCentavos",
      "providerVatInCentavos", "providerVatReversedInCentavos",
      "platformVatInCentavos", "platformVatReversedInCentavos",
      "withholdingInCentavos", "withholdingReversedInCentavos", "createdAt",
    )
    .get();

  const revenueByDay =
    new Map<string, number>();

  const revenueByMonth =
    new Map<string, number>();

  for (const document of snapshot.docs) {
    const row = normalizeLedgerRow(document);

    if (!row) {
      throw new Error("Dashboard revenue contains an invalid financial ledger entry.");
    }

    const recordedAt = new Date(row.createdAt);
    const amountInCentavos =
      row.commissionAccruedInCentavos - row.commissionReversedInCentavos + (row.feastaCancellationFeeEarnedInCentavos ?? 0);
    const dayKey = createDayKey(recordedAt);
    const monthKey = createMonthKey(recordedAt);

    revenueByDay.set(
      dayKey,
      (revenueByDay.get(dayKey) ?? 0) +
        amountInCentavos,
    );

    revenueByMonth.set(
      monthKey,
      (revenueByMonth.get(monthKey) ?? 0) +
        amountInCentavos,
    );
  }

  const last30Days = dayRanges.map(
    (range): RevenuePoint => ({
      label: range.label,
      revenueInCentavos:
        revenueByDay.get(
          createDayKey(range.start),
        ) ?? 0,
    }),
  );

  const last12Months = monthRanges.map(
    (range): RevenuePoint => ({
      label: range.label,
      revenueInCentavos:
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

/** Rank completed provider engagements once per Main Event, not stale counters. */
async function getTopProviders(): Promise<AdminDashboardData["topProviders"]> {
  const [providers, completedRequests] = await Promise.all([
    adminDb.collection(FIRESTORE_COLLECTIONS.providers)
      .where("isActive", "==", true)
      .select("businessName", "providerServiceType", "ownerId")
      .get(),
    adminDb.collection(FIRESTORE_COLLECTIONS.providerRequests)
      .where("status", "==", "completed")
      .select("providerId", "mainEventId")
      .get(),
  ]);
  const eventsByProvider = new Map<string, Set<string>>();
  for (const document of completedRequests.docs) {
    const data = document.data();
    const providerId = stringValue(data.providerId, "");
    const mainEventId = stringValue(data.mainEventId, "");
    if (!providerId || !mainEventId) continue;
    const events = eventsByProvider.get(providerId) ?? new Set<string>();
    events.add(mainEventId);
    eventsByProvider.set(providerId, events);
  }
  const ranked = providers.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      ownerId: stringValue(data.ownerId, ""),
      businessName: stringValue(data.businessName, "Unnamed provider"),
      serviceType: stringValue(data.providerServiceType, "provider"),
      completedBookings: eventsByProvider.get(document.id)?.size ?? 0,
    };
  }).filter((provider) => provider.completedBookings > 0)
    .sort((left, right) => right.completedBookings - left.completedBookings ||
      left.businessName.localeCompare(right.businessName) || left.id.localeCompare(right.id))
    .slice(0, 5);

  return Promise.all(ranked.map(async ({ ownerId, ...provider }) => {
    // The verification page's selected parameter identifies an application,
    // which is a different document from the provider profile.
    const applications = await adminDb.collection(FIRESTORE_COLLECTIONS.providerVerifications)
      .where("providerId", "==", provider.id)
      .select("ownerId", "updatedAt", "createdAt")
      .get();
    const latest = applications.docs.filter((document) => {
      const applicationOwner = stringValue(document.data().ownerId, "");
      return /^[A-Za-z0-9_-]{1,150}$/u.test(document.id) &&
        (!applicationOwner || applicationOwner === ownerId);
    }).sort((left, right) => {
      const date = (document: typeof left) =>
        timestampToDate(document.data().updatedAt ?? document.data().createdAt)?.getTime() ?? 0;
      return date(right) - date(left) || left.id.localeCompare(right.id);
    })[0];
    return {
      ...provider,
      href: latest
        ? "/admin/providers?selected=" + encodeURIComponent(latest.id)
        : "/admin/providers?q=" + encodeURIComponent(provider.businessName),
    };
  }));
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [
    settingsSnapshot,
    commissionAccruedSnapshot,
    commissionReversedSnapshot,
    defaultAdjustmentSnapshot,
    defaultFeeSnapshot,
    totalBookingsSnapshot,
    customersSnapshot,
    providersSnapshot,
    activeBookingsSnapshot,
    completedBookingsSnapshot,
    submittedApprovalsSnapshot,
    underReviewApprovalsSnapshot,
    openComplaintsSnapshot,
    pendingPaymentsSnapshot,
    failedExpiredPaymentsSnapshot,
    topProviders,
    reportedReviewsSnapshot,
    activitiesSnapshot,
    revenueByRange,
  ] = await Promise.all([
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.appSettings,
      )
      .doc("adminDashboard")
      .get(),

    // Separate sums are intentional: settlement entries contain accruals,
    // while refund entries contain reversals. A combined Firestore aggregate
    // would exclude documents missing either field.
    adminDb.collection("financialLedgerEntries")
      .aggregate({ totalInCentavos: AggregateField.sum("commissionAccruedInCentavos") })
      .get(),
    adminDb.collection("financialLedgerEntries")
      .aggregate({ totalInCentavos: AggregateField.sum("commissionReversedInCentavos") })
      .get(),
    adminDb.collection("financialLedgerEntries").where("entryType", "==", "payment_default_allocation_completed")
      .aggregate({totalInCentavos: AggregateField.sum("ordinaryCommissionAdjustmentInCentavos")}).get(),
    adminDb.collection("financialLedgerEntries").where("entryType", "==", "payment_default_allocation_completed")
      .aggregate({totalInCentavos: AggregateField.sum("feastaCancellationFeeEarnedInCentavos")}).get(),
    adminDb.collection(FIRESTORE_COLLECTIONS.mainEvents)
      .count()
      .get(),

    // customersSnapshot
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.users,
      )
      .where("role", "==", "customer")
      .count()
      .get(),

    // providersSnapshot
    adminDb
      .collection(
        FIRESTORE_COLLECTIONS.users,
      )
      .where("role", "==", "provider")
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

    adminDb.collection(FIRESTORE_COLLECTIONS.mainEvents)
      .where("status", "==", "completed")
      .count()
      .get(),
    adminDb.collection(FIRESTORE_COLLECTIONS.providerVerifications)
      .where("status", "==", "submitted")
      .count()
      .get(),
    adminDb.collection(FIRESTORE_COLLECTIONS.providerVerifications)
      .where("status", "==", "under_review")
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

    getTopProviders(),
    adminDb.collection(FIRESTORE_COLLECTIONS.reviews)
      .where("isDeleted", "==", false)
      .where("isReported", "==", true)
      .count()
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

  // Fee revenue after completed reversals, not customer collection or
  // profit after gateway processing costs and taxes.
  const commissionAccrued = commissionAccruedSnapshot.data().totalInCentavos;
  const commissionReversed = commissionReversedSnapshot.data().totalInCentavos;
  if (
    !Number.isSafeInteger(commissionAccrued) || commissionAccrued < 0 ||
    !Number.isSafeInteger(commissionReversed) || commissionReversed < 0
  ) {
    throw new Error("Dashboard revenue totals are invalid.");
  }
  const adjustment = defaultAdjustmentSnapshot.data().totalInCentavos;
  const defaultFee = defaultFeeSnapshot.data().totalInCentavos;
  if (![adjustment, defaultFee].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Dashboard default fee totals are invalid.");
  const feastaRevenueInCentavos = commissionAccrued - commissionReversed - adjustment + defaultFee;

  const customerAccounts =
    customersSnapshot.data().count;

  const providerAccounts =
    providersSnapshot.data().count;

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

      operationsOverviewTitle: stringValue(
        settings.operationsOverviewTitle,
        "Operations Overview",
      ),

      recentActivitiesTitle: stringValue(
        settings.recentActivitiesTitle,
        "Recent Activities",
      ),
    },

    statistics: {
      feastaRevenueInCentavos,
      totalUsers: customerAccounts + providerAccounts,
      totalBookings: totalBookingsSnapshot.data().count,
      verificationQueue:
        submittedApprovalsSnapshot.data().count + underReviewApprovalsSnapshot.data().count,
      revenueLast30DaysInCentavos: revenueByRange["1M"].reduce(
        (total, point) => total + point.revenueInCentavos, 0,
      ),
      customerAccounts,
      providerAccounts,
      activeBookings: activeBookingsSnapshot.data().count,
      completedBookings: completedBookingsSnapshot.data().count,
      submittedApprovals: submittedApprovalsSnapshot.data().count,
      underReviewApprovals: underReviewApprovalsSnapshot.data().count,
    },

    revenueByRange,

    topProviders,

    operationsOverview: {
      pendingProcessingPayments: pendingPaymentsSnapshot.data().count,
      failedExpiredPayments: failedExpiredPaymentsSnapshot.data().count,
      reportedReviews: reportedReviewsSnapshot.data().count,
      openComplaints: openComplaintsSnapshot.data().count,
    },

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
  };
}
