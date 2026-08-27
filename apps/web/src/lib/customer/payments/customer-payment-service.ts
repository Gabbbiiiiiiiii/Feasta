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
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PROVIDER_REQUEST_STATUSES,
  type MainEventStatus,
  type PaymentGateway,
  type PaymentStatus,
  type PaymentType,
  type ProviderRequestStatus,
} from "@feasta/shared-types";

import type {
  CustomerPayment,
  CustomerPaymentFilters,
  CustomerPaymentPage,
  CustomerPaymentReturnDetails,
  CustomerPaymentReturnLookup,
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

export class CustomerPaymentReturnUnavailableError extends Error {
  constructor() {
    super("Payment return unavailable");
    this.name = "CustomerPaymentReturnUnavailableError";
  }
}

export function isCustomerPaymentReturnUnavailableError(
  error: unknown,
): error is CustomerPaymentReturnUnavailableError {
  return error instanceof CustomerPaymentReturnUnavailableError;
}

export async function getCustomerPaymentReturnDetails(
  input: CustomerPaymentReturnLookup,
): Promise<CustomerPaymentReturnDetails> {
  const customer = await requireCustomer();
  const lookup = normalizeReturnLookup(input);
  const paymentSnapshot = await adminDb
    .collection(COLLECTIONS.payments)
    .doc(lookup.paymentId)
    .get();

  if (!paymentSnapshot.exists) {
    throw new CustomerPaymentReturnUnavailableError();
  }

  const payment = paymentSnapshot.data() ?? {};
  const mainEventId = stringValue(payment.mainEventId);
  const bookingId = stringValue(payment.bookingId);
  const providerRequestId = stringValue(payment.providerRequestId);
  const providerId = stringValue(payment.providerId);

  if (
    paymentSnapshot.id !== lookup.paymentId ||
    payment.paymentId !== lookup.paymentId ||
    payment.customerId !== customer.uid ||
    mainEventId !== lookup.bookingId ||
    bookingId !== lookup.bookingId ||
    providerRequestId !== lookup.providerRequestId ||
    !providerId ||
    payment.paymentType !== "provider_down_payment" ||
    payment.gateway !== "paymongo"
  ) {
    throw new CustomerPaymentReturnUnavailableError();
  }

  const [providerRequestSnapshot, mainEventSnapshot, providerSnapshot] =
    await adminDb.getAll(
      adminDb.collection(COLLECTIONS.providerRequests).doc(providerRequestId),
      adminDb.collection(COLLECTIONS.mainEvents).doc(mainEventId),
      adminDb.collection(COLLECTIONS.providers).doc(providerId),
    );

  if (
    !providerRequestSnapshot.exists ||
    !mainEventSnapshot.exists ||
    !providerSnapshot.exists ||
    providerSnapshot.id !== providerId
  ) {
    throw new CustomerPaymentReturnUnavailableError();
  }

  const providerRequest = providerRequestSnapshot.data() ?? {};
  const mainEvent = mainEventSnapshot.data() ?? {};
  const provider = providerSnapshot.data() ?? {};

  if (
    providerRequestSnapshot.id !== providerRequestId ||
    providerRequest.providerRequestId !== providerRequestId ||
    providerRequest.mainEventId !== mainEventId ||
    providerRequest.bookingId !== mainEventId ||
    providerRequest.customerId !== customer.uid ||
    providerRequest.providerId !== providerId ||
    providerRequest.paymentId !== lookup.paymentId ||
    mainEventSnapshot.id !== mainEventId ||
    mainEvent.mainEventId !== mainEventId ||
    mainEvent.bookingId !== mainEventId ||
    mainEvent.customerId !== customer.uid ||
    !Array.isArray(mainEvent.providerRequestIds) ||
    !mainEvent.providerRequestIds.includes(providerRequestId)
  ) {
    throw new CustomerPaymentReturnUnavailableError();
  }

  const paymentStatus = strictPaymentStatus(payment.status);
  const providerRequestStatus = strictProviderRequestStatus(
    providerRequest.status,
  );
  const mainEventStatus = strictMainEventStatus(mainEvent.status);
  const requestAmount = strictMoney(providerRequest.amount);
  const downPaymentAmount = strictPositiveMoney(
    providerRequest.downPaymentAmount,
  );
  const amountInCentavos = positiveCentavos(payment.amountInCentavos);
  const paymentAmount = strictPositiveMoney(payment.amount);

  if (
    !paymentStatus ||
    !providerRequestStatus ||
    !mainEventStatus ||
    requestAmount === null ||
    downPaymentAmount === null ||
    amountInCentavos === null ||
    paymentAmount === null ||
    requestAmount < downPaymentAmount ||
    payment.currency !== "PHP" ||
    amountInCentavos !== Math.round(downPaymentAmount * 100) ||
    Math.round(paymentAmount * 100) !== amountInCentavos
  ) {
    throw new CustomerPaymentReturnUnavailableError();
  }

  const services = returnServiceSummary(providerRequest.services);

  return {
    providerRequestId,
    providerName: boundedText(
      providerRequest.providerBusinessName || provider.businessName,
      "Provider unavailable",
      120,
    ),
    serviceLabel:
      services.names.length > 0
        ? services.names.join(", ")
        : boundedText(providerRequest.packageName, "Event service", 160),
    categoryLabel:
      services.categories.length > 0
        ? services.categories.map(humanizeLabel).join(", ")
        : humanizeLabel(providerRequest.type) || "Event service",
    requestAmountFormatted: formatCentavos(
      Math.round(requestAmount * 100),
      "PHP",
    ),
    downPaymentAmountFormatted: formatCentavos(
      amountInCentavos,
      "PHP",
    ),
    paymentStatus,
    providerRequestStatus,
    canStartCheckout: canRetryReturnedCheckout({
      paymentStatus,
      providerRequestStatus,
      providerRequestPaymentStatus: providerRequest.paymentStatus,
      mainEventStatus,
    }),
    bookingLabel: boundedText(
      mainEvent.bookingCode,
      "Booking details",
      80,
    ),
    bookingDetailsPath:
      `/customer/bookings/${encodeURIComponent(mainEventId)}`,
  };
}

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

function normalizeReturnLookup(
  input: unknown,
): CustomerPaymentReturnLookup {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new CustomerPaymentReturnUnavailableError();
  }

  const candidate = input as Record<string, unknown>;
  const paymentId = stringValue(candidate.paymentId);
  const providerRequestId = stringValue(candidate.providerRequestId);
  const bookingId = stringValue(candidate.bookingId);

  if (
    !SAFE_DOCUMENT_ID.test(paymentId) ||
    paymentId.length < 8 ||
    !SAFE_DOCUMENT_ID.test(providerRequestId) ||
    providerRequestId.length < 8 ||
    !SAFE_DOCUMENT_ID.test(bookingId) ||
    bookingId.length < 8
  ) {
    throw new CustomerPaymentReturnUnavailableError();
  }

  return {paymentId, providerRequestId, bookingId};
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

function strictPaymentStatus(value: unknown): PaymentStatus | null {
  const normalized = stringValue(value).toLowerCase();

  return (PAYMENT_STATUSES as readonly string[]).includes(normalized)
    ? normalized as PaymentStatus
    : null;
}

function strictMainEventStatus(value: unknown): MainEventStatus | null {
  const normalized = stringValue(value).toLowerCase();

  return (MAIN_EVENT_STATUSES as readonly string[]).includes(normalized)
    ? normalized as MainEventStatus
    : null;
}

function strictProviderRequestStatus(
  value: unknown,
): ProviderRequestStatus | null {
  const normalized = stringValue(value).toLowerCase();

  return (PROVIDER_REQUEST_STATUSES as readonly string[]).includes(normalized)
    ? normalized as ProviderRequestStatus
    : null;
}

function canRetryReturnedCheckout(input: {
  paymentStatus: PaymentStatus;
  providerRequestStatus: ProviderRequestStatus;
  providerRequestPaymentStatus: unknown;
  mainEventStatus: MainEventStatus;
}): boolean {
  return [
    "pending_provider_approval",
    "needs_provider_replacement",
    "waiting_for_down_payment",
  ].includes(input.mainEventStatus) &&
    input.providerRequestStatus === "waiting_for_down_payment" &&
    input.providerRequestPaymentStatus !== "processing" &&
    ["pending", "failed", "expired"].includes(input.paymentStatus);
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

function strictMoney(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(Math.round(value * 100))
  ) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function strictPositiveMoney(value: unknown): number | null {
  const amount = strictMoney(value);
  return amount !== null && amount > 0 ? amount : null;
}

function positiveCentavos(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0
    ? value as number
    : null;
}

function returnServiceSummary(value: unknown): {
  names: string[];
  categories: string[];
} {
  if (!Array.isArray(value)) return {names: [], categories: []};

  const names = new Set<string>();
  const categories = new Set<string>();

  for (const candidate of value.slice(0, 30)) {
    if (!candidate || typeof candidate !== "object") continue;
    const service = candidate as Record<string, unknown>;
    const name = boundedText(service.name, "", 120);
    const category = boundedText(service.category, "", 80);
    if (name) names.add(name);
    if (category) categories.add(category);
  }

  return {
    names: [...names].slice(0, 3),
    categories: [...categories].slice(0, 3),
  };
}

function boundedText(
  value: unknown,
  fallback: string,
  maximumLength: number,
): string {
  const normalized = stringValue(value);

  if (!normalized) return fallback;
  if (normalized.length <= maximumLength) return normalized;

  return `${normalized.slice(0, maximumLength - 1).trimEnd()}…`;
}

function humanizeLabel(value: unknown): string {
  return stringValue(value)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
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
