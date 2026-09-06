import "server-only";

import {
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

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import type {
  ProviderBooking,
  ProviderBookingFilter,
  ProviderBookingFilters,
  ProviderBookingPage,
  ProviderBookingPayment,
  ProviderBookingService,
  ProviderBookingSummary,
  ProviderBookingTimeline,
  ProviderBookingTimelineEntry,
} from "./provider-booking-types";

const COLLECTIONS = {
  mainEvents: "mainEvents",
  providerRequests: "providerRequests",
  payments: "payments",
} as const;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const MAX_TIMELINE_ENTRIES = 100;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

const FILTER_STATUSES = {
  pending: ["pending"],
  accepted: [
    "accepted",
    "waiting_for_down_payment",
    "payment_processing",
  ],
  confirmed: ["confirmed"],
  upcoming: ["confirmed"],
  in_progress: ["in_progress"],
  completed: ["completed"],
  cancelled: ["cancelled"],
} as const satisfies Record<
  Exclude<ProviderBookingFilter, "all">,
  readonly ProviderRequestStatus[]
>;

type NormalizedFilters = {
  status: ProviderBookingFilter;
  pageSize: number;
  cursor: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
};

type BookingCursor = {
  sortField: "createdAt" | "eventDate";
  milliseconds: number;
  documentId: string;
};

type BookingRelations = {
  mainEvents: Map<string, DocumentSnapshot<DocumentData>>;
  paymentsByProviderRequestId: Map<
    string,
    DocumentSnapshot<DocumentData>
  >;
};

export async function getProviderBookingPage(
  input: Partial<ProviderBookingFilters> = {},
): Promise<ProviderBookingPage> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  const filters = normalizeFilters(input);
  const useEventDate =
    filters.status === "upcoming" ||
    filters.dateFrom !== null ||
    filters.dateTo !== null;
  const sortField = useEventDate ? "eventDate" : "createdAt";
  const sortDirection = useEventDate ? "asc" : "desc";
  const summaryPromise = loadProviderBookingSummary(providerId);

  let query: Query<DocumentData> = adminDb
    .collection(COLLECTIONS.providerRequests)
    .where("providerId", "==", providerId);

  if (filters.status !== "all") {
    const statuses = FILTER_STATUSES[filters.status];
    query = statuses.length === 1
      ? query.where("status", "==", statuses[0])
      : query.where("status", "in", [...statuses]);
  }

  const effectiveDateFrom = filters.status === "upcoming"
    ? laterDate(filters.dateFrom, new Date())
    : filters.dateFrom;

  if (effectiveDateFrom) {
    query = query.where(
      "eventDate",
      ">=",
      Timestamp.fromDate(effectiveDateFrom),
    );
  }

  if (filters.dateTo) {
    query = query.where(
      "eventDate",
      "<=",
      Timestamp.fromDate(filters.dateTo),
    );
  }

  query = query
    .orderBy(sortField, sortDirection)
    .orderBy(FieldPath.documentId(), sortDirection);

  const cursor = decodeCursor(filters.cursor);

  if (cursor?.sortField === sortField) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.milliseconds),
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
  const relations = await loadRelations(documents, providerId);
  const bookings: ProviderBooking[] = [];
  let skippedMalformedCount = 0;

  for (const document of documents) {
    const booking = mapProviderBooking(
      document,
      providerId,
      relations,
    );

    if (booking) {
      bookings.push(booking);
    } else {
      skippedMalformedCount += 1;
    }
  }

  const lastDocument = documents.at(-1) ?? null;

  return {
    bookings,
    summary: await summaryPromise,
    nextCursor: hasMore && lastDocument
      ? encodeCursor(lastDocument, sortField)
      : null,
    hasMore,
    skippedMalformedCount,
  };
}

async function loadProviderBookingSummary(
  providerId: string,
): Promise<ProviderBookingSummary> {
  const baseQuery = adminDb
    .collection(COLLECTIONS.providerRequests)
    .where("providerId", "==", providerId);
  const countStatus = (statuses: readonly ProviderRequestStatus[]) => {
    const query = statuses.length === 1
      ? baseQuery.where("status", "==", statuses[0])
      : baseQuery.where("status", "in", [...statuses]);

    return query.count().get();
  };
  const [
    pending,
    awaitingPayment,
    confirmed,
    upcoming,
    inProgress,
    completed,
  ] = await Promise.all([
    countStatus(FILTER_STATUSES.pending),
    countStatus(FILTER_STATUSES.accepted),
    countStatus(FILTER_STATUSES.confirmed),
    baseQuery
      .where("status", "==", "confirmed")
      .where("eventDate", ">=", Timestamp.now())
      .count()
      .get(),
    countStatus(FILTER_STATUSES.in_progress),
    countStatus(FILTER_STATUSES.completed),
  ]);

  return {
    pending: pending.data().count,
    awaitingPayment: awaitingPayment.data().count,
    confirmed: confirmed.data().count,
    upcoming: upcoming.data().count,
    inProgress: inProgress.data().count,
    completed: completed.data().count,
  };
}

export async function getProviderBooking(
  providerRequestId: string,
): Promise<ProviderBooking> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  const normalizedRequestId = normalizeDocumentId(providerRequestId);
  const requestSnapshot = await adminDb
    .collection(COLLECTIONS.providerRequests)
    .doc(normalizedRequestId)
    .get();

  if (
    !requestSnapshot.exists ||
    requestSnapshot.data()?.providerId !== providerId
  ) {
    throw unavailableBooking();
  }

  const relations = await loadRelations(
    [requestSnapshot],
    providerId,
  );
  const booking = mapProviderBooking(
    requestSnapshot,
    providerId,
    relations,
  );

  if (!booking) {
    throw unavailableBooking();
  }

  return booking;
}

export async function getProviderBookingTimeline(
  providerRequestId: string,
): Promise<ProviderBookingTimeline> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  const normalizedRequestId = normalizeDocumentId(providerRequestId);
  const requestSnapshot = await adminDb
    .collection(COLLECTIONS.providerRequests)
    .doc(normalizedRequestId)
    .get();
  const requestData = requestSnapshot.data() ?? {};
  const mainEventId = optionalDocumentId(
    requestData.mainEventId ?? requestData.bookingId,
  );
  const customerId = optionalDocumentId(requestData.customerId);

  if (
    !requestSnapshot.exists ||
    requestData.providerId !== providerId ||
    !mainEventId ||
    !customerId
  ) {
    throw unavailableTimeline();
  }

  const mainEventReference = adminDb
    .collection(COLLECTIONS.mainEvents)
    .doc(mainEventId);
  const mainEventSnapshot = await mainEventReference.get();

  if (
    !mainEventSnapshot.exists ||
    mainEventSnapshot.data()?.customerId !== customerId
  ) {
    throw unavailableTimeline();
  }

  const timelineSnapshot = await mainEventReference
    .collection("timeline")
    .orderBy("createdAt", "desc")
    .limit(MAX_TIMELINE_ENTRIES)
    .get();

  return {
    providerRequestId: normalizedRequestId,
    mainEventId,
    entries: timelineSnapshot.docs.flatMap((document) => {
      const entry = mapTimelineEntry(document, normalizedRequestId);
      return entry ? [entry] : [];
    }),
  };
}

async function loadRelations(
  requestDocuments: readonly DocumentSnapshot<DocumentData>[],
  expectedProviderId: string,
): Promise<BookingRelations> {
  const mainEventIds = new Set<string>();
  const providerRequestIds = new Set<string>();

  for (const document of requestDocuments) {
    const data = document.data() ?? {};

    if (data.providerId !== expectedProviderId) {
      continue;
    }

    const mainEventId = optionalDocumentId(
      data.mainEventId ?? data.bookingId,
    );

    if (mainEventId) mainEventIds.add(mainEventId);
    providerRequestIds.add(document.id);
  }

  const [mainEventSnapshots, paymentSnapshots] = await Promise.all([
    getDocuments(COLLECTIONS.mainEvents, [...mainEventIds]),
    loadPayments(
      [...providerRequestIds],
      expectedProviderId,
    ),
  ]);

  return {
    mainEvents: new Map(
      mainEventSnapshots.map((snapshot) => [snapshot.id, snapshot]),
    ),
    paymentsByProviderRequestId: paymentSnapshots,
  };
}

async function loadPayments(
  providerRequestIds: readonly string[],
  expectedProviderId: string,
): Promise<
  Map<string, DocumentSnapshot<DocumentData>>
> {
  const payments = new Map<
    string,
    DocumentSnapshot<DocumentData>
  >();
  const ambiguousRequestIds = new Set<string>();

  for (const chunk of chunkValues(providerRequestIds, 30)) {
    const snapshot = await adminDb
      .collection(COLLECTIONS.payments)
      .where("providerRequestId", "in", chunk)
      .get();

    for (const document of snapshot.docs) {
      const data = document.data();
      const providerRequestId = optionalDocumentId(
        data.providerRequestId,
      );

      if (
        !providerRequestId ||
        !providerRequestIds.includes(providerRequestId) ||
        data.providerId !== expectedProviderId ||
        ambiguousRequestIds.has(providerRequestId)
      ) {
        continue;
      }

      if (payments.has(providerRequestId)) {
        payments.delete(providerRequestId);
        ambiguousRequestIds.add(providerRequestId);
        continue;
      }

      payments.set(providerRequestId, document);
    }
  }

  return payments;
}

async function getDocuments(
  collection: string,
  documentIds: readonly string[],
): Promise<DocumentSnapshot<DocumentData>[]> {
  if (documentIds.length === 0) return [];

  const references = documentIds.map((documentId) =>
    adminDb.collection(collection).doc(documentId),
  );

  return adminDb.getAll(...references);
}

function mapProviderBooking(
  requestSnapshot: DocumentSnapshot<DocumentData>,
  expectedProviderId: string,
  relations: BookingRelations,
): ProviderBooking | null {
  const request = requestSnapshot.data() ?? {};
  const providerRequestId = requestSnapshot.id;
  const storedRequestId = optionalDocumentId(request.providerRequestId);
  const providerId = optionalDocumentId(request.providerId);
  const mainEventId = optionalDocumentId(
    request.mainEventId ?? request.bookingId,
  );
  const customerId = optionalDocumentId(request.customerId);
  const requestStatus = normalizeProviderRequestStatus(request.status);
  const requestType = normalizeProviderRequestType(request.type);

  if (
    providerId !== expectedProviderId ||
    (storedRequestId && storedRequestId !== providerRequestId) ||
    !mainEventId ||
    !customerId ||
    !requestStatus ||
    !requestType
  ) {
    return null;
  }

  const mainEventSnapshot = relations.mainEvents.get(mainEventId);
  const mainEvent = mainEventSnapshot?.data() ?? null;
  const mainEventStatus = normalizeMainEventStatus(mainEvent?.status);

  if (
    !mainEventSnapshot?.exists ||
    !mainEvent ||
    mainEvent.customerId !== customerId ||
    !mainEventStatus
  ) {
    return null;
  }

  const eventDate = timestampIso(request.eventDate ?? mainEvent.eventDate);
  const createdAt = timestampIso(request.createdAt);

  if (!eventDate || !createdAt) {
    return null;
  }

  const paymentId = optionalDocumentId(request.paymentId);
  const relatedPayment =
    relations.paymentsByProviderRequestId.get(
      providerRequestId,
    );
  const paymentSnapshot =
    paymentId && relatedPayment?.id !== paymentId
      ? undefined
      : relatedPayment;
  const payment = mapPayment(
    paymentSnapshot,
    {
      providerRequestId,
      mainEventId,
      providerId,
      customerId,
    },
  );
  const services = normalizeServices(request.services);
  const packageId = optionalDocumentId(request.packageId);
  const packageName = optionalText(request.packageName, 160);
  const customerDisplayName = [
    optionalText(
      request.customerFirstName ?? mainEvent.customerFirstName,
      120,
    ),
    optionalText(
      request.customerLastName ?? mainEvent.customerLastName,
      120,
    ),
  ].filter(Boolean).join(" ") || "FEASTA customer";
  const eventLocation = optionalText(
    request.eventLocation ?? mainEvent.eventLocation,
    200,
  );
  const eventAddress = optionalText(
    request.eventAddress ?? mainEvent.eventAddress,
    500,
  ) ?? "";
  const requestedAmount = nonNegativeMoney(request.amount);

  return {
    providerRequestId,
    mainEventId,
    providerId,
    customerId,
    providerRequestStatus: requestStatus,
    mainEventStatus,
    paymentStatus: payment?.status ?? null,
    requestType,
    eventType: optionalText(
      request.eventType ?? mainEvent.eventType,
      100,
    ) ?? "Event",
    eventDate,
    eventTime: optionalText(
      request.eventTime ?? mainEvent.eventTime,
      40,
    ),
    eventEndTime: optionalText(
      request.eventEndTime ?? mainEvent.eventEndTime,
      40,
    ),
    guestCount: nonNegativeInteger(
      request.guestCount ?? mainEvent.guestCount,
    ),
    venueAddress: eventAddress,
    locationSummary: [eventLocation, eventAddress]
      .filter(Boolean)
      .join(" · "),
    customerDisplayName,
    packageId,
    packageName,
    services,
    serviceSummary: packageName ?? (
      services.map((service) => service.name).join(", ") ||
      (requestType === "catering" ? "Catering service" : "Event service")
    ),
    serviceCategory: optionalText(request.serviceCategory, 120) ??
      services.find((service) => service.category)?.category ??
      null,
    requestedAmount,
    acceptedAmount: request.acceptedAt
      ? nonNegativeMoney(request.acceptedAmount ?? request.amount)
      : null,
    downPaymentAmount: nonNegativeMoney(request.downPaymentAmount),
    paymentAmount: payment?.amount ?? null,
    remainingBalance: nonNegativeMoney(request.remainingBalance),
    currency: payment?.currency ?? optionalText(request.currency, 8) ?? "PHP",
    payment,
    createdAt,
    updatedAt: timestampIso(request.updatedAt),
    acceptedAt: timestampIso(request.acceptedAt),
    confirmedAt: timestampIso(request.confirmedAt),
    startedAt: timestampIso(request.startedAt),
    completedAt: timestampIso(request.completedAt),
    cancelledAt: timestampIso(request.cancelledAt),
    rejectionReason: optionalText(
      request.rejectionReason ?? request.rejectedReason,
      500,
    ),
    cancellationReason: optionalText(request.cancellationReason, 500),
    cancellationActor: optionalText(request.cancellationActor, 80),
    refundEligibility: mapRefundEligibility(request, requestStatus, payment),
    timelineCount: null,
  };
}

function mapRefundEligibility(
  request: DocumentData,
  requestStatus: ProviderRequestStatus,
  payment: ProviderBookingPayment | null,
): ProviderBooking["refundEligibility"] {
  const snapshotPresent = request.refundPolicySnapshot !== undefined && request.refundPolicySnapshot !== null;
  const agreementPresent = request.refundPolicyAgreement !== undefined && request.refundPolicyAgreement !== null;
  const statePresent = request.refundEligibilityState !== undefined && request.refundEligibilityState !== null;
  const presentCount = [snapshotPresent, agreementPresent, statePresent].filter(Boolean).length;

  if (presentCount === 0) {
    return {
      evidenceStatus: "legacy",
      currentStage: null,
      activeCancellationLocked: optionalDocumentId(request.activeCancellationRequestId) !== null,
      canMarkPreparationStarted: false,
    };
  }

  const state = recordValue(request.refundEligibilityState);
  const stage = refundEligibilityStage(state?.currentStage);
  const sequence = state?.stageSequence;
  const activeCancellationId = state?.activeCancellationRequestId === null
    ? null
    : optionalDocumentId(state?.activeCancellationRequestId);
  const stageSequenceValid = stage === "preparation_not_started"
    ? sequence === 0
    : stage === "preparation_started"
      ? sequence === 1
      : stage === "service_started" && (sequence === 1 || sequence === 2);

  if (presentCount !== 3 || !stage || !stageSequenceValid ||
    (state?.activeCancellationRequestId !== null && !activeCancellationId)) {
    return {
      evidenceStatus: "invalid",
      currentStage: null,
      activeCancellationLocked: true,
      canMarkPreparationStarted: false,
    };
  }

  const paymentReady = nonNegativeMoney(request.downPaymentAmount) === 0 || (
    request.paymentStatus === "paid" &&
    payment?.status === "paid" &&
    dateValue(request.paidAt) !== null
  );

  return {
    evidenceStatus: "policy_backed",
    currentStage: stage,
    activeCancellationLocked: activeCancellationId !== null,
    canMarkPreparationStarted:
      stage === "preparation_not_started" &&
      activeCancellationId === null &&
      requestStatus === "confirmed" &&
      paymentReady,
  };
}

function refundEligibilityStage(value: unknown): ProviderBooking["refundEligibility"]["currentStage"] {
  return value === "preparation_not_started" || value === "preparation_started" || value === "service_started"
    ? value
    : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mapPayment(
  snapshot: DocumentSnapshot<DocumentData> | undefined,
  expected: {
    providerRequestId: string;
    mainEventId: string;
    providerId: string;
    customerId: string;
  },
): ProviderBookingPayment | null {
  if (!snapshot?.exists) return null;

  const data = snapshot.data() ?? {};
  const status = normalizePaymentStatus(data.status);
  const storedPaymentId = optionalDocumentId(data.paymentId);

  if (
    !status ||
    (storedPaymentId && storedPaymentId !== snapshot.id) ||
    data.providerRequestId !== expected.providerRequestId ||
    (data.mainEventId ?? data.bookingId) !== expected.mainEventId ||
    data.providerId !== expected.providerId ||
    data.customerId !== expected.customerId
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    status,
    amount: nonNegativeMoney(data.amount),
    amountInCentavos: nonNegativeInteger(data.amountInCentavos),
    currency: optionalText(data.currency, 8) ?? "PHP",
    paymentType: optionalText(data.paymentType, 80) ?? "provider_down_payment",
    paidAt: timestampIso(data.paidAt),
    refundedAt: timestampIso(data.refundedAt),
    createdAt: timestampIso(data.createdAt),
    updatedAt: timestampIso(data.updatedAt),
  };
}

function normalizeServices(value: unknown): ProviderBookingService[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 50).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }

    const service = candidate as Record<string, unknown>;
    const name = optionalText(service.name, 160);

    if (!name) return [];

    const quantity = positiveInteger(service.quantity, 1);
    const unitPrice = nonNegativeMoney(service.unitPrice ?? service.price);

    return [{
      id: optionalDocumentId(service.id ?? service.serviceId) ??
        `service-${index + 1}`,
      name,
      category: optionalText(service.category, 120),
      quantity,
      unitPrice,
      totalPrice: nonNegativeMoney(
        service.totalPrice ?? service.total ?? unitPrice * quantity,
      ),
    }];
  });
}

function mapTimelineEntry(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  ownedProviderRequestId: string,
): ProviderBookingTimelineEntry | null {
  const data = snapshot.data();
  const type = optionalText(data.type, 100);
  const title = optionalText(data.title, 200);
  const createdAt = timestampIso(data.createdAt);

  if (!type || !title || !createdAt) return null;

  const relatedRequestId = optionalDocumentId(data.providerRequestId);

  return {
    id: snapshot.id,
    type,
    status: normalizeMainEventStatus(data.status),
    title,
    description: optionalText(data.description, 1_000),
    createdByRole: optionalText(data.createdByRole, 40),
    relatedProviderRequestId:
      relatedRequestId === ownedProviderRequestId
        ? relatedRequestId
        : null,
    createdAt,
  };
}

function normalizeFilters(
  input: Partial<ProviderBookingFilters>,
): NormalizedFilters {
  const pageSize = Number.isInteger(input.pageSize) &&
    (input.pageSize ?? 0) > 0
    ? Math.min(input.pageSize as number, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  return {
    status: isProviderBookingFilter(input.status) ? input.status : "all",
    pageSize,
    cursor: optionalText(input.cursor, 1_000),
    dateFrom: optionalInputDate(input.dateFrom, "dateFrom"),
    dateTo: optionalInputDate(input.dateTo, "dateTo"),
  };
}

function isProviderBookingFilter(
  value: unknown,
): value is ProviderBookingFilter {
  return [
    "all",
    "pending",
    "accepted",
    "confirmed",
    "upcoming",
    "in_progress",
    "completed",
    "cancelled",
  ].includes(typeof value === "string" ? value : "");
}

function optionalInputDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value !== "string") {
    throw new Error(`${field} must be an ISO date.`);
  }

  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${field} must be an ISO date.`);
  }

  return parsed;
}

function laterDate(left: Date | null, right: Date): Date {
  return left && left > right ? left : right;
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
  sortField: BookingCursor["sortField"],
): string | null {
  const value = dateValue(document.data()[sortField]);

  if (!value) return null;

  const payload: BookingCursor = {
    sortField,
    milliseconds: value.getTime(),
    documentId: document.id,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): BookingCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<BookingCursor>;

    if (
      (parsed.sortField !== "createdAt" && parsed.sortField !== "eventDate") ||
      typeof parsed.milliseconds !== "number" ||
      !Number.isFinite(parsed.milliseconds) ||
      typeof parsed.documentId !== "string" ||
      !SAFE_DOCUMENT_ID.test(parsed.documentId)
    ) {
      return null;
    }

    return {
      sortField: parsed.sortField,
      milliseconds: parsed.milliseconds,
      documentId: parsed.documentId,
    };
  } catch {
    return null;
  }
}

function normalizeDocumentId(value: unknown): string {
  const normalized = optionalDocumentId(value);

  if (!normalized) {
    throw new Error("The provider booking is unavailable.");
  }

  return normalized;
}

function optionalDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SAFE_DOCUMENT_ID.test(normalized) ? normalized : null;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function normalizeProviderRequestStatus(
  value: unknown,
): ProviderRequestStatus | null {
  return typeof value === "string" &&
    (PROVIDER_REQUEST_STATUSES as readonly string[]).includes(value)
    ? value as ProviderRequestStatus
    : null;
}

function normalizeProviderRequestType(
  value: unknown,
): ProviderRequestType | null {
  return typeof value === "string" &&
    (PROVIDER_REQUEST_TYPES as readonly string[]).includes(value)
    ? value as ProviderRequestType
    : null;
}

function normalizeMainEventStatus(value: unknown): MainEventStatus | null {
  return typeof value === "string" &&
    (MAIN_EVENT_STATUSES as readonly string[]).includes(value)
    ? value as MainEventStatus
    : null;
}

function normalizePaymentStatus(value: unknown): PaymentStatus | null {
  return typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
    ? value as PaymentStatus
    : null;
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

function timestampIso(value: unknown): string | null {
  return dateValue(value)?.toISOString() ?? null;
}

function nonNegativeMoney(value: unknown): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100_000_000
    ? Math.round(value * 100) / 100
    : 0;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : 0;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : fallback;
}

function unavailableTimeline(): Error {
  return new Error("The provider booking timeline is unavailable.");
}

function unavailableBooking(): Error {
  return new Error("The provider booking is unavailable.");
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
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
