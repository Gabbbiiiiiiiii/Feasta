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

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import type {
  ProviderReview,
  ProviderReviewDetail,
  ProviderReviewFilter,
  ProviderReviewFilters,
  ProviderReviewPage,
  ProviderReviewRating,
  ProviderReviewSummary,
} from "./provider-review-types";

const COLLECTIONS = {
  reviews: "reviews",
  providerRequests: "providerRequests",
  mainEvents: "mainEvents",
  packages: "packages",
  users: "users",
} as const;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const CUSTOMER_NAME_FALLBACK = "FEASTA customer";

type NormalizedFilters = {
  rating: ProviderReviewFilter;
  pageSize: number;
  cursor: string | null;
};

type ReviewCursor = {
  rating: ProviderReviewFilter;
  createdAtMilliseconds: number;
  documentId: string;
};

type ReviewRelations = {
  providerRequests: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
  mainEvents: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
  packages: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
  users: ReadonlyMap<string, DocumentSnapshot<DocumentData>>;
};

export async function getProviderReviewPage(
  input: Partial<ProviderReviewFilters> = {},
): Promise<ProviderReviewPage> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  const filters = normalizeFilters(input);
  let query: Query<DocumentData> = adminDb
    .collection(COLLECTIONS.reviews)
    .where("providerId", "==", providerId)
    .where("isDeleted", "==", false);

  if (filters.rating !== "all") {
    query = query.where("rating", "==", Number(filters.rating));
  }

  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  const cursor = decodeCursor(filters.cursor, filters.rating);

  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.createdAtMilliseconds),
      cursor.documentId,
    );
  }

  const snapshot = await query.limit(filters.pageSize + 1).get();
  const queryHasMore = snapshot.docs.length > filters.pageSize;
  const documents = queryHasMore
    ? snapshot.docs.slice(0, filters.pageSize)
    : snapshot.docs;
  const relations = await loadReviewRelations(documents, providerId);
  const reviews: ProviderReview[] = [];
  let skippedMalformedCount = 0;

  for (const document of documents) {
    const review = mapProviderReview(document, providerId, relations);

    if (review) {
      reviews.push(review);
    } else {
      skippedMalformedCount += 1;
    }
  }

  const lastDocument = documents.at(-1) ?? null;
  const nextCursor = queryHasMore && lastDocument
    ? encodeCursor(lastDocument, filters.rating)
    : null;

  return {
    reviews,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount,
  };
}

export async function getProviderReview(
  reviewId: string,
): Promise<ProviderReviewDetail> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  const normalizedReviewId = normalizeDocumentId(reviewId);
  const reviewSnapshot = await adminDb
    .collection(COLLECTIONS.reviews)
    .doc(normalizedReviewId)
    .get();
  const reviewData = reviewSnapshot.data() ?? {};

  if (
    !reviewSnapshot.exists ||
    reviewData.providerId !== providerId ||
    reviewData.isDeleted !== false
  ) {
    throw unavailableReview();
  }

  const relations = await loadReviewRelations([reviewSnapshot], providerId);
  const review = mapProviderReview(reviewSnapshot, providerId, relations);

  if (!review) throw unavailableReview();
  return review;
}

export async function getProviderReviewSummary():
Promise<ProviderReviewSummary> {
  const account = await requireApprovedProvider();
  const providerId = normalizeDocumentId(account.providerId);
  // These trusted, transactionally-maintained counters intentionally cover
  // canonical provider-request reviews only. Valid legacy reviews remain in
  // bounded history reads, but are not folded into summary metrics because a
  // raw Firestore aggregation cannot validate their cross-document ownership.
  const providerSnapshot = await adminDb
    .collection("providers")
    .doc(providerId)
    .get();
  const provider = providerSnapshot.data() ?? {};
  const summary = canonicalReviewSummary(provider);

  if (!providerSnapshot.exists || !summary) {
    throw new Error("The provider review summary is unavailable.");
  }

  return {
    totalReviews: summary.totalReviews,
    averageRating: summary.totalReviews > 0
      ? roundRating(summary.ratingTotal / summary.totalReviews)
      : 0,
    ratingDistribution: summary.ratingDistribution,
  };
}

async function loadReviewRelations(
  reviewDocuments: readonly DocumentSnapshot<DocumentData>[],
  expectedProviderId: string,
): Promise<ReviewRelations> {
  const mainEventIds = new Set<string>();
  const providerRequestIds = new Set<string>();
  const packageIds = new Set<string>();
  const customerIds = new Set<string>();

  for (const document of reviewDocuments) {
    const data = document.data() ?? {};

    if (
      data.providerId !== expectedProviderId ||
      data.isDeleted !== false
    ) {
      continue;
    }

    if (Object.hasOwn(data, "providerRequestId")) {
      addDocumentId(providerRequestIds, data.providerRequestId);
      addDocumentId(mainEventIds, data.mainEventId);
    } else {
      addDocumentId(mainEventIds, data.bookingId);
    }
    addDocumentId(packageIds, data.packageId);
    addDocumentId(customerIds, data.customerId);
  }

  const [providerRequests, mainEvents, packages, users] = await Promise.all([
    loadDocuments(COLLECTIONS.providerRequests, providerRequestIds),
    loadDocuments(COLLECTIONS.mainEvents, mainEventIds),
    loadDocuments(COLLECTIONS.packages, packageIds),
    loadDocuments(COLLECTIONS.users, customerIds),
  ]);

  return {providerRequests, mainEvents, packages, users};
}

async function loadDocuments(
  collection: string,
  documentIds: ReadonlySet<string>,
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  if (documentIds.size === 0) return new Map();

  const snapshots = await adminDb.getAll(
    ...[...documentIds].map((documentId) =>
      adminDb.collection(collection).doc(documentId),
    ),
  );

  return new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
}

function mapProviderReview(
  document: DocumentSnapshot<DocumentData>,
  expectedProviderId: string,
  relations: ReviewRelations,
): ProviderReview | null {
  const data = document.data() ?? {};
  const providerId = optionalDocumentId(data.providerId);
  const customerId = optionalDocumentId(data.customerId);
  const canonical = Object.hasOwn(data, "providerRequestId");
  const providerRequestId = canonical
    ? optionalDocumentId(data.providerRequestId)
    : null;
  const mainEventId = optionalDocumentId(
    canonical ? data.mainEventId : data.bookingId,
  );
  const packageId = nullableDocumentId(data.packageId);
  const rating = ratingValue(data.rating);
  const comment = normalizedText(data.comment, 2_000);
  const createdAt = timestampIso(data.createdAt);
  const updatedAt = nullableTimestampIso(data.updatedAt);
  const visibility = reviewVisibility(data, canonical);

  if (
    providerId !== expectedProviderId ||
    data.isDeleted !== false ||
    !customerId ||
    !mainEventId ||
    !rating ||
    !comment ||
    !createdAt ||
    updatedAt === undefined ||
    !visibility ||
    (canonical && !providerRequestId)
  ) {
    return null;
  }

  const mainEventSnapshot = relations.mainEvents.get(mainEventId);
  const mainEvent = mainEventSnapshot?.data() ?? null;

  if (!mainEventSnapshot?.exists || !mainEvent ||
      mainEvent.customerId !== customerId) {
    return null;
  }

  if (canonical) {
    const providerRequestSnapshot = providerRequestId
      ? relations.providerRequests.get(providerRequestId)
      : null;
    const providerRequest = providerRequestSnapshot?.data() ?? null;
    const hasStoredRequestId = Object.hasOwn(
      providerRequest ?? {},
      "providerRequestId",
    );
    const storedRequestId = optionalDocumentId(
      providerRequest?.providerRequestId,
    );
    const mainEventRequestIds = documentIdArray(mainEvent.providerRequestIds);

    if (
      document.id !== canonicalReviewId(
        providerRequestId as string,
        customerId,
      ) ||
      data.schemaVersion !== 2 ||
      data.relationshipVersion !== "provider_request_v1" ||
      !providerRequestSnapshot?.exists ||
      !providerRequest ||
      (hasStoredRequestId && storedRequestId !== providerRequestId) ||
      providerRequest.mainEventId !== mainEventId ||
      providerRequest.customerId !== customerId ||
      providerRequest.providerId !== expectedProviderId ||
      providerRequest.status !== "completed" ||
      mainEvent.status !== "completed" ||
      !mainEventRequestIds.includes(providerRequestId as string)
    ) {
      return null;
    }
  } else if (
    mainEvent.providerId !== expectedProviderId ||
    mainEvent.status !== "completed"
  ) {
    return null;
  }

  const eventType = normalizedText(mainEvent.eventType, 120);
  const eventDate = timestampIso(mainEvent.eventDate);

  if (!eventType || !eventDate) return null;

  const packageSnapshot = packageId
    ? relations.packages.get(packageId)
    : null;
  const packageData = packageSnapshot?.data() ?? null;

  if (
    packageId &&
    (
      !packageSnapshot?.exists ||
      !packageData ||
      packageData.providerId !== expectedProviderId
    )
  ) {
    return null;
  }

  const reply = normalizeReply(data.providerReply, data.providerReplyAt);
  if (!reply) return null;

  const userSnapshot = relations.users.get(customerId);
  const user = userSnapshot?.data() ?? {};
  const customerDisplayName = personName(data) ??
    (userSnapshot?.exists && user.role === "customer"
      ? personName(user)
      : null) ??
    CUSTOMER_NAME_FALLBACK;

  return {
    id: document.id,
    rating,
    comment,
    customerDisplayName,
    visibility,
    context: {
      eventType,
      eventDate,
      serviceSummary: normalizedText(data.serviceName, 160) ??
        normalizedText(packageData?.name, 160) ??
        "Custom event service",
    },
    providerReply: reply.text,
    providerReplyAt: reply.createdAt,
    createdAt,
    updatedAt,
  };
}

function reviewVisibility(
  data: DocumentData,
  canonical: boolean,
): ProviderReview["visibility"] | null {
  if (
    data.moderationStatus === "published" &&
    data.isVisible === true
  ) {
    return "visible";
  }

  if (
    data.moderationStatus === "hidden" &&
    data.isVisible === false
  ) {
    return "hidden";
  }

  if (!canonical && !("moderationStatus" in data)) {
    if (data.isVisible === true) return "visible";
    if (data.isVisible === false) return "hidden";
  }

  return null;
}

function normalizeReply(
  textValue: unknown,
  dateValue: unknown,
): {text: string | null; createdAt: string | null} | null {
  if (textValue === null || textValue === undefined) {
    return dateValue === null || dateValue === undefined
      ? {text: null, createdAt: null}
      : null;
  }

  const text = normalizedText(textValue, 2_000);
  const createdAt = timestampIso(dateValue);
  return text && createdAt ? {text, createdAt} : null;
}

function normalizeFilters(
  input: Partial<ProviderReviewFilters>,
): NormalizedFilters {
  return {
    rating: isRatingFilter(input.rating) ? input.rating : "all",
    pageSize: Number.isSafeInteger(input.pageSize) &&
      (input.pageSize ?? 0) > 0
      ? Math.min(input.pageSize as number, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
    cursor: optionalText(input.cursor, 1_000),
  };
}

function isRatingFilter(value: unknown): value is ProviderReviewFilter {
  return value === "all" ||
    value === "5" ||
    value === "4" ||
    value === "3" ||
    value === "2" ||
    value === "1";
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
  rating: ProviderReviewFilter,
): string | null {
  const createdAt = dateFromValue(document.data().createdAt);
  if (!createdAt) return null;

  const payload: ReviewCursor = {
    rating,
    createdAtMilliseconds: createdAt.getTime(),
    documentId: document.id,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(
  value: string | null,
  rating: ProviderReviewFilter,
): ReviewCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ReviewCursor>;

    if (
      parsed.rating !== rating ||
      typeof parsed.createdAtMilliseconds !== "number" ||
      !Number.isFinite(parsed.createdAtMilliseconds) ||
      typeof parsed.documentId !== "string" ||
      !SAFE_DOCUMENT_ID.test(parsed.documentId)
    ) {
      return null;
    }

    return {
      rating,
      createdAtMilliseconds: parsed.createdAtMilliseconds,
      documentId: parsed.documentId,
    };
  } catch {
    return null;
  }
}

function addDocumentId(target: Set<string>, value: unknown): void {
  const documentId = optionalDocumentId(value);
  if (documentId) target.add(documentId);
}

function normalizeDocumentId(value: unknown): string {
  const normalized = optionalDocumentId(value);
  if (!normalized) throw unavailableReview();
  return normalized;
}

function nullableDocumentId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return optionalDocumentId(value);
}

function optionalDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SAFE_DOCUMENT_ID.test(normalized) ? normalized : null;
}

function personName(data: DocumentData): string | null {
  const name = [
    normalizedText(data.customerFirstName ?? data.firstName, 120),
    normalizedText(data.customerLastName ?? data.lastName, 120),
  ].filter(Boolean).join(" ");

  return name || normalizedText(data.displayName, 160);
}

function normalizedText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (value === null || value === undefined) return null;
  return normalizedText(value, maximumLength);
}

function ratingValue(value: unknown): ProviderReviewRating | null {
  return value === 1 || value === 2 || value === 3 ||
    value === 4 || value === 5
    ? value
    : null;
}

function dateFromValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const parsed = value.toDate();
    return parsed instanceof Date && Number.isFinite(parsed.getTime())
      ? parsed
      : null;
  }

  return null;
}

function timestampIso(value: unknown): string | null {
  return dateFromValue(value)?.toISOString() ?? null;
}

function nullableTimestampIso(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return timestampIso(value) ?? undefined;
}

function canonicalReviewSummary(data: DocumentData): {
  totalReviews: number;
  ratingTotal: number;
  ratingDistribution: ProviderReviewSummary["ratingDistribution"];
} | null {
  const count = safeNonNegativeInteger(data.canonicalReviewCount);
  const total = safeNonNegativeInteger(data.canonicalRatingTotal);
  const rawDistribution = recordValue(data.canonicalRatingDistribution);

  if (count === null && total === null && rawDistribution === null) {
    return {
      totalReviews: 0,
      ratingTotal: 0,
      ratingDistribution: {5: 0, 4: 0, 3: 0, 2: 0, 1: 0},
    };
  }
  if (count === null || total === null || !rawDistribution) return null;

  const ratingDistribution = {
    5: safeNonNegativeInteger(rawDistribution["5"]),
    4: safeNonNegativeInteger(rawDistribution["4"]),
    3: safeNonNegativeInteger(rawDistribution["3"]),
    2: safeNonNegativeInteger(rawDistribution["2"]),
    1: safeNonNegativeInteger(rawDistribution["1"]),
  };
  if (Object.values(ratingDistribution).some((value) => value === null)) {
    return null;
  }
  const safeDistribution = ratingDistribution as
    ProviderReviewSummary["ratingDistribution"];
  const calculatedCount = Object.values(safeDistribution)
    .reduce((sum, value) => sum + value, 0);
  const calculatedTotal = Object.entries(safeDistribution)
    .reduce((sum, [rating, value]) => sum + Number(rating) * value, 0);

  return calculatedCount === count && calculatedTotal === total
    ? {totalReviews: count, ratingTotal: total, ratingDistribution: safeDistribution}
    : null;
}

function safeNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function documentIdArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(optionalDocumentId).filter((id): id is string => id !== null)
    : [];
}

function canonicalReviewId(
  providerRequestId: string,
  customerId: string,
): string {
  return `review_${createHash("sha256")
    .update(`${providerRequestId}\u0000${customerId}`)
    .digest("hex")}`;
}

function roundRating(value: number): number {
  return Math.round(value * 100) / 100;
}

function unavailableReview(): Error {
  return new Error("The provider review is unavailable.");
}
