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
  CustomerPayment,
  CustomerPaymentFilters,
  CustomerPaymentPage,
  CustomerPaymentStatistics,
} from "@/lib/customer/payments/customer-payment-types";
import {requireCustomer} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const COLLECTIONS = {
  mainEvents: "mainEvents",
  payments: "payments",
  providerRequests: "providerRequests",
  providers: "providers",
} as const;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

type NormalizedFilters = {
  search: string;
  status: CustomerPaymentFilters["status"];
  pageSize: number;
  cursor: string | null;
};

type PaymentCursor = {
  createdAtMilliseconds: number;
  documentId: string;
};

type PaymentRelations = {
  bookings: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
  providerRequests: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
  providers: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
};

export async function getCustomerPaymentPage(
  input: CustomerPaymentFilters,
): Promise<CustomerPaymentPage> {
  const customer = await requireCustomer();
  const filters = normalizeFilters(input);
  const statisticsPromise = getCustomerPaymentStatistics(customer.uid);

  if (filters.search) {
    const documents = await searchOwnedPayments(customer.uid, filters);
    const relations = await loadPaymentRelations(documents);

    return {
      payments: documents.map((document) =>
        mapPaymentDocument(document, relations, customer.uid),
      ),
      statistics: await statisticsPromise,
      nextCursor: null,
      hasMore: false,
    };
  }

  let query: Query<DocumentData> = adminDb
    .collection(COLLECTIONS.payments)
    .where("customerId", "==", customer.uid);

  if (filters.status !== "all") {
    query = query.where("status", "==", filters.status);
  }

  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  const cursor = decodeCursor(filters.cursor);

  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.createdAtMilliseconds),
      cursor.documentId,
    );
  }

  const snapshot = await query
    .limit(filters.pageSize + 1)
    .get();
  const hasMore = snapshot.docs.length > filters.pageSize;
  const documents = hasMore
    ? snapshot.docs.slice(0, filters.pageSize)
    : snapshot.docs;
  const relations = await loadPaymentRelations(documents);
  const lastDocument = documents.at(-1) ?? null;

  return {
    payments: documents.map((document) =>
      mapPaymentDocument(document, relations, customer.uid),
    ),
    statistics: await statisticsPromise,
    nextCursor:
      hasMore && lastDocument
        ? encodeCursor(lastDocument)
        : null,
    hasMore,
  };
}

function normalizeFilters(
  input: CustomerPaymentFilters,
): NormalizedFilters {
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize > 0
      ? Math.min(input.pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const status =
    input.status === "all" || isPaymentStatus(input.status)
      ? input.status
      : "all";

  return {
    search: stringValue(input.search),
    status,
    pageSize,
    cursor:
      typeof input.cursor === "string" && input.cursor.trim()
        ? input.cursor.trim()
        : null,
  };
}

async function searchOwnedPayments(
  customerId: string,
  filters: NormalizedFilters,
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const directDocumentPromise = SAFE_DOCUMENT_ID.test(filters.search)
    ? adminDb
        .collection(COLLECTIONS.payments)
        .doc(filters.search)
        .get()
    : Promise.resolve(null);
  const bookingPaymentsPromise = adminDb
    .collection(COLLECTIONS.payments)
    .where("bookingId", "==", filters.search)
    .limit(filters.pageSize)
    .get();
  const [directDocument, bookingPayments] = await Promise.all([
    directDocumentPromise,
    bookingPaymentsPromise,
  ]);
  const documents = new Map<
    string,
    QueryDocumentSnapshot<DocumentData>
  >();

  if (directDocument?.exists) {
    documents.set(
      directDocument.id,
      directDocument as QueryDocumentSnapshot<DocumentData>,
    );
  }

  for (const document of bookingPayments.docs) {
    documents.set(document.id, document);
  }

  return [...documents.values()]
    .filter((document) => {
      const data = document.data();

      return (
        data.customerId === customerId &&
        (filters.status === "all" || data.status === filters.status)
      );
    })
    .slice(0, filters.pageSize);
}

async function getCustomerPaymentStatistics(
  customerId: string,
): Promise<CustomerPaymentStatistics> {
  const payments = adminDb
    .collection(COLLECTIONS.payments)
    .where("customerId", "==", customerId);
  const [
    total,
    awaitingPayment,
    processing,
    paid,
    failedOrExpired,
    refunded,
    paidAmount,
  ] = await Promise.all([
    payments.count().get(),
    payments.where("status", "==", "pending").count().get(),
    payments.where("status", "==", "processing").count().get(),
    payments.where("status", "==", "paid").count().get(),
    payments
      .where("status", "in", ["failed", "expired"])
      .count()
      .get(),
    payments.where("status", "==", "refunded").count().get(),
    payments
      .where("status", "==", "paid")
      .aggregate({
        amountInCentavos: AggregateField.sum("amountInCentavos"),
      })
      .get(),
  ]);
  const totalPaidInCentavos = finiteNumber(
    paidAmount.data().amountInCentavos,
  );

  return {
    totalPayments: total.data().count,
    awaitingPayment: awaitingPayment.data().count,
    processing: processing.data().count,
    paid: paid.data().count,
    failedOrExpired: failedOrExpired.data().count,
    refunded: refunded.data().count,
    totalPaidInCentavos,
    totalPaidFormatted: formatCentavos(totalPaidInCentavos, "PHP"),
  };
}

async function loadPaymentRelations(
  documents: readonly DocumentSnapshot<DocumentData>[],
): Promise<PaymentRelations> {
  const bookingIds = unique(
    documents.map((document) =>
      stringValue(
        document.data()?.mainEventId || document.data()?.bookingId,
      ),
    ),
  );
  const providerRequestIds = unique(
    documents.map((document) =>
      stringValue(document.data()?.providerRequestId),
    ),
  );
  const providerIds = unique(
    documents.map((document) =>
      stringValue(document.data()?.providerId),
    ),
  );
  const [bookings, providerRequests, providers] = await Promise.all([
    loadDocuments(COLLECTIONS.mainEvents, bookingIds),
    loadDocuments(COLLECTIONS.providerRequests, providerRequestIds),
    loadDocuments(COLLECTIONS.providers, providerIds),
  ]);

  return {bookings, providerRequests, providers};
}

async function loadDocuments(
  collection: string,
  ids: readonly string[],
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  const result = new Map<string, DocumentSnapshot<DocumentData>>();

  if (ids.length === 0) return result;

  const references = ids.map((id) =>
    adminDb.collection(collection).doc(id),
  );
  const snapshots = await adminDb.getAll(...references);

  for (const snapshot of snapshots) {
    if (snapshot.exists) result.set(snapshot.id, snapshot);
  }

  return result;
}

function mapPaymentDocument(
  document: DocumentSnapshot<DocumentData>,
  relations: PaymentRelations,
  customerId: string,
): CustomerPayment {
  const data = document.data() ?? {};
  const bookingId =
    stringValue(data.mainEventId) || stringValue(data.bookingId);
  const providerRequestId = stringValue(data.providerRequestId);
  const providerId = stringValue(data.providerId);
  const bookingData = relations.bookings.get(bookingId)?.data() ?? {};
  const providerRequestData =
    relations.providerRequests.get(providerRequestId)?.data() ?? {};
  const providerData = relations.providers.get(providerId)?.data() ?? {};
  const amountInCentavos = finiteNumber(
    data.amountInCentavos,
    Math.round(finiteNumber(data.amount) * 100),
  );
  const currency = stringValue(data.currency).toUpperCase() || "PHP";
  const status = normalizePaymentStatus(data.status);
  const requestStatus = stringValue(providerRequestData.status);
  const ownsRequest = providerRequestData.customerId === customerId;

  return {
    id: document.id,
    paymentId: stringValue(data.paymentId) || document.id,
    bookingId,
    bookingCode: nullableString(bookingData.bookingCode),
    providerRequestId,
    providerId,
    providerName:
      stringValue(providerRequestData.providerBusinessName) ||
      stringValue(providerData.businessName) ||
      stringValue(bookingData.providerBusinessName) ||
      "Provider unavailable",
    amountInCentavos,
    formattedAmount: formatCentavos(amountInCentavos, currency),
    currency,
    paymentType: normalizePaymentType(data.paymentType),
    gateway: normalizePaymentGateway(data.gateway),
    status,
    canStartCheckout:
      ownsRequest &&
      ["pending", "failed", "expired"].includes(status) &&
      ["waiting_for_down_payment", "payment_processing"].includes(
        requestStatus,
      ),
    createdAt: isoDateValue(data.createdAt),
    updatedAt: isoDateValue(data.updatedAt),
    paidAt: isoDateValue(data.paidAt),
    failedAt: isoDateValue(data.failedAt),
    expiredAt: isoDateValue(data.expiredAt),
    refundedAt: isoDateValue(data.refundedAt),
  };
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
): string | null {
  const createdAt = dateValue(document.data().createdAt);

  if (!createdAt) return null;

  const payload: PaymentCursor = {
    createdAtMilliseconds: createdAt.getTime(),
    documentId: document.id,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): PaymentCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PaymentCursor>;

    if (
      typeof parsed.createdAtMilliseconds !== "number" ||
      !Number.isFinite(parsed.createdAtMilliseconds) ||
      typeof parsed.documentId !== "string" ||
      !SAFE_DOCUMENT_ID.test(parsed.documentId)
    ) {
      return null;
    }

    return {
      createdAtMilliseconds: parsed.createdAtMilliseconds,
      documentId: parsed.documentId,
    };
  } catch {
    return null;
  }
}

function normalizePaymentStatus(value: unknown): PaymentStatus {
  const normalized = stringValue(value).toLowerCase();

  return (PAYMENT_STATUSES as readonly string[]).includes(normalized)
    ? normalized as PaymentStatus
    : "pending";
}

function normalizePaymentType(value: unknown): PaymentType {
  const normalized = stringValue(value).toLowerCase();

  return (PAYMENT_TYPES as readonly string[]).includes(normalized)
    ? normalized as PaymentType
    : "provider_down_payment";
}

function normalizePaymentGateway(value: unknown): PaymentGateway {
  const normalized = stringValue(value).toLowerCase();

  return (PAYMENT_GATEWAYS as readonly string[]).includes(normalized)
    ? normalized as PaymentGateway
    : "paymongo";
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly unknown[]).includes(value);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, MAX_PAGE_SIZE);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized || null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
}

function isoDateValue(value: unknown): string | null {
  return dateValue(value)?.toISOString() ?? null;
}

function formatCentavos(amountInCentavos: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountInCentavos / 100);
  } catch {
    return `PHP ${(amountInCentavos / 100).toFixed(2)}`;
  }
}