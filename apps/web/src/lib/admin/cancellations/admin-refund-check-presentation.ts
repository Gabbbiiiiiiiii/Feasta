import type {RefundReconciliationInspection} from "@feasta/shared-types";
import type {AdminCancellationQueueItem, AdminCancellationReconciliationResult} from "./admin-cancellation-types";

export class RefundCheckNeedsReviewError extends Error {}
export type RefundCheckFeedback = {status: "confirmed" | "pending" | "review" | "failed"; title: string; message: string};
export const refundReviewFeedback: RefundCheckFeedback = {
  status: "review", title: "Refund needs review",
  message: "FEASTA could not confirm the latest refund status automatically.",
};
export const refundCheckFailedFeedback: RefundCheckFeedback = {
  status: "failed", title: "Refund status could not be checked. Try again.", message: "",
};

// Only the completed response from the existing validating status-check callable
// confirms completion. A saved badge or read-only operation snapshot is not proof.
export function refundCheckFeedback(result: AdminCancellationReconciliationResult, amount: number | null): RefundCheckFeedback {
  if (result.status === "completed" && result.gatewayStatus === "succeeded" && !result.reconciliationRequired) {
    return confirmedRefundFeedback(amount);
  }
  if (result.status === "processing" && (result.gatewayStatus === "pending" || result.gatewayStatus === "processing")) {
    return pendingRefundFeedback;
  }
  if (result.reconciliationRequired) return refundReviewFeedback;
  if (result.status === "failed") {
    return {status: "failed", title: "Refund failed", message: "The refund was not completed."};
  }
  return refundReviewFeedback;
}

const pendingRefundFeedback: RefundCheckFeedback = {
  status: "pending", title: "Refund pending", message: "FEASTA is checking the refund status automatically.",
};

function confirmedRefundFeedback(amount: number | null): RefundCheckFeedback {
  return {status: "confirmed", title: "Refund confirmed", message: amount === null
    ? "The refund has been completed."
    : `${formatRefundAmount(amount)} has been refunded.`};
}

export function savedRefundPresentation(item: AdminCancellationQueueItem): RefundCheckFeedback | null {
  const refundPhase = item.cancellationStatus === "refund_processing" ||
    item.cancellationStatus === "refund_completed" || item.cancellationStatus === "refund_failed";
  if (!refundPhase) return null;
  if (item.policyEvidenceStatus === "legacy" || item.refundAutomaticCheckState === "review" || item.reconciliationRequired) {
    return refundReviewFeedback;
  }
  if (item.cancellationStatus === "refund_processing") return pendingRefundFeedback;
  if (item.cancellationStatus === "refund_completed") {
    return confirmedRefundFeedback(item.completedRefundAmountInCentavos ?? item.refundAmountInCentavos);
  }
  return {status: "failed", title: "Refund failed", message: "The refund was not completed."};
}

export function manualRefundStatusCheckAvailable(item: AdminCancellationQueueItem): boolean {
  return item.policyEvidenceStatus === "policy_backed" &&
    (item.refundAutomaticCheckState === "review" || item.reconciliationRequired);
}

export function refundInspectionFeedback(result: RefundReconciliationInspection): RefundCheckFeedback {
  if (result.reconciliationRequired) return refundReviewFeedback;
  if (result.operationStatus === "processing" && (result.gatewayStatus === "pending" || result.gatewayStatus === "processing")) {
    return pendingRefundFeedback;
  }
  // Failed/missing/completed inspection snapshots require the validating check;
  // never turn incomplete historical data into a completed refund.
  return refundReviewFeedback;
}

export function refundCheckScope(item: AdminCancellationQueueItem): string {
  return JSON.stringify([item.cancellationRequestId, item.updatedAt, item.cancellationStatus, item.operationStatus,
    item.paymentStatus, item.refundAmountInCentavos, item.completedRefundAmountInCentavos, item.reconciliationRequired,
    item.refundAutomaticCheckState]);
}

export function formatRefundAmount(value: number): string {
  return new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(value / 100);
}
