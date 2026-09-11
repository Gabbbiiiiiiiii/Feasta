import "server-only";

import {
  AggregateField,
  FieldPath,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  MAIN_EVENT_STATUSES,
  PAYMENT_STATUSES,
  PROVIDER_REQUEST_STATUSES,
  PROVIDER_REQUEST_TYPES,
  type MainEventStatus,
  type PaymentStatus,
  type ProviderRequestStatus,
  type ProviderRequestType,
} from "@feasta/shared-types";

import type {
  AdminBooking,
  AdminBookingCustomer,
  AdminBookingDateFilter,
  AdminBookingDetailsResult,
  AdminBookingFilters,
  AdminBookingOverallPaymentStatus,
  AdminBookingPage,
  AdminBookingPayment,
  AdminBookingProviderRequest,
  AdminBookingSortDirection,
  AdminBookingSortField,
  AdminBookingStatistics,
} from "@/lib/admin/bookings/admin-booking-types";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

const COLLECTIONS = {
  mainEvents: "mainEvents",
  providerRequests: "providerRequests",
  payments: "payments",
  providers: "providers",
} as const;

const WHERE_IN_LIMIT = 30;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BOOKING_STATISTICS_CACHE_MS =
  30 * 1000;

let bookingStatisticsCache: {
  expiresAt: number;
  promise: Promise<AdminBookingStatistics>;
} | null = null;

type NormalizedFilters = {
  search: string;
  status: AdminBookingFilters["status"];
  paymentStatus: AdminBookingFilters["paymentStatus"];
  date: AdminBookingDateFilter;
  sortField: AdminBookingSortField;
  sortDirection: AdminBookingSortDirection;
  pageSize: number;
  cursor: string | null;
};

type BookingCursor = {
  field: AdminBookingSortField;
  milliseconds: number;
  documentId: string;
};

type ProviderSummary = {
  ownerId: string | null;
  businessName: string;
};

type BookingRelations = {
  requestsByMainEventId: Map<
    string,
    AdminBookingProviderRequest[]
  >;
  paymentsByMainEventId: Map<
    string,
    AdminBookingPayment[]
  >;
};

export async function getAdminBookingPage(
  input: AdminBookingFilters,
): Promise<AdminBookingPage> {
  await requireAdmin();

  const filters = normalizeFilters(input);
  const statisticsPromise =
    getAdminBookingStatistics();

  if (filters.search) {
    const bookings = await searchBookings(filters);

    return {
      bookings,
      statistics: await statisticsPromise,
      nextCursor: null,
      hasMore: false,
    };
  }

  let query: Query<DocumentData> = adminDb.collection(
    COLLECTIONS.mainEvents,
  );

  query = applyBookingFilters(query, filters);

/*
 * Firestore range queries must order by
 * the field used by the range filter.
 */
const sortField =
  filters.date !== "all"
    ? "eventDate"
    : filters.sortField;

const sortDirection =
  filters.sortDirection === "ascending"
    ? "asc"
    : "desc";

  query = query
    .orderBy(sortField, sortDirection)
    .orderBy(
      FieldPath.documentId(),
      sortDirection,
    );

  const cursor = decodeCursor(filters.cursor);

  if (cursor && cursor.field === sortField) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.milliseconds),
      cursor.documentId,
    );
  }

  const snapshot = await query
    .limit(filters.pageSize + 1)
    .get();

  const hasMore =
    snapshot.docs.length > filters.pageSize;

  const visibleDocuments = hasMore
    ? snapshot.docs.slice(0, filters.pageSize)
    : snapshot.docs;

  const relations = await loadBookingRelations(
    visibleDocuments.map((document) => document.id),
  );

  const bookings = visibleDocuments.map((document) =>
    mapBookingDocument(document, relations),
  );

  const lastDocument =
    visibleDocuments.at(-1) ?? null;

  return {
    bookings,
    statistics: await statisticsPromise,
    nextCursor:
      hasMore && lastDocument
        ? encodeCursor(lastDocument, sortField)
        : null,
    hasMore,
  };
}

export async function getAdminBookingDetails(
  bookingId: string,
): Promise<AdminBookingDetailsResult> {
  await requireAdmin();

  const normalizedBookingId = bookingId.trim();

  if (!normalizedBookingId) {
    throw new Error("The booking ID is required.");
  }

  const reference = adminDb
    .collection(COLLECTIONS.mainEvents)
    .doc(normalizedBookingId);

  const snapshot = await reference.get();

  if (!snapshot.exists) {
    throw new Error(
      "The booking could not be found.",
    );
  }

  const relations = await loadBookingRelations([
    normalizedBookingId,
  ]);

  return {
    booking: mapBookingDocument(
      snapshot,
      relations,
    ),
  };
}

function normalizeFilters(
  input: AdminBookingFilters,
): NormalizedFilters {
  const pageSize =
    Number.isInteger(input.pageSize) &&
    input.pageSize > 0
      ? Math.min(input.pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    search: stringValue(input.search).toUpperCase(),

    status:
      input.status === "all" ||
      isMainEventStatus(input.status)
        ? input.status
        : "all",

    paymentStatus:
      input.paymentStatus === "all" ||
      isOverallPaymentStatus(
        input.paymentStatus,
      )
        ? input.paymentStatus
        : "all",

    date: isDateFilter(input.date)
      ? input.date
      : "all",

    sortField:
      input.sortField === "eventDate"
        ? "eventDate"
        : "createdAt",

    sortDirection:
      input.sortDirection === "ascending"
        ? "ascending"
        : "descending",

    pageSize,
    cursor:
      typeof input.cursor === "string" &&
      input.cursor.trim()
        ? input.cursor.trim()
        : null,
  };
}

function applyBookingFilters(
  source: Query<DocumentData>,
  filters: NormalizedFilters,
): Query<DocumentData> {
  let query = source;

  if (filters.status !== "all") {
    query = query.where(
      "status",
      "==",
      filters.status,
    );
  }

  if (filters.paymentStatus !== "all") {
    query = query.where(
      "paymentStatus",
      "==",
      filters.paymentStatus,
    );
  }

  const range = getDateRange(filters.date);

  if (range.start) {
    query = query.where(
      "eventDate",
      ">=",
      Timestamp.fromDate(range.start),
    );
  }

  if (range.end) {
    query = query.where(
      "eventDate",
      "<",
      Timestamp.fromDate(range.end),
    );
  }

  return query;
}

async function searchBookings(
  filters: NormalizedFilters,
): Promise<AdminBooking[]> {
  /*
   * Booking search is intentionally exact and indexed.
   *
   * Firestore does not provide efficient arbitrary substring
   * searching. The UI should describe this field as a booking-code
   * search instead of downloading the entire collection.
   */
  const directDocumentPromise = adminDb
    .collection(COLLECTIONS.mainEvents)
    .doc(filters.search)
    .get();

  const bookingCodePromise = adminDb
    .collection(COLLECTIONS.mainEvents)
    .where("bookingCode", "==", filters.search)
    .limit(1)
    .get();

  const [
    directDocument,
    bookingCodeSnapshot,
  ] = await Promise.all([
    directDocumentPromise,
    bookingCodePromise,
  ]);

  const documents =
    new Map<
      string,
      QueryDocumentSnapshot<DocumentData>
    >();

  if (directDocument.exists) {
    documents.set(
      directDocument.id,
      directDocument as QueryDocumentSnapshot<DocumentData>,
    );
  }

  for (const document of bookingCodeSnapshot.docs) {
    documents.set(document.id, document);
  }

  const matchingDocuments = [
    ...documents.values(),
  ].filter((document) =>
    documentMatchesFilters(document, filters),
  );

  const relations = await loadBookingRelations(
    matchingDocuments.map((document) => document.id),
  );

  return matchingDocuments.map((document) =>
    mapBookingDocument(document, relations),
  );
}

function documentMatchesFilters(
  document: QueryDocumentSnapshot<DocumentData>,
  filters: NormalizedFilters,
): boolean {
  const data = document.data() ?? {};

  if (
    filters.status !== "all" &&
    data.status !== filters.status
  ) {
    return false;
  }

  if (
    filters.paymentStatus !== "all" &&
    data.paymentStatus !== filters.paymentStatus
  ) {
    return false;
  }

  const range = getDateRange(filters.date);
  const eventDate = dateValue(data.eventDate);

  if (
    range.start &&
    (
      !eventDate ||
      eventDate < range.start
    )
  ) {
    return false;
  }

  if (
    range.end &&
    (
      !eventDate ||
      eventDate >= range.end
    )
  ) {
    return false;
  }

  return true;
}

async function loadBookingRelations(
  mainEventIds: readonly string[],
): Promise<BookingRelations> {
  if (mainEventIds.length === 0) {
    return {
      requestsByMainEventId: new Map(),
      paymentsByMainEventId: new Map(),
    };
  }

  const chunks = chunkValues(
    [...new Set(mainEventIds)],
    WHERE_IN_LIMIT,
  );

  const [
    requestSnapshots,
    paymentSnapshots,
  ] = await Promise.all([
    Promise.all(
      chunks.map((chunk) =>
        adminDb
          .collection(
            COLLECTIONS.providerRequests,
          )
          .where("mainEventId", "in", chunk)
          .get(),
      ),
    ),

    Promise.all(
      chunks.map((chunk) =>
        adminDb
          .collection(COLLECTIONS.payments)
          .where("mainEventId", "in", chunk)
          .get(),
      ),
    ),
  ]);

  const requestDocuments =
    requestSnapshots.flatMap(
      (snapshot) => snapshot.docs,
    );

  const paymentDocuments =
    paymentSnapshots.flatMap(
      (snapshot) => snapshot.docs,
    );

  const providerIds = [
    ...new Set(
      requestDocuments
        .map((document) =>
          stringValue(
            document.data().providerId,
          ),
        )
        .filter(Boolean),
    ),
  ];

  const providers = await loadProviders(
    providerIds,
  );

  const requestsByMainEventId =
    new Map<
      string,
      AdminBookingProviderRequest[]
    >();

  for (const document of requestDocuments) {
    const request = mapProviderRequest(
      document,
      providers,
    );

    appendMapValue(
      requestsByMainEventId,
      request.mainEventId,
      request,
    );
  }

  const paymentsByMainEventId =
    new Map<
      string,
      AdminBookingPayment[]
    >();

  for (const document of paymentDocuments) {
    const payment =
      mapPaymentDocument(document);

    appendMapValue(
      paymentsByMainEventId,
      payment.mainEventId,
      payment,
    );
  }

  for (const requests of requestsByMainEventId.values()) {
    requests.sort(compareProviderRequests);
  }

  for (const payments of paymentsByMainEventId.values()) {
    payments.sort(comparePayments);
  }

  return {
    requestsByMainEventId,
    paymentsByMainEventId,
  };
}

async function loadProviders(
  providerIds: readonly string[],
): Promise<Map<string, ProviderSummary>> {
  const providers =
    new Map<string, ProviderSummary>();

  if (providerIds.length === 0) {
    return providers;
  }

  const references = providerIds.map((providerId) =>
    adminDb
      .collection(COLLECTIONS.providers)
      .doc(providerId),
  );

  const snapshots =
    await adminDb.getAll(...references);

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }

    const data = snapshot.data() ?? {};

    providers.set(snapshot.id, {
      ownerId: nullableString(data.ownerId),

      businessName:
        stringValue(data.businessName) ||
        "Unnamed provider",
    });
  }

  return providers;
}

function mapBookingDocument(
  document: DocumentSnapshot<DocumentData>,
  relations: BookingRelations,
): AdminBooking {
  const data = document.data() ?? {};

  const providerRequests =
    relations.requestsByMainEventId.get(
      document.id,
    ) ?? [];

  const payments =
    relations.paymentsByMainEventId.get(
      document.id,
    ) ?? [];

  const totalAmount =
    finiteNumber(
      data.estimatedEventTotal,
      finiteNumber(data.totalAmount),
    );

  const totalPaidAmount =
    sumPaymentAmounts(
      payments.filter(
        (payment) => payment.status === "paid",
      ),
    );

  const totalRefundedAmount =
    sumPaymentAmounts(
      payments.filter(
        (payment) =>
          payment.status === "refunded",
      ),
    );

  const customer =
    mapBookingCustomer(data);

  return {
    id: document.id,

    reference:
      stringValue(data.bookingCode) ||
      document.id,

    status: normalizeMainEventStatus(
      data.status,
    ),

    paymentStatus:
      normalizeOverallPaymentStatus(
        data.paymentStatus,
        payments,
      ),

    customerId:
      stringValue(data.customerId),

    customer,

    eventType:
      stringValue(data.eventType) ||
      "Unspecified event",

    eventDate:
      isoDateValue(data.eventDate),

    eventTime:
      nullableString(data.eventTime),

    guestCount:
      integerValue(data.guestCount),

    venueName:
      nullableString(data.eventLocation),

    venueAddress:
      stringValue(data.eventAddress),

    city:
      stringValue(data.city),

    notes:
      nullableString(data.specialRequest),

    providerRequestCount:
      integerValue(
        data.providerRequestCount,
        providerRequests.length,
      ),

    pendingProviderRequestCount:
      integerValue(
        data.pendingProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "pending",
        ),
      ),

    acceptedProviderRequestCount:
      integerValue(
        data.acceptedProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "accepted",
        ),
      ),

    waitingPaymentProviderRequestCount:
      integerValue(
        data.waitingPaymentProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "waiting_for_down_payment",
        ),
      ),

    paymentProcessingProviderRequestCount:
      integerValue(
        data.paymentProcessingProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "payment_processing",
        ),
      ),

    confirmedProviderRequestCount:
      integerValue(
        data.confirmedProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "confirmed",
        ),
      ),

    inProgressProviderRequestCount:
      integerValue(
        data.inProgressProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "in_progress",
        ),
      ),

    completedProviderRequestCount:
      integerValue(
        data.completedProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "completed",
        ),
      ),

    rejectedProviderRequestCount:
      integerValue(
        data.rejectedProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "rejected",
        ),
      ),

    cancelledProviderRequestCount:
      integerValue(
        data.cancelledProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "cancelled",
        ),
      ),

    expiredProviderRequestCount:
      integerValue(
        data.expiredProviderRequestCount,
        countRequestStatus(
          providerRequests,
          "expired",
        ),
      ),

    totalAmount,
    totalPaidAmount,
    totalRefundedAmount,

    outstandingAmount:
      roundCurrency(
        Math.max(
          0,
          totalAmount -
            totalPaidAmount +
            totalRefundedAmount,
        ),
      ),

    providerRequests,
    payments,

    createdAt:
      isoDateValue(data.createdAt),

    updatedAt:
      isoDateValue(data.updatedAt),

    confirmedAt:
      isoDateValue(data.confirmedAt),

    completedAt:
      isoDateValue(data.completedAt),

    cancelledAt:
      isoDateValue(data.cancelledAt),
  };
}

function mapBookingCustomer(
  data: DocumentData,
): AdminBookingCustomer {
  const firstName =
    stringValue(data.customerFirstName);

  const lastName =
    stringValue(data.customerLastName);

  return {
    id: stringValue(data.customerId),

    fullName:
      `${firstName} ${lastName}`.trim() ||
      "Unnamed customer",

    email:
      stringValue(data.customerEmail),

    phoneNumber:
      stringValue(
        data.customerPhoneNumber,
      ),
  };
}

function mapProviderRequest(
  document: QueryDocumentSnapshot<DocumentData>,
  providers: ReadonlyMap<
    string,
    ProviderSummary
  >,
): AdminBookingProviderRequest {
  const data = document.data();
  const providerId =
    stringValue(data.providerId);

  const provider =
    providers.get(providerId);

  return {
    id: document.id,

    mainEventId:
      stringValue(data.mainEventId),

    providerId,

    providerOwnerId:
      provider?.ownerId ?? null,

    providerName:
      stringValue(
        data.providerBusinessName,
      ) ||
      provider?.businessName ||
      "Unnamed provider",

    requestType:
      normalizeProviderRequestType(
        data.type,
      ),

    status:
      normalizeProviderRequestStatus(
        data.status,
      ),

    packageId:
      nullableString(data.packageId),

    packageName:
      nullableString(data.packageName),

    subtotal:
      finiteNumber(data.amount),

    downPaymentPercentage:
      finiteNumber(
        data.downPaymentPercentage,
      ),

    downPaymentAmount:
      finiteNumber(
        data.downPaymentAmount,
      ),

    paymentId:
      nullableString(data.paymentId),

    paymentStatus:
      normalizePaymentStatus(
        data.paymentStatus,
      ),

    acceptedAt:
      isoDateValue(data.acceptedAt),

    confirmedAt:
      isoDateValue(data.confirmedAt),

    completedAt:
      isoDateValue(data.completedAt),

    rejectedAt:
      isoDateValue(data.rejectedAt),

    cancelledAt:
      isoDateValue(data.cancelledAt),

    createdAt:
      isoDateValue(data.createdAt),

    updatedAt:
      isoDateValue(data.updatedAt),
  };
}

function mapPaymentDocument(
  document: QueryDocumentSnapshot<DocumentData>,
): AdminBookingPayment {
  const data = document.data();

  const amount =
    finiteNumber(data.amount);

  const amountInCentavos =
    integerValue(
      data.amountInCentavos,
      Math.round(amount * 100),
    );

  return {
    id: document.id,

    mainEventId:
      stringValue(data.mainEventId) ||
      stringValue(data.bookingId),

    providerRequestId:
      stringValue(data.providerRequestId),

    providerId:
      stringValue(data.providerId),

    customerId:
      stringValue(data.customerId),

    amount,
    amountInCentavos,

    currency:
      stringValue(data.currency) || "PHP",

    status:
      normalizePaymentStatus(data.status) ??
      "pending",

    gateway:
      stringValue(data.gateway) ||
      "paymongo",

    paymentType:
      stringValue(data.paymentType),

    refundStatus:
      nullableString(data.refundStatus),

    refundId:
      nullableString(data.refundId),

    refundReason:
      nullableString(data.refundReason),

    createdAt:
      isoDateValue(data.createdAt),

    updatedAt:
      isoDateValue(data.updatedAt),

    paidAt:
      isoDateValue(data.paidAt),

    failedAt:
      isoDateValue(data.failedAt),

    expiredAt:
      isoDateValue(data.expiredAt),

    refundedAt:
      isoDateValue(data.refundedAt),

    refundRequestedAt:
      isoDateValue(
        data.refundRequestedAt,
      ),
  };
}

async function queryAdminBookingStatistics(): Promise<AdminBookingStatistics> {
  const mainEvents = adminDb.collection(
    COLLECTIONS.mainEvents,
  );

  const providerRequests = adminDb.collection(
    COLLECTIONS.providerRequests,
  );

  const payments = adminDb.collection(
    COLLECTIONS.payments,
  );

  const [
    totalBookings,
    pendingApproval,
    waitingForPayment,
    confirmed,
    inProgress,
    completed,
    needsReplacement,
    cancelled,
    expired,
    totalRequests,
    pendingRequests,
    confirmedRequests,
    paidAmount,
    refundedAmount,
  ] = await Promise.all([
    mainEvents.count().get(),

    mainEvents
      .where(
        "status",
        "==",
        "pending_provider_approval",
      )
      .count()
      .get(),

    mainEvents
      .where(
        "status",
        "==",
        "waiting_for_down_payment",
      )
      .count()
      .get(),

    mainEvents
      .where("status", "==", "confirmed")
      .count()
      .get(),

    mainEvents
      .where("status", "==", "in_progress")
      .count()
      .get(),

    mainEvents
      .where("status", "==", "completed")
      .count()
      .get(),

    mainEvents
      .where(
        "status",
        "==",
        "needs_provider_replacement",
      )
      .count()
      .get(),

    mainEvents
      .where("status", "==", "cancelled")
      .count()
      .get(),

    mainEvents
      .where("status", "==", "expired")
      .count()
      .get(),

    providerRequests.count().get(),

    providerRequests
      .where("status", "==", "pending")
      .count()
      .get(),

    providerRequests
      .where("status", "==", "confirmed")
      .count()
      .get(),

    payments
      .where("status", "==", "paid")
      .aggregate({
        amount: AggregateField.sum("amount"),
      })
      .get(),

    payments
      .where("status", "==", "refunded")
      .aggregate({
        amount: AggregateField.sum("amount"),
      })
      .get(),
  ]);

  return {
    totalBookings:
      totalBookings.data().count,

    pendingApproval:
      pendingApproval.data().count,

    waitingForPayment:
      waitingForPayment.data().count,

    confirmed:
      confirmed.data().count,

    inProgress:
      inProgress.data().count,

    completed:
      completed.data().count,

    needsProviderReplacement:
      needsReplacement.data().count,

    cancelledOrExpired:
      cancelled.data().count +
      expired.data().count,

    totalProviderRequests:
      totalRequests.data().count,

    pendingProviderRequests:
      pendingRequests.data().count,

    confirmedProviderRequests:
      confirmedRequests.data().count,

    totalPaidAmount:
      aggregateNumber(
        paidAmount.data().amount,
      ),

    totalRefundedAmount:
      aggregateNumber(
        refundedAmount.data().amount,
      ),
  };
}

function getAdminBookingStatistics(): Promise<
  AdminBookingStatistics
> {
  const now = Date.now();

  if (
    bookingStatisticsCache &&
    bookingStatisticsCache.expiresAt > now
  ) {
    return bookingStatisticsCache.promise;
  }

  const promise =
    queryAdminBookingStatistics();

  bookingStatisticsCache = {
    expiresAt:
      now + BOOKING_STATISTICS_CACHE_MS,

    promise,
  };

  void promise.catch(() => {
    if (
      bookingStatisticsCache?.promise ===
      promise
    ) {
      bookingStatisticsCache = null;
    }
  });

  return promise;
}

function normalizeOverallPaymentStatus(
  value: unknown,
  payments: readonly AdminBookingPayment[],
): AdminBookingOverallPaymentStatus {
  const storedValue =
    stringValue(value).toLowerCase();

  if (isOverallPaymentStatus(storedValue)) {
    return storedValue;
  }

  if (payments.length === 0) {
    return "unpaid";
  }

  const statuses =
    new Set(
      payments.map((payment) => payment.status),
    );

  if (
    payments.every(
      (payment) =>
        payment.status === "refunded",
    )
  ) {
    return "refunded";
  }

  if (statuses.has("processing")) {
    return "processing";
  }

  if (statuses.has("pending")) {
    return "pending";
  }

  if (
    payments.every(
      (payment) => payment.status === "paid",
    )
  ) {
    return "paid";
  }

  if (statuses.has("paid")) {
    return "partially_paid";
  }

  if (statuses.has("failed")) {
    return "failed";
  }

  if (statuses.has("expired")) {
    return "expired";
  }

  return "unpaid";
}

function normalizeMainEventStatus(
  value: unknown,
): MainEventStatus {
  const normalized =
    stringValue(value).toLowerCase();

  return isMainEventStatus(normalized)
    ? normalized
    : "draft";
}

function normalizeProviderRequestStatus(
  value: unknown,
): ProviderRequestStatus {
  const normalized =
    stringValue(value).toLowerCase();

  return (
    PROVIDER_REQUEST_STATUSES as
      readonly string[]
  ).includes(normalized)
    ? normalized as ProviderRequestStatus
    : "pending";
}

function normalizeProviderRequestType(
  value: unknown,
): ProviderRequestType {
  const normalized =
    stringValue(value).toLowerCase();

  return (
    PROVIDER_REQUEST_TYPES as
      readonly string[]
  ).includes(normalized)
    ? normalized as ProviderRequestType
    : "addon";
}

function normalizePaymentStatus(
  value: unknown,
): PaymentStatus | null {
  const normalized =
    stringValue(value).toLowerCase();

  return (
    PAYMENT_STATUSES as readonly string[]
  ).includes(normalized)
    ? normalized as PaymentStatus
    : null;
}

function isMainEventStatus(
  value: unknown,
): value is MainEventStatus {
  return (
    MAIN_EVENT_STATUSES as readonly unknown[]
  ).includes(value);
}

function isOverallPaymentStatus(
  value: unknown,
): value is AdminBookingOverallPaymentStatus {
  return [
    "unpaid",
    "pending",
    "processing",
    "partially_paid",
    "paid",
    "failed",
    "expired",
    "refunded",
  ].includes(stringValue(value).toLowerCase());
}

function isDateFilter(
  value: unknown,
): value is AdminBookingDateFilter {
  return [
    "all",
    "today",
    "upcoming",
    "past",
  ].includes(stringValue(value));
}

function getDateRange(
  filter: AdminBookingDateFilter,
): {
  start: Date | null;
  end: Date | null;
} {
  if (filter === "all") {
    return {
      start: null,
      end: null,
    };
  }

  const now = new Date();
  const manilaNow = new Date(
    now.getTime() + MANILA_OFFSET_MS,
  );

  const startOfToday = new Date(
    Date.UTC(
      manilaNow.getUTCFullYear(),
      manilaNow.getUTCMonth(),
      manilaNow.getUTCDate(),
    ) - MANILA_OFFSET_MS,
  );

  const startOfTomorrow = new Date(
    startOfToday.getTime() + DAY_MS,
  );

  if (filter === "today") {
    return {
      start: startOfToday,
      end: startOfTomorrow,
    };
  }

  if (filter === "upcoming") {
    return {
      start: now,
      end: null,
    };
  }

  return {
    start: null,
    end: now,
  };
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
  field: AdminBookingSortField,
): string | null {
  const value = dateValue(
    document.data()[field],
  );

  if (!value) {
    return null;
  }

  const payload: BookingCursor = {
    field,
    milliseconds: value.getTime(),
    documentId: document.id,
  };

  return Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  value: string | null,
): BookingCursor | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url")
        .toString("utf8"),
    ) as Partial<BookingCursor>;

    if (
      (
        parsed.field !== "createdAt" &&
        parsed.field !== "eventDate"
      ) ||
      typeof parsed.milliseconds !==
        "number" ||
      !Number.isFinite(parsed.milliseconds) ||
      typeof parsed.documentId !==
        "string" ||
      !parsed.documentId
    ) {
      return null;
    }

    return {
      field: parsed.field,
      milliseconds: parsed.milliseconds,
      documentId: parsed.documentId,
    };
  } catch {
    return null;
  }
}

function dateValue(
  value: unknown,
): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return new Date(value);
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  }

  return null;
}

function isoDateValue(
  value: unknown,
): string | null {
  return dateValue(value)?.toISOString() ?? null;
}

function stringValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value).trim();
}

function nullableString(
  value: unknown,
): string | null {
  const result = stringValue(value);

  return result ? result : null;
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

function integerValue(
  value: unknown,
  fallback = 0,
): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value)
    ? value
    : fallback;
}

function aggregateNumber(
  value: unknown,
): number {
  return finiteNumber(value);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumPaymentAmounts(
  payments: readonly AdminBookingPayment[],
): number {
  return roundCurrency(
    payments.reduce(
      (total, payment) =>
        total + payment.amount,
      0,
    ),
  );
}

function countRequestStatus(
  requests:
    readonly AdminBookingProviderRequest[],
  status: ProviderRequestStatus,
): number {
  return requests.reduce(
    (count, request) =>
      request.status === status
        ? count + 1
        : count,
    0,
  );
}

function appendMapValue<T>(
  map: Map<string, T[]>,
  key: string,
  value: T,
): void {
  const current = map.get(key);

  if (current) {
    current.push(value);
  } else {
    map.set(key, [value]);
  }
}

function chunkValues<T>(
  values: readonly T[],
  size: number,
): T[][] {
  const chunks: T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    chunks.push(
      values.slice(index, index + size),
    );
  }

  return chunks;
}

function compareProviderRequests(
  left: AdminBookingProviderRequest,
  right: AdminBookingProviderRequest,
): number {
  return (
    dateMilliseconds(left.createdAt) -
    dateMilliseconds(right.createdAt)
  );
}

function comparePayments(
  left: AdminBookingPayment,
  right: AdminBookingPayment,
): number {
  return (
    dateMilliseconds(right.createdAt) -
    dateMilliseconds(left.createdAt)
  );
}

function dateMilliseconds(
  value: string | null,
): number {
  if (!value) {
    return 0;
  }

  const result = new Date(value).getTime();

  return Number.isNaN(result) ? 0 : result;
}
