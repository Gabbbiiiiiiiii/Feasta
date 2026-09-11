import "server-only";

import {createHash} from "node:crypto";

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
  PROVIDER_REQUEST_STATUSES,
  PROVIDER_REQUEST_TYPES,
  type MainEventStatus,
  type ProviderRequestStatus,
  type ProviderRequestType,
} from "@feasta/shared-types";

import type {
  CustomerBooking,
  CustomerBookingDetailPageResult,
  CustomerBookingDetailsResult,
  CustomerBookingFilters,
  CustomerBookingPage,
  CustomerBookingResults,
  CustomerBookingProviderRequest,
  CustomerBookingService,
  CustomerBookingStatistics,
} from "@/lib/customer/bookings/customer-booking-types";
import {
  normalizeCustomerBookingAggregateCounts,
  normalizeCustomerBookingProviderPaymentConfirmationFields,
  normalizeCustomerBookingProviderResponseFields,
} from "@/lib/customer/bookings/customer-booking-data-normalizers";
import {
  isCanonicalOwnedProviderRequest,
  normalizeCanonicalProviderRequestIds,
} from "@/lib/customer/bookings/customer-booking-membership";
import {normalizeCustomerBookingReviewStatus} from "@/lib/customer/bookings/customer-booking-review";
import {
  compareCustomerBookingTimelineEntries,
  normalizeCustomerBookingTimelineData,
} from "@/lib/customer/bookings/customer-booking-timeline-normalizer";
import {
  customerBookingStatusesForFilter,
  isCustomerBookingStatusFilter,
} from "@/lib/customer/bookings/customer-booking-status";
import {requireCustomer} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const COLLECTIONS = {
  mainEvents: "mainEvents",
  providerRequests: "providerRequests",
  reviews: "reviews",
} as const;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const MAX_TIMELINE_ENTRIES = 100;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

type NormalizedFilters = {
  search: string;
  status: CustomerBookingFilters["status"];
  pageSize: number;
  cursor: string | null;
};

type BookingCursor = {
  createdAtMilliseconds: number;
  documentId: string;
};

export async function getCustomerBookingPage(
  input: CustomerBookingFilters,
): Promise<CustomerBookingPage> {
  const customer = await requireCustomer();
  const [results, statistics] = await Promise.all([
    getOwnedCustomerBookingResults(customer.uid, input),
    getCustomerBookingStatistics(customer.uid),
  ]);

  return {
    ...results,
    statistics,
  };
}

export async function getCustomerBookingResults(
  input: CustomerBookingFilters,
): Promise<CustomerBookingResults> {
  const customer = await requireCustomer();

  return getOwnedCustomerBookingResults(customer.uid, input);
}

async function getOwnedCustomerBookingResults(
  customerId: string,
  input: CustomerBookingFilters,
): Promise<CustomerBookingResults> {
  const filters = normalizeFilters(input);

  if (filters.search) {
    const bookings = await searchOwnedBookings(customerId, filters);

    return {
      bookings,
      nextCursor: null,
      hasMore: false,
    };
  }

  let query: Query<DocumentData> = adminDb
    .collection(COLLECTIONS.mainEvents)
    .where("customerId", "==", customerId);

  const statuses = customerBookingStatusesForFilter(filters.status);

  if (statuses?.length === 1) {
    query = query.where("status", "==", statuses[0]);
  } else if (statuses && statuses.length > 1) {
    query = query.where("status", "in", statuses);
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
  const lastDocument = documents.at(-1) ?? null;

  return {
    bookings: documents.map(mapBookingDocument),
    nextCursor:
      hasMore && lastDocument
        ? encodeCursor(lastDocument)
        : null,
    hasMore,
  };
}

export async function getCustomerBookingDetails(
  bookingId: string,
): Promise<CustomerBookingDetailsResult> {
  const ownedBooking = await loadOwnedCustomerBooking(bookingId);
  const providerRequests = await loadOwnedProviderRequests(
    ownedBooking.id,
    ownedBooking.customerId,
    ownedBooking.providerRequestIds,
    normalizeMainEventStatus(ownedBooking.snapshot.data()?.status),
    false,
  );

  return {
    details: {
      booking: mapBookingDocument(ownedBooking.snapshot),
      providerRequests,
    },
  };
}

export async function getCustomerBookingDetailsWithTimeline(
  bookingId: string,
): Promise<CustomerBookingDetailPageResult> {
  const ownedBooking = await loadOwnedCustomerBooking(bookingId);
  const mainEventStatus = normalizeMainEventStatus(
    ownedBooking.snapshot.data()?.status,
  );

  const [providerRequests, timelineSnapshot] = await Promise.all([
    loadOwnedProviderRequests(
      ownedBooking.id,
      ownedBooking.customerId,
      ownedBooking.providerRequestIds,
      mainEventStatus,
      mainEventStatus === "completed",
    ),
    ownedBooking.snapshot.ref
      .collection("timeline")
      .orderBy("createdAt", "desc")
      .limit(MAX_TIMELINE_ENTRIES + 1)
      .get(),
  ]);

  const providerNames = new Map(
    providerRequests.map((request) => [
      request.providerRequestId,
      request.providerName,
    ]),
  );
  const timelineDocuments = timelineSnapshot.docs.slice(
    0,
    MAX_TIMELINE_ENTRIES,
  );
  const entries = timelineDocuments
    .flatMap((document) => {
      const entry = normalizeCustomerBookingTimelineData(
        document.id,
        document.data(),
        providerNames,
      );
      return entry ? [entry] : [];
    })
    .sort(compareCustomerBookingTimelineEntries);

  return {
    details: {
      booking: mapBookingDocument(ownedBooking.snapshot),
      providerRequests,
    },
    timeline: {
      entries,
      truncated: timelineSnapshot.docs.length > MAX_TIMELINE_ENTRIES,
    },
  };
}

export class CustomerBookingUnavailableError extends Error {
  constructor() {
    super("The booking could not be found.");
    this.name = "CustomerBookingUnavailableError";
  }
}

export function isCustomerBookingUnavailableError(
  error: unknown,
): error is CustomerBookingUnavailableError {
  return error instanceof CustomerBookingUnavailableError;
}

async function loadOwnedCustomerBooking(
  bookingId: string,
): Promise<{
  id: string;
  customerId: string;
  providerRequestIds: string[];
  snapshot: DocumentSnapshot<DocumentData>;
}> {
  const customer = await requireCustomer();
  const normalizedBookingId = normalizeOwnedBookingId(bookingId);
  const bookingSnapshot = await adminDb
    .collection(COLLECTIONS.mainEvents)
    .doc(normalizedBookingId)
    .get();
  const bookingData = bookingSnapshot.data();

  if (
    !bookingSnapshot.exists ||
    bookingData?.customerId !== customer.uid ||
    bookingData.isDeleted === true
  ) {
    throw new CustomerBookingUnavailableError();
  }

  return {
    id: normalizedBookingId,
    customerId: customer.uid,
    providerRequestIds: normalizeCanonicalProviderRequestIds(
      bookingData.providerRequestIds,
    ),
    snapshot: bookingSnapshot,
  };
}

async function loadOwnedProviderRequests(
  bookingId: string,
  customerId: string,
  providerRequestIds: readonly string[],
  mainEventStatus: MainEventStatus,
  includeReviewStatus: boolean,
): Promise<CustomerBookingProviderRequest[]> {
  if (providerRequestIds.length === 0) return [];

  const canonicalProviderRequestIds = new Set(providerRequestIds);
  const requestReferences = providerRequestIds.map((providerRequestId) =>
    adminDb
      .collection(COLLECTIONS.providerRequests)
      .doc(providerRequestId));
  const reviewReferences = includeReviewStatus
    ? providerRequestIds.map((providerRequestId) =>
        adminDb
          .collection(COLLECTIONS.reviews)
          .doc(canonicalCustomerReviewId(providerRequestId, customerId)))
    : [];
  const [requestSnapshots, reviewSnapshots] = await Promise.all([
    adminDb.getAll(...requestReferences),
    includeReviewStatus
      ? adminDb.getAll(...reviewReferences)
      : Promise.resolve([]),
  ]);
  const reviewsByProviderRequestId = new Map(
    providerRequestIds.map((providerRequestId, index) => [
      providerRequestId,
      reviewSnapshots[index],
    ]),
  );

  return requestSnapshots
    .filter((document) => {
      if (!document.exists) return false;
      const data = document.data() ?? {};

      return isCanonicalOwnedProviderRequest({
        documentId: document.id,
        storedProviderRequestId: data.providerRequestId,
        mainEventId: data.mainEventId,
        customerId: data.customerId,
      }, {
        mainEventId: bookingId,
        customerId,
        canonicalProviderRequestIds,
      });
    })
    .sort(compareProviderRequestDocuments)
    .map((document) => {
      const request = mapProviderRequestDocument(document);
      return {
        ...request,
        reviewStatus: includeReviewStatus
          ? normalizeCustomerBookingReviewStatus({
              reviewExists:
                reviewsByProviderRequestId.get(document.id)?.exists === true,
              reviewData:
                reviewsByProviderRequestId.get(document.id)?.data() ?? {},
              request,
              bookingId,
              customerId,
              mainEventStatus,
            })
          : "unavailable",
      };
    });
}

function compareProviderRequestDocuments(
  left: DocumentSnapshot<DocumentData>,
  right: DocumentSnapshot<DocumentData>,
): number {
  const leftCreatedAt = dateValue(left.data()?.createdAt)?.getTime() ??
    Number.POSITIVE_INFINITY;
  const rightCreatedAt = dateValue(right.data()?.createdAt)?.getTime() ??
    Number.POSITIVE_INFINITY;

  return leftCreatedAt - rightCreatedAt || left.id.localeCompare(right.id);
}

function normalizeFilters(
  input: CustomerBookingFilters,
): NormalizedFilters {
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize > 0
      ? Math.min(input.pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const status = isCustomerBookingStatusFilter(input.status) ?
    input.status :
    "all";

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

async function searchOwnedBookings(
  customerId: string,
  filters: NormalizedFilters,
): Promise<CustomerBooking[]> {
  const directDocumentPromise = SAFE_DOCUMENT_ID.test(filters.search)
    ? adminDb
        .collection(COLLECTIONS.mainEvents)
        .doc(filters.search)
        .get()
    : Promise.resolve(null);
  const bookingCodePromise = adminDb
    .collection(COLLECTIONS.mainEvents)
    .where("bookingCode", "==", filters.search.toUpperCase())
    .limit(1)
    .get();
  const [directDocument, bookingCodeSnapshot] = await Promise.all([
    directDocumentPromise,
    bookingCodePromise,
  ]);
  const documents = new Map<string, DocumentSnapshot<DocumentData>>();

  if (directDocument?.exists) {
    documents.set(directDocument.id, directDocument);
  }

  for (const document of bookingCodeSnapshot.docs) {
    documents.set(document.id, document);
  }

  return [...documents.values()]
    .filter((document) => {
      const data = document.data() ?? {};

      return (
        data.customerId === customerId &&
        statusMatchesFilter(data.status, filters.status)
      );
    })
    .slice(0, filters.pageSize)
    .map(mapBookingDocument);
}

async function getCustomerBookingStatistics(
  customerId: string,
): Promise<CustomerBookingStatistics> {
  const bookings = adminDb
    .collection(COLLECTIONS.mainEvents)
    .where("customerId", "==", customerId);
  const [
    total,
    upcoming,
    awaitingProvider,
    awaitingPayment,
    confirmed,
    completed,
    cancelledOrExpired,
  ] = await Promise.all([
    bookings.count().get(),
    bookings
      .where("status", "in", ["confirmed", "in_progress"])
      .where("eventDate", ">=", Timestamp.now())
      .count()
      .get(),
    bookings
      .where("status", "in", [
        "pending_provider_approval",
        "needs_provider_replacement",
      ])
      .count()
      .get(),
    bookings
      .where("status", "==", "waiting_for_down_payment")
      .count()
      .get(),
    bookings
      .where("status", "in", ["confirmed", "in_progress"])
      .count()
      .get(),
    bookings.where("status", "==", "completed").count().get(),
    bookings
      .where("status", "in", ["cancelled", "expired"])
      .count()
      .get(),
  ]);

  return {
    total: total.data().count,
    upcoming: upcoming.data().count,
    awaitingProvider: awaitingProvider.data().count,
    awaitingPayment: awaitingPayment.data().count,
    confirmed: confirmed.data().count,
    completed: completed.data().count,
    cancelledOrExpired: cancelledOrExpired.data().count,
  };
}

function mapBookingDocument(
  document: DocumentSnapshot<DocumentData>,
): CustomerBooking {
  const data = document.data() ?? {};

  return {
    id: document.id,
    bookingId: stringValue(data.bookingId) || document.id,
    bookingCode: stringValue(data.bookingCode) || document.id,
    eventType: stringValue(data.eventType) || "Unspecified event",
    eventDate: isoDateValue(data.eventDate),
    eventTime: stringValue(data.eventTime),
    eventEndTime: stringValue(data.eventEndTime),
    guestCount: integerValue(data.guestCount),
    eventLocation: stringValue(data.eventLocation),
    eventAddress: stringValue(data.eventAddress),
    providerId:
      stringValue(data.currentProviderId) || stringValue(data.providerId),
    providerName:
      stringValue(data.providerBusinessName) || "Provider unavailable",
    packageId: nullableString(data.packageId),
    packageName: nullableString(data.packageName),
    status: normalizeMainEventStatus(data.status),
    paymentStatus: stringValue(data.paymentStatus) || "unpaid",
    estimatedEventTotal: finiteNumber(
      data.estimatedEventTotal,
      finiteNumber(data.totalAmount),
    ),
    downPaymentAmount: finiteNumber(data.downPaymentAmount),
    remainingBalance: finiteNumber(data.remainingBalance),
    ...normalizeCustomerBookingAggregateCounts(data),
    submittedAt: isoDateValue(data.submittedAt),
    completedAt: isoDateValue(data.completedAt),
    createdAt: isoDateValue(data.createdAt),
    updatedAt: isoDateValue(data.updatedAt),
  };
}

function mapProviderRequestDocument(
  document: DocumentSnapshot<DocumentData>,
): CustomerBookingProviderRequest {
  const data = document.data() ?? {};

  return {
    id: document.id,
    providerRequestId:
      stringValue(data.providerRequestId) || document.id,
    mainEventId: stringValue(data.mainEventId),
    providerId: stringValue(data.providerId),
    providerName:
      stringValue(data.providerBusinessName) || "Provider unavailable",
    type: normalizeProviderRequestType(data.type),
    packageId: nullableString(data.packageId),
    packageName: nullableString(data.packageName),
    services: normalizeServices(data.services),
    amount: finiteNumber(data.amount),
    downPaymentAmount: finiteNumber(data.downPaymentAmount),
    downPaymentPercentage: finiteNumber(data.downPaymentPercentage),
    remainingBalance: finiteNumber(data.remainingBalance),
    status: normalizeProviderRequestStatus(data.status),
    paymentStatus: stringValue(data.paymentStatus) || "unpaid",
    paymentId: nullableString(data.paymentId),
    rejectionReason: nullableString(data.rejectionReason),
    cancellationReason: nullableString(data.cancellationReason),
    requestedAt: isoDateValue(data.requestedAt),
    ...normalizeCustomerBookingProviderResponseFields(data),
    confirmedAt: isoDateValue(data.confirmedAt),
    ...normalizeCustomerBookingProviderPaymentConfirmationFields(data),
    completedAt: isoDateValue(data.completedAt),
    cancelledAt: isoDateValue(data.cancelledAt),
    expiresAt: isoDateValue(data.expiresAt),
    reviewStatus: "unavailable",
  };
}

function canonicalCustomerReviewId(
  providerRequestId: string,
  customerId: string,
): string {
  return `review_${createHash("sha256")
    .update(`${providerRequestId}\u0000${customerId}`)
    .digest("hex")}`;
}

function normalizeServices(value: unknown): CustomerBookingService[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 30).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const service = candidate as Record<string, unknown>;
    const id = stringValue(service.serviceId);
    const name = stringValue(service.name);

    if (!id || !name) return [];

    return [{
      id,
      name,
      category: nullableString(service.category),
      price: finiteNumber(service.price),
      downPaymentPercentage: finiteNumber(
        service.downPaymentPercentage,
      ),
      downPaymentAmount: finiteNumber(service.downPaymentAmount),
    }];
  });
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
): string | null {
  const createdAt = dateValue(document.data().createdAt);

  if (!createdAt) return null;

  const payload: BookingCursor = {
    createdAtMilliseconds: createdAt.getTime(),
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

function normalizeOwnedBookingId(value: string): string {
  const normalized = value.trim();

  if (!SAFE_DOCUMENT_ID.test(normalized)) {
    throw new CustomerBookingUnavailableError();
  }

  return normalized;
}

function normalizeMainEventStatus(value: unknown): MainEventStatus {
  const normalized = stringValue(value).toLowerCase();

  return (MAIN_EVENT_STATUSES as readonly string[]).includes(normalized)
    ? normalized as MainEventStatus
    : "draft";
}

function normalizeProviderRequestStatus(
  value: unknown,
): ProviderRequestStatus {
  const normalized = stringValue(value).toLowerCase();

  return (PROVIDER_REQUEST_STATUSES as readonly string[]).includes(normalized)
    ? normalized as ProviderRequestStatus
    : "pending";
}

function normalizeProviderRequestType(
  value: unknown,
): ProviderRequestType {
  const normalized = stringValue(value).toLowerCase();

  return (PROVIDER_REQUEST_TYPES as readonly string[]).includes(normalized)
    ? normalized as ProviderRequestType
    : "addon";
}

function statusMatchesFilter(
  status: unknown,
  filter: CustomerBookingFilters["status"],
): boolean {
  const statuses = customerBookingStatusesForFilter(filter);

  if (statuses === null) return true;

  const normalized = stringValue(status).toLowerCase();

  return (MAIN_EVENT_STATUSES as readonly string[]).includes(normalized) &&
    statuses.includes(normalized as MainEventStatus);
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

function integerValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
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
