import "server-only";

import {
  Timestamp,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {
  MAIN_EVENT_STATUSES,
  PAYMENT_STATUSES,
  type MainEventStatus,
  type PaymentStatus,
  type PaymentType,
} from "@feasta/shared-types";

import {
  adminBookingPaymentLabel,
  adminBookingStatusLabel,
} from "@/lib/admin/bookings/admin-booking-labels";
import {bookingPaymentAccounting} from "@/lib/admin/bookings/booking-payment-accounting";
import {
  DEFAULT_BOOKINGS_REPORT_FILTERS,
  DEFAULT_FEE_WITHDRAWALS_FILTERS,
  DEFAULT_PROVIDER_PERFORMANCE_FILTERS,
  DEFAULT_SERVICE_FEES_FILTERS,
  DEFAULT_USERS_DIRECTORY_FILTERS,
  type AdminReportModuleDatePreset,
  type AdminReportModulePayload,
  type AdminReportModuleRequest,
  type BookingReportRow,
  type BookingsReportFilters,
  type BookingsReportPayload,
  type DateFilterFields,
  type FeeWithdrawalReportRow,
  type FeeWithdrawalsReportFilters,
  type FeeWithdrawalsReportPayload,
  type ProviderPerformanceReportFilters,
  type ProviderPerformanceReportPayload,
  type ProviderPerformanceReportRow,
  type ServiceFeeReportRow,
  type ServiceFeesReportFilters,
  type ServiceFeesReportPayload,
  type UserDirectoryStatus,
  type UsersDirectoryReportFilters,
  type UsersDirectoryReportPayload,
  type UsersDirectoryReportRow,
} from "@/lib/admin/reports/admin-report-modules-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {formatPaymentPurpose} from "@/lib/payments/payment-purpose";
import {getServiceCategoryOptions} from "@/lib/service-categories/service-category-service";
import {serviceCategoryName} from "@/lib/service-categories/service-category-types";

const MAX_RECORDS = 5_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_DAYS = 366;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Manila",
});

type ResolvedDateWindow = {
  start: Date | null;
  endExclusive: Date | null;
  label: string;
};

export async function getAdminReportModule(
  request: AdminReportModuleRequest,
): Promise<AdminReportModulePayload> {
  await requireAdmin();

  switch (request.module) {
    case "service_fees":
      return queryServiceFeesReport(request.filters);
    case "fee_withdrawals":
      return queryFeeWithdrawalsReport(request.filters);
    case "bookings":
      return queryBookingsReport(request.filters);
    case "providers":
      return queryProviderPerformanceReport(request.filters);
    case "users":
      return queryUsersDirectoryReport(request.filters);
  }
}

export async function getInitialAdminReportsModule(): Promise<ServiceFeesReportPayload> {
  await requireAdmin();
  return queryServiceFeesReport(DEFAULT_SERVICE_FEES_FILTERS);
}

async function queryServiceFeesReport(
  rawFilters: ServiceFeesReportFilters,
): Promise<ServiceFeesReportPayload> {
  const filters: ServiceFeesReportFilters = {
    ...DEFAULT_SERVICE_FEES_FILTERS,
    ...rawFilters,
  };
  const window = resolveDateWindow(filters);

  const [paymentDocs, ledgerDocs, eventDocs, userDocs, providerDocs] =
    await Promise.all([
      readBounded(
        adminDb
          .collection("payments")
          .select(
            "bookingId",
            "mainEventId",
            "customerId",
            "providerId",
            "paymentType",
            "paymentChoice",
            "status",
            "amountInCentavos",
            "amount",
            "commissionAccruedInCentavos",
            "refundedAmountInCentavos",
            "paidAt",
            "createdAt",
            "financialLedgerSchemaVersion",
            "financialLedgerEntryId",
            "currency",
          ),
      ),
      readBounded(
        adminDb
          .collection("financialLedgerEntries")
          .select(
            "entryType",
            "paymentId",
            "commissionAccruedInCentavos",
            "commissionReversedInCentavos",
            "feastaCancellationFeeEarnedInCentavos",
          ),
      ),
      readBounded(
        adminDb
          .collection("mainEvents")
          .select("bookingCode", "referenceCode"),
      ),
      readBounded(
        adminDb
          .collection("users")
          .select("fullName", "firstName", "lastName", "displayName"),
      ),
      readBounded(
        adminDb.collection("providers").select("businessName"),
      ),
    ]);

  const bookingCodes = new Map<string, string>();
  for (const doc of eventDocs) {
    const code = text(doc.get("bookingCode")) || text(doc.get("referenceCode"));
    if (code) bookingCodes.set(doc.id, code);
  }
  const customerNames = new Map<string, string>();
  for (const doc of userDocs) {
    customerNames.set(doc.id, personName(doc.data()));
  }
  const providerNames = new Map<string, string>();
  for (const doc of providerDocs) {
    const name = text(doc.get("businessName"));
    if (name) providerNames.set(doc.id, name);
  }

  const ledgerByPayment = new Map<
    string,
    {accrued: number; reversed: number; cancellationFee: number; hasRefundEntry: boolean}
  >();
  for (const doc of ledgerDocs) {
    const data = doc.data();
    const paymentId = text(data.paymentId);
    if (!paymentId) continue;
    const entry = ledgerByPayment.get(paymentId) ?? {
      accrued: 0,
      reversed: 0,
      cancellationFee: 0,
      hasRefundEntry: false,
    };
    const accrued = nonNegativeInt(data.commissionAccruedInCentavos);
    const reversed = nonNegativeInt(data.commissionReversedInCentavos);
    const cancellationFee = nonNegativeInt(data.feastaCancellationFeeEarnedInCentavos);
    if (data.entryType === "refund_completed") {
      entry.hasRefundEntry = true;
      entry.reversed += reversed;
      entry.cancellationFee += cancellationFee;
    } else if (accrued > 0) {
      entry.accrued = Math.max(entry.accrued, accrued);
    }
    ledgerByPayment.set(paymentId, entry);
  }

  const feeStatuses = new Set<"paid" | "partially_refunded" | "refunded">([
    "paid",
    "partially_refunded",
    "refunded",
  ]);
  const presentFeeStatuses = new Set<"paid" | "partially_refunded" | "refunded">();
  type SortableFeeRow = ServiceFeeReportRow & {
    sortMillis: number;
    feeEarned: number;
    feeRefunded: number;
    netFee: number;
  };
  const collected: SortableFeeRow[] = [];

  for (const doc of paymentDocs) {
    const data = doc.data();
    const rawStatus = text(data.status);
    if (
      rawStatus !== "paid" &&
      rawStatus !== "partially_refunded" &&
      rawStatus !== "refunded"
    ) {
      continue;
    }
    const status = rawStatus;
    if (!feeStatuses.has(status)) continue;

    const timestamp = dateValue(data.paidAt) ?? dateValue(data.createdAt);
    if (!inDateWindow(timestamp, window)) continue;
    presentFeeStatuses.add(status);

    if (filters.status !== "all" && status !== filters.status) continue;

    const amountInCentavos = canonicalCentavos(data);
    const ledger = ledgerByPayment.get(doc.id);
    const directCommission = nonNegativeInt(data.commissionAccruedInCentavos);
    const feeEarned = ledger && ledger.accrued > 0 ? ledger.accrued : directCommission;

    let feeRefunded = 0;
    let netFee = feeEarned;
    if (ledger?.hasRefundEntry) {
      feeRefunded = Math.min(feeEarned, ledger.reversed);
      netFee = Math.max(0, feeEarned - feeRefunded + ledger.cancellationFee);
    } else if (status === "refunded") {
      feeRefunded = feeEarned;
      netFee = 0;
    } else if (status === "partially_refunded" && amountInCentavos > 0) {
      const accounting = bookingPaymentAccounting({
        status,
        amountInCentavos,
        refundedAmountInCentavos: data.refundedAmountInCentavos,
      });
      if (accounting && accounting.refunded > 0) {
        feeRefunded = Math.min(
          feeEarned,
          Math.round((feeEarned * accounting.refunded) / amountInCentavos),
        );
        netFee = Math.max(0, feeEarned - feeRefunded);
      }
    }

    const bookingId = text(data.mainEventId) || text(data.bookingId);
    const bookingCode = bookingCodes.get(bookingId) ?? "Booking unavailable";
    const customerName = customerNames.get(text(data.customerId)) ?? "Unknown customer";
    const providerName = providerNames.get(text(data.providerId)) ?? "Unknown provider";
    const paymentChoice =
      data.paymentChoice === "full" ||
      data.paymentChoice === "minimum" ||
      data.paymentChoice === "remaining_balance"
        ? data.paymentChoice
        : null;
    const pType = (text(data.paymentType) || "provider_down_payment") as PaymentType;

    collected.push({
      id: doc.id,
      sortMillis: timestamp?.getTime() ?? 0,
      dateLabel: timestamp ? dateFormatter.format(timestamp) : "Unavailable",
      bookingCode,
      customerName,
      providerName,
      paymentTypeLabel: formatPaymentPurpose({
        paymentType: pType,
        paymentChoice,
      }),
      customerPaidFormatted: formatCentavos(amountInCentavos),
      feeEarnedFormatted: formatCentavos(feeEarned),
      feeRefundedFormatted: formatCentavos(feeRefunded),
      netFeeFormatted: formatCentavos(netFee),
      statusLabel: paymentStatusLabel(status),
      feeEarned,
      feeRefunded,
      netFee,
    });
  }

  collected.sort((left, right) => right.sortMillis - left.sortMillis);

  const grossFeeEarnedInCentavos = collected.reduce((sum, row) => sum + row.feeEarned, 0);
  const feeRefundedInCentavos = collected.reduce((sum, row) => sum + row.feeRefunded, 0);
  const netFeeInCentavos = collected.reduce((sum, row) => sum + row.netFee, 0);
  const availableStatuses = (
    ["paid", "partially_refunded", "refunded"] as const
  ).filter((status) => presentFeeStatuses.has(status));

  return {
    module: "service_fees",
    generatedAt: new Date().toISOString(),
    periodLabel: window.label,
    filters,
    availableStatuses,
    summary: {
      recordCount: collected.length,
      grossFeeEarnedInCentavos,
      grossFeeEarnedFormatted: formatCentavos(grossFeeEarnedInCentavos),
      feeRefundedInCentavos,
      feeRefundedFormatted: formatCentavos(feeRefundedInCentavos),
      netFeeInCentavos,
      netFeeFormatted: formatCentavos(netFeeInCentavos),
    },
    rows: collected.map((row) => ({
      id: row.id,
      dateLabel: row.dateLabel,
      bookingCode: row.bookingCode,
      customerName: row.customerName,
      providerName: row.providerName,
      paymentTypeLabel: row.paymentTypeLabel,
      customerPaidFormatted: row.customerPaidFormatted,
      feeEarnedFormatted: row.feeEarnedFormatted,
      feeRefundedFormatted: row.feeRefundedFormatted,
      netFeeFormatted: row.netFeeFormatted,
      statusLabel: row.statusLabel,
    })),
  };
}

async function queryFeeWithdrawalsReport(
  rawFilters: FeeWithdrawalsReportFilters,
): Promise<FeeWithdrawalsReportPayload> {
  const filters: FeeWithdrawalsReportFilters = {
    ...DEFAULT_FEE_WITHDRAWALS_FILTERS,
    ...rawFilters,
  };
  const window = resolveDateWindow(filters);

  const [withdrawalDocs, commissionSnapshot] = await Promise.all([
    readBounded(adminDb.collection("companyCommissionMockWithdrawals")),
    adminDb.collection("companyFinance").doc("commission").get(),
  ]);

  const commissionData = commissionSnapshot.exists
    ? commissionSnapshot.data() ?? {}
    : {};
  const currentAvailableInCentavos = nonNegativeInt(
    commissionData.availableBalanceInCentavos,
  );

  const presentMethods = new Set<"gcash" | "bank">();
  type SortableWithdrawalRow = FeeWithdrawalReportRow & {
    sortMillis: number;
    amountInCentavos: number;
  };
  const collected: SortableWithdrawalRow[] = [];

  for (const doc of withdrawalDocs) {
    const data = doc.data();
    const amountInCentavos = nonNegativeInt(data.amountInCentavos);
    const destination =
      data.destination && typeof data.destination === "object" && !Array.isArray(data.destination)
        ? (data.destination as Record<string, unknown>)
        : null;
    const methodType =
      destination?.type === "gcash"
        ? "gcash"
        : destination?.type === "bank"
          ? "bank"
          : null;
    const accountName = text(destination?.accountName);

    if (
      data.status !== "succeeded" ||
      amountInCentavos <= 0 ||
      methodType === null ||
      !accountName
    ) {
      continue;
    }

    const timestamp = dateValue(data.completedAt) ?? dateValue(data.createdAt);
    if (!inDateWindow(timestamp, window)) continue;
    presentMethods.add(methodType);

    if (filters.method !== "all" && methodType !== filters.method) continue;

    const destinationSummary =
      methodType === "gcash"
        ? text(destination?.mobileMasked) || "GCash"
        : [text(destination?.bankName), text(destination?.accountNumberMasked)]
            .filter(Boolean)
            .join(" - ") || "Bank transfer";

    collected.push({
      id: doc.id,
      sortMillis: timestamp?.getTime() ?? 0,
      dateLabel: timestamp ? dateTimeFormatter.format(timestamp) : "Unavailable",
      reference: text(data.withdrawalId) || doc.id,
      methodLabel: methodType === "gcash" ? "GCash" : "Bank transfer",
      accountName,
      destination: destinationSummary,
      amountFormatted: formatCentavos(amountInCentavos),
      statusLabel: "Completed",
      amountInCentavos,
    });
  }

  collected.sort((left, right) => right.sortMillis - left.sortMillis);
  const totalWithdrawnInCentavos = collected.reduce(
    (sum, row) => sum + row.amountInCentavos,
    0,
  );
  const availableMethods = (["gcash", "bank"] as const).filter((method) =>
    presentMethods.has(method),
  );

  return {
    module: "fee_withdrawals",
    generatedAt: new Date().toISOString(),
    periodLabel: window.label,
    filters,
    availableMethods,
    summary: {
      withdrawalCount: collected.length,
      totalWithdrawnInCentavos,
      totalWithdrawnFormatted: formatCentavos(totalWithdrawnInCentavos),
      currentAvailableInCentavos,
      currentAvailableFormatted: formatCentavos(currentAvailableInCentavos),
    },
    rows: collected.map((row) => ({
      id: row.id,
      dateLabel: row.dateLabel,
      reference: row.reference,
      methodLabel: row.methodLabel,
      accountName: row.accountName,
      destination: row.destination,
      amountFormatted: row.amountFormatted,
      statusLabel: row.statusLabel,
    })),
  };
}

async function queryBookingsReport(
  rawFilters: BookingsReportFilters,
): Promise<BookingsReportPayload> {
  const filters: BookingsReportFilters = {
    ...DEFAULT_BOOKINGS_REPORT_FILTERS,
    ...rawFilters,
  };
  const window = resolveDateWindow(filters);

  const [eventDocs, requestDocs, paymentDocs, userDocs, providerDocs] =
    await Promise.all([
      readBounded(
        adminDb
          .collection("mainEvents")
          .select(
            "bookingCode",
            "referenceCode",
            "customerId",
            "eventType",
            "eventDate",
            "status",
            "paymentStatus",
            "createdAt",
          ),
      ),
      readBounded(
        adminDb
          .collection("providerRequests")
          .select("mainEventId", "providerId", "providerName"),
      ),
      readBounded(
        adminDb
          .collection("payments")
          .select(
            "bookingId",
            "mainEventId",
            "status",
            "amountInCentavos",
            "amount",
            "refundedAmountInCentavos",
          ),
      ),
      readBounded(
        adminDb
          .collection("users")
          .select("fullName", "firstName", "lastName", "displayName"),
      ),
      readBounded(adminDb.collection("providers").select("businessName")),
    ]);

  const customerNames = new Map<string, string>();
  for (const doc of userDocs) {
    customerNames.set(doc.id, personName(doc.data()));
  }
  const providerNamesById = new Map<string, string>();
  for (const doc of providerDocs) {
    const name = text(doc.get("businessName"));
    if (name) providerNamesById.set(doc.id, name);
  }

  const providersByBooking = new Map<string, Set<string>>();
  for (const doc of requestDocs) {
    const bookingId = text(doc.get("mainEventId"));
    if (!bookingId) continue;
    const providerId = text(doc.get("providerId"));
    const name =
      providerNamesById.get(providerId) ??
      text(doc.get("providerName")) ??
      "";
    if (!name) continue;
    const existing = providersByBooking.get(bookingId) ?? new Set<string>();
    existing.add(name);
    providersByBooking.set(bookingId, existing);
  }

  const paymentSumsByBooking = new Map<
    string,
    {paid: number; refunded: number}
  >();
  for (const doc of paymentDocs) {
    const data = doc.data();
    const bookingId = text(data.mainEventId) || text(data.bookingId);
    if (!bookingId) continue;
    const paymentStatus = enumValue(data.status, PAYMENT_STATUSES);
    if (!paymentStatus) continue;
    const accounting = bookingPaymentAccounting({
      status: paymentStatus,
      amountInCentavos: canonicalCentavos(data),
      refundedAmountInCentavos: data.refundedAmountInCentavos,
    });
    if (!accounting) continue;
    const entry = paymentSumsByBooking.get(bookingId) ?? {paid: 0, refunded: 0};
    entry.paid += accounting.paid;
    entry.refunded += accounting.refunded;
    paymentSumsByBooking.set(bookingId, entry);
  }

  const presentStatuses = new Set<MainEventStatus>();
  type SortableBookingRow = BookingReportRow & {
    sortMillis: number;
    status: MainEventStatus;
  };
  const collected: SortableBookingRow[] = [];

  for (const doc of eventDocs) {
    const data = doc.data();
    const status = enumValue(data.status, MAIN_EVENT_STATUSES);
    if (!status || status === "draft") continue;

    const createdAt = dateValue(data.createdAt);
    if (!inDateWindow(createdAt, window)) continue;
    presentStatuses.add(status);

    if (filters.status !== "all" && status !== filters.status) continue;

    const eventDate = dateValue(data.eventDate);
    const sums = paymentSumsByBooking.get(doc.id) ?? {paid: 0, refunded: 0};
    const providers = [...(providersByBooking.get(doc.id) ?? [])];
    const bookingCode =
      text(data.bookingCode) || text(data.referenceCode) || doc.id;

    collected.push({
      id: doc.id,
      sortMillis: createdAt?.getTime() ?? 0,
      status,
      bookingCode,
      eventDateLabel: eventDate ? dateFormatter.format(eventDate) : "Not set",
      eventTypeLabel: formatEventType(text(data.eventType)),
      customerName:
        customerNames.get(text(data.customerId)) ?? "Unknown customer",
      providerNames: providers.length > 0 ? providers.join(", ") : "Unassigned",
      bookingStatusLabel: adminBookingStatusLabel(status),
      paymentStatusLabel: adminBookingPaymentLabel(
        text(data.paymentStatus) || "unpaid",
      ),
      paidFormatted: formatCentavos(sums.paid),
      refundedFormatted: formatCentavos(sums.refunded),
    });
  }

  collected.sort((left, right) => right.sortMillis - left.sortMillis);

  const totalBookings = collected.length;
  const completedBookings = collected.filter((row) => row.status === "completed").length;
  const cancelledBookings = collected.filter((row) => row.status === "cancelled").length;
  const cancellationRate =
    totalBookings === 0 ? 0 : (cancelledBookings / totalBookings) * 100;

  const availableStatuses = MAIN_EVENT_STATUSES.filter(
    (status) => status !== "draft" && presentStatuses.has(status),
  );

  return {
    module: "bookings",
    generatedAt: new Date().toISOString(),
    periodLabel: window.label,
    filters,
    availableStatuses,
    summary: {
      totalBookings,
      completedBookings,
      cancelledBookings,
      cancellationRateFormatted: `${cancellationRate.toFixed(1)}%`,
    },
    rows: collected.map((row) => ({
      id: row.id,
      bookingCode: row.bookingCode,
      eventDateLabel: row.eventDateLabel,
      eventTypeLabel: row.eventTypeLabel,
      customerName: row.customerName,
      providerNames: row.providerNames,
      bookingStatusLabel: row.bookingStatusLabel,
      paymentStatusLabel: row.paymentStatusLabel,
      paidFormatted: row.paidFormatted,
      refundedFormatted: row.refundedFormatted,
    })),
  };
}

async function queryProviderPerformanceReport(
  rawFilters: ProviderPerformanceReportFilters,
): Promise<ProviderPerformanceReportPayload> {
  const filters: ProviderPerformanceReportFilters = {
    ...DEFAULT_PROVIDER_PERFORMANCE_FILTERS,
    ...rawFilters,
    serviceCategory: text(rawFilters.serviceCategory).slice(0, 100),
  };
  const window = resolveDateWindow(filters);

  const [providerDocs, requestDocs, paymentDocs, categoryOptions] =
    await Promise.all([
      readBounded(
        adminDb
          .collection("providers")
          .select(
            "businessName",
            "providerCategory",
            "serviceCategories",
            "providerServiceType",
            "ratingAverage",
            "reviewCount",
          ),
      ),
      readBounded(
        adminDb
          .collection("providerRequests")
          .select("providerId", "status", "createdAt"),
      ),
      readBounded(
        adminDb
          .collection("payments")
          .select(
            "providerId",
            "status",
            "amountInCentavos",
            "amount",
            "refundedAmountInCentavos",
            "paidAt",
            "createdAt",
          ),
      ),
      getServiceCategoryOptions(),
    ]);

  type Accumulator = {
    id: string;
    providerName: string;
    serviceCategoryLabel: string;
    totalBookings: number;
    acceptedBookings: number;
    completedEvents: number;
    cancelledBookings: number;
    ratingAverage: number;
    reviewCount: number;
    grossValueInCentavos: number;
  };

  const categoryMap = new Map<string, string>();
  const providers = new Map<string, Accumulator>();
  for (const doc of providerDocs) {
    const data = doc.data();
    const rawArray = Array.isArray(data.serviceCategories)
      ? data.serviceCategories
          .map((item) => text(item))
          .filter(Boolean)
      : [];
    const primaryCode = text(data.providerCategory);
    const categoryCodes = [
      ...new Set([
        ...(primaryCode ? [primaryCode] : []),
        ...rawArray,
      ]),
    ];

    for (const code of categoryCodes) {
      if (!categoryMap.has(code)) {
        categoryMap.set(code, serviceCategoryName(code, categoryOptions));
      }
    }

    if (
      filters.serviceCategory &&
      !categoryCodes.includes(filters.serviceCategory)
    ) {
      continue;
    }

    const serviceCategoryLabel =
      categoryCodes.length > 0
        ? categoryCodes
            .map((code) => categoryMap.get(code) ?? serviceCategoryName(code, categoryOptions))
            .join(", ")
        : "Uncategorized";

    providers.set(doc.id, {
      id: doc.id,
      providerName: text(data.businessName) || "Unnamed provider",
      serviceCategoryLabel,
      totalBookings: 0,
      acceptedBookings: 0,
      completedEvents: 0,
      cancelledBookings: 0,
      ratingAverage: nonNegativeFloat(data.ratingAverage),
      reviewCount: nonNegativeInt(data.reviewCount),
      grossValueInCentavos: 0,
    });
  }

  const acceptedStates = new Set([
    "accepted",
    "waiting_for_down_payment",
    "payment_processing",
    "confirmed",
    "in_progress",
    "completed",
  ]);

  for (const doc of requestDocs) {
    const data = doc.data();
    const providerId = text(data.providerId);
    const provider = providers.get(providerId);
    if (!provider) continue;

    const createdAt = dateValue(data.createdAt);
    if (!inDateWindow(createdAt, window)) continue;

    const status = text(data.status);
    provider.totalBookings += 1;
    if (acceptedStates.has(status)) {
      provider.acceptedBookings += 1;
    }
    if (status === "completed") {
      provider.completedEvents += 1;
    }
    if (status === "cancelled") {
      provider.cancelledBookings += 1;
    }
  }

  for (const doc of paymentDocs) {
    const data = doc.data();
    const providerId = text(data.providerId);
    const provider = providers.get(providerId);
    if (!provider) continue;

    const timestamp = dateValue(data.paidAt) ?? dateValue(data.createdAt);
    if (!inDateWindow(timestamp, window)) continue;

    const paymentStatus = enumValue(data.status, PAYMENT_STATUSES);
    if (!paymentStatus) continue;
    const accounting = bookingPaymentAccounting({
      status: paymentStatus,
      amountInCentavos: canonicalCentavos(data),
      refundedAmountInCentavos: data.refundedAmountInCentavos,
    });
    if (accounting && accounting.paid > 0) {
      provider.grossValueInCentavos += accounting.paid;
    }
  }

  const list = [...providers.values()];
  list.sort((left, right) => {
    switch (filters.sortBy) {
      case "highest_rating": {
        const leftRated = left.reviewCount > 0 ? 1 : 0;
        const rightRated = right.reviewCount > 0 ? 1 : 0;
        if (rightRated !== leftRated) return rightRated - leftRated;
        if (right.ratingAverage !== left.ratingAverage) {
          return right.ratingAverage - left.ratingAverage;
        }
        if (right.reviewCount !== left.reviewCount) {
          return right.reviewCount - left.reviewCount;
        }
        return right.totalBookings - left.totalBookings;
      }
      case "most_completed":
        return (
          right.completedEvents - left.completedEvents ||
          right.totalBookings - left.totalBookings ||
          right.grossValueInCentavos - left.grossValueInCentavos
        );
      case "highest_value":
        return (
          right.grossValueInCentavos - left.grossValueInCentavos ||
          right.totalBookings - left.totalBookings
        );
      case "most_bookings":
      default:
        return (
          right.totalBookings - left.totalBookings ||
          right.completedEvents - left.completedEvents ||
          right.ratingAverage - left.ratingAverage
        );
    }
  });

  const rows: ProviderPerformanceReportRow[] = list.map((item, index) => {
    const acceptanceRate =
      item.totalBookings === 0
        ? 0
        : (item.acceptedBookings / item.totalBookings) * 100;
    const ratingLabel =
      item.reviewCount > 0
        ? `${item.ratingAverage.toFixed(1)} (${item.reviewCount})`
        : "No reviews";

    return {
      id: item.id,
      rank: index + 1,
      providerName: item.providerName,
      serviceCategoryLabel: item.serviceCategoryLabel,
      totalBookings: item.totalBookings,
      completedEvents: item.completedEvents,
      cancelledBookings: item.cancelledBookings,
      acceptanceRateFormatted: `${acceptanceRate.toFixed(1)}%`,
      ratingLabel,
      ratingAverage: item.ratingAverage,
      reviewCount: item.reviewCount,
      grossValueInCentavos: item.grossValueInCentavos,
      grossValueFormatted: formatCentavos(item.grossValueInCentavos),
    };
  });

  const topByBookings = [...list].sort(
    (left, right) =>
      right.totalBookings - left.totalBookings ||
      right.completedEvents - left.completedEvents,
  )[0];
  const highestRated = [...list]
    .filter((item) => item.reviewCount > 0)
    .sort(
      (left, right) =>
        right.ratingAverage - left.ratingAverage ||
        right.reviewCount - left.reviewCount,
    )[0];
  const availableServiceCategories = [...categoryMap.entries()].sort(
    (left, right) => left[1].localeCompare(right[1]),
  );

  return {
    module: "providers",
    generatedAt: new Date().toISOString(),
    periodLabel: window.label,
    filters,
    availableServiceCategories,
    summary: {
      providerCount: rows.length,
      topByBookingsLabel:
        topByBookings && topByBookings.totalBookings > 0
          ? `${topByBookings.providerName} (${topByBookings.totalBookings})`
          : "None yet",
      highestRatedLabel: highestRated
        ? `${highestRated.providerName} (${highestRated.ratingAverage.toFixed(1)})`
        : "No reviews yet",
      totalCompletedEvents: list.reduce(
        (sum, item) => sum + item.completedEvents,
        0,
      ),
    },
    rows,
  };
}

async function queryUsersDirectoryReport(
  rawFilters: UsersDirectoryReportFilters,
): Promise<UsersDirectoryReportPayload> {
  const filters: UsersDirectoryReportFilters = {
    ...DEFAULT_USERS_DIRECTORY_FILTERS,
    ...rawFilters,
    municipality: text(rawFilters.municipality).slice(0, 150).toLowerCase(),
  };

  const [userDocs, customerDocs, providerDocs, eventDocs, requestDocs] =
    await Promise.all([
      readBounded(
        adminDb
          .collection("users")
          .select(
            "role",
            "fullName",
            "firstName",
            "lastName",
            "displayName",
            "email",
            "phoneNumber",
            "createdAt",
            "accountStatus",
            "isActive",
            "isBlocked",
          ),
      ),
      readBounded(adminDb.collection("customers").select("city")),
      readBounded(
        adminDb
          .collection("providers")
          .select("businessName", "city", "location"),
      ),
      readBounded(
        adminDb.collection("mainEvents").select("customerId", "status"),
      ),
      readBounded(adminDb.collection("providerRequests").select("providerId")),
    ]);

  const customerCities = new Map<string, string>();
  for (const doc of customerDocs) {
    const city = text(doc.get("city"));
    if (city) customerCities.set(doc.id, city);
  }

  const providerMeta = new Map<string, {businessName: string; city: string}>();
  for (const doc of providerDocs) {
    const data = doc.data();
    const location =
      data.location && typeof data.location === "object" && !Array.isArray(data.location)
        ? (data.location as Record<string, unknown>)
        : null;
    providerMeta.set(doc.id, {
      businessName: text(data.businessName),
      city: text(data.city) || text(location?.city),
    });
  }

  const customerBookings = new Map<string, number>();
  for (const doc of eventDocs) {
    if (text(doc.get("status")) === "draft") continue;
    const customerId = text(doc.get("customerId"));
    if (customerId) {
      customerBookings.set(customerId, (customerBookings.get(customerId) ?? 0) + 1);
    }
  }

  const providerBookings = new Map<string, number>();
  for (const doc of requestDocs) {
    const providerId = text(doc.get("providerId"));
    if (providerId) {
      providerBookings.set(providerId, (providerBookings.get(providerId) ?? 0) + 1);
    }
  }

  const municipalityMap = new Map<string, string>();
  const presentRoles = new Set<"customer" | "provider">();
  const presentUserStatuses = new Set<UserDirectoryStatus>();
  const rows: UsersDirectoryReportRow[] = [];

  for (const doc of userDocs) {
    const data = doc.data();
    const rawRole = text(data.role).toLowerCase();
    if (rawRole !== "customer" && rawRole !== "provider") {
      continue;
    }
    const role: "customer" | "provider" = rawRole;

    const providerInfo = providerMeta.get(doc.id);
    const city =
      role === "provider"
        ? providerInfo?.city || customerCities.get(doc.id) || ""
        : customerCities.get(doc.id) || providerInfo?.city || "";
    const cityKey = city.toLowerCase();
    if (city && !municipalityMap.has(cityKey)) {
      municipalityMap.set(cityKey, city);
    }

    const status = resolveUserStatus(data);
    presentRoles.add(role);
    presentUserStatuses.add(status);

    if (filters.role !== "all" && role !== filters.role) continue;
    if (filters.status !== "all" && status !== filters.status) continue;
    if (filters.municipality && filters.municipality !== cityKey) continue;

    const joined = dateValue(data.createdAt);
    const name =
      personName(data) !== "Unnamed account"
        ? personName(data)
        : providerInfo?.businessName || "Unnamed account";

    rows.push({
      id: doc.id,
      fullName:
        role === "provider" && providerInfo?.businessName && providerInfo.businessName !== name
          ? `${name} (${providerInfo.businessName})`
          : name,
      roleLabel: role === "provider" ? "Provider" : "Customer",
      email: text(data.email) || "Unavailable",
      phone: text(data.phoneNumber) || "Unavailable",
      municipality: city || "Unavailable",
      bookingsCount:
        role === "provider"
          ? providerBookings.get(doc.id) ?? 0
          : customerBookings.get(doc.id) ?? 0,
      dateJoinedLabel: joined ? dateFormatter.format(joined) : "Unavailable",
      status,
    });
  }

  rows.sort((left, right) => left.fullName.localeCompare(right.fullName));

  const municipalities = [...municipalityMap.entries()].sort((left, right) =>
    left[1].localeCompare(right[1]),
  );
  const availableRoles = (["customer", "provider"] as const).filter(
    (role) => presentRoles.has(role),
  );
  const availableStatuses = (
    ["Active", "Inactive", "Blocked", "Pending Deletion", "Unknown"] as const
  ).filter((status) => presentUserStatuses.has(status));

  return {
    module: "users",
    generatedAt: new Date().toISOString(),
    periodLabel: "All registered accounts",
    filters,
    availableRoles,
    availableStatuses,
    municipalities,
    summary: {
      totalUsers: rows.length,
      customersCount: rows.filter((row) => row.roleLabel === "Customer").length,
      providersCount: rows.filter((row) => row.roleLabel === "Provider").length,
      activeCount: rows.filter((row) => row.status === "Active").length,
    },
    rows,
  };
}

function resolveDateWindow(
  input: DateFilterFields,
  now = new Date(),
): ResolvedDateWindow {
  const preset: AdminReportModuleDatePreset = input.datePreset;
  if (preset === "all_time") {
    return {start: null, endExclusive: null, label: "All time"};
  }

  const manila = manilaParts(now);
  const startOfToday = manilaMidnight(manila.year, manila.month, manila.day);
  const endOfTodayExclusive = new Date(startOfToday.getTime() + DAY_MS);

  if (preset === "today") {
    return {
      start: startOfToday,
      endExclusive: endOfTodayExclusive,
      label: dateFormatter.format(startOfToday),
    };
  }

  if (preset === "last_7_days") {
    const start = new Date(endOfTodayExclusive.getTime() - 7 * DAY_MS);
    return {
      start,
      endExclusive: endOfTodayExclusive,
      label: `${dateFormatter.format(start)} - ${dateFormatter.format(startOfToday)}`,
    };
  }

  if (preset === "last_30_days") {
    const start = new Date(endOfTodayExclusive.getTime() - 30 * DAY_MS);
    return {
      start,
      endExclusive: endOfTodayExclusive,
      label: `${dateFormatter.format(start)} - ${dateFormatter.format(startOfToday)}`,
    };
  }

  if (preset === "last_3_months") {
    const start = manilaMidnight(manila.year, manila.month - 2, 1);
    return {
      start,
      endExclusive: endOfTodayExclusive,
      label: `${dateFormatter.format(start)} - ${dateFormatter.format(startOfToday)}`,
    };
  }

  if (preset === "this_year") {
    const start = manilaMidnight(manila.year, 0, 1);
    return {
      start,
      endExclusive: endOfTodayExclusive,
      label: `${dateFormatter.format(start)} - ${dateFormatter.format(startOfToday)}`,
    };
  }

  // Custom date range
  const startParsed = parseIsoDate(input.startDate);
  const endParsed = parseIsoDate(input.endDate);
  if (!startParsed || !endParsed) {
    throw new Error("Choose both a start date and an end date for a custom report.");
  }
  const start = manilaMidnight(startParsed.year, startParsed.month, startParsed.day);
  const endInclusive = manilaMidnight(endParsed.year, endParsed.month, endParsed.day);
  const endExclusive = new Date(endInclusive.getTime() + DAY_MS);
  if (endExclusive <= start) {
    throw new Error("End date must be on or after the start date.");
  }
  const days = Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS);
  if (days > MAX_CUSTOM_DAYS) {
    throw new Error("Custom date ranges are limited to 366 days.");
  }
  return {
    start,
    endExclusive,
    label: `${dateFormatter.format(start)} - ${dateFormatter.format(endInclusive)}`,
  };
}

function inDateWindow(date: Date | null, window: ResolvedDateWindow): boolean {
  if (!window.start && !window.endExclusive) return true;
  if (!date) return false;
  const millis = date.getTime();
  if (window.start && millis < window.start.getTime()) return false;
  if (window.endExclusive && millis >= window.endExclusive.getTime()) return false;
  return true;
}

async function readBounded(
  query: Query<DocumentData>,
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const snapshot = await query.limit(MAX_RECORDS + 1).get();
  if (snapshot.size > MAX_RECORDS) {
    throw new Error(
      "This report exceeds the 5,000-record safety limit. Narrow the filters and try again.",
    );
  }
  return snapshot.docs;
}

function manilaParts(date: Date) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function manilaMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - MANILA_OFFSET_MS);
}

function parseIsoDate(value: string | null) {
  if (!value) return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date && Number.isFinite(result.getTime())
      ? result
      : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function nonNegativeFloat(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function canonicalCentavos(data: DocumentData): number {
  const direct = nonNegativeInt(data.amountInCentavos);
  if (direct > 0) return direct;
  const legacy = nonNegativeFloat(data.amount);
  return legacy > 0 ? Math.round(legacy * 100) : 0;
}

function formatCentavos(centavos: number): string {
  return phpFormatter.format(centavos / 100);
}

function personName(data: DocumentData): string {
  const full = text(data.fullName);
  if (full) return full;
  const combined = [text(data.firstName), text(data.lastName)]
    .filter(Boolean)
    .join(" ");
  if (combined) return combined;
  return text(data.displayName) || "Unnamed account";
}

function resolveUserStatus(user: DocumentData): UserDirectoryStatus {
  if (user.accountStatus === "pending_deletion") return "Pending Deletion";
  if (user.isBlocked === true || user.accountStatus === "blocked") return "Blocked";
  if (
    user.isActive === false ||
    ["disabled", "deactivated"].includes(text(user.accountStatus))
  ) {
    return "Inactive";
  }
  if (user.isActive === true || user.accountStatus === "active") return "Active";
  return "Unknown";
}

function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_refunded":
      return "Partially refunded";
    case "refunded":
      return "Refunded";
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "failed":
      return "Failed";
    case "expired":
      return "Expired";
  }
}

function formatEventType(value: string): string {
  if (!value) return "Not specified";
  return value
    .split(/[_\s-]+/u)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T[number])
    : null;
}
