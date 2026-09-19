import "server-only";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {parseProviderVerificationStatusStrict} from "@feasta/shared-types";

import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import type {
  ProviderVerificationApplication,
  ProviderVerificationQueueFilters,
  ProviderVerificationQueueItem,
  ProviderVerificationQueuePage,
  ProviderVerificationQueueSummary,
  ProviderVerificationReviewDetail,
  VerificationActivity,
  VerificationActivityType,
  VerificationApplicationStatus,
  VerificationDocumentData,
  VerificationDocumentStatus,
  VerificationTimelineEntry,
  VerificationTimelineStatus,
} from "./provider-verification-types";

const applicationLimit = 50;
export const verificationQueuePageSize = 20;
const queueStatuses = ["pending", "submitted", "under_review"] as const;

function normalizeSearchToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .slice(0, 80);
}

function queueStatus(
  value: unknown,
): Exclude<ProviderVerificationQueueFilters["status"], "all"> {
  return parseProviderVerificationStatusStrict(value) ?? "pending";
}

function parseQueueDate(value: string, endOfDay = false): Timestamp | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

type QueueCursor = {createdAtMillis: number; id: string};

function encodeQueueCursor(snapshot: QueryDocumentSnapshot<DocumentData>): string {
  const createdAt = getDate(snapshot.data().createdAt);
  const payload: QueueCursor = {
    createdAtMillis: createdAt?.getTime() ?? 0,
    id: snapshot.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeQueueCursor(value: string | null): QueueCursor | null {
  if (!value || value.length > 500) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<QueueCursor>;
    return typeof parsed.createdAtMillis === "number" &&
      Number.isSafeInteger(parsed.createdAtMillis) &&
      typeof parsed.id === "string" &&
      /^[A-Za-z0-9_-]{1,150}$/u.test(parsed.id)
      ? {
          createdAtMillis: parsed.createdAtMillis,
          id: parsed.id,
        }
      : null;
  } catch {
    return null;
  }
}

function getString(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function getNullableString(value: unknown): string | null {
  const result = getString(value);
  return result || null;
}

function getBoolean(
  value: unknown,
  fallback = false,
): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  }

  return null;
}

function formatDate(value: unknown): string {
  const date = getDate(value);

  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: unknown): string {
  const date = getDate(value);

  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function mapApplicationStatus(
  value: unknown,
): VerificationApplicationStatus {
  switch (value) {
    case "approved":
      return "approved";

    case "rejected":
    case "resubmission_required":
      return "rejected";

    case "under_review":
      return "under_review";

    case "pending":
    case "submitted":
    case "draft":
    default:
      return "pending";
  }
}

function mapDocumentStatus(
  value: unknown,
): VerificationDocumentStatus {
  switch (value) {
    case "verified":
    case "approved":
      return "verified";

    case "invalid":
    case "rejected":
      return "invalid";

    case "missing":
      return "missing";

    default:
      return "pending";
  }
}

function mapTimelineStatus(
  value: unknown,
): VerificationTimelineStatus {
  switch (value) {
    case "completed":
      return "completed";

    case "in_progress":
    case "under_review":
      return "in_progress";

    case "failed":
    case "rejected":
      return "failed";

    default:
      return "pending";
  }
}

function mapActivityType(
  value: unknown,
): VerificationActivityType {
  switch (value) {
    case "review_started":
      return "review_started";

    case "document_verified":
      return "document_verified";

    case "document_invalid":
      return "document_invalid";

    case "note_updated":
      return "note_updated";

    case "approved":
    case "provider_verification_approved":
      return "approved";

    case "rejected":
    case "provider_verification_rejected":
      return "rejected";

    case "provider_notified":
      return "provider_notified";

    default:
      return "application_submitted";
  }
}

function mapDocument(
  document: QueryDocumentSnapshot<DocumentData>,
): VerificationDocumentData {
  const data = document.data();

  return {
    id: document.id,
    title: getString(
      data.displayName ?? data.title,
      "Verification document",
    ),
    fileName: getString(
      data.fileName ?? data.originalFileName,
      "Document",
    ),
    fileSize: getString(data.fileSizeLabel, "—"),
    fileUrl: getNullableString(
      data.fileUrl ?? data.downloadUrl,
    ),
    mimeType: getNullableString(data.mimeType),
    reviewNote: getNullableString(
      data.reviewNote ?? data.rejectionReason,
    ),
    uploadedAt: getDate(data.uploadedAt)
      ? formatDateTime(data.uploadedAt)
      : null,
    reviewedAt: getDate(data.reviewedAt)
      ? formatDateTime(data.reviewedAt)
      : null,
    reviewedBy: getNullableString(data.reviewedBy),
    isRequired: getBoolean(data.isRequired, true),
    status: mapDocumentStatus(data.status),
  };
}

function mapTimelineEntry(
  document: QueryDocumentSnapshot<DocumentData>,
): VerificationTimelineEntry {
  const data = document.data();
  const timestamp = data.timestamp ?? data.createdAt;

  return {
    id: document.id,
    title: getString(data.title, "Verification update"),
    description: getString(data.description),
    status: mapTimelineStatus(data.status),
    timestamp: getDate(timestamp)
      ? formatDateTime(timestamp)
      : null,
    adminName: getNullableString(
      data.adminName ?? data.actorName,
    ),
  };
}

function mapActivity(
  document: QueryDocumentSnapshot<DocumentData>,
): VerificationActivity {
  const data = document.data();

  return {
    id: document.id,
    type: mapActivityType(data.type ?? data.action),
    title: getString(
      data.title ?? data.action,
      "Verification activity",
    ),
    description: getString(data.description),
    timestamp: formatDateTime(
      data.timestamp ?? data.createdAt,
    ),
    actorName: getNullableString(
      data.actorName ?? data.adminName,
    ),
  };
}

function createFallbackTimeline(
  applicationId: string,
  applicationData: DocumentData,
): VerificationTimelineEntry[] {
  const status = mapApplicationStatus(
    applicationData.status,
  );

  const submittedTimestamp =
    applicationData.submittedAt ??
    applicationData.createdAt;

  const timeline: VerificationTimelineEntry[] = [
    {
      id: `${applicationId}-submitted`,
      title: "Application submitted",
      description:
        "The provider submitted the verification application.",
      status: "completed",
      timestamp: getDate(submittedTimestamp)
        ? formatDateTime(submittedTimestamp)
        : null,
      adminName: null,
    },
  ];

  timeline.push({
    id: `${applicationId}-review`,
    title: "Initial review",
    description:
      status === "pending"
        ? "Waiting for an administrator to begin reviewing the application."
        : "The application has been reviewed.",
    status:
      status === "pending"
        ? "pending"
        : status === "under_review"
          ? "in_progress"
          : "completed",
    timestamp:
      status !== "pending" &&
      getDate(applicationData.reviewedAt)
        ? formatDateTime(applicationData.reviewedAt)
        : null,
    adminName: getNullableString(
      applicationData.reviewedByName,
    ),
  });

  timeline.push({
    id: `${applicationId}-decision`,
    title: "Approval or rejection",
    description:
      status === "approved"
        ? "The application was approved."
        : status === "rejected"
          ? "The application was rejected."
          : "A final decision has not been recorded.",
    status:
      status === "approved"
        ? "completed"
        : status === "rejected"
          ? "failed"
          : "pending",
    timestamp:
      (status === "approved" ||
        status === "rejected") &&
      getDate(applicationData.reviewedAt)
        ? formatDateTime(applicationData.reviewedAt)
        : null,
    adminName: getNullableString(
      applicationData.reviewedByName,
    ),
  });

  return timeline;
}

async function loadNestedVerificationData(
  application: QueryDocumentSnapshot<DocumentData>,
) {
  const [documentsSnapshot, timelineSnapshot, activitiesSnapshot] =
    await Promise.all([
      application.ref
        .collection("documents")
        .orderBy("createdAt", "asc")
        .get()
        .catch(() =>
          application.ref.collection("documents").get(),
        ),

      application.ref
        .collection("timeline")
        .orderBy("createdAt", "asc")
        .get()
        .catch(() =>
          application.ref.collection("timeline").get(),
        ),

      application.ref
        .collection("activities")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get()
        .catch(() =>
          application.ref
            .collection("activities")
            .limit(20)
            .get(),
        ),
    ]);

  return {
    documents: documentsSnapshot.docs.map(mapDocument),
    timeline: timelineSnapshot.docs.map(mapTimelineEntry),
    activities: activitiesSnapshot.docs.map(mapActivity),
  };
}

function documentData(
  snapshot: DocumentSnapshot<DocumentData> | undefined,
): DocumentData {
  return snapshot?.exists
    ? snapshot.data() ?? {}
    : {};
}

export async function getProviderVerificationQueue(
  filters: ProviderVerificationQueueFilters,
): Promise<ProviderVerificationQueuePage> {
  await requireAdmin();

  let query: Query<DocumentData> = adminDb
    .collection("providerVerifications");
  query = filters.status === "all"
    ? query.where("status", "in", queueStatuses)
    : query.where("status", "==", filters.status);

  if (filters.serviceType !== "all") {
    query = query.where(
      "providerServiceType",
      "==",
      filters.serviceType,
    );
  }

  const searchToken = normalizeSearchToken(filters.search);
  if (searchToken) {
    query = query.where("searchTokens", "array-contains", searchToken);
  }

  const from = parseQueueDate(filters.from);
  const to = parseQueueDate(filters.to, true);
  if (from) query = query.where("createdAt", ">=", from);
  if (to) query = query.where("createdAt", "<=", to);

  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  const cursor = decodeQueueCursor(filters.cursor);
  if (filters.cursor && !cursor) {
    throw new Error("The verification queue cursor is invalid.");
  }
  if (cursor) {
    const values = [
      Timestamp.fromMillis(cursor.createdAtMillis),
      cursor.id,
    ] as const;
    query = filters.direction === "previous"
      ? query.endBefore(...values).limitToLast(verificationQueuePageSize + 1)
      : query.startAfter(...values).limit(verificationQueuePageSize + 1);
  } else {
    query = query.limit(verificationQueuePageSize + 1);
  }

  const snapshot = await query.get();
  let documents = [...snapshot.docs];
  const hasExtra = documents.length > verificationQueuePageSize;
  if (hasExtra) {
    if (filters.direction === "previous") {
      documents = documents.slice(1);
    } else {
      documents = documents.slice(0, verificationQueuePageSize);
    }
  }

  const providerIds = [...new Set(documents.map((document) =>
    getString(document.data().providerId)
  ).filter(Boolean))];
  const providerSnapshots = providerIds.length > 0
    ? await adminDb.getAll(...providerIds.map((providerId) =>
        adminDb.collection("providers").doc(providerId)
      ))
    : [];
  const providersById = new Map(providerSnapshots.map((provider) => [
    provider.id,
    documentData(provider),
  ]));
  const ownerIds = [...new Set(documents.map((document) => {
    const data = document.data();
    const provider = providersById.get(getString(data.providerId));
    return getString(data.ownerId ?? provider?.ownerId);
  }).filter(Boolean))];
  const ownerSnapshots = ownerIds.length > 0
    ? await adminDb.getAll(...ownerIds.map((ownerId) =>
        adminDb.collection("users").doc(ownerId)
      ))
    : [];
  const ownersById = new Map(ownerSnapshots.map((owner) => [
    owner.id,
    documentData(owner),
  ]));

  const items: ProviderVerificationQueueItem[] = documents.map((document) => {
    const data = document.data();
    const providerId = getString(data.providerId);
    const provider = providersById.get(providerId) ?? {};
    const ownerId = getString(data.ownerId ?? provider.ownerId);
    const owner = ownersById.get(ownerId) ?? {};
    const ownerName = getString(data.ownerName) || [
      getString(data.ownerFirstName ?? owner.firstName),
      getString(data.ownerLastName ?? owner.lastName),
    ].filter(Boolean).join(" ") || "Unnamed owner";
    return {
      id: document.id,
      providerId,
      businessName: getString(
        data.businessName ?? provider.businessName,
        "Unnamed provider",
      ),
      ownerName,
      email: getString(
        data.businessEmail ?? provider.businessEmail ?? owner.email,
        "Not provided",
      ),
      providerServiceType: getString(
        data.providerServiceType ?? provider.providerServiceType,
        "provider",
      ),
      submittedAt: formatDate(data.submittedAt ?? data.createdAt),
      status: queueStatus(data.status),
    };
  });

  const first = documents[0];
  const last = documents.at(-1);
  return {
    items,
    previousCursor: first && (
      filters.direction === "previous"
        ? hasExtra
        : filters.cursor != null
    ) ? encodeQueueCursor(first) : null,
    nextCursor: last && (
      filters.direction === "previous" ? filters.cursor != null : hasExtra
    )
      ? encodeQueueCursor(last)
      : null,
    pageSize: verificationQueuePageSize,
  };
}

export async function getProviderVerificationQueueSummary(): Promise<
  ProviderVerificationQueueSummary
> {
  await requireAdmin();
  const now = new Date();
  const approvedTodayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ) - (8 * 60 * 60 * 1000));
  const collection = adminDb.collection("providerVerifications");
  const [submitted, underReview, approvedToday, needsResubmission] =
    await Promise.all([
      collection.where("status", "==", "submitted").count().get(),
      collection.where("status", "==", "under_review").count().get(),
      collection
        .where("status", "==", "approved")
        .where("approvedAt", ">=", Timestamp.fromDate(approvedTodayStart))
        .count()
        .get(),
      collection
        .where("status", "==", "resubmission_required")
        .count()
        .get(),
    ]);
  return {
    submitted: submitted.data().count,
    underReview: underReview.data().count,
    approvedToday: approvedToday.data().count,
    needsResubmission: needsResubmission.data().count,
  };
}

export async function getProviderVerificationReview(
  verificationId: string,
): Promise<ProviderVerificationReviewDetail | null> {
  await requireAdmin();
  if (!/^[A-Za-z0-9_-]{1,150}$/u.test(verificationId)) return null;

  const verificationSnapshot = await adminDb
    .collection("providerVerifications")
    .doc(verificationId)
    .get();
  if (!verificationSnapshot.exists) return null;

  const verification = verificationSnapshot.data() ?? {};
  const providerId = getString(verification.providerId);
  const status = parseProviderVerificationStatusStrict(verification.status);
  if (!providerId || !status) return null;

  const providerSnapshot = await adminDb
    .collection("providers")
    .doc(providerId)
    .get();
  if (!providerSnapshot.exists) return null;
  const provider = providerSnapshot.data() ?? {};
  const ownerId = getString(provider.ownerId ?? verification.ownerId);
  if (
    !ownerId ||
    (verification.ownerId != null &&
      getString(verification.ownerId) !== ownerId)
  ) {
    return null;
  }

  const [ownerSnapshot, documentsSnapshot, historySnapshot] = await Promise.all([
    adminDb.collection("users").doc(ownerId).get(),
    verificationSnapshot.ref.collection("documents").limit(20).get(),
    verificationSnapshot.ref
      .collection("history")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get(),
  ]);
  const owner = ownerSnapshot.data() ?? {};
  const documents = documentsSnapshot.docs.map((document) => {
    const data = document.data();
    const fileSize = Number(data.fileSize);
    return {
      id: document.id,
      documentType: getString(data.documentType, document.id),
      title: getString(
        data.displayName ?? data.title,
        humanizeValue(getString(data.documentType, document.id)),
      ),
      fileName: getString(
        data.originalFileName ?? data.fileName,
        "Verification document",
      ),
      fileSize: Number.isFinite(fileSize) && fileSize > 0
        ? formatFileSize(fileSize)
        : "Size unavailable",
      contentType: getString(data.contentType, "Unknown type"),
      status: getString(data.status, "pending"),
      isRequired: getBoolean(data.isRequired),
      reviewNote: getNullableString(
        data.rejectionReason ?? data.reviewNote,
      ),
      uploadedAt: formatDateTime(data.updatedAt ?? data.createdAt),
      viewPath:
        `/api/admin/provider-verifications/${verificationId}/documents/` +
        `${document.id}?disposition=inline`,
      downloadPath:
        `/api/admin/provider-verifications/${verificationId}/documents/` +
        `${document.id}?disposition=attachment`,
    };
  }).sort((left, right) =>
    Number(right.isRequired) - Number(left.isRequired) ||
    left.title.localeCompare(right.title)
  );

  const ownerName = [
    getString(provider.ownerFirstName ?? owner.firstName),
    getString(provider.ownerLastName ?? owner.lastName),
  ].filter(Boolean).join(" ") || getString(
    verification.ownerName,
    "Unnamed owner",
  );
  return {
    id: verificationId,
    providerId,
    owner: {
      name: ownerName,
      email: getString(
        provider.ownerEmail ?? owner.email,
        "Not provided",
      ),
      phone: getString(
        provider.ownerPhone ?? owner.phoneNumber,
        "Not provided",
      ),
    },
    business: {
      name: getString(provider.businessName, "Unnamed provider"),
      email: getString(provider.businessEmail, "Not provided"),
      phone: getString(provider.businessPhone, "Not provided"),
      description: getString(provider.description, "No description provided."),
      serviceType: getString(provider.providerServiceType, "Not configured"),
      address: getString(provider.address, "Not provided"),
      city: getString(provider.city, "Not provided"),
      province: getString(provider.province, "Not provided"),
    },
    operations: {
      serviceCategories: stringList(provider.serviceCategories),
      eventTypes: stringList(
        provider.eventTypesSupported ?? provider.supportedEventTypes,
      ),
      serviceAreas: stringList(
        provider.serviceAreas ?? provider.serviceCoverage,
      ),
      maximumServiceDistance: numericLabel(
        provider.maxServiceDistanceKm,
        "km",
      ),
      guestCapacity: rangeLabel(
        provider.minGuestsPerEvent,
        provider.maxGuestsPerEvent,
        "guests",
      ),
      eventsPerDay: provider.acceptsMultipleEventsPerDay === true
        ? numericLabel(provider.maxEventsPerDay, "events")
        : "One event per day",
      staffCount: numericLabel(provider.availableStaffCount, "staff"),
      equipmentCount: numericLabel(
        provider.availableEquipmentCount,
        "equipment units",
      ),
      operatingDays: stringList(provider.operatingDays),
      bookingLeadTime: numericLabel(provider.bookingLeadTimeDays, "days"),
      unavailableDates: stringList(provider.unavailableDates),
    },
    media: {
      logoUrl: cloudinaryProviderImageUrl(
        provider.logoUrl,
        provider.logoPublicId,
        provider.ownerId,
        "logo",
      ),
      coverImageUrl: cloudinaryProviderImageUrl(
        provider.coverImageUrl,
        provider.coverPublicId,
        provider.ownerId,
        "cover",
      ),
    },
    status,
    submittedAt: formatDateTime(
      verification.submittedAt ?? verification.createdAt,
    ),
    reviewedAt: formatDateTime(verification.reviewedAt),
    reviewedBy: getNullableString(verification.reviewedBy),
    remarks: getNullableString(verification.remarks),
    rejectionReason: getNullableString(verification.rejectionReason),
    resubmissionReason: getNullableString(verification.resubmissionReason),
    suspensionReason: getNullableString(verification.suspensionReason),
    termsPolicyVersion: getNullableString(verification.termsPolicyVersion),
    privacyPolicyVersion: getNullableString(verification.privacyPolicyVersion),
    documents,
    history: historySnapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        eventType: getString(data.eventType, "verification_updated"),
        fromStatus: getNullableString(data.fromStatus),
        toStatus: getNullableString(data.toStatus),
        remarks: getNullableString(data.remarks),
        documentType: getNullableString(data.documentType),
        documentStatus: getNullableString(data.documentStatus),
        actorRole: getString(data.actorRole, "system"),
        actorId: getString(data.actorId, "system"),
        auditLogId: getString(data.auditLogId, "Unavailable"),
        createdAt: formatDateTime(data.createdAt),
      };
    }),
  };
}

function cloudinaryProviderImageUrl(
  urlValue: unknown,
  publicIdValue: unknown,
  ownerIdValue: unknown,
  mediaType: "logo" | "cover",
): string | null {
  const url =
    typeof urlValue === "string"
      ? urlValue.trim()
      : "";

  const publicId =
    typeof publicIdValue === "string"
      ? publicIdValue.trim()
      : "";

  const ownerId =
    typeof ownerIdValue === "string"
      ? ownerIdValue.trim()
      : "";

  if (
    !url ||
    !publicId ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(
      ownerId,
    )
  ) {
    return null;
  }

  const expectedPublicId = [
    "feasta",
    "providers",
    ownerId,
    "onboarding",
    mediaType,
  ].join("/");

  if (publicId !== expectedPublicId) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !==
        "res.cloudinary.com" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      !parsed.pathname.includes(
        "/image/upload/",
      ) ||
      !parsed.pathname.includes(
        `/${expectedPublicId}.`,
      ) ||
      !/\.(?:jpe?g|png|webp)$/iu.test(
        parsed.pathname,
      )
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0
      ).map((item) => item.trim()).slice(0, 50)
    : [];
}

function humanizeValue(value: string): string {
  return value.split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function numericLabel(value: unknown, suffix: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value} ${suffix}`
    : "Not configured";
}

function rangeLabel(
  minimum: unknown,
  maximum: unknown,
  suffix: string,
): string {
  return (
    typeof minimum === "number" &&
    Number.isFinite(minimum) &&
    typeof maximum === "number" &&
    Number.isFinite(maximum)
  ) ? `${minimum}–${maximum} ${suffix}` : "Not configured";
}

export async function getProviderVerificationApplications(): Promise<
  ProviderVerificationApplication[]
> {
  const applicationsSnapshot = await adminDb
    .collection("providerVerifications")
    .orderBy("createdAt", "desc")
    .limit(applicationLimit)
    .get()
    .catch(() =>
      adminDb
        .collection("providerVerifications")
        .limit(applicationLimit)
        .get(),
    );

  if (applicationsSnapshot.empty) {
    return [];
  }

  const providerIds = Array.from(
    new Set(
      applicationsSnapshot.docs
        .map((document) =>
          getString(document.data().providerId),
        )
        .filter(Boolean),
    ),
  );

  const providerSnapshots = providerIds.length
    ? await adminDb.getAll(
        ...providerIds.map((providerId) =>
          adminDb.collection("providers").doc(providerId),
        ),
      )
    : [];

  const providersById = new Map(
    providerSnapshots.map((snapshot) => [
      snapshot.id,
      documentData(snapshot),
    ]),
  );

  const ownerIds = Array.from(
    new Set(
      applicationsSnapshot.docs
        .map((document) => {
          const application = document.data();
          const provider = providersById.get(
            getString(application.providerId),
          );

          return getString(
            application.ownerId ??
              provider?.ownerId ??
              provider?.userId,
          );
        })
        .filter(Boolean),
    ),
  );

  const ownerSnapshots = ownerIds.length
    ? await adminDb.getAll(
        ...ownerIds.map((ownerId) =>
          adminDb.collection("users").doc(ownerId),
        ),
      )
    : [];

  const ownersById = new Map(
    ownerSnapshots.map((snapshot) => [
      snapshot.id,
      documentData(snapshot),
    ]),
  );

  const nestedData = await Promise.all(
    applicationsSnapshot.docs.map(
      loadNestedVerificationData,
    ),
  );

  return applicationsSnapshot.docs.map(
    (document, index) => {
      const application = document.data();
      const providerId = getString(
        application.providerId,
      );

      const provider =
        providersById.get(providerId) ?? {};

      const ownerId = getString(
        application.ownerId ??
          provider.ownerId ??
          provider.userId,
      );

      const owner = ownersById.get(ownerId) ?? {};
      const nested = nestedData[index];

      const ownerName =
        getString(application.ownerName) ||
        [
          getString(owner.firstName),
          getString(owner.lastName),
        ]
          .filter(Boolean)
          .join(" ") ||
        "Unnamed owner";

      const location =
        getString(application.location) ||
        [
          getString(provider.city),
          getString(provider.province),
        ]
          .filter(Boolean)
          .join(", ") ||
        getString(provider.address, "Not provided");

      return {
        id: document.id,
        providerId,
        businessName: getString(
          application.businessName ??
            provider.businessName,
          "Unnamed provider",
        ),
        ownerName,
        email: getString(
          application.email ??
            provider.businessEmail ??
            owner.email,
          "Not provided",
        ),
        phone: getString(
          application.phone ??
            provider.businessPhone ??
            owner.phoneNumber,
          "Not provided",
        ),
        location,
        providerType: getString(
          application.providerType ??
            provider.providerServiceType ??
            provider.providerCategory,
          "Provider",
        ),
        businessSince: getString(
          application.businessSince ??
            provider.businessSince,
          formatDate(provider.createdAt),
        ),
        submittedAt: formatDate(
          application.submittedAt ??
            application.createdAt,
        ),
        status: mapApplicationStatus(
          application.status,
        ),
        documents: nested.documents,
        timeline:
          nested.timeline.length > 0
            ? nested.timeline
            : createFallbackTimeline(
                document.id,
                application,
              ),
        activities: nested.activities,
        adminNotes: getNullableString(
          application.adminNotes ??
            application.remarks,
        ),
        rejectionReason: getNullableString(
          application.rejectionReason,
        ),
        reviewedBy: getNullableString(
          application.reviewedByName ??
            application.reviewedBy,
        ),
        reviewedAt: getDate(application.reviewedAt)
          ? formatDateTime(application.reviewedAt)
          : null,
      };
    },
  );
}

type VerificationDecisionInput = {
  verificationId: string;
  providerId: string;
};

type RejectVerificationInput =
  VerificationDecisionInput & {
    reason: string;
  };

function validateDecisionIdentifiers({
  verificationId,
  providerId,
}: VerificationDecisionInput) {
  if (!verificationId.trim()) {
    throw new Error("Verification ID is required.");
  }

  if (!providerId.trim()) {
    throw new Error("Provider ID is required.");
  }
}

export async function approveProviderVerification({
  verificationId,
  providerId,
}: VerificationDecisionInput): Promise<void> {
  validateDecisionIdentifiers({
    verificationId,
    providerId,
  });

  const admin = await requireAdmin();

  const verificationRef = adminDb
    .collection("providerVerifications")
    .doc(verificationId);

  const providerRef = adminDb
    .collection("providers")
    .doc(providerId);

  const documentsQuery =
    verificationRef.collection("documents");

  const logRef = adminDb
    .collection("adminLogs")
    .doc();

  await adminDb.runTransaction(async (transaction) => {
    const verificationSnapshot =
      await transaction.get(verificationRef);

    const providerSnapshot =
      await transaction.get(providerRef);

    const documentsSnapshot =
      await transaction.get(documentsQuery);

    if (!verificationSnapshot.exists) {
      throw new Error(
        "The verification application no longer exists.",
      );
    }

    if (!providerSnapshot.exists) {
      throw new Error(
        "The associated provider no longer exists.",
      );
    }

    const verification =
      verificationSnapshot.data() ?? {};

    if (verification.providerId !== providerId) {
      throw new Error(
        "The verification application does not belong to this provider.",
      );
    }

    const currentStatus = getString(
      verification.status,
    );

    const allowedStatuses = [
      "submitted",
      "pending",
      "under_review",
    ];

    if (!allowedStatuses.includes(currentStatus)) {
      throw new Error(
        `Applications with status "${currentStatus}" cannot be approved.`,
      );
    }

    const requiredDocuments =
      documentsSnapshot.docs.filter(
        (document) =>
          document.data().isRequired !== false,
      );

    if (requiredDocuments.length === 0) {
      throw new Error(
        "At least one required document must be submitted before approval.",
      );
    }

    const unverifiedDocument =
      requiredDocuments.find((document) => {
        const status = getString(
          document.data().status,
        );

        return (
          status !== "verified" &&
          status !== "approved"
        );
      });

    if (unverifiedDocument) {
      const documentName = getString(
        unverifiedDocument.data().displayName ??
          unverifiedDocument.data().title,
        "A required document",
      );

      throw new Error(
        `${documentName} must be verified before approval.`,
      );
    }

    const now = FieldValue.serverTimestamp();

    transaction.update(verificationRef, {
      status: "approved",
      reviewedAt: now,
      reviewedBy: admin.uid,
      approvedAt: now,
      rejectedAt: null,
      rejectionReason: null,
      updatedAt: now,
    });

    transaction.update(providerRef, {
      verificationStatus: "verified",
      isActive: true,
      updatedAt: now,
    });

    transaction.set(logRef, {
      action: "provider_verification_approved",
      actorId: admin.uid,
      actorName: admin.email ?? "Administrator",
      entity: "provider",
      entityId: providerId,
      details: {
        verificationId,
        previousStatus: currentStatus,
        newStatus: "approved",
      },
      createdAt: now,
    });
  });
}

export async function rejectProviderVerification({
  verificationId,
  providerId,
  reason,
}: RejectVerificationInput): Promise<void> {
  validateDecisionIdentifiers({
    verificationId,
    providerId,
  });

  const normalizedReason = reason.trim();

  if (normalizedReason.length < 10) {
    throw new Error(
      "Provide a rejection reason with at least 10 characters.",
    );
  }

  if (normalizedReason.length > 500) {
    throw new Error(
      "The rejection reason cannot exceed 500 characters.",
    );
  }

  const admin = await requireAdmin();

  const verificationRef = adminDb
    .collection("providerVerifications")
    .doc(verificationId);

  const providerRef = adminDb
    .collection("providers")
    .doc(providerId);

  const logRef = adminDb
    .collection("adminLogs")
    .doc();

  await adminDb.runTransaction(async (transaction) => {
    const verificationSnapshot =
      await transaction.get(verificationRef);

    const providerSnapshot =
      await transaction.get(providerRef);

    if (!verificationSnapshot.exists) {
      throw new Error(
        "The verification application no longer exists.",
      );
    }

    if (!providerSnapshot.exists) {
      throw new Error(
        "The associated provider no longer exists.",
      );
    }

    const verification =
      verificationSnapshot.data() ?? {};

    if (verification.providerId !== providerId) {
      throw new Error(
        "The verification application does not belong to this provider.",
      );
    }

    const currentStatus = getString(
      verification.status,
    );

    const allowedStatuses = [
      "submitted",
      "pending",
      "under_review",
    ];

    if (!allowedStatuses.includes(currentStatus)) {
      throw new Error(
        `Applications with status "${currentStatus}" cannot be rejected.`,
      );
    }

    const now = FieldValue.serverTimestamp();

    transaction.update(verificationRef, {
      status: "rejected",
      rejectionReason: normalizedReason,
      reviewedAt: now,
      reviewedBy: admin.uid,
      rejectedAt: now,
      approvedAt: null,
      updatedAt: now,
    });

    transaction.update(providerRef, {
      verificationStatus: "rejected",
      isActive: false,
      updatedAt: now,
    });

    transaction.set(logRef, {
      action: "provider_verification_rejected",
      actorId: admin.uid,
      actorName: admin.email ?? "Administrator",
      entity: "provider",
      entityId: providerId,
      details: {
        verificationId,
        previousStatus: currentStatus,
        newStatus: "rejected",
        reason: normalizedReason,
      },
      createdAt: now,
    });
  });
}
