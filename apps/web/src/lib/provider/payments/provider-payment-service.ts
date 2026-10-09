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
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "@feasta/shared-types";

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import {
  normalizeProviderPaymentRecord,
  type ProviderPaymentSourceDocument,
} from "./provider-payment-normalization";
import type {
  ProviderPayment,
  ProviderPaymentDetail,
  ProviderPaymentFilter,
  ProviderPaymentFilters,
  ProviderPaymentMetric,
  ProviderPaymentPage,
  ProviderPaymentSummary,
} from "./provider-payment-types";

const COLLECTIONS = {
  payments: "payments",
  providerRequests: "providerRequests",
  mainEvents: "mainEvents",
} as const;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

type NormalizedFilters = {
  status: ProviderPaymentFilter;
  pageSize: number;
  cursor: string | null;
};

type PaymentCursor = {
  createdAtMilliseconds: number;
  documentId: string;
};

type PaymentRelations = {
  providerRequests: ReadonlyMap<string, ProviderPaymentSourceDocument>;
  mainEvents: ReadonlyMap<string, ProviderPaymentSourceDocument>;
};

export async function getProviderPaymentPage(
  input: Partial<ProviderPaymentFilters> = {},
): Promise<ProviderPaymentPage> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  const filters = normalizeFilters(input);
  const summaryPromise = loadProviderPaymentSummary(providerId);

  let query: Query<DocumentData> = adminDb
    .collection(COLLECTIONS.payments)
    .where("providerId", "==", providerId);

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
  const queryHasMore = snapshot.docs.length > filters.pageSize;
  const documents = queryHasMore
    ? snapshot.docs.slice(0, filters.pageSize)
    : snapshot.docs;
  const relations = await loadPaymentRelations(documents, providerId);
  const normalized = documents.flatMap((document) => {
    const detail = normalizePaymentDocument(
      document,
      providerId,
      relations,
    );

    return detail ? [detail.payment] : [];
  });
  const duplicateRequestIds = duplicateProviderRequestIds(normalized);
  const payments = normalized.filter(
    (payment) => !duplicateRequestIds.has(payment.providerRequestId),
  );
  const lastDocument = documents.at(-1) ?? null;
  const nextCursor = queryHasMore && lastDocument
    ? encodeCursor(lastDocument)
    : null;

  return {
    payments,
    summary: await summaryPromise,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount: documents.length - payments.length,
  };
}

export async function getProviderPayment(
  paymentId: string,
): Promise<ProviderPaymentDetail> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  const normalizedPaymentId = normalizeDocumentId(paymentId);
  const paymentReference = adminDb
    .collection(COLLECTIONS.payments)
    .doc(normalizedPaymentId);
  const paymentSnapshot = await paymentReference.get();
  const paymentData = paymentSnapshot.data() ?? {};
  const providerRequestId = optionalDocumentId(paymentData.providerRequestId);

  if (
    !paymentSnapshot.exists ||
    paymentData.providerId !== providerId ||
    !providerRequestId
  ) {
    throw unavailablePayment();
  }

  const duplicateSnapshot = await adminDb
    .collection(COLLECTIONS.payments)
    .where("providerRequestId", "==", providerRequestId)
    .limit(2)
    .get();

  if (
    duplicateSnapshot.size !== 1 ||
    duplicateSnapshot.docs[0]?.id !== normalizedPaymentId
  ) {
    throw unavailablePayment();
  }

  const relations = await loadPaymentRelations(
    [paymentSnapshot],
    providerId,
  );
  const detail = normalizePaymentDocument(
    paymentSnapshot,
    providerId,
    relations,
  );

  if (!detail) throw unavailablePayment();
  return detail;
}

export async function getProviderPaymentSummary():
Promise<ProviderPaymentSummary> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);

  return loadProviderPaymentSummary(providerId);
}

async function loadProviderPaymentSummary(
  providerId: string,
): Promise<ProviderPaymentSummary> {
  const payments = adminDb
    .collection(COLLECTIONS.payments)
    .where("providerId", "==", providerId);
  const metric = (status: PaymentStatus) =>
    loadPaymentMetric(
      payments.where("status", "==", status),
    );
  const [
    confirmedCustomerPayments,
    processingPayments,
    failedPayments,
    expiredPayments,
    fullyRefundedPayments,
    paymentRecords,
    refundAwaitingConfirmation,
  ] = await Promise.all([
    metric("paid"),
    metric("processing"),
    metric("failed"),
    metric("expired"),
    metric("refunded"),
    payments.count().get(),
    payments
      .where("status", "==", "paid")
      .where("refundStatus", "==", "requested")
      .count()
      .get(),
  ]);

  return {
    confirmedCustomerPayments,
    processingPayments,
    failedPayments,
    expiredPayments,
    fullyRefundedPayments,
    paymentRecords: safeAggregateInteger(paymentRecords.data().count),
    refundAwaitingConfirmation: safeAggregateInteger(
      refundAwaitingConfirmation.data().count,
    ),
  };
}

async function loadPaymentMetric(
  query: Query<DocumentData>,
): Promise<ProviderPaymentMetric> {
  const snapshot = await query.aggregate({
    count: AggregateField.count(),
    totalAmountInCentavos: AggregateField.sum("amountInCentavos"),
  }).get();
  const data = snapshot.data();

  return {
    count: safeAggregateInteger(data.count),
    totalAmountInCentavos: safeAggregateInteger(
      data.totalAmountInCentavos,
    ),
  };
}

async function loadPaymentRelations(
  paymentDocuments: readonly DocumentSnapshot<DocumentData>[],
  expectedProviderId: string,
): Promise<PaymentRelations> {
  const providerRequestIds = new Set<string>();
  const mainEventIds = new Set<string>();

  for (const document of paymentDocuments) {
    const payment = document.data() ?? {};

    if (payment.providerId !== expectedProviderId) continue;

    const providerRequestId = optionalDocumentId(payment.providerRequestId);
    const mainEventId = optionalDocumentId(
      payment.mainEventId ?? payment.bookingId,
    );

    if (providerRequestId) providerRequestIds.add(providerRequestId);
    if (mainEventId) mainEventIds.add(mainEventId);
  }

  const [providerRequests, mainEvents] = await Promise.all([
    loadDocuments(COLLECTIONS.providerRequests, [...providerRequestIds]),
    loadDocuments(COLLECTIONS.mainEvents, [...mainEventIds]),
  ]);

  return {providerRequests, mainEvents};
}

async function loadDocuments(
  collection: string,
  documentIds: readonly string[],
): Promise<Map<string, ProviderPaymentSourceDocument>> {
  const documents = new Map<string, ProviderPaymentSourceDocument>();

  if (documentIds.length === 0) return documents;

  const snapshots = await adminDb.getAll(
    ...documentIds.map((documentId) =>
      adminDb.collection(collection).doc(documentId),
    ),
  );

  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    documents.set(snapshot.id, sourceDocument(snapshot));
  }

  return documents;
}

function normalizePaymentDocument(
  document: DocumentSnapshot<DocumentData>,
  trustedProviderId: string,
  relations: PaymentRelations,
): ProviderPaymentDetail | null {
  const payment = sourceDocument(document);
  const providerRequestId = optionalDocumentId(
    payment.data.providerRequestId,
  );
  const mainEventId = optionalDocumentId(
    payment.data.mainEventId ?? payment.data.bookingId,
  );

  return normalizeProviderPaymentRecord({
    payment,
    providerRequest: providerRequestId
      ? relations.providerRequests.get(providerRequestId) ?? null
      : null,
    mainEvent: mainEventId
      ? relations.mainEvents.get(mainEventId) ?? null
      : null,
    trustedProviderId,
  });
}

function sourceDocument(
  snapshot: DocumentSnapshot<DocumentData>,
): ProviderPaymentSourceDocument {
  return {
    id: snapshot.id,
    data: snapshot.data() ?? {},
  };
}

function duplicateProviderRequestIds(
  payments: readonly ProviderPayment[],
): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const payment of payments) {
    if (seen.has(payment.providerRequestId)) {
      duplicates.add(payment.providerRequestId);
    }
    seen.add(payment.providerRequestId);
  }

  return duplicates;
}

function normalizeFilters(
  input: Partial<ProviderPaymentFilters>,
): NormalizedFilters {
  return {
    status: isPaymentFilter(input.status) ? input.status : "all",
    pageSize: Number.isSafeInteger(input.pageSize) &&
      (input.pageSize ?? 0) > 0
      ? Math.min(input.pageSize as number, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
    cursor: optionalText(input.cursor, 1_000),
  };
}

function isPaymentFilter(value: unknown): value is ProviderPaymentFilter {
  return value === "all" || (
    typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
  );
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

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;

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

  return null;
}

function normalizeDocumentId(value: unknown): string {
  const normalized = optionalDocumentId(value);
  if (!normalized) throw unavailablePayment();
  return normalized;
}

function optionalDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SAFE_DOCUMENT_ID.test(normalized) ? normalized : null;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function safeAggregateInteger(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : 0;
}

function unavailablePayment(): Error {
  return new Error("The provider payment is unavailable.");
}
