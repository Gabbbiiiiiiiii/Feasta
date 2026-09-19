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
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  type PaymentGateway,
  type PaymentStatus,
  type PaymentType,
} from "@feasta/shared-types";

import type {
  AdminPayment,
  AdminPaymentAuditEntry,
  AdminPaymentDateFilter,
  AdminPaymentDetails,
  AdminPaymentDetailsResult,
  AdminPaymentFilters,
  AdminPaymentIssue,
  AdminPaymentPage,
  AdminPaymentRefundEligibility,
  AdminPaymentSortDirection,
  AdminPaymentSortField,
  AdminPaymentStatistics,
  AdminPaymentWebhookEvent,
} from "@/lib/admin/payments/admin-payment-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const COLLECTIONS = {
  payments: "payments",
  mainEvents: "mainEvents",
  providerRequests: "providerRequests",
  providers: "providers",
  users: "users",
  webhookEvents: "paymentWebhookEvents",
  adminLogs: "adminLogs",
} as const;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const SEARCH_RESULT_LIMIT = 30;
const DETAIL_HISTORY_LIMIT = 25;
const STATISTICS_CACHE_MS = 30 * 1000;
const PROCESSING_STALE_MS = 30 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let paymentStatisticsCache: {
  expiresAt: number;
  promise: Promise<AdminPaymentStatistics>;
} | null = null;

type NormalizedFilters = {
  search: string;
  status: AdminPaymentFilters["status"];
  paymentType: AdminPaymentFilters["paymentType"];
  date: AdminPaymentDateFilter;
  issue: AdminPaymentFilters["issue"];
  sortField: AdminPaymentSortField;
  sortDirection: AdminPaymentSortDirection;
  pageSize: number;
  cursor: string | null;
};

type PaymentCursor = {
  field: AdminPaymentSortField;
  kind: "number" | "timestamp";
  value: number;
  documentId: string;
};

type PaymentRelations = {
  bookings: Map<string, DocumentSnapshot<DocumentData>>;
  providerRequests: Map<string, DocumentSnapshot<DocumentData>>;
  providers: Map<string, DocumentSnapshot<DocumentData>>;
  users: Map<string, DocumentSnapshot<DocumentData>>;
};

export async function getAdminPaymentPage(
  input: AdminPaymentFilters,
): Promise<AdminPaymentPage> {
  await requireAdmin();

  const filters = normalizeFilters(input);
  const statisticsPromise = getAdminPaymentStatistics();

  if (filters.search) {
    const documents = await searchPaymentDocuments(filters.search);
    const relations = await loadPaymentRelations(documents);

    const payments = documents
      .map((document) => mapPaymentDocument(document, relations))
      .filter((payment) => paymentMatchesFilters(payment, filters))
      .sort((left, right) => comparePayments(left, right, filters))
      .slice(0, filters.pageSize);

    return {
      payments,
      statistics: await statisticsPromise,
      nextCursor: null,
      hasMore: false,
    };
  }

  const effectiveSortField = resolveSortField(filters);
  const sortDirection =
    filters.sortDirection === "ascending" ? "asc" : "desc";

  let query: Query<DocumentData> = adminDb.collection(
    COLLECTIONS.payments,
  );

  query = applyPaymentFilters(query, filters);
  query = query
    .orderBy(effectiveSortField, sortDirection)
    .orderBy(FieldPath.documentId(), sortDirection);

  const cursor = decodeCursor(filters.cursor);

  if (cursor && cursor.field === effectiveSortField) {
    const cursorValue =
      cursor.kind === "timestamp"
        ? Timestamp.fromMillis(cursor.value)
        : cursor.value;

    query = query.startAfter(cursorValue, cursor.documentId);
  }

  const snapshot = await query
    .limit(filters.pageSize + 1)
    .get();

  const hasMore = snapshot.docs.length > filters.pageSize;
  const visibleDocuments = hasMore
    ? snapshot.docs.slice(0, filters.pageSize)
    : snapshot.docs;

  const relations = await loadPaymentRelations(visibleDocuments);
  const payments = visibleDocuments
    .map((document) => mapPaymentDocument(document, relations))
    .filter((payment) => paymentMatchesIssueFilter(payment, filters));

  const lastDocument = visibleDocuments.at(-1) ?? null;

  return {
    payments,
    statistics: await statisticsPromise,
    nextCursor:
      hasMore && lastDocument
        ? encodeCursor(lastDocument, effectiveSortField)
        : null,
    hasMore,
  };
}

export async function getAdminPaymentDetails(
  paymentId: string,
): Promise<AdminPaymentDetailsResult> {
  await requireAdmin();

  const normalizedPaymentId = paymentId.trim();

  if (!normalizedPaymentId) {
    throw new Error("The payment ID is required.");
  }

  const paymentReference = adminDb
    .collection(COLLECTIONS.payments)
    .doc(normalizedPaymentId);

  const paymentSnapshot = await paymentReference.get();

  if (!paymentSnapshot.exists) {
    throw new Error("The payment could not be found.");
  }

  const relations = await loadPaymentRelations([paymentSnapshot]);
  const payment = mapPaymentDocument(paymentSnapshot, relations);

  const [webhookSnapshot, auditSnapshot] = await Promise.all([
    adminDb
      .collection(COLLECTIONS.webhookEvents)
      .where("paymentId", "==", payment.id)
      .orderBy("processedAt", "desc")
      .limit(DETAIL_HISTORY_LIMIT)
      .get(),

    adminDb
      .collection(COLLECTIONS.adminLogs)
      .where("targetCollection", "==", COLLECTIONS.payments)
      .where("targetId", "==", payment.id)
      .orderBy("createdAt", "desc")
      .limit(DETAIL_HISTORY_LIMIT)
      .get(),
  ]);

  const bookingSnapshot = payment.mainEventId
    ? relations.bookings.get(payment.mainEventId)
    : undefined;

  const providerRequestSnapshot = payment.providerRequestId
    ? relations.providerRequests.get(payment.providerRequestId)
    : undefined;

  const bookingData = bookingSnapshot?.data() ?? {};
  const providerRequestData = providerRequestSnapshot?.data() ?? {};

  const details: AdminPaymentDetails = {
    payment,
    booking: {
      exists: bookingSnapshot?.exists === true,
      id: payment.mainEventId,
      bookingCode:
        nullableString(bookingData.bookingCode) ??
        nullableString(bookingData.referenceCode),
      eventType: nullableString(bookingData.eventType),
      eventDate: isoDateValue(bookingData.eventDate),
      status: nullableString(bookingData.status),
      paymentStatus: nullableString(bookingData.paymentStatus),
    },
    providerRequest: {
      exists: providerRequestSnapshot?.exists === true,
      id: payment.providerRequestId,
      status: nullableString(providerRequestData.status),
      requestType:
        nullableString(providerRequestData.requestType) ??
        nullableString(providerRequestData.type),
    },
    webhooks: webhookSnapshot.docs.map(mapWebhookEvent),
    auditHistory: auditSnapshot.docs.map(mapAuditEntry),
  };

  return {details};
}

function normalizeFilters(input: AdminPaymentFilters): NormalizedFilters {
  const requestedSortField = isSortField(input.sortField)
    ? input.sortField
    : "createdAt";

  return {
    search: stringValue(input.search).slice(0, 128),
    status:
      input.status === "all" || isPaymentStatus(input.status)
        ? input.status
        : "all",
    paymentType:
      input.paymentType === "all" || isPaymentType(input.paymentType)
        ? input.paymentType
        : "all",
    date: isDateFilter(input.date) ? input.date : "all",
    issue:
      input.issue === "with_issues" ||
      input.issue === "without_issues"
        ? input.issue
        : "all",
    sortField: requestedSortField,
    sortDirection:
      input.sortDirection === "ascending"
        ? "ascending"
        : "descending",
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.isSafeInteger(input.pageSize)
          ? input.pageSize
          : DEFAULT_PAGE_SIZE,
      ),
    ),
    cursor: nullableString(input.cursor),
  };
}

function resolveSortField(
  filters: NormalizedFilters,
): AdminPaymentSortField {
  if (filters.date !== "all") {
    return "createdAt";
  }

  if (
    filters.sortField === "paidAt" &&
    filters.status !== "paid" &&
    filters.status !== "refunded"
  ) {
    return "createdAt";
  }

  return filters.sortField;
}

function applyPaymentFilters(
  initialQuery: Query<DocumentData>,
  filters: NormalizedFilters,
): Query<DocumentData> {
  let query = initialQuery;

  if (filters.status !== "all") {
    query = query.where("status", "==", filters.status);
  }

  if (filters.paymentType !== "all") {
    query = query.where("paymentType", "==", filters.paymentType);
  }

  const range = getDateRange(filters.date);

  if (range.start) {
    query = query.where(
      "createdAt",
      ">=",
      Timestamp.fromDate(range.start),
    );
  }

  if (range.end) {
    query = query.where(
      "createdAt",
      "<",
      Timestamp.fromDate(range.end),
    );
  }

  return query;
}

async function searchPaymentDocuments(
  search: string,
): Promise<DocumentSnapshot<DocumentData>[]> {
  const collection = adminDb.collection(COLLECTIONS.payments);

  const [directSnapshot, bookingId, mainEventId, providerRequestId, gatewayId] =
    await Promise.all([
      collection.doc(search).get(),
      collection
        .where("bookingId", "==", search)
        .limit(SEARCH_RESULT_LIMIT)
        .get(),
      collection
        .where("mainEventId", "==", search)
        .limit(SEARCH_RESULT_LIMIT)
        .get(),
      collection
        .where("providerRequestId", "==", search)
        .limit(SEARCH_RESULT_LIMIT)
        .get(),
      collection
        .where("paymongoResourceId", "==", search)
        .limit(SEARCH_RESULT_LIMIT)
        .get(),
    ]);

  const documents = new Map<string, DocumentSnapshot<DocumentData>>();

  for (const snapshot of [
    bookingId,
    mainEventId,
    providerRequestId,
    gatewayId,
  ]) {
    for (const document of snapshot.docs) {
      documents.set(document.id, document);
    }
  }

  if (directSnapshot.exists) {
    documents.set(directSnapshot.id, directSnapshot);
  }

  return [...documents.values()].slice(0, SEARCH_RESULT_LIMIT);
}

async function loadPaymentRelations(
  paymentDocuments: readonly DocumentSnapshot<DocumentData>[],
): Promise<PaymentRelations> {
  const bookingIds = new Set<string>();
  const providerRequestIds = new Set<string>();
  const providerIds = new Set<string>();
  const customerIds = new Set<string>();

  for (const document of paymentDocuments) {
    const data = document.data() ?? {};
    const bookingId =
      nullableString(data.mainEventId) ??
      nullableString(data.bookingId);
    const providerRequestId = nullableString(data.providerRequestId);
    const providerId = nullableString(data.providerId);
    const customerId = nullableString(data.customerId);

    if (bookingId) bookingIds.add(bookingId);
    if (providerRequestId) providerRequestIds.add(providerRequestId);
    if (providerId) providerIds.add(providerId);
    if (customerId) customerIds.add(customerId);
  }

  const [bookings, providerRequests, providers, users] = await Promise.all([
    loadDocumentsById(COLLECTIONS.mainEvents, [...bookingIds]),
    loadDocumentsById(
      COLLECTIONS.providerRequests,
      [...providerRequestIds],
    ),
    loadDocumentsById(COLLECTIONS.providers, [...providerIds]),
    loadDocumentsById(COLLECTIONS.users, [...customerIds]),
  ]);

  return {bookings, providerRequests, providers, users};
}

async function loadDocumentsById(
  collectionName: string,
  ids: readonly string[],
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  const result = new Map<string, DocumentSnapshot<DocumentData>>();

  for (const chunk of chunkValues([...new Set(ids)], 30)) {
    if (chunk.length === 0) continue;

    const snapshot = await adminDb
      .collection(collectionName)
      .where(FieldPath.documentId(), "in", chunk)
      .get();

    for (const document of snapshot.docs) {
      result.set(document.id, document);
    }
  }

  return result;
}

function mapPaymentDocument(
  document: DocumentSnapshot<DocumentData>,
  relations: PaymentRelations,
): AdminPayment {
  const data = document.data() ?? {};
  const bookingId =
    nullableString(data.mainEventId) ??
    nullableString(data.bookingId) ??
    "";
  const providerRequestId = nullableString(data.providerRequestId);
  const providerId = nullableString(data.providerId) ?? "";
  const customerId = nullableString(data.customerId) ?? "";

  const bookingData = relations.bookings.get(bookingId)?.data() ?? {};
  const providerRequestData =
    providerRequestId
      ? relations.providerRequests.get(providerRequestId)?.data() ?? {}
      : {};
  const providerData = relations.providers.get(providerId)?.data() ?? {};
  const customerData = relations.users.get(customerId)?.data() ?? {};

  const status = paymentStatus(data.status);
  const amountInCentavos = canonicalAmountInCentavos(data);
  const currency = stringValue(data.currency).toUpperCase() || "PHP";
  const updatedAt = dateValue(data.updatedAt) ?? dateValue(data.createdAt);
  const refundRequestedAt = dateValue(data.refundRequestedAt);

  const issues: AdminPaymentIssue[] = [];

  if (amountInCentavos <= 0) {
    issues.push("invalid_amount");
  }

  if (!relations.bookings.has(bookingId)) {
    issues.push("missing_booking");
  }

  if (
    !providerRequestId ||
    !relations.providerRequests.has(providerRequestId)
  ) {
    issues.push("missing_provider_request");
  }

  if (!providerId || !relations.providers.has(providerId)) {
    issues.push("missing_provider");
  }

  const gatewayResourceId = nullableString(data.paymongoResourceId);

  if (
    (status === "paid" || status === "refunded") &&
    !gatewayResourceId
  ) {
    issues.push("missing_gateway_reference");
  }

  if (
    status === "processing" &&
    updatedAt &&
    Date.now() - updatedAt.getTime() >= PROCESSING_STALE_MS
  ) {
    issues.push("stale_processing");
  }

  const bookingPaymentStatus = nullableString(bookingData.paymentStatus);

  if (
    status === "paid" &&
    bookingPaymentStatus !== "partially_paid" &&
    bookingPaymentStatus !== "paid"
  ) {
    issues.push("booking_status_mismatch");
  }

  if (refundRequestedAt && status === "paid") {
    issues.push("refund_awaiting_webhook");
  }

  return {
    id: document.id,
    paymentId: nullableString(data.paymentId) ?? document.id,
    bookingId:
      nullableString(data.bookingId) ??
      bookingId,
    mainEventId: bookingId,
    bookingCode:
      nullableString(bookingData.bookingCode) ??
      nullableString(bookingData.referenceCode),
    providerRequestId,
    customerId,
    customerName: personName(customerData, "Unknown customer"),
    customerEmail: nullableString(customerData.email),
    providerId,
    providerName:
      nullableString(providerData.businessName) ??
      nullableString(providerRequestData.providerName) ??
      "Unknown provider",
    amountInCentavos,
    formattedAmount: formatCentavos(amountInCentavos, currency),
    currency,
    paymentType: paymentType(data.paymentType),
    gateway: paymentGateway(data.gateway),
    status,
    gatewayResourceId,
    gatewayCheckoutId: nullableString(data.paymongoCheckoutId),
    createdAt: isoDateValue(data.createdAt),
    updatedAt: isoDateValue(data.updatedAt),
    paidAt: isoDateValue(data.paidAt),
    failedAt: isoDateValue(data.failedAt),
    expiredAt: isoDateValue(data.expiredAt),
    refundedAt: isoDateValue(data.refundedAt),
    lastWebhookEventId: nullableString(data.lastWebhookEventId),
    issues: [...new Set(issues)],
    refundEligibility: refundEligibility({
      status,
      amountInCentavos,
      currency,
      gatewayResourceId,
      refundRequested:
        refundRequestedAt !== null,
    }),
  };
}

function refundEligibility(input: {
  status: PaymentStatus;
  amountInCentavos: number;
  currency: string;
  gatewayResourceId: string | null;
  refundRequested: boolean;
}): AdminPaymentRefundEligibility {
  if (input.status === "refunded") {
    return {
      eligible: false,
      reason: "already_refunded",
    };
  }

  if (
    input.status === "paid" &&
    input.refundRequested
  ) {
    return {
      eligible: false,
      reason: "refund_pending",
    };
  }

  if (input.status !== "paid") {
    return {
      eligible: false,
      reason: "not_paid",
    };
  }

  if (!input.gatewayResourceId) {
    return {
      eligible: false,
      reason:
        "missing_gateway_reference",
    };
  }

  if (
    !Number.isSafeInteger(
      input.amountInCentavos,
    ) ||
    input.amountInCentavos <= 0
  ) {
    return {
      eligible: false,
      reason: "invalid_amount",
    };
  }

  if (input.currency !== "PHP") {
    return {
      eligible: false,
      reason: "invalid_currency",
    };
  }

  return {
    eligible: true,
    reason: "eligible",
  };
}

async function queryAdminPaymentStatistics(): Promise<
  AdminPaymentStatistics
> {
  const payments = adminDb.collection(COLLECTIONS.payments);

  const [paid, pending, processing, failed, expired, refunded] =
    await Promise.all([
      payments
        .where("status", "==", "paid")
        .aggregate({
          amountInCentavos: AggregateField.sum("amountInCentavos"),
        })
        .get(),
      payments.where("status", "==", "pending").count().get(),
      payments.where("status", "==", "processing").count().get(),
      payments.where("status", "==", "failed").count().get(),
      payments.where("status", "==", "expired").count().get(),
      payments
        .where("status", "==", "refunded")
        .aggregate({
          amountInCentavos: AggregateField.sum("amountInCentavos"),
        })
        .get(),
    ]);

  const confirmedVolumeInCentavos = aggregateNumber(
    paid.data().amountInCentavos,
  );
  const refundedAmountInCentavos = aggregateNumber(
    refunded.data().amountInCentavos,
  );

  return {
    confirmedVolumeInCentavos,
    pendingProcessingCount:
      pending.data().count + processing.data().count,
    failedExpiredCount: failed.data().count + expired.data().count,
    refundedAmountInCentavos,
    confirmedVolumeFormatted: formatCentavos(
      confirmedVolumeInCentavos,
      "PHP",
    ),
    refundedAmountFormatted: formatCentavos(
      refundedAmountInCentavos,
      "PHP",
    ),
  };
}

function getAdminPaymentStatistics(): Promise<AdminPaymentStatistics> {
  const now = Date.now();

  if (
    paymentStatisticsCache &&
    paymentStatisticsCache.expiresAt > now
  ) {
    return paymentStatisticsCache.promise;
  }

  const promise = queryAdminPaymentStatistics();

  paymentStatisticsCache = {
    expiresAt: now + STATISTICS_CACHE_MS,
    promise,
  };

  void promise.catch(() => {
    if (paymentStatisticsCache?.promise === promise) {
      paymentStatisticsCache = null;
    }
  });

  return promise;
}

function mapWebhookEvent(
  document: QueryDocumentSnapshot<DocumentData>,
): AdminPaymentWebhookEvent {
  const data = document.data();

  return {
    id: document.id,
    eventId: nullableString(data.eventId) ?? document.id,
    eventType: nullableString(data.eventType) ?? "unknown",
    gatewayResourceId: nullableString(data.gatewayResourceId),
    status: nullableString(data.status) ?? "unknown",
    reason: nullableString(data.reason),
    processedAt: isoDateValue(data.processedAt),
  };
}

function mapAuditEntry(
  document: QueryDocumentSnapshot<DocumentData>,
): AdminPaymentAuditEntry {
  const data = document.data();
  const before = recordValue(data.before);
  const after = recordValue(data.after);

  return {
    id: document.id,
    action: nullableString(data.action) ?? "payment.activity",
    actorId: nullableString(data.actorId) ?? "system",
    actorRole: nullableString(data.actorRole) ?? "system",
    reason: nullableString(data.reason),
    source: nullableString(data.source),
    beforeStatus: nullableString(before.status),
    afterStatus: nullableString(after.status),
    createdAt: isoDateValue(data.createdAt),
  };
}

function paymentMatchesFilters(
  payment: AdminPayment,
  filters: NormalizedFilters,
): boolean {
  if (filters.status !== "all" && payment.status !== filters.status) {
    return false;
  }

  if (
    filters.paymentType !== "all" &&
    payment.paymentType !== filters.paymentType
  ) {
    return false;
  }

  if (!paymentMatchesIssueFilter(payment, filters)) return false;

  const range = getDateRange(filters.date);
  const createdAt = payment.createdAt
    ? new Date(payment.createdAt)
    : null;

  if (range.start && (!createdAt || createdAt < range.start)) {
    return false;
  }

  if (range.end && (!createdAt || createdAt >= range.end)) {
    return false;
  }

  return true;
}

function paymentMatchesIssueFilter(
  payment: AdminPayment,
  filters: NormalizedFilters,
): boolean {
  if (filters.issue === "with_issues") {
    return payment.issues.length > 0;
  }

  if (filters.issue === "without_issues") {
    return payment.issues.length === 0;
  }

  return true;
}

function comparePayments(
  left: AdminPayment,
  right: AdminPayment,
  filters: NormalizedFilters,
): number {
  const field = resolveSortField(filters);
  const multiplier = filters.sortDirection === "ascending" ? 1 : -1;

  if (field === "amountInCentavos") {
    return (
      (left.amountInCentavos - right.amountInCentavos) * multiplier
    );
  }

  const leftValue = dateMilliseconds(left[field]);
  const rightValue = dateMilliseconds(right[field]);

  return (leftValue - rightValue) * multiplier;
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
  field: AdminPaymentSortField,
): string | null {
  const rawValue = document.data()[field];
  const date = dateValue(rawValue);
  const numeric = finiteNumber(rawValue);

  const payload: PaymentCursor | null =
    field === "amountInCentavos"
      ? {
          field,
          kind: "number",
          value: numeric,
          documentId: document.id,
        }
      : date
        ? {
            field,
            kind: "timestamp",
            value: date.getTime(),
            documentId: document.id,
          }
        : null;

  return payload
    ? Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
    : null;
}

function decodeCursor(value: string | null): PaymentCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PaymentCursor>;

    if (
      !isSortField(parsed.field) ||
      (parsed.kind !== "number" && parsed.kind !== "timestamp") ||
      typeof parsed.value !== "number" ||
      !Number.isFinite(parsed.value) ||
      typeof parsed.documentId !== "string" ||
      !parsed.documentId
    ) {
      return null;
    }

    if (
      (parsed.field === "amountInCentavos") !==
      (parsed.kind === "number")
    ) {
      return null;
    }

    return parsed as PaymentCursor;
  } catch {
    return null;
  }
}

function getDateRange(filter: AdminPaymentDateFilter): {
  start: Date | null;
  end: Date | null;
} {
  if (filter === "all") {
    return {start: null, end: null};
  }

  const now = new Date();
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const startOfToday = new Date(
    Date.UTC(
      manilaNow.getUTCFullYear(),
      manilaNow.getUTCMonth(),
      manilaNow.getUTCDate(),
    ) - MANILA_OFFSET_MS,
  );
  const startOfTomorrow = new Date(startOfToday.getTime() + DAY_MS);

  if (filter === "today") {
    return {start: startOfToday, end: startOfTomorrow};
  }

  const days = filter === "last_7_days" ? 7 : 30;

  return {
    start: new Date(startOfTomorrow.getTime() - days * DAY_MS),
    end: startOfTomorrow,
  };
}

function canonicalAmountInCentavos(data: DocumentData): number {
  const amountInCentavos = finiteNumber(data.amountInCentavos);

  if (Number.isSafeInteger(amountInCentavos) && amountInCentavos > 0) {
    return amountInCentavos;
  }

  const legacyAmount = finiteNumber(data.amount);

  if (legacyAmount > 0) {
    return Math.round(legacyAmount * 100);
  }

  return 0;
}

function formatCentavos(amountInCentavos: number, currency: string): string {
  if (currency !== "PHP") {
    return `${currency} ${(amountInCentavos / 100).toFixed(2)}`;
  }

  return phpFormatter.format(amountInCentavos / 100);
}

function paymentStatus(value: unknown): PaymentStatus {
  return isPaymentStatus(value) ? value : "pending";
}

function paymentType(value: unknown): PaymentType {
  return isPaymentType(value) ? value : "provider_down_payment";
}

function paymentGateway(value: unknown): PaymentGateway {
  return typeof value === "string" &&
    (PAYMENT_GATEWAYS as readonly string[]).includes(value)
    ? (value as PaymentGateway)
    : "paymongo";
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value);
}

function isPaymentType(value: unknown): value is PaymentType {
  return typeof value === "string" &&
    (PAYMENT_TYPES as readonly string[]).includes(value);
}

function isSortField(value: unknown): value is AdminPaymentSortField {
  return (
    value === "createdAt" ||
    value === "paidAt" ||
    value === "amountInCentavos"
  );
}

function isDateFilter(value: unknown): value is AdminPaymentDateFilter {
  return (
    value === "all" ||
    value === "today" ||
    value === "last_7_days" ||
    value === "last_30_days"
  );
}

function personName(data: DocumentData, fallback: string): string {
  const fullName = nullableString(data.fullName);
  if (fullName) return fullName;

  const name = [
    nullableString(data.firstName),
    nullableString(data.lastName),
  ]
    .filter(Boolean)
    .join(" ");

  return name || fallback;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date && !Number.isNaN(result.getTime())
      ? result
      : null;
  }

  return null;
}

function isoDateValue(value: unknown): string | null {
  return dateValue(value)?.toISOString() ?? null;
}

function dateMilliseconds(value: string | null): number {
  if (!value) return 0;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const result = stringValue(value);
  return result || null;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function aggregateNumber(value: unknown): number {
  const result = finiteNumber(value);
  return Number.isSafeInteger(result) && result > 0 ? result : 0;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}