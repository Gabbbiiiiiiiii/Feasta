import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import type {
  ProviderVerificationApplication,
  VerificationActivity,
  VerificationActivityType,
  VerificationApplicationStatus,
  VerificationDocumentData,
  VerificationDocumentStatus,
  VerificationTimelineEntry,
  VerificationTimelineStatus,
} from "./provider-verification-types";

const applicationLimit = 50;

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