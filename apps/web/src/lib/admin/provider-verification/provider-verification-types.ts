export const verificationFilters = [
  "all",
  "pending",
  "under_review",
  "approved",
  "rejected",
] as const;

export type VerificationFilter =
  (typeof verificationFilters)[number];

export const verificationFilterLabels: Record<
  VerificationFilter,
  string
> = {
  all: "All",
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
};

export type VerificationApplicationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected";

export const verificationQueueStatuses = [
  "all",
  "pending",
  "draft",
  "submitted",
  "under_review",
  "resubmission_required",
  "approved",
  "rejected",
  "suspended",
] as const;

export type VerificationQueueStatus =
  (typeof verificationQueueStatuses)[number];

export const verificationQueueServiceTypes = [
  "all",
  "catering",
  "addon",
  "both",
] as const;

export type VerificationQueueServiceType =
  (typeof verificationQueueServiceTypes)[number];

export type ProviderVerificationQueueFilters = {
  search: string;
  status: VerificationQueueStatus;
  serviceType: VerificationQueueServiceType;
  from: string;
  to: string;
  cursor: string | null;
  direction: "next" | "previous";
};

export type ProviderVerificationQueueItem = {
  id: string;
  providerId: string;
  businessName: string;
  ownerName: string;
  email: string;
  providerServiceType: string;
  submittedAt: string;
  status: Exclude<VerificationQueueStatus, "all">;
};

export type ProviderVerificationQueuePage = {
  items: ProviderVerificationQueueItem[];
  previousCursor: string | null;
  nextCursor: string | null;
  pageSize: number;
};

export type ProviderVerificationQueueSummary = {
  submitted: number;
  underReview: number;
  approvedToday: number;
  needsResubmission: number;
};

export type ProviderVerificationReviewDocument = {
  id: string;
  documentType: string;
  title: string;
  fileName: string;
  fileSize: string;
  contentType: string;
  status: string;
  isRequired: boolean;
  reviewNote: string | null;
  uploadedAt: string;
  viewPath: string;
  downloadPath: string;
};

export type ProviderVerificationHistoryEntry = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  remarks: string | null;
  documentType: string | null;
  documentStatus: string | null;
  actorRole: string;
  actorId: string;
  auditLogId: string;
  createdAt: string;
};

export type ProviderVerificationReviewDetail = {
  id: string;
  providerId: string;
  owner: {
    name: string;
    email: string;
    phone: string;
  };
  business: {
    name: string;
    email: string;
    phone: string;
    description: string;
    serviceType: string;
    address: string;
    city: string;
    province: string;
  };
  operations: {
    serviceCategories: readonly string[];
    eventTypes: readonly string[];
    serviceAreas: readonly string[];
    maximumServiceDistance: string;
    guestCapacity: string;
    eventsPerDay: string;
    staffCount: string;
    equipmentCount: string;
    operatingDays: readonly string[];
    bookingLeadTime: string;
    unavailableDates: readonly string[];
  };
  media: {
    logoUrl: string | null;
    coverImageUrl: string | null;
  };
  status: ProviderVerificationStatus;
  submittedAt: string;
  reviewedAt: string;
  reviewedBy: string | null;
  remarks: string | null;
  rejectionReason: string | null;
  resubmissionReason: string | null;
  suspensionReason: string | null;
  termsPolicyVersion: string | null;
  privacyPolicyVersion: string | null;
  documents: readonly ProviderVerificationReviewDocument[];
  history: readonly ProviderVerificationHistoryEntry[];
};

export type VerificationDocumentStatus =
  | "pending"
  | "verified"
  | "invalid"
  | "missing";

export type VerificationTimelineStatus =
  | "completed"
  | "in_progress"
  | "pending"
  | "failed";

export type VerificationActivityType =
  | "application_submitted"
  | "review_started"
  | "document_verified"
  | "document_invalid"
  | "note_updated"
  | "approved"
  | "rejected"
  | "provider_notified";

export type VerificationDocumentData = {
  id: string;
  title: string;
  fileName: string;
  fileSize: string;
  fileUrl: string | null;
  mimeType: string | null;
  reviewNote: string | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  isRequired: boolean;
  status: VerificationDocumentStatus;
};

export type VerificationTimelineEntry = {
  id: string;
  title: string;
  description: string;
  status: VerificationTimelineStatus;
  timestamp: string | null;
  adminName: string | null;
};

export type VerificationActivity = {
  id: string;
  type: VerificationActivityType;
  title: string;
  description: string;
  timestamp: string;
  actorName: string | null;
};

export type ProviderVerificationApplication = {
  id: string;
  providerId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  location: string;
  providerType: string;
  businessSince: string;
  submittedAt: string;
  status: VerificationApplicationStatus;
  documents: VerificationDocumentData[];
  timeline: VerificationTimelineEntry[];
  activities: VerificationActivity[];
  adminNotes: string | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export function canApproveVerification(
  application: Pick<
    ProviderVerificationApplication,
    "documents"
  >,
) {
  const requiredDocuments =
    application.documents.filter(
      (document) => document.isRequired,
    );

  if (requiredDocuments.length === 0) {
    return false;
  }

  return requiredDocuments.every(
    (document) => document.status === "verified",
  );
}
import type {ProviderVerificationStatus} from "@feasta/shared-types";
