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

import type {
  AdminReview,
  AdminReviewAuditEntry,
  AdminReviewDateFilter,
  AdminReviewDetails,
  AdminReviewDetailsResult,
  AdminReviewFilters,
  AdminReviewPage,
  AdminReviewSortField,
  AdminReviewStatistics,
} from "@/lib/admin/reviews/admin-review-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const COLLECTIONS = {
  reviews: "reviews",
  mainEvents: "mainEvents",
  packages: "packages",
  providers: "providers",
  users: "users",
  adminLogs: "adminLogs",
} as const;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const SEARCH_RESULT_LIMIT = 100;
const FILTER_SCAN_BATCH_SIZE = 30;
const FILTER_SCAN_LIMIT = 300;
const DETAIL_HISTORY_LIMIT = 25;
const STATISTICS_CACHE_MS = 30 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let reviewStatisticsCache: {
  expiresAt: number;
  promise: Promise<AdminReviewStatistics>;
} | null = null;

type NormalizedFilters = Omit<AdminReviewFilters, "cursor"> & {
  cursor: string | null;
};

type ReviewCursor = {
  field: AdminReviewSortField;
  kind: "number" | "timestamp";
  value: number;
  documentId: string;
};

type ReviewRelations = {
  bookings: Map<string, DocumentSnapshot<DocumentData>>;
  packages: Map<string, DocumentSnapshot<DocumentData>>;
  providers: Map<string, DocumentSnapshot<DocumentData>>;
  users: Map<string, DocumentSnapshot<DocumentData>>;
};

export async function getAdminReviewPage(
  input: AdminReviewFilters,
): Promise<AdminReviewPage> {
  await requireAdmin();

  const filters = normalizeFilters(input);
  const statisticsPromise = getAdminReviewStatistics();

  if (filters.search) {
    const snapshot = await adminDb
      .collection(COLLECTIONS.reviews)
      .orderBy("createdAt", "desc")
      .limit(SEARCH_RESULT_LIMIT)
      .get();
    const relations = await loadReviewRelations(snapshot.docs);
    const query = filters.search.toLocaleLowerCase("en-PH");
    const reviews = snapshot.docs
      .map((document) => mapReviewDocument(document, relations))
      .filter((review) => reviewMatchesFilters(review, filters))
      .filter((review) => reviewSearchText(review).includes(query))
      .sort((left, right) => compareReviews(left, right, filters))
      .slice(0, filters.pageSize);

    return {
      reviews,
      statistics: await statisticsPromise,
      nextCursor: null,
      hasMore: false,
    };
  }

  const direction = filters.sortDirection === "ascending" ? "asc" : "desc";
  let query: Query<DocumentData> = adminDb
    .collection(COLLECTIONS.reviews)
    .orderBy(filters.sortField, direction)
    .orderBy(FieldPath.documentId(), direction);
  const cursor = decodeCursor(filters.cursor);
  if (cursor && cursor.field === filters.sortField) {
    query = query.startAfter(
      cursor.kind === "timestamp"
        ? Timestamp.fromMillis(cursor.value)
        : cursor.value,
      cursor.documentId,
    );
  }

  const matching: Array<{
    document: QueryDocumentSnapshot<DocumentData>;
    review: AdminReview;
  }> = [];
  let scanned = 0;
  let exhausted = false;
  let scanQuery = query;
  let lastScanned: QueryDocumentSnapshot<DocumentData> | null = null;

  while (
    matching.length <= filters.pageSize &&
    scanned < FILTER_SCAN_LIMIT &&
    !exhausted
  ) {
    const snapshot = await scanQuery.limit(FILTER_SCAN_BATCH_SIZE).get();
    if (snapshot.empty) {
      exhausted = true;
      break;
    }
    const relations = await loadReviewRelations(snapshot.docs);
    for (const document of snapshot.docs) {
      scanned += 1;
      lastScanned = document;
      const review = mapReviewDocument(document, relations);
      if (reviewMatchesFilters(review, filters)) {
        matching.push({document, review});
        if (matching.length > filters.pageSize) break;
      }
      if (scanned >= FILTER_SCAN_LIMIT) break;
    }
    if (matching.length > filters.pageSize || scanned >= FILTER_SCAN_LIMIT) {
      break;
    }
    exhausted = snapshot.docs.length < FILTER_SCAN_BATCH_SIZE;
    if (!exhausted) {
      const finalDocument = snapshot.docs.at(-1);
      if (finalDocument) {
        const rawValue = finalDocument.data()[filters.sortField];
        scanQuery = query.startAfter(rawValue, finalDocument.id);
      }
    }
  }

  const visible = matching.slice(0, filters.pageSize);
  const hasMore = matching.length > filters.pageSize || !exhausted;
  const lastDocument = matching.length > filters.pageSize
    ? visible.at(-1)?.document ?? null
    : lastScanned;

  return {
    reviews: visible.map(({review}) => review),
    statistics: await statisticsPromise,
    nextCursor: hasMore && lastDocument
      ? encodeCursor(lastDocument, filters.sortField)
      : null,
    hasMore,
  };
}

export async function getAdminReviewDetails(
  reviewId: string,
): Promise<AdminReviewDetailsResult> {
  await requireAdmin();
  const normalizedId = reviewId.trim();
  if (!normalizedId || normalizedId.length > 256) {
    throw new Error("A valid review ID is required.");
  }

  const reviewSnapshot = await adminDb
    .collection(COLLECTIONS.reviews)
    .doc(normalizedId)
    .get();
  if (!reviewSnapshot.exists) {
    throw new Error("The review could not be found.");
  }

  const relations = await loadReviewRelations([reviewSnapshot]);
  const review = mapReviewDocument(reviewSnapshot, relations);
  const bookingData = relations.bookings.get(review.bookingId)?.data() ?? {};
  const providerData = relations.providers.get(review.providerId)?.data() ?? {};
  const auditSnapshot = await adminDb
    .collection(COLLECTIONS.adminLogs)
    .where("targetCollection", "==", COLLECTIONS.reviews)
    .where("targetId", "==", review.id)
    .orderBy("createdAt", "desc")
    .limit(DETAIL_HISTORY_LIMIT)
    .get();

  const details: AdminReviewDetails = {
    review,
    booking: {
      exists: relations.bookings.get(review.bookingId)?.exists === true,
      id: review.bookingId,
      bookingCode:
        nullableString(bookingData.bookingCode) ??
        nullableString(bookingData.referenceCode),
      eventType: nullableString(bookingData.eventType),
      eventDate: isoDateValue(bookingData.eventDate),
      status: nullableString(bookingData.status),
    },
    provider: {
      exists: relations.providers.get(review.providerId)?.exists === true,
      id: review.providerId,
      name: review.providerName,
      ownerId: nullableString(providerData.ownerId),
      verificationStatus: nullableString(providerData.verificationStatus),
      ratingAverage: finiteNumber(providerData.ratingAverage),
      reviewCount: nonNegativeInteger(providerData.reviewCount),
    },
    auditHistory: auditSnapshot.docs.map(mapAuditEntry),
  };

  return {details};
}

async function loadReviewRelations(
  documents: readonly DocumentSnapshot<DocumentData>[],
): Promise<ReviewRelations> {
  const bookingIds = new Set<string>();
  const packageIds = new Set<string>();
  const providerIds = new Set<string>();
  const customerIds = new Set<string>();

  for (const document of documents) {
    const data = document.data() ?? {};
    addString(bookingIds, data.mainEventId ?? data.bookingId);
    addString(packageIds, data.packageId);
    addString(providerIds, data.providerId);
    addString(customerIds, data.customerId);
  }

  const [bookings, packages, providers, users] = await Promise.all([
    loadDocuments(COLLECTIONS.mainEvents, bookingIds),
    loadDocuments(COLLECTIONS.packages, packageIds),
    loadDocuments(COLLECTIONS.providers, providerIds),
    loadDocuments(COLLECTIONS.users, customerIds),
  ]);
  return {bookings, packages, providers, users};
}

async function loadDocuments(
  collection: string,
  ids: ReadonlySet<string>,
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  const references = [...ids].map((id) => adminDb.collection(collection).doc(id));
  if (references.length === 0) return new Map();
  const snapshots = await adminDb.getAll(...references);
  return new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
}

function mapReviewDocument(
  document: DocumentSnapshot<DocumentData>,
  relations: ReviewRelations,
): AdminReview {
  const data = document.data() ?? {};
  const providerRequestId = nullableString(data.providerRequestId);
  const bookingId = nullableString(data.mainEventId ?? data.bookingId) ?? "";
  const packageId = nullableString(data.packageId);
  const customerId = nullableString(data.customerId) ?? "";
  const providerId = nullableString(data.providerId) ?? "";
  const booking = relations.bookings.get(bookingId)?.data() ?? {};
  const packageData = packageId
    ? relations.packages.get(packageId)?.data() ?? {}
    : {};
  const customer = relations.users.get(customerId)?.data() ?? {};
  const provider = relations.providers.get(providerId)?.data() ?? {};
  const status = moderationStatus(data);

  return {
    id: document.id,
    reviewId: document.id,
    providerRequestId,
    bookingId,
    bookingCode:
      nullableString(booking.bookingCode) ?? nullableString(booking.referenceCode),
    packageId,
    packageName: nullableString(packageData.name),
    customerId,
    customerName:
      reviewCustomerName(data) ?? personName(customer, "Unknown customer"),
    customerEmail: nullableString(customer.email),
    providerId,
    providerName: nullableString(provider.businessName) ?? "Unknown provider",
    providerOwnerId: nullableString(provider.ownerId),
    rating: ratingValue(data.rating),
    comment: nullableString(data.comment) ?? "",
    providerReply: nullableString(data.providerReply),
    providerReplyAt: isoDateValue(data.providerReplyAt),
    moderationStatus: status,
    moderationReason: nullableString(data.moderationReason),
    moderatedAt: isoDateValue(data.moderatedAt),
    moderatedBy: nullableString(data.moderatedBy),
    isVisible: status === "published" && data.isVisible !== false,
    isReported: data.isReported === true,
    isDeleted: data.isDeleted === true,
    createdAt: isoDateValue(data.createdAt),
    updatedAt: isoDateValue(data.updatedAt),
  };
}

function moderationStatus(data: DocumentData): "published" | "hidden" {
  if (data.moderationStatus === "hidden" || data.isVisible === false) {
    return "hidden";
  }
  return "published";
}

function reviewMatchesFilters(
  review: AdminReview,
  filters: NormalizedFilters,
): boolean {
  if (review.isDeleted) return false;
  if (filters.status !== "all" && review.moderationStatus !== filters.status) {
    return false;
  }
  if (filters.report === "reported" && !review.isReported) return false;
  if (filters.report === "not_reported" && review.isReported) return false;
  if (filters.rating !== "all" && review.rating !== Number(filters.rating)) {
    return false;
  }
  const range = getDateRange(filters.date);
  const createdAt = review.createdAt ? new Date(review.createdAt) : null;
  if (range.start && (!createdAt || createdAt < range.start)) return false;
  if (range.end && (!createdAt || createdAt >= range.end)) return false;
  return true;
}

function reviewSearchText(review: AdminReview): string {
  return [
    review.id,
    review.bookingId,
    review.bookingCode,
    review.customerId,
    review.customerName,
    review.customerEmail,
    review.providerId,
    review.providerName,
    review.packageId,
    review.packageName,
    review.comment,
  ].filter(Boolean).join(" ").toLocaleLowerCase("en-PH");
}

function compareReviews(
  left: AdminReview,
  right: AdminReview,
  filters: NormalizedFilters,
): number {
  const multiplier = filters.sortDirection === "ascending" ? 1 : -1;
  if (filters.sortField === "rating") {
    return (left.rating - right.rating) * multiplier;
  }
  return (
    dateMilliseconds(left.createdAt) - dateMilliseconds(right.createdAt)
  ) * multiplier;
}

async function queryAdminReviewStatistics(): Promise<AdminReviewStatistics> {
  const reviews = adminDb.collection(COLLECTIONS.reviews);
  const active = reviews.where("isDeleted", "==", false);
  const published = active.where("isVisible", "==", true);
  const [total, publishedCount, reported, hidden, average] = await Promise.all([
    active.count().get(),
    published.count().get(),
    active.where("isReported", "==", true).count().get(),
    active.where("isVisible", "==", false).count().get(),
    published.aggregate({rating: AggregateField.average("rating")}).get(),
  ]);
  return {
    totalCount: total.data().count,
    publishedCount: publishedCount.data().count,
    reportedCount: reported.data().count,
    hiddenCount: hidden.data().count,
    averageRating: roundRating(aggregateNumber(average.data().rating)),
  };
}

function getAdminReviewStatistics(): Promise<AdminReviewStatistics> {
  const now = Date.now();
  if (reviewStatisticsCache && reviewStatisticsCache.expiresAt > now) {
    return reviewStatisticsCache.promise;
  }
  const promise = queryAdminReviewStatistics();
  reviewStatisticsCache = {
    expiresAt: now + STATISTICS_CACHE_MS,
    promise,
  };
  void promise.catch(() => {
    if (reviewStatisticsCache?.promise === promise) reviewStatisticsCache = null;
  });
  return promise;
}

function mapAuditEntry(
  document: QueryDocumentSnapshot<DocumentData>,
): AdminReviewAuditEntry {
  const data = document.data();
  const before = recordValue(data.before);
  const after = recordValue(data.after);
  return {
    id: document.id,
    action: nullableString(data.action) ?? "review.activity",
    actorId: nullableString(data.actorId) ?? "system",
    actorRole: nullableString(data.actorRole) ?? "system",
    reason: nullableString(data.reason),
    source: nullableString(data.source),
    beforeStatus: nullableString(before.moderationStatus),
    afterStatus: nullableString(after.moderationStatus),
    createdAt: isoDateValue(data.createdAt),
  };
}

function normalizeFilters(input: AdminReviewFilters): NormalizedFilters {
  return {
    search: typeof input.search === "string"
      ? input.search.trim().slice(0, 160)
      : "",
    status: input.status === "published" || input.status === "hidden"
      ? input.status
      : "all",
    report: input.report === "reported" || input.report === "not_reported"
      ? input.report
      : "all",
    rating: ["1", "2", "3", "4", "5"].includes(input.rating)
      ? input.rating
      : "all",
    date: isDateFilter(input.date) ? input.date : "all",
    sortField: input.sortField === "rating" ? "rating" : "createdAt",
    sortDirection: input.sortDirection === "ascending"
      ? "ascending"
      : "descending",
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.isSafeInteger(input.pageSize)
        ? input.pageSize
        : DEFAULT_PAGE_SIZE),
    ),
    cursor: typeof input.cursor === "string" && input.cursor
      ? input.cursor
      : null,
  };
}

function encodeCursor(
  document: DocumentSnapshot<DocumentData>,
  field: AdminReviewSortField,
): string | null {
  const raw = document.data()?.[field];
  const date = dateValue(raw);
  const payload: ReviewCursor | null = field === "rating"
    ? {
        field,
        kind: "number",
        value: ratingValue(raw),
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

function decodeCursor(value: string | null): ReviewCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ReviewCursor>;
    if (
      (parsed.field !== "createdAt" && parsed.field !== "rating") ||
      (parsed.kind !== "number" && parsed.kind !== "timestamp") ||
      typeof parsed.value !== "number" ||
      !Number.isFinite(parsed.value) ||
      typeof parsed.documentId !== "string" ||
      !parsed.documentId ||
      (parsed.field === "rating") !== (parsed.kind === "number")
    ) {
      return null;
    }
    return parsed as ReviewCursor;
  } catch {
    return null;
  }
}

function getDateRange(filter: AdminReviewDateFilter): {
  start: Date | null;
  end: Date | null;
} {
  if (filter === "all") return {start: null, end: null};
  const now = new Date();
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const startUtc = Date.UTC(
    manilaNow.getUTCFullYear(),
    manilaNow.getUTCMonth(),
    manilaNow.getUTCDate(),
  ) - MANILA_OFFSET_MS;
  const days = filter === "today" ? 0 : filter === "last_7_days" ? 6 : 29;
  return {
    start: new Date(startUtc - days * DAY_MS),
    end: filter === "today" ? new Date(startUtc + DAY_MS) : null,
  };
}

function isDateFilter(value: unknown): value is AdminReviewDateFilter {
  return value === "all" || value === "today" ||
    value === "last_7_days" || value === "last_30_days";
}

function addString(target: Set<string>, value: unknown): void {
  const normalized = nullableString(value);
  if (normalized) target.add(normalized);
}

function reviewCustomerName(data: DocumentData): string | null {
  const first = nullableString(data.customerFirstName);
  const last = nullableString(data.customerLastName);
  const name = [first, last].filter(Boolean).join(" ");
  return name || null;
}

function personName(data: DocumentData, fallback: string): string {
  const name = [nullableString(data.firstName), nullableString(data.lastName)]
    .filter(Boolean)
    .join(" ");
  return name || nullableString(data.displayName) || fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonNegativeInteger(value: unknown): number {
  const number = finiteNumber(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function ratingValue(value: unknown): number {
  const number = finiteNumber(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : 0;
}

function aggregateNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}
