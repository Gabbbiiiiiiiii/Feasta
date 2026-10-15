import {
  authenticationGatePresentation,
  type AuthenticationGateKind,
  type ProviderVerificationStatus,
} from "@feasta/shared-types";

export interface ProviderStatusPresentation {
  title: string;
  description: string;
  next: string;
  actionLabel: string | null;
  actionHref: string | null;
  visibleReason:
    | "remarks"
    | "rejectionReason"
    | "resubmissionReason"
    | "suspensionReason"
    | null;
}

export function providerStatusPresentation(
  status: ProviderVerificationStatus,
): ProviderStatusPresentation {
  const canonical = authenticationGatePresentation(providerGateKind(status));
  switch (status) {
    case "draft":
      return {
        title: canonical.label,
        description: canonical.message,
        next: "Complete the required documents, review your application, and submit it for FEASTA review.",
        actionLabel: "Continue verification",
        actionHref: "/provider/verification",
        visibleReason: null,
      };
    case "submitted":
      return {
        title: canonical.label,
        description: canonical.message,
        next: "FEASTA will move the submission into review. Business operations remain unavailable.",
        actionLabel: null,
        actionHref: null,
        visibleReason: null,
      };
    case "under_review":
      return {
        title: canonical.label,
        description: canonical.message,
        next: "No action is required unless FEASTA requests updated documents.",
        actionLabel: null,
        actionHref: null,
        visibleReason: "remarks",
      };
    case "resubmission_required":
      return {
        title: canonical.label,
        description: canonical.message,
        next: "Review the requested changes, replace the affected documents, and submit again.",
        actionLabel: "Update verification",
        actionHref: "/provider/verification",
        visibleReason: "resubmissionReason",
      };
    case "rejected":
      return {
        title: canonical.label,
        description: canonical.message,
        next: "Review FEASTA's decision below. Approved-provider operations remain disabled.",
        actionLabel: null,
        actionHref: null,
        visibleReason: "rejectionReason",
      };
    case "suspended":
      return {
        title: canonical.label,
        description: canonical.message,
        next: "Review the suspension reason and contact support through the established channel.",
        actionLabel: null,
        actionHref: null,
        visibleReason: "suspensionReason",
      };
    case "approved":
      return {
        title: canonical.label,
        description: canonical.message,
        next: "Your approved provider tools are available from the business dashboard.",
        actionLabel: "Open provider dashboard",
        actionHref: "/provider",
        visibleReason: null,
      };
  }
}

function providerGateKind(
  status: ProviderVerificationStatus,
): AuthenticationGateKind {
  switch (status) {
    case "draft":
      return "providerVerificationDraft";
    case "submitted":
      return "providerVerificationSubmitted";
    case "under_review":
      return "providerUnderReview";
    case "resubmission_required":
      return "providerResubmissionRequired";
    case "rejected":
      return "providerRejected";
    case "suspended":
      return "providerSuspended";
    case "approved":
      return "providerApproved";
  }
}
