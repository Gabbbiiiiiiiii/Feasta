import type {
  CustomerCancellationProjection,
} from "@/lib/customer/bookings/customer-cancellation-client";

type CancellationStatusPresentation = {
  title: string;
  description: string;
  nextStep: string;
};

type RefundStatusPresentation = {
  title: string;
  description: string;
  amountInCentavos: number | null;
};

export function cancellationStatusPresentation(
  cancellation: CustomerCancellationProjection,
): CancellationStatusPresentation {
  switch (cancellation.status) {
    case "submitted":
      return {
        title: "Cancellation request submitted",
        description: "FEASTA recorded this request for this Provider service.",
        nextStep: cancellation.manualReviewRequired
          ? "Manual FEASTA review is required before any refund decision."
          : "FEASTA will review the request using the recorded cancellation policy.",
      };
    case "awaiting_payment_resolution":
      return {
        title: "Awaiting payment resolution",
        description: "FEASTA must resolve the current payment state before this cancellation can continue.",
        nextStep: "No action is required from you while the payment state is checked.",
      };
    case "under_review":
      return {
        title: cancellation.manualReviewRequired
          ? "Manual review required"
          : "Cancellation under review",
        description: cancellation.manualReviewRequired
          ? "This older request has no policy evidence or refund estimate to display."
          : "FEASTA is reviewing the request before any refund decision is made.",
        nextStep: "Wait for FEASTA's decision for this Provider service.",
      };
    case "approved":
      return {
        title: "Cancellation approved",
        description: "This Provider service was cancelled and the refund decision is approved.",
        nextStep: "Refund progress is shown below when a refund is due.",
      };
    case "rejected":
      return {
        title: "Cancellation request rejected",
        description: "FEASTA reviewed this cancellation request and did not approve it. This is not a Provider rejection of the booking request.",
        nextStep: "This outcome applies only to this Provider service cancellation request.",
      };
    case "refund_processing":
      return {
        title: "Refund processing",
        description: "The approved refund for this Provider service is being processed.",
        nextStep: "Completion has not been confirmed yet; check this status again later.",
      };
    case "refund_failed":
      return {
        title: "Refund needs attention",
        description: "The approved refund did not complete and remains in FEASTA's trusted workflow.",
        nextStep: cancellation.refund.status === "failed_reconciliation_required"
          ? "FEASTA support and reconciliation review are required."
          : "FEASTA is handling the safe retry workflow; action remains pending.",
      };
    case "refund_completed":
      return {
        title: cancellation.refund.status === "partial_completed"
          ? "Partial refund completed"
          : "Refund completed",
        description: "The trusted refund record confirms completion for this Provider service.",
        nextStep: "No further refund action is required from you for this completed amount.",
      };
    case "cancelled_no_refund":
      return {
        title: "Service cancelled without refund",
        description: "This Provider service was cancelled and the trusted decision confirms that no refund is due.",
        nextStep: "No refund will be processed for this Provider service.",
      };
  }
}

export function refundStatusPresentation(
  cancellation: CustomerCancellationProjection,
): RefundStatusPresentation {
  const refund = cancellation.refund;

  switch (refund.status) {
    case "none":
      return cancellation.status === "cancelled_no_refund"
        ? {
          title: "No refund due",
          description: "The trusted cancellation result confirms that no refund is due.",
          amountInCentavos: null,
        }
        : {
          title: "Refund not decided",
          description: "No approved or completed refund is recorded yet.",
          amountInCentavos: null,
        };
    case "manual_review":
      return {
        title: "Manual review required",
        description: "No policy, refund percentage, or refund estimate is shown for this legacy request.",
        amountInCentavos: null,
      };
    case "approved":
      return {
        title: "Refund approved",
        description: "This system-calculated refund is approved but not yet confirmed as completed.",
        amountInCentavos: refund.amountInCentavos,
      };
    case "processing":
      return {
        title: "Refund processing",
        description: "The approved refund is in progress and is not yet complete.",
        amountInCentavos: refund.amountInCentavos,
      };
    case "failed_retry_pending":
      return {
        title: "Refund retry pending",
        description: "FEASTA is continuing the safe retry workflow. The refund remains pending.",
        amountInCentavos: refund.amountInCentavos,
      };
    case "failed_reconciliation_required":
      return {
        title: "Refund requires reconciliation review",
        description: "FEASTA support must reconcile this refund before completion can be confirmed.",
        amountInCentavos: refund.amountInCentavos,
      };
    case "partial_completed":
      return {
        title: "Partial refund completed",
        description: "The trusted refund record confirms this completed partial amount.",
        amountInCentavos: refund.completedAmountInCentavos,
      };
    case "full_completed":
      return {
        title: "Full refund completed",
        description: "The trusted refund record confirms this completed full amount.",
        amountInCentavos: refund.completedAmountInCentavos,
      };
  }
}

export function formatTrustedRefundAmount(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value / 100);
}

export type {
  CancellationStatusPresentation,
  RefundStatusPresentation,
};
