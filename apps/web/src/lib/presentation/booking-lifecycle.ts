import {scheduledEventWindow} from "./scheduled-event-window";

export const BOOKING_REVIEW_LABEL = "Booking review required";
export const COMPLETION_ON_HOLD_LABEL = "Completion on hold";
export const AWAITING_COMPLETION_LABEL = "Awaiting completion";
export const BOOKING_REVIEW_MESSAGE = "FEASTA needs to resolve a booking review before progression.";
export const ENDED_REVIEW_MESSAGE = "The event has ended. FEASTA must verify the booking's completion records before marking it completed.";
export type LifecycleEvidence = {cancellation: boolean; reconciliation: boolean; end: number | null;
  initialPaymentReview?: boolean; initialPaymentExpired?: boolean};
export function initialPaymentReviewApplies(data: Readonly<Record<string, unknown>>): boolean {
  return data.initialPaymentReview != null &&
    ["accepted", "waiting_for_down_payment", "payment_processing"].includes(String(data.status));
}
/** Display evidence only. Never authorizes preparation, completion, or financial writes. */
export function lifecycleEvidence(data: Readonly<Record<string, unknown>>): LifecycleEvidence {
  const state = data.refundEligibilityState as Record<string, unknown> | null;
  const enforcement = data.remainingBalanceEnforcement as Record<string, unknown> | null;
  return {
    ...(initialPaymentReviewApplies(data) ? {initialPaymentReview: true} : {}),
    ...(data.status === "expired" && data.initialPaymentExpirationReason === "no_attempt_original_deadline_elapsed"
      ? {initialPaymentExpired: true} : {}),
    cancellation: data.activeCancellationRequestId != null || data.approvedCancellationRequestId != null || state?.activeCancellationRequestId != null,
    reconciliation: data.reconciliationRequired === true || data.lifecycleReconciliationRequired === true || data.refundExecutionLock != null || enforcement?.status === "reconciliation_required",
    end: scheduledEventWindow(data)?.end ?? null,
  };
}
export function lifecycleLabel(status: string, evidence?: LifecycleEvidence, now?: number): string | null {
  if (status === "expired" && evidence?.initialPaymentExpired) return "Payment expired";
  if (["completed", "cancelled", "expired", "rejected"].includes(status)) return null;
  if (evidence?.initialPaymentReview && ["accepted", "waiting_for_down_payment", "payment_processing"].includes(status)) {
    return "Payment verification required — Contact support";
  }
  const ended = evidence?.end != null && now != null && now >= evidence.end;
  if (evidence?.cancellation) return BOOKING_REVIEW_LABEL;
  if (evidence?.reconciliation) return ended ? COMPLETION_ON_HOLD_LABEL : BOOKING_REVIEW_LABEL;
  if (status === "in_progress" && ended) return AWAITING_COMPLETION_LABEL;
  return null;
}

export function linkedLifecycleEvidence(parent: LifecycleEvidence, requests: readonly {status: string; lifecycle?: LifecycleEvidence}[], expectedCount = requests.length): LifecycleEvidence {
  const active = requests.filter(request => !["cancelled", "expired", "rejected", "completed"].includes(request.status));
  return {...parent, cancellation: parent.cancellation || active.some(request => request.lifecycle?.cancellation),
    reconciliation: parent.reconciliation || requests.length !== expectedCount || active.some(request => request.lifecycle?.reconciliation)};
}
