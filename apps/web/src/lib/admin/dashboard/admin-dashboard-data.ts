import "server-only";

import {
  AggregateField,
  Timestamp,
} from "firebase-admin/firestore";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import {
  formatAuditAction,
  formatAuditRecordType,
  isMeaningfulAuditLog,
} from "@/lib/admin/audit-logs/admin-audit-log-normalization";
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
    activeBookings: number;
    completedBookings: number;
    verificationQueue: number;
    revenueLast30DaysInCentavos: number;
    customerAccounts: number;
    providerAccounts: number;
    submittedApprovals: number;
    underReviewApprovals: number;
  };

  revenueByRange: Record<
    RevenueRange,
    RevenuePoint[]
  >;

  providerPerformance: {
    activeProvidersCount: number;
    mostBookedProvider: {
      id: string;
      businessName: string;
      totalBookings: number;
      completedBookings: number;
      href: string;
    } | null;
    highestRatedProvider: {
      id: string;
      businessName: string;
      ratingAverage: number;
      reviewCount: number;
      href: string;
    } | null;
  };

  topProviders: Array<{
    id: string;
    businessName: string;
    serviceType: string;
    serviceCategory: string;
    totalBookings: number;
    completedBookings: number;
    ratingAverage: number;
    reviewCount: number;
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
    actionLabel: string;
    entity: string;
    entityLabel: string;
    actorName: string;
    createdAt: Date | null;
    href: string;
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

function nonNegativeFloat(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function formatFallbackCategory(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "provider") return "Uncategorized";
  if (trimmed.toLowerCase() === "both") return "Catering & Add-on";
  if (trimmed.toLowerCase() === "addon") return "Add-on";
  return trimmed
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

/** Rank active providers by distinct completed events, total bookings, and customer rating. */
async function getProviderPerformanceData(): Promise<{
  providerPerformance: AdminDashboardData["providerPerformance"];
  topProviders: AdminDashboardData["topProviders"];
}> {
  const [providers, allRequests, categoriesSnapshot] = await Promise.all([
    adminDb.collection(FIRESTORE_COLLECTIONS.providers)
      .where("isActive", "==", true)
      .select(
        "businessName",
        "providerServiceType",
        "providerCategory",
        "serviceCategories",
        "ownerId",
        "ratingAverage",
        "reviewCount",
        "isDeleted",
      )
      .get(),
    adminDb.collection(FIRESTORE_COLLECTIONS.providerRequests)
      .select("providerId", "mainEventId", "status")
      .get(),
    adminDb.collection("serviceCategories")
      .select("code", "name")
      .get(),
  ]);

  const categoryLabels = new Map<string, string>();
  for (const doc of categoriesSnapshot.docs) {
    const data = doc.data();
    const code = stringValue(data.code, doc.id);
    const name = stringValue(data.name, "");
    if (code && name) {
      categoryLabels.set(code, name);
      categoryLabels.set(doc.id, name);
    }
  }

  const completedEventsByProvider = new Map<string, Set<string>>();
  const totalRequestsByProvider = new Map<string, number>();

  for (const document of allRequests.docs) {
    const data = document.data();
    const providerId = stringValue(data.providerId, "");
    if (!providerId) continue;

    const status = stringValue(data.status, "");
    const mainEventId = stringValue(data.mainEventId, "");

    if (status === "completed") {
      if (mainEventId) {
        const events = completedEventsByProvider.get(providerId) ?? new Set<string>();
        events.add(mainEventId);
        completedEventsByProvider.set(providerId, events);
      }
      totalRequestsByProvider.set(
        providerId,
        (totalRequestsByProvider.get(providerId) ?? 0) + 1,
      );
    } else if (status && status !== "draft") {
      totalRequestsByProvider.set(
        providerId,
        (totalRequestsByProvider.get(providerId) ?? 0) + 1,
      );
    }
  }

  const activeProviders = providers.docs
    .filter((document) => document.data().isDeleted !== true)
    .map((document) => {
      const data = document.data();
      const rawCategories = Array.isArray(data.serviceCategories)
        ? data.serviceCategories
            .map((item) => stringValue(item, ""))
            .filter(Boolean)
        : [];
      const primaryCategory = stringValue(data.providerCategory, "");
      const categoryCodes = [
        ...new Set([
          ...(primaryCategory ? [primaryCategory] : []),
          ...rawCategories,
        ]),
      ];
      const serviceType = stringValue(data.providerServiceType, "provider");
      const serviceCategory =
        categoryCodes.length > 0
          ? categoryCodes
              .map((code) => categoryLabels.get(code) ?? formatFallbackCategory(code))
              .join(", ")
          : formatFallbackCategory(serviceType);

      const completedBookings = completedEventsByProvider.get(document.id)?.size ?? 0;
      const totalBookings = Math.max(
        completedBookings,
        totalRequestsByProvider.get(document.id) ?? 0,
      );

      return {
        id: document.id,
        ownerId: stringValue(data.ownerId, ""),
        businessName: stringValue(data.businessName, "Unnamed provider"),
        serviceType,
        serviceCategory,
        totalBookings,
        completedBookings,
        ratingAverage: nonNegativeFloat(data.ratingAverage),
        reviewCount: nonNegativeInt(data.reviewCount),
      };
    });

  const ranked = activeProviders
    .filter((provider) => provider.completedBookings > 0)
    .sort((left, right) =>
      right.completedBookings - left.completedBookings ||
      right.totalBookings - left.totalBookings ||
      right.ratingAverage - left.ratingAverage ||
      left.businessName.localeCompare(right.businessName) ||
      left.id.localeCompare(right.id),
    )
    .slice(0, 5);

  // If no provider has completed events yet, show active providers with bookings or reviews.
  const displayCandidates =
    ranked.length > 0
      ? ranked
      : activeProviders
          .filter((provider) => provider.totalBookings > 0 || provider.reviewCount > 0)
          .sort((left, right) =>
            right.totalBookings - left.totalBookings ||
            right.ratingAverage - left.ratingAverage ||
            left.businessName.localeCompare(right.businessName) ||
            left.id.localeCompare(right.id),
          )
          .slice(0, 5);

  const mostBookedCandidate = [...activeProviders]
    .filter((provider) => provider.totalBookings > 0)
    .sort((left, right) =>
      right.totalBookings - left.totalBookings ||
      right.completedBookings - left.completedBookings ||
      right.ratingAverage - left.ratingAverage ||
      left.businessName.localeCompare(right.businessName),
    )[0] ?? null;

  const highestRatedCandidate = [...activeProviders]
    .filter((provider) => provider.reviewCount > 0 && provider.ratingAverage > 0)
    .sort((left, right) =>
      right.ratingAverage - left.ratingAverage ||
      right.reviewCount - left.reviewCount ||
      right.completedBookings - left.completedBookings ||
      left.businessName.localeCompare(right.businessName),
    )[0] ?? null;

  const uniqueForHref = new Map<string, (typeof activeProviders)[number]>();
  for (const item of displayCandidates) uniqueForHref.set(item.id, item);
  if (mostBookedCandidate) uniqueForHref.set(mostBookedCandidate.id, mostBookedCandidate);
  if (highestRatedCandidate) uniqueForHref.set(highestRatedCandidate.id, highestRatedCandidate);

  const hrefByProviderId = new Map<string, string>();
  await Promise.all(
    [...uniqueForHref.values()].map(async ({ id, ownerId, businessName }) => {
      const applications = await adminDb.collection(FIRESTORE_COLLECTIONS.providerVerifications)
        .where("providerId", "==", id)
        .select("ownerId", "updatedAt", "createdAt")
        .get();
      const latest = applications.docs
        .filter((document) => {
          const applicationOwner = stringValue(document.data().ownerId, "");
          return (
            /^[A-Za-z0-9_-]{1,150}$/u.test(document.id) &&
            (!applicationOwner || applicationOwner === ownerId)
          );
        })
        .sort((left, right) => {
          const date = (document: typeof left) =>
            timestampToDate(document.data().updatedAt ?? document.data().createdAt)?.getTime() ?? 0;
          return date(right) - date(left) || left.id.localeCompare(right.id);
        })[0];

      hrefByProviderId.set(
        id,
        latest
          ? "/admin/providers?selected=" + encodeURIComponent(latest.id)
          : "/admin/providers?q=" + encodeURIComponent(businessName),
      );
    }),
  );

  const resolveHref = (provider: { id: string; businessName: string }) =>
    hrefByProviderId.get(provider.id) ??
    "/admin/providers?q=" + encodeURIComponent(provider.businessName);

  return {
    providerPerformance: {
      activeProvidersCount: activeProviders.length,
      mostBookedProvider: mostBookedCandidate
        ? {
            id: mostBookedCandidate.id,
            businessName: mostBookedCandidate.businessName,
            totalBookings: mostBookedCandidate.totalBookings,
            completedBookings: mostBookedCandidate.completedBookings,
            href: resolveHref(mostBookedCandidate),
          }
        : null,
      highestRatedProvider: highestRatedCandidate
        ? {
            id: highestRatedCandidate.id,
            businessName: highestRatedCandidate.businessName,
            ratingAverage: highestRatedCandidate.ratingAverage,
            reviewCount: highestRatedCandidate.reviewCount,
            href: resolveHref(highestRatedCandidate),
          }
        : null,
    },
    topProviders: displayCandidates.map((provider) => ({
      id: provider.id,
      businessName: provider.businessName,
      serviceType: provider.serviceType,
      serviceCategory: provider.serviceCategory,
      totalBookings: provider.totalBookings,
      completedBookings: provider.completedBookings,
      ratingAverage: provider.ratingAverage,
      reviewCount: provider.reviewCount,
      href: resolveHref(provider),
    })),
  };
}

export async function getAdminFeastaRevenueInCentavos(): Promise<number> {
  const [
    commissionAccruedSnapshot,
    commissionReversedSnapshot,
    defaultAdjustmentSnapshot,
    defaultFeeSnapshot,
  ] = await Promise.all([
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
  ]);

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
  return commissionAccrued - commissionReversed - adjustment + defaultFee;
}

const NON_DRAFT_BOOKING_STATUSES = [
  "pending_provider_approval",
  "needs_provider_replacement",
  "waiting_for_down_payment",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
];

const ACTIVE_BOOKING_STATUSES = [
  "pending_provider_approval",
  "needs_provider_replacement",
  "waiting_for_down_payment",
  "confirmed",
  "in_progress",
];

function formatActorNameFromUserDoc(data: Record<string, unknown> | undefined): string {
  if (!data) return "";
  const first = stringValue(data.firstName, "");
  const last = stringValue(data.lastName, "");
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return stringValue(data.displayName, "") || stringValue(data.email, "");
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [
    settingsSnapshot,
    feastaRevenueInCentavos,
    totalBookingsSnapshot,
    activeBookingsSnapshot,
    completedBookingsSnapshot,
    customersSnapshot,
    providersSnapshot,
    submittedApprovalsSnapshot,
    underReviewApprovalsSnapshot,
    openComplaintsSnapshot,
    pendingPaymentsSnapshot,
    failedExpiredPaymentsSnapshot,
    providerData,
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

    getAdminFeastaRevenueInCentavos(),
    adminDb.collection(FIRESTORE_COLLECTIONS.mainEvents)
      .where("status", "in", NON_DRAFT_BOOKING_STATUSES)
      .count()
      .get(),
    adminDb.collection(FIRESTORE_COLLECTIONS.mainEvents)
      .where("status", "in", ACTIVE_BOOKING_STATUSES)
      .count()
      .get(),
    adminDb.collection(FIRESTORE_COLLECTIONS.mainEvents)
      .where("status", "==", "completed")
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

    getProviderPerformanceData(),
    adminDb.collection(FIRESTORE_COLLECTIONS.reviews)
      .where("isDeleted", "==", false)
      .where("isReported", "==", true)
      .count()
      .get(),

    adminDb
      .collection(FIRESTORE_COLLECTIONS.adminLogs)
      .orderBy("createdAt", "desc")
      .limit(40)
      .get(),

    getRevenueByRange(),
  ]);

  const settings =
    settingsSnapshot.data() ?? {};

  const customerAccounts =
    customersSnapshot.data().count;

  const providerAccounts =
    providersSnapshot.data().count;

  const meaningfulActivityDocs = activitiesSnapshot.docs
    .filter((document) => {
      const action = stringValue(document.data().action, "");
      return action ? isMeaningfulAuditLog({ action }) : false;
    })
    .slice(0, 6);

  const actorIdsToHydrate = [
    ...new Set(
      meaningfulActivityDocs
        .map((document) => {
          const data = document.data();
          const role = stringValue(data.actorRole, "").toLowerCase();
          const actorId = stringValue(data.actorId, "");
          if (
            !actorId ||
            role === "system" ||
            actorId === "system" ||
            !/^[A-Za-z0-9_-]{1,150}$/u.test(actorId)
          ) {
            return "";
          }
          return actorId;
        })
        .filter(Boolean),
    ),
  ];

  const actorNamesById = new Map<string, string>();
  if (actorIdsToHydrate.length > 0) {
    const snapshots = await Promise.all(
      actorIdsToHydrate.map(async (actorId) => {
        const snapshot = await adminDb
          .collection(FIRESTORE_COLLECTIONS.users)
          .doc(actorId)
          .get();
        return [actorId, formatActorNameFromUserDoc(snapshot.data() as Record<string, unknown> | undefined)] as const;
      }),
    );
    for (const [actorId, actorName] of snapshots) {
      if (actorName) actorNamesById.set(actorId, actorName);
    }
  }

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
        "Provider Performance",
      ),

      operationsOverviewTitle: stringValue(
        settings.operationsOverviewTitle,
        "Operations Overview",
      ),

      recentActivitiesTitle: stringValue(
        settings.recentActivitiesTitle,
        "Recent Activity",
      ),
    },

    statistics: {
      feastaRevenueInCentavos,
      totalUsers: customerAccounts + providerAccounts,
      totalBookings: totalBookingsSnapshot.data().count,
      activeBookings: activeBookingsSnapshot.data().count,
      completedBookings: completedBookingsSnapshot.data().count,
      verificationQueue:
        submittedApprovalsSnapshot.data().count + underReviewApprovalsSnapshot.data().count,
      revenueLast30DaysInCentavos: revenueByRange["1M"].reduce(
        (total, point) => total + point.revenueInCentavos, 0,
      ),
      customerAccounts,
      providerAccounts,
      submittedApprovals: submittedApprovalsSnapshot.data().count,
      underReviewApprovals: underReviewApprovalsSnapshot.data().count,
    },

    revenueByRange,

    providerPerformance: providerData.providerPerformance,
    topProviders: providerData.topProviders,

    operationsOverview: {
      pendingProcessingPayments: pendingPaymentsSnapshot.data().count,
      failedExpiredPayments: failedExpiredPaymentsSnapshot.data().count,
      reportedReviews: reportedReviewsSnapshot.data().count,
      openComplaints: openComplaintsSnapshot.data().count,
    },

    recentActivities: meaningfulActivityDocs.map((document) => {
      const data = document.data();
      const action = stringValue(data.action, "Administrative activity");
      const entity = stringValue(
        data.targetCollection,
        stringValue(data.entity, "platform"),
      );
      const actorId = stringValue(data.actorId, "");
      const actorRole = stringValue(data.actorRole, "").toLowerCase();
      const actorName =
        actorRole === "system" || actorId === "system"
          ? "FEASTA System"
          : actorNamesById.get(actorId) ||
            stringValue(data.actorName, "") ||
            (actorRole ? actorRole.charAt(0).toUpperCase() + actorRole.slice(1) : "Administrator");

      return {
        id: document.id,
        action,
        actionLabel: formatAuditAction(action),
        entity,
        entityLabel: entity === "platform" ? "Platform" : formatAuditRecordType(entity),
        actorName,
        createdAt: timestampToDate(data.createdAt),
        href: `/admin/audit-logs/${document.id}`,
      };
    }),
  };
}
