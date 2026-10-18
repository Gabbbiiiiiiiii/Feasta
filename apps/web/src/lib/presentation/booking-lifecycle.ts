import {scheduledEventWindow} from "./scheduled-event-window";

export const ENDED_REVIEW_MESSAGE = "The event has ended, but FEASTA needs to resolve a booking reconciliation issue before confirming completion.";
export type LifecycleEvidence = {cancellation: boolean; reconciliation: boolean; end: number | null};
/** Display evidence only. Never authorizes preparation, completion, or financial writes. */
export function lifecycleEvidence(data: Readonly<Record<string, unknown>>): LifecycleEvidence {
  const state = data.refundEligibilityState as Record<string, unknown> | null;
  const enforcement = data.remainingBalanceEnforcement as Record<string, unknown> | null;
  return {
    cancellation: data.activeCancellationRequestId != null || data.approvedCancellationRequestId != null || state?.activeCancellationRequestId != null,
    reconciliation: data.reconciliationRequired === true || data.lifecycleReconciliationRequired === true || data.refundExecutionLock != null || enforcement?.status === "reconciliation_required",
    end: scheduledEventWindow(data)?.end ?? null,
  };
}
export function lifecycleLabel(status: string, evidence?: LifecycleEvidence, now?: number): string | null {
  if (["completed", "cancelled", "expired", "rejected"].includes(status)) return null;
  if (evidence?.cancellation || evidence?.reconciliation) return "Booking review required";
  if (status === "in_progress" && evidence?.end != null && now != null && now >= evidence.end) return "Awaiting completion";
  return null;
}

export function linkedLifecycleEvidence(parent: LifecycleEvidence, requests: readonly {status: string; lifecycle?: LifecycleEvidence}[], expectedCount = requests.length): LifecycleEvidence {
  const active = requests.filter(request => !["cancelled", "expired", "rejected", "completed"].includes(request.status));
  return {...parent, cancellation: parent.cancellation || active.some(request => request.lifecycle?.cancellation),
    reconciliation: parent.reconciliation || requests.length !== expectedCount || active.some(request => request.lifecycle?.reconciliation)};
}
