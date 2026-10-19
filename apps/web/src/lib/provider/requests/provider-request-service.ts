import "server-only";
import {providerInitialPaymentPresentation} from "./provider-request-payment-presentation";
import {dashboardMatches, dashboardEventStart, storedDate} from "../dashboard/provider-dashboard-projection";
import {matchesRequestSearch} from "./provider-request-presentation";

import {
  Timestamp,
  FieldPath,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  PROVIDER_REQUEST_STATUSES,
  PROVIDER_REQUEST_TYPES,
  type ProviderRequestStatus,
  type ProviderRequestType,
} from "@feasta/shared-types";

import {
  requireApprovedProvider,
} from "@/lib/auth/session";
import {
  adminDb,
} from "@/lib/firebase/admin";

import type {
  ProviderRequestListItem,
  ProviderRequestListResult,
  ProviderRequestService,
  ProviderRequestSummary,
  ProviderRequestPage,
  ProviderRequestFilters,
  ProviderRequestFilter,
} from "./provider-request-types";

const COLLECTIONS = {
  providerRequests: "providerRequests",
} as const;


const PAGE_SIZE = 10;
const SCAN_BATCH_SIZE = 30;
const MAX_FILTER_SCAN = 150;
const FILTERS = ["all", "new", "accepted", "rejected", "cancelled"];

export function normalizeRequestFilters(input: Partial<ProviderRequestFilters>): ProviderRequestFilters {
  return {status: FILTERS.includes(String(input.status)) ? input.status as ProviderRequestFilter : "all",
    search: typeof input.search === "string" ? input.search.trim().slice(0, 160) : "", cursor: input.cursor ?? null};
}

/** Bounded, provider-scoped server search. Continuation preserves access to the entire history. */
export async function getProviderRequestPage(input: Partial<ProviderRequestFilters> = {}): Promise<ProviderRequestPage> {
  const account = await requireApprovedProvider();
  const providerId = validDocumentId(account.providerId);
  if (!providerId) throw invalidProviderRequest();
  const filters = normalizeRequestFilters(input);
  const now = new Date();
  const batchSize = filters.search || filters.status === "new" ? SCAN_BATCH_SIZE : PAGE_SIZE + 1;
  let base = adminDb.collection(COLLECTIONS.providerRequests).where("providerId", "==", providerId);
  if (filters.status !== "all") base = base.where("status", "==", filters.status === "new" ? "pending" : filters.status);
  base = base.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  const cursor = decodeRequestCursor(filters.cursor, providerId, filters);
  if (cursor) base = base.startAfter(Timestamp.fromMillis(cursor.time), cursor.id);
  let scanQuery = base;
  let scanned = 0, exhausted = false, skippedMalformedCount = 0;
  let last: QueryDocumentSnapshot<DocumentData> | null = null;
  const matches: {document: QueryDocumentSnapshot<DocumentData>; request: ProviderRequestListItem}[] = [];
  while (matches.length <= PAGE_SIZE && scanned < MAX_FILTER_SCAN && !exhausted) {
    const batch = await scanQuery.limit(batchSize).get();
    if (batch.docs.length === 0) {exhausted = true; break;}
    const parents = filters.search || filters.status === "new" ? await requestParents(batch.docs) : new Map<string, DocumentData>();
    for (const document of batch.docs) {
      scanned++; last = document;
      try {
        const data = document.data();
        const linkedParent = parents.get(data.mainEventId ?? data.bookingId) ?? null;
        const parent = linkedParent?.customerId === data.customerId ? linkedParent : null;
        const request = mapProviderRequest(document, providerId);
        request.bookingReference = optionalText(data.bookingCode ?? data.bookingReference ?? parent?.bookingCode, 160);
        if (parent) request.responseUnavailableReason = responseUnavailableReason({...data, providerRequestId: data.providerRequestId ?? document.id}, parent, now);
        const current = parent != null && parent.customerId === data.customerId &&
          (!Array.isArray(parent.providerRequestIds) || parent.providerRequestIds.includes(document.id));
        if ((filters.status !== "new" || (current && dashboardMatches("new", data, parent, now))) && matchesRequestSearch(request, filters.search)) matches.push({document, request});
      } catch {skippedMalformedCount++;}
      if (matches.length > PAGE_SIZE || scanned >= MAX_FILTER_SCAN) break;
    }
    if (matches.length > PAGE_SIZE || scanned >= MAX_FILTER_SCAN) break;
    exhausted = batch.docs.length < batchSize;
    if (!exhausted && last) scanQuery = base.startAfter(last.data().createdAt, last.id);
  }
  const visible = matches.slice(0, PAGE_SIZE);
  const hasMore = matches.length > PAGE_SIZE || !exhausted;
  const next = matches.length > PAGE_SIZE ? visible.at(-1)?.document : last;
  return {requests: visible.map(item => item.request), hasMore, skippedMalformedCount,
    nextCursor: hasMore && next ? encodeRequestCursor(next, providerId, filters) : null};
}

async function requestParents(documents: QueryDocumentSnapshot<DocumentData>[]) {
  const ids = [...new Set(documents.map(doc => validDocumentId(doc.data().mainEventId ?? doc.data().bookingId)).filter((id): id is string => id !== null))];
  const parents = new Map<string, DocumentData>();
  if (ids.length) {
    const snapshots = await adminDb.getAll(...ids.map(id => adminDb.collection("mainEvents").doc(id)));
    for (const snapshot of snapshots) if (snapshot.exists) parents.set(snapshot.id, snapshot.data()!);
  }
  return parents;
}

export async function getProviderRequestDetail(requestId: string): Promise<ProviderRequestListItem> {
  const account = await requireApprovedProvider();
  const providerId = validDocumentId(account.providerId), id = validDocumentId(requestId);
  if (!providerId || !id) throw invalidProviderRequest();
  const snapshot = await adminDb.collection(COLLECTIONS.providerRequests).where("providerId", "==", providerId).where(FieldPath.documentId(), "==", id).get();
  const document = snapshot.docs[0];
  if (!document) throw new Error("This booking request is unavailable.");
  const parents = await requestParents([document]);
  const data = document.data(), linkedParent = parents.get(data.mainEventId ?? data.bookingId) ?? null;
  const parent = linkedParent?.customerId === data.customerId ? linkedParent : null;
  const request = mapProviderRequest(document, providerId);
  request.bookingReference = optionalText(data.bookingCode ?? data.bookingReference ?? parent?.bookingCode, 160);
  request.responseUnavailableReason = responseUnavailableReason({...data, providerRequestId: data.providerRequestId ?? document.id}, parent, new Date());
  return request;
}

function responseUnavailableReason(data: DocumentData, parent: DocumentData | null, now: Date): string | null {
  if (data.status === "cancelled" || parent?.status === "cancelled") return "This booking has been cancelled.";
  const expiry = storedDate(data.expiresAt), parentExpiry = storedDate(parent?.expiresAt);
  if (data.status === "expired" || parent?.status === "expired" ||
    (data.status === "pending" && ((expiry && expiry <= now) || (parentExpiry && parentExpiry <= now)))) return "This request has expired.";
  if (data.status !== "pending") return "This request has already been responded to. You can review its booking updates below.";
  if (!parent || parent.customerId !== data.customerId ||
    (Array.isArray(parent.providerRequestIds) && !parent.providerRequestIds.includes(data.providerRequestId)) ||
    !["pending_provider_approval", "needs_provider_replacement"].includes(String(parent.status))) return "This booking has changed and cannot be responded to. Please refresh or contact FEASTA support.";
  const start = dashboardEventStart(data);
  if (!start || start <= now) return "The event's scheduled start has passed or its schedule needs review.";
  if (!dashboardMatches("new", data, parent, now)) return "This booking is being reviewed or cancelled. Responses are temporarily unavailable.";
  return null;
}

function encodeRequestCursor(document: QueryDocumentSnapshot<DocumentData>, providerId: string, filters: ProviderRequestFilters): string {
  const time = storedDate(document.data().createdAt)?.getTime();
  if (time == null) throw invalidProviderRequest();
  return Buffer.from(JSON.stringify({time, id: document.id, providerId, status: filters.status, search: filters.search.toLowerCase()})).toString("base64url");
}
function decodeRequestCursor(value: unknown, providerId: string, filters: ProviderRequestFilters): {time: number; id: string} | null {
  if (value == null || value === "") return null;
  try {
    if (typeof value !== "string" || value.length > 1500) throw invalidProviderRequest();
    const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (data.providerId !== providerId || data.status !== filters.status || data.search !== filters.search.toLowerCase() ||
      !validDocumentId(data.id) || !Number.isSafeInteger(data.time) || Math.abs(data.time) > 8640000000000000) throw invalidProviderRequest();
    return {time: data.time, id: data.id};
  } catch {throw new Error("This search page is no longer available. Start your search again.");}
}

/** Compatibility for existing callers; the interactive page uses cursor pagination. */
export async function getProviderRequests(options: {newRequests?: boolean; requestId?: string} = {}): Promise<ProviderRequestListResult> {
  const page = await getProviderRequestPage({status: options.newRequests ? "new" : "all"});
  if (options.requestId && !page.requests.some(item => item.id === options.requestId)) page.requests.push(await getProviderRequestDetail(options.requestId));
  return {requests: page.requests, summary: calculateSummary(page.requests)};
}

function mapProviderRequest(
  document:
    QueryDocumentSnapshot<DocumentData>,
  expectedProviderId: string,
): ProviderRequestListItem {
  const data =
    document.data();

  const providerId =
    requiredDocumentId(
      data.providerId,
      "providerId",
    );

  if (
    providerId !==
    expectedProviderId
  ) {
    throw invalidProviderRequest();
  }

  const mainEventId =
    requiredDocumentId(
      data.mainEventId ??
        data.bookingId,
      "mainEventId",
    );

  const type =
    providerRequestType(
      data.type,
    );

  const status =
    providerRequestStatus(
      data.status,
    );

  const customerFirstName =
    optionalText(
      data.customerFirstName,
      120,
    );

  const customerLastName =
    optionalText(
      data.customerLastName,
      120,
    );

  const customerName =
    [
      customerFirstName,
      customerLastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "FEASTA customer";

  const packageId =
    optionalDocumentId(
      data.packageId,
    );

  const packageName =
    optionalText(
      data.packageName,
      160,
    );

  return {
    initialPaymentPresentation: providerInitialPaymentPresentation(data),
    id: document.id,

    mainEventId,

    providerId,

    type,

    status,

    customer: {
      id:
        requiredDocumentId(
          data.customerId,
          "customerId",
        ),

      name:
        customerName,

      email:
        optionalEmail(
          data.customerEmail,
        ),

      phoneNumber:
        optionalText(
          data.customerPhoneNumber,
          40,
        ),
    },

    package:
      packageId ||
      packageName
        ? {
            id: packageId,
            name: packageName,
          }
        : null,

    services:
      normalizeServices(
        data.services,
      ),

    event: {
      eventType:
        optionalText(
          data.eventType,
          100,
        ) ?? "Event",

      eventDate:
        timestampIso(
          data.eventDate,
        ),

      eventTime:
        optionalText(
          data.eventTime,
          40,
        ),

      guestCount:
        optionalInteger(
          data.guestCount,
          0,
          1_000_000,
        ),

      venueAddress:
        optionalText(
          data.venueAddress ?? data.eventAddress,
          500,
        ),

      city:
        optionalText(
          data.city ?? data.eventLocation,
          200,
        ),

      notes:
        optionalText(
          data.specialRequest ??
            data.notes,
          2_000,
        ),
    },

    amount:
      nonNegativeMoney(
        data.amount,
      ),

    downPaymentAmount:
      nonNegativeMoney(
        data.downPaymentAmount,
      ),

    paymentPolicy:
      paymentPolicyFromTerms(
        data.packagePaymentTerms,
      ),

    downPaymentPercentage:
      optionalNumber(
        data.downPaymentPercentage,
        0,
        100,
      ),

    rejectionReason:
      optionalText(
        data.rejectionReason,
        500,
      ),

    createdAt:
      timestampIso(
        data.createdAt,
      ),

    updatedAt:
      timestampIso(
        data.updatedAt,
      ),

    respondedAt:
      timestampIso(
        data.respondedAt,
      ),
  };
}

function paymentPolicyFromTerms(
  value: unknown,
): "full_payment" | "deposit_then_balance" | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const policy =
    (value as Record<string, unknown>)
      .paymentPolicy;

  if (
    policy === "full_payment" ||
    policy === "deposit_then_balance"
  ) {
    return policy;
  }

  return null;
}

function calculateSummary(
  requests:
    readonly ProviderRequestListItem[],
): ProviderRequestSummary {
  let pending = 0;
  let awaitingPayment = 0;
  let confirmed = 0;
  let completed = 0;

  for (const request of requests) {
    switch (request.status) {
      case "pending":
        pending += 1;
        break;

      case "waiting_for_down_payment":
      case "payment_processing":
        awaitingPayment += 1;
        break;

      case "accepted":
      case "confirmed":
      case "in_progress":
        confirmed += 1;
        break;

      case "completed":
        completed += 1;
        break;

      default:
        break;
    }
  }

  return {
    pending,
    awaitingPayment,
    confirmed,
    completed,
    total: requests.length,
  };
}

function normalizeServices(
  value: unknown,
): ProviderRequestService[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      (entry, index) =>
        normalizeService(
          entry,
          index,
        ),
    )
    .filter(
      (
        entry,
      ): entry is ProviderRequestService =>
        entry !== null,
    );
}

function normalizeService(
  value: unknown,
  index: number,
): ProviderRequestService | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const data =
    value as Record<
      string,
      unknown
    >;

  const name =
    optionalText(
      data.name,
      160,
    );

  if (!name) {
    return null;
  }

  const quantity =
    optionalInteger(
      data.quantity,
      1,
      100_000,
    ) ?? 1;

  const unitPrice =
    nonNegativeMoney(
      data.unitPrice ??
        data.price,
    );

  const explicitTotal =
    optionalNumber(
      data.totalPrice ??
        data.total,
      0,
      100_000_000,
    );

  return {
    id:
      optionalDocumentId(
        data.id,
      ) ??
      `service-${index + 1}`,

    name,

    quantity,

    unitPrice,

    totalPrice:
      explicitTotal ??
      roundCurrency(
        unitPrice *
          quantity,
      ),
  };
}

function providerRequestStatus(
  value: unknown,
): ProviderRequestStatus {
  if (
    typeof value === "string" &&
    (
      PROVIDER_REQUEST_STATUSES as
        readonly string[]
    ).includes(value)
  ) {
    return value as
      ProviderRequestStatus;
  }

  throw invalidProviderRequest();
}

function providerRequestType(
  value: unknown,
): ProviderRequestType {
  if (
    typeof value === "string" &&
    (
      PROVIDER_REQUEST_TYPES as
        readonly string[]
    ).includes(value)
  ) {
    return value as
      ProviderRequestType;
  }

  throw invalidProviderRequest();
}

function validDocumentId(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 160 ||
    normalized.includes("/")
  ) {
    return null;
  }

  return normalized;
}

function requiredDocumentId(
  value: unknown,
  field: string,
): string {
  const normalized =
    validDocumentId(value);

  if (!normalized) {
    throw new Error(
      `The provider request ${field} is invalid.`,
    );
  }

  return normalized;
}

function optionalDocumentId(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return validDocumentId(
    value,
  );
}

function optionalText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(
        /\s+/gu,
        " ",
      )
      .slice(
        0,
        maximumLength,
      );

  return normalized || null;
}

function optionalEmail(
  value: unknown,
): string | null {
  const normalized =
    optionalText(
      value,
      254,
    );

  if (
    !normalized ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
      .test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function optionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
    ? value
    : null;
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  )
    ? value
    : null;
}

function nonNegativeMoney(
  value: unknown,
): number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100_000_000
  )
    ? roundCurrency(value)
    : 0;
}

function timestampIso(
  value: unknown,
): string | null {
  if (
    value instanceof Timestamp
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime(),
    )
  ) {
    return value.toISOString();
  }

  return null;
}

function roundCurrency(
  value: number,
): number {
  return (
    Math.round(
      (value +
        Number.EPSILON) *
        100,
    ) / 100
  );
}

function invalidProviderRequest():
Error {
  return new Error(
    "A provider request contains invalid data.",
  );
}
