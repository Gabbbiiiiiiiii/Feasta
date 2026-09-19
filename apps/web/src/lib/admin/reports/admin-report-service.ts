import "server-only";

import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {
  MAIN_EVENT_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PROVIDER_REQUEST_STATUSES,
  type MainEventStatus,
  type PaymentStatus,
  type PaymentType,
  type ProviderRequestStatus,
  type ProviderRequestType,
  type ProviderServiceType,
} from "@feasta/shared-types";

import {
  ADMIN_REPORT_CURRENCY,
  ADMIN_REPORT_DEFINITIONS,
  ADMIN_REPORT_TIME_ZONE,
  type AdminBookingFunnelStage,
  type AdminBookingTrendPoint,
  type AdminPaymentTrendPoint,
  type AdminProviderPerformanceRow,
  type AdminReportFilters,
  type AdminReportResult,
  type AdminReportResolvedPeriod,
} from "@/lib/admin/reports/admin-report-types";
import {
  createAdminReportMetric,
  createAdminReportMoneyMetric,
  createAdminReportRateMetric,
  deriveAdminPaymentFinancials,
  formatAdminReportCentavos,
  resolveAdminReportFilters,
} from "@/lib/admin/reports/admin-report-policy";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const COLLECTIONS = {
  mainEvents: "mainEvents",
  providerRequests: "providerRequests",
  payments: "payments",
  providers: "providers",
} as const;

const REPORT_CACHE_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 20;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type RawMainEvent = {
  id: string;
  customerId: string;
  eventType: string;
  city: string;
  status: MainEventStatus | null;
  eventDate: Date | null;
  createdAt: Date;
};

type RawProviderRequest = {
  id: string;
  mainEventId: string;
  providerId: string;
  type: ProviderRequestType | null;
  status: ProviderRequestStatus | null;
  createdAt: Date;
  respondedAt: Date | null;
};

type RawPayment = {
  id: string;
  bookingId: string;
  providerId: string;
  paymentType: PaymentType | null;
  status: PaymentStatus | null;
  amountInCentavos: number;
  lastWebhookEventId: string | null;
  createdAt: Date;
};

type RawProvider = {
  id: string;
  name: string;
  serviceType: ProviderServiceType;
  category: string | null;
  ratingAverage: number;
  reviewCount: number;
};

type ReportSource = {
  events: RawMainEvent[];
  requests: RawProviderRequest[];
  payments: RawPayment[];
  providers: Map<string, RawProvider>;
};

type PeriodData = {
  events: RawMainEvent[];
  requests: RawProviderRequest[];
  payments: RawPayment[];
};

type ReportCacheEntry = {
  expiresAt: number;
  promise: Promise<AdminReportResult>;
};

const reportCache = new Map<string, ReportCacheEntry>();

export async function getAdminReport(
  input: AdminReportFilters,
): Promise<AdminReportResult> {
  await requireAdmin();

  const resolved = resolveAdminReportFilters(input);
  const cacheKey = JSON.stringify(resolved);
  const now = Date.now();
  const cached = reportCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;

  pruneReportCache(now);
  const promise = queryAdminReport(resolved);
  reportCache.set(cacheKey, {expiresAt: now + REPORT_CACHE_MS, promise});
  void promise.catch(() => {
    if (reportCache.get(cacheKey)?.promise === promise) {
      reportCache.delete(cacheKey);
    }
  });
  return promise;
}

async function queryAdminReport(
  filters: ReturnType<typeof resolveAdminReportFilters>,
): Promise<AdminReportResult> {
  const source = await loadReportSource(
    filters.period,
    filters.comparisonPeriod,
  );
  const current = applyReportFilters(
    selectPeriod(source, filters.period),
    source.providers,
    filters,
  );
  const previous = filters.comparisonPeriod
    ? applyReportFilters(
        selectPeriod(source, filters.comparisonPeriod),
        source.providers,
        filters,
      )
    : null;

  return {
    generatedAt: new Date().toISOString(),
    currency: ADMIN_REPORT_CURRENCY,
    timeZone: ADMIN_REPORT_TIME_ZONE,
    filters,
    executive: buildExecutiveSummary(current, previous),
    bookings: buildBookingPerformance(current, filters.period, filters.grouping),
    payments: buildPaymentPerformance(
      current,
      previous,
      filters.period,
      filters.grouping,
    ),
    providers: buildProviderPerformance(current, source.providers),
    definitions: [...ADMIN_REPORT_DEFINITIONS],
  };
}

async function loadReportSource(
  period: AdminReportResolvedPeriod,
  comparison: AdminReportResolvedPeriod | null,
): Promise<ReportSource> {
  const rangeStart = new Date(
    comparison && comparison.startAt < period.startAt
      ? comparison.startAt
      : period.startAt,
  );
  const rangeEnd = new Date(
    comparison && comparison.endAtExclusive > period.endAtExclusive
      ? comparison.endAtExclusive
      : period.endAtExclusive,
  );
  const startTimestamp = Timestamp.fromDate(rangeStart);
  const endTimestamp = Timestamp.fromDate(rangeEnd);

  const [eventSnapshot, requestSnapshot, paymentSnapshot] = await Promise.all([
    adminDb.collection(COLLECTIONS.mainEvents)
      .where("createdAt", ">=", startTimestamp)
      .where("createdAt", "<", endTimestamp)
      .select(
        "customerId",
        "eventType",
        "city",
        "status",
        "eventDate",
        "createdAt",
      )
      .get(),
    adminDb.collection(COLLECTIONS.providerRequests)
      .where("createdAt", ">=", startTimestamp)
      .where("createdAt", "<", endTimestamp)
      .select(
        "mainEventId",
        "providerId",
        "type",
        "status",
        "createdAt",
        "respondedAt",
      )
      .get(),
    adminDb.collection(COLLECTIONS.payments)
      .where("createdAt", ">=", startTimestamp)
      .where("createdAt", "<", endTimestamp)
      .select(
        "bookingId",
        "mainEventId",
        "providerId",
        "paymentType",
        "status",
        "amountInCentavos",
        "amount",
        "lastWebhookEventId",
        "createdAt",
      )
      .get(),
  ]);

  const events = eventSnapshot.docs.flatMap(mapMainEvent);
  const requests = requestSnapshot.docs.flatMap(mapProviderRequest);
  const payments = paymentSnapshot.docs.flatMap(mapPayment);
  const providerIds = new Set<string>();
  for (const request of requests) providerIds.add(request.providerId);
  for (const payment of payments) providerIds.add(payment.providerId);

  return {
    events,
    requests,
    payments,
    providers: await loadProviders(providerIds),
  };
}

function selectPeriod(
  source: ReportSource,
  period: AdminReportResolvedPeriod,
): PeriodData {
  const start = new Date(period.startAt).getTime();
  const end = new Date(period.endAtExclusive).getTime();
  const inside = (date: Date) => {
    const value = date.getTime();
    return value >= start && value < end;
  };
  return {
    events: source.events.filter((event) => inside(event.createdAt)),
    requests: source.requests.filter((request) => inside(request.createdAt)),
    payments: source.payments.filter((payment) => inside(payment.createdAt)),
  };
}

function applyReportFilters(
  data: PeriodData,
  providers: Map<string, RawProvider>,
  filters: ReturnType<typeof resolveAdminReportFilters>,
): PeriodData {
  const eventMatches = (event: RawMainEvent) =>
    (filters.eventType === "all" || event.eventType === filters.eventType) &&
    (filters.city === "all" || event.city === filters.city) &&
    (filters.bookingStatus === "all" || event.status === filters.bookingStatus);
  const providerMatches = (providerId: string) => {
    if (filters.providerServiceType === "all") return true;
    const provider = providers.get(providerId);
    return provider?.serviceType === filters.providerServiceType ||
      provider?.serviceType === "both";
  };

  const baseEvents = data.events.filter(eventMatches);
  const baseEventIds = new Set(baseEvents.map((event) => event.id));
  const eventFilterActive = filters.eventType !== "all" ||
    filters.city !== "all" || filters.bookingStatus !== "all";
  const requests = data.requests.filter((request) =>
    (!eventFilterActive || baseEventIds.has(request.mainEventId)) &&
    providerMatches(request.providerId) &&
    (filters.providerRequestType === "all" ||
      request.type === filters.providerRequestType),
  );
  const providerScoped = filters.providerServiceType !== "all" ||
    filters.providerRequestType !== "all";
  const scopedEventIds = new Set(requests.map((request) => request.mainEventId));
  const events = providerScoped
    ? baseEvents.filter((event) => scopedEventIds.has(event.id))
    : baseEvents;
  const finalEventIds = new Set(events.map((event) => event.id));
  const payments = data.payments.filter((payment) =>
    (!eventFilterActive || finalEventIds.has(payment.bookingId)) &&
    providerMatches(payment.providerId) &&
    (filters.paymentStatus === "all" || payment.status === filters.paymentStatus),
  );

  return {
    events,
    requests: requests.filter((request) => finalEventIds.has(request.mainEventId)),
    payments,
  };
}

function buildExecutiveSummary(current: PeriodData, previous: PeriodData | null) {
  const currentPayment = paymentTotals(current.payments);
  const previousPayment = previous ? paymentTotals(previous.payments) : null;
  const currentNonDraft = current.events.filter((event) => event.status !== "draft");
  const previousNonDraft = previous?.events.filter((event) => event.status !== "draft") ?? [];

  return {
    totalBookings: metric(current.events.length, previous?.events.length),
    confirmedBookings: metric(
      countStatus(current.events, "confirmed"),
      previous ? countStatus(previous.events, "confirmed") : null,
    ),
    completedEvents: metric(
      countStatus(current.events, "completed"),
      previous ? countStatus(previous.events, "completed") : null,
    ),
    cancellationRate: createAdminReportRateMetric(
      countStatus(current.events, "cancelled"),
      currentNonDraft.length,
      previous
        ? rate(countStatus(previous.events, "cancelled"), previousNonDraft.length)
        : null,
    ),
    activeCustomers: metric(
      unique(currentNonDraft.map((event) => event.customerId)),
      previous ? unique(previousNonDraft.map((event) => event.customerId)) : null,
    ),
    activeProviders: metric(
      unique(current.requests.map((request) => request.providerId)),
      previous ? unique(previous.requests.map((request) => request.providerId)) : null,
    ),
    confirmedPaymentVolume: createAdminReportMoneyMetric(
      currentPayment.paidAmount,
      previousPayment?.paidAmount ?? null,
    ),
    averagePaidPayment: createAdminReportMoneyMetric(
      averageCentavos(currentPayment.paidAmount, currentPayment.paidCount),
      previousPayment
        ? averageCentavos(previousPayment.paidAmount, previousPayment.paidCount)
        : null,
    ),
  };
}

function buildBookingPerformance(
  data: PeriodData,
  period: AdminReportResolvedPeriod,
  grouping: ReturnType<typeof resolveAdminReportFilters>["grouping"],
) {
  const total = data.events.length;
  const responseMinutes = data.requests.flatMap((request) => {
    if (!request.respondedAt) return [];
    const minutes = (request.respondedAt.getTime() - request.createdAt.getTime()) / 60000;
    return Number.isFinite(minutes) && minutes >= 0 ? [minutes] : [];
  });
  const acceptedStatuses: ProviderRequestStatus[] = [
    "accepted", "waiting_for_down_payment", "payment_processing",
    "confirmed", "in_progress", "completed",
  ];
  const accepted = data.requests.filter((request) =>
    request.status !== null && acceptedStatuses.includes(request.status),
  ).length;
  const rejected = countStatus(data.requests, "rejected");
  const leadTimes = data.events.flatMap((event) => {
    if (!event.eventDate) return [];
    const days = (event.eventDate.getTime() - event.createdAt.getTime()) / DAY_MS;
    return Number.isFinite(days) && days >= 0 ? [days] : [];
  });

  return {
    statusDistribution: MAIN_EVENT_STATUSES.map((status) => {
      const count = countStatus(data.events, status);
      return {status, count, percentage: rate(count, total)};
    }),
    trend: buildBookingTrend(data.events, period, grouping),
    funnel: buildBookingFunnel(data),
    providerRequests: {
      totalRequests: data.requests.length,
      byStatus: PROVIDER_REQUEST_STATUSES.map((status) => {
        const count = countStatus(data.requests, status);
        return {status, count, percentage: rate(count, data.requests.length)};
      }),
      acceptanceRate: createAdminReportRateMetric(accepted, data.requests.length),
      rejectionRate: createAdminReportRateMetric(rejected, data.requests.length),
      averageResponseTimeInMinutes: average(responseMinutes),
    },
    averageLeadTimeInDays: average(leadTimes),
  };
}

function buildPaymentPerformance(
  current: PeriodData,
  previous: PeriodData | null,
  period: AdminReportResolvedPeriod,
  grouping: ReturnType<typeof resolveAdminReportFilters>["grouping"],
) {
  const totals = paymentTotals(current.payments);
  const previousTotals = previous ? paymentTotals(previous.payments) : null;
  const financials = deriveAdminPaymentFinancials({
    paidCount: totals.paidCount,
    paidAmountInCentavos: totals.paidAmount,
    refundedCount: totals.refundedCount,
    refundedAmountInCentavos: totals.refundedAmount,
    failedCount: totals.failedCount,
    expiredCount: totals.expiredCount,
  });
  const previousFinancials = previousTotals
    ? deriveAdminPaymentFinancials({
        paidCount: previousTotals.paidCount,
        paidAmountInCentavos: previousTotals.paidAmount,
        refundedCount: previousTotals.refundedCount,
        refundedAmountInCentavos: previousTotals.refundedAmount,
        failedCount: previousTotals.failedCount,
        expiredCount: previousTotals.expiredCount,
      })
    : null;
  const awaitingWebhook = current.payments.filter((payment) =>
    payment.status === "processing" && !payment.lastWebhookEventId,
  ).length;
  const previousAwaiting = previous?.payments.filter((payment) =>
    payment.status === "processing" && !payment.lastWebhookEventId,
  ).length ?? null;

  return {
    createdPayments: metric(current.payments.length, previous?.payments.length),
    currentlyPaidPayments: metric(totals.paidCount, previousTotals?.paidCount),
    successfulPaymentAttempts: metric(
      financials.successfulPaymentAttempts,
      previousFinancials?.successfulPaymentAttempts,
    ),
    grossCollectedVolume: createAdminReportMoneyMetric(
      financials.grossCollectedVolumeInCentavos,
      previousFinancials?.grossCollectedVolumeInCentavos ?? null,
    ),
    confirmedPaymentVolume: createAdminReportMoneyMetric(
      financials.confirmedPaymentVolumeInCentavos,
      previousFinancials?.confirmedPaymentVolumeInCentavos ?? null,
    ),
    providerAssociatedVolume: createAdminReportMoneyMetric(
      financials.providerAssociatedVolumeInCentavos,
      previousFinancials?.providerAssociatedVolumeInCentavos ?? null,
    ),
    refundedAmount: createAdminReportMoneyMetric(
      totals.refundedAmount,
      previousTotals?.refundedAmount ?? null,
    ),
    averagePaidPayment: createAdminReportMoneyMetric(
      averageCentavos(totals.paidAmount, totals.paidCount),
      previousTotals
        ? averageCentavos(previousTotals.paidAmount, previousTotals.paidCount)
        : null,
    ),
    pendingOrProcessing: metric(
      totals.pendingCount + totals.processingCount,
      previousTotals
        ? previousTotals.pendingCount + previousTotals.processingCount
        : null,
    ),
    failedOrExpired: metric(
      totals.failedCount + totals.expiredCount,
      previousTotals
        ? previousTotals.failedCount + previousTotals.expiredCount
        : null,
    ),
    awaitingWebhookConfirmation: metric(awaitingWebhook, previousAwaiting),
    paymentSuccessRate: createAdminReportRateMetric(
      financials.successfulPaymentAttempts,
      financials.finalizedPaymentAttempts,
      previousFinancials?.paymentSuccessRate ?? null,
    ),
    refundRate: createAdminReportRateMetric(
      totals.refundedCount,
      financials.successfulPaymentAttempts,
      previousFinancials?.refundRate ?? null,
    ),
    byStatus: PAYMENT_STATUSES.map((status) => {
      const matching = current.payments.filter((payment) => payment.status === status);
      const amountInCentavos = sum(matching.map((payment) => payment.amountInCentavos));
      return {
        status,
        count: matching.length,
        amountInCentavos,
        formattedAmount: formatAdminReportCentavos(amountInCentavos),
      };
    }),
    byType: PAYMENT_TYPES.map((paymentType) => {
      const matching = current.payments.filter(
        (payment) => payment.paymentType === paymentType,
      );
      const amountInCentavos = sum(matching.map((payment) => payment.amountInCentavos));
      return {
        paymentType,
        count: matching.length,
        amountInCentavos,
        formattedAmount: formatAdminReportCentavos(amountInCentavos),
      };
    }),
    trend: buildPaymentTrend(current.payments, period, grouping),
    platformRevenue: {
      status: "not_configured" as const,
      grossPlatformFeeInCentavos: null,
      processingFeeInCentavos: null,
      netPlatformRevenueInCentavos: null,
      explanation:
        "FEASTA does not yet persist commission, processing-fee allocation, or provider-payout records. These values cannot be calculated accurately.",
    },
  };
}

function buildProviderPerformance(
  data: PeriodData,
  providers: Map<string, RawProvider>,
) {
  const providerIds = new Set([
    ...data.requests.map((request) => request.providerId),
    ...data.payments.map((payment) => payment.providerId),
  ]);
  const rows: AdminProviderPerformanceRow[] = [];
  for (const providerId of providerIds) {
    const provider = providers.get(providerId);
    if (!provider) continue;
    const requests = data.requests.filter((request) => request.providerId === providerId);
    const payments = data.payments.filter((payment) =>
      payment.providerId === providerId && payment.status === "paid",
    );
    const accepted = requests.filter((request) => request.status !== null && [
      "accepted", "waiting_for_down_payment", "payment_processing",
      "confirmed", "in_progress", "completed",
    ].includes(request.status)).length;
    const rejected = countStatus(requests, "rejected");
    const cancelled = countStatus(requests, "cancelled");
    const responseTimes = requests.flatMap((request) => request.respondedAt
      ? [(request.respondedAt.getTime() - request.createdAt.getTime()) / 60000]
      : [],
    ).filter((value) => Number.isFinite(value) && value >= 0);
    const paidVolume = sum(payments.map((payment) => payment.amountInCentavos));
    rows.push({
      providerId,
      providerName: provider.name,
      serviceType: provider.serviceType,
      providerCategory: provider.category,
      requestsReceived: requests.length,
      acceptedRequests: accepted,
      rejectedRequests: rejected,
      confirmedBookings: countStatus(requests, "confirmed"),
      completedEvents: countStatus(requests, "completed"),
      cancelledRequests: cancelled,
      acceptanceRate: rate(accepted, requests.length),
      rejectionRate: rate(rejected, requests.length),
      cancellationRate: rate(cancelled, requests.length),
      averageResponseTimeInMinutes: average(responseTimes),
      averageRating: provider.ratingAverage,
      publishedReviewCount: provider.reviewCount,
      confirmedPaymentVolumeInCentavos: paidVolume,
      formattedConfirmedPaymentVolume: formatAdminReportCentavos(paidVolume),
    });
  }
  rows.sort((left, right) =>
    right.confirmedPaymentVolumeInCentavos - left.confirmedPaymentVolumeInCentavos ||
    right.completedEvents - left.completedEvents ||
    left.providerName.localeCompare(right.providerName),
  );
  return {providers: rows, minimumReviewsForRatingRanking: 3};
}

function buildBookingTrend(
  events: RawMainEvent[],
  period: AdminReportResolvedPeriod,
  grouping: ReturnType<typeof resolveAdminReportFilters>["grouping"],
): AdminBookingTrendPoint[] {
  return createBuckets(period, grouping).map((bucket) => {
    const matching = events.filter((event) => insideBucket(event.createdAt, bucket));
    return {
      ...bucket,
      created: matching.length,
      confirmed: countStatus(matching, "confirmed"),
      completed: countStatus(matching, "completed"),
      cancelled: countStatus(matching, "cancelled"),
      expired: countStatus(matching, "expired"),
    };
  });
}

function buildPaymentTrend(
  payments: RawPayment[],
  period: AdminReportResolvedPeriod,
  grouping: ReturnType<typeof resolveAdminReportFilters>["grouping"],
): AdminPaymentTrendPoint[] {
  return createBuckets(period, grouping).map((bucket) => {
    const matching = payments.filter((payment) => insideBucket(payment.createdAt, bucket));
    const totals = paymentTotals(matching);
    const financials = deriveAdminPaymentFinancials({
      paidCount: totals.paidCount,
      paidAmountInCentavos: totals.paidAmount,
      refundedCount: totals.refundedCount,
      refundedAmountInCentavos: totals.refundedAmount,
      failedCount: totals.failedCount,
      expiredCount: totals.expiredCount,
    });
    return {
      ...bucket,
      createdPayments: matching.length,
      successfulPayments: financials.successfulPaymentAttempts,
      failedOrExpiredPayments: totals.failedCount + totals.expiredCount,
      refundedPayments: totals.refundedCount,
      collectedVolumeInCentavos: financials.grossCollectedVolumeInCentavos,
      currentlyPaidVolumeInCentavos: totals.paidAmount,
      refundedAmountInCentavos: totals.refundedAmount,
      netProviderAssociatedVolumeInCentavos:
        financials.providerAssociatedVolumeInCentavos,
    };
  });
}

function buildBookingFunnel(data: PeriodData): AdminBookingFunnelStage[] {
  const created = data.events.length;
  const accepted = unique(data.requests.filter((request) => request.status !== null && [
    "accepted", "waiting_for_down_payment", "payment_processing",
    "confirmed", "in_progress", "completed",
  ].includes(request.status)).map((request) => request.mainEventId));
  const waiting = unique(data.requests.filter((request) =>
    request.status === "waiting_for_down_payment" ||
    request.status === "payment_processing",
  ).map((request) => request.mainEventId));
  const paid = unique(data.payments.filter((payment) =>
    payment.status === "paid" || payment.status === "refunded",
  ).map((payment) => payment.bookingId));
  const values = [
    ["booking_created", "Booking created", created],
    ["provider_accepted", "Provider accepted", accepted],
    ["waiting_for_payment", "Waiting for payment", waiting],
    ["payment_completed", "Payment completed", paid],
    ["booking_confirmed", "Booking confirmed", countStatus(data.events, "confirmed")],
    ["event_completed", "Event completed", countStatus(data.events, "completed")],
  ] as const;
  return values.map(([id, label, count], index): AdminBookingFunnelStage => ({
    id,
    label,
    count,
    conversionFromPrevious: index === 0 ? null : rate(count, values[index - 1][2]),
    conversionFromCreated: rate(count, created),
  }));
}

type TrendBucket = {
  periodStart: string;
  periodEndExclusive: string;
  label: string;
};

function createBuckets(
  period: AdminReportResolvedPeriod,
  grouping: ReturnType<typeof resolveAdminReportFilters>["grouping"],
): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  let cursor = new Date(period.startAt);
  const end = new Date(period.endAtExclusive);
  while (cursor < end) {
    const next = nextBucket(cursor, grouping);
    const bucketEnd = next < end ? next : end;
    buckets.push({
      periodStart: cursor.toISOString(),
      periodEndExclusive: bucketEnd.toISOString(),
      label: bucketLabel(cursor, bucketEnd, grouping),
    });
    cursor = next;
  }
  return buckets;
}

function nextBucket(date: Date, grouping: "day" | "week" | "month"): Date {
  if (grouping === "day") return new Date(date.getTime() + DAY_MS);
  if (grouping === "week") return new Date(date.getTime() + 7 * DAY_MS);
  const parts = manilaParts(date);
  return manilaDate(parts.year, parts.month + 1, 1);
}

function bucketLabel(start: Date, end: Date, grouping: "day" | "week" | "month") {
  const options: Intl.DateTimeFormatOptions = grouping === "month"
    ? {month: "short", year: "numeric", timeZone: ADMIN_REPORT_TIME_ZONE}
    : {month: "short", day: "numeric", timeZone: ADMIN_REPORT_TIME_ZONE};
  const formatter = new Intl.DateTimeFormat("en-PH", options);
  if (grouping !== "week") return formatter.format(start);
  return `${formatter.format(start)} – ${formatter.format(new Date(end.getTime() - 1))}`;
}

function insideBucket(date: Date, bucket: TrendBucket) {
  const value = date.getTime();
  return value >= new Date(bucket.periodStart).getTime() &&
    value < new Date(bucket.periodEndExclusive).getTime();
}

async function loadProviders(ids: Set<string>): Promise<Map<string, RawProvider>> {
  const references = [...ids].map((id) => adminDb.collection(COLLECTIONS.providers).doc(id));
  if (references.length === 0) return new Map();
  const snapshots = await adminDb.getAll(...references);
  const providers = new Map<string, RawProvider>();
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    const data = snapshot.data() ?? {};
    const serviceType = providerServiceType(data.providerServiceType);
    if (!serviceType) continue;
    providers.set(snapshot.id, {
      id: snapshot.id,
      name: text(data.businessName, "Unnamed provider"),
      serviceType,
      category: nullableText(data.providerCategory),
      ratingAverage: nonNegativeNumber(data.ratingAverage),
      reviewCount: safeCount(data.reviewCount),
    });
  }
  return providers;
}

function mapMainEvent(document: QueryDocumentSnapshot<DocumentData>): RawMainEvent[] {
  const data = document.data();
  const createdAt = dateValue(data.createdAt);
  if (!createdAt) return [];
  return [{
    id: document.id,
    customerId: text(data.customerId),
    eventType: text(data.eventType),
    city: text(data.city),
    status: enumValue(data.status, MAIN_EVENT_STATUSES),
    eventDate: dateValue(data.eventDate),
    createdAt,
  }];
}

function mapProviderRequest(
  document: QueryDocumentSnapshot<DocumentData>,
): RawProviderRequest[] {
  const data = document.data();
  const createdAt = dateValue(data.createdAt);
  const mainEventId = text(data.mainEventId);
  const providerId = text(data.providerId);
  if (!createdAt || !mainEventId || !providerId) return [];
  return [{
    id: document.id,
    mainEventId,
    providerId,
    type: enumValue(data.type, ["catering", "addon"] as const),
    status: enumValue(data.status, PROVIDER_REQUEST_STATUSES),
    createdAt,
    respondedAt: dateValue(data.respondedAt),
  }];
}

function mapPayment(document: QueryDocumentSnapshot<DocumentData>): RawPayment[] {
  const data = document.data();
  const createdAt = dateValue(data.createdAt);
  const bookingId = text(data.bookingId ?? data.mainEventId);
  const providerId = text(data.providerId);
  if (!createdAt || !bookingId || !providerId) return [];
  const legacyAmount = nonNegativeNumber(data.amount);
  const centavos = safeCount(data.amountInCentavos) || Math.round(legacyAmount * 100);
  return [{
    id: document.id,
    bookingId,
    providerId,
    paymentType: enumValue(data.paymentType, PAYMENT_TYPES),
    status: enumValue(data.status, PAYMENT_STATUSES),
    amountInCentavos: Number.isSafeInteger(centavos) && centavos > 0 ? centavos : 0,
    lastWebhookEventId: nullableText(data.lastWebhookEventId),
    createdAt,
  }];
}

function paymentTotals(payments: RawPayment[]) {
  const paid = payments.filter((payment) => payment.status === "paid");
  const refunded = payments.filter((payment) => payment.status === "refunded");
  return {
    paidCount: paid.length,
    refundedCount: refunded.length,
    pendingCount: countStatus(payments, "pending"),
    processingCount: countStatus(payments, "processing"),
    failedCount: countStatus(payments, "failed"),
    expiredCount: countStatus(payments, "expired"),
    paidAmount: sum(paid.map((payment) => payment.amountInCentavos)),
    refundedAmount: sum(refunded.map((payment) => payment.amountInCentavos)),
  };
}

function metric(value: number, previous: number | null | undefined) {
  return createAdminReportMetric(value, previous ?? null);
}

function countStatus<T extends {status: string | null}>(items: T[], status: string) {
  return items.filter((item) => item.status === status).length;
}

function unique(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function averageCentavos(total: number, count: number): number {
  return count === 0 ? 0 : Math.round(total / count);
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator * 100;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value as T[number]
    : null;
}

function providerServiceType(value: unknown): ProviderServiceType | null {
  return enumValue(value, ["catering", "addon", "both"] as const);
}

function manilaParts(date: Date) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
  };
}

function manilaDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - MANILA_OFFSET_MS);
}

function pruneReportCache(now: number) {
  for (const [key, entry] of reportCache) {
    if (entry.expiresAt <= now) reportCache.delete(key);
  }
  while (reportCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = reportCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    reportCache.delete(oldestKey);
  }
}