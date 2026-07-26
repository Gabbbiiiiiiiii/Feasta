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