import {trustedScheduledEventEnd} from "../bookings/booking-completion-policy.js";
import {cancellationError, REFUND_CANCELLATION_ERROR_REASONS} from
  "./refund-cancellation-domain.js";

/** Gates new customer requests only; existing cancellation/refund processing is unchanged. */
export function cancellationDeadline(request: Readonly<Record<string, unknown>>,
  parent: Readonly<Record<string, unknown>>, now = new Date()): {
    reason: "EVENT_ENDED" | "SCHEDULE_RECONCILIATION_REQUIRED" | null;
    eligibilityExpiresInMs: number | null;
  } {
  try {
    const end = trustedScheduledEventEnd(request, parent);
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(end.getTime())) {
      throw new Error("Invalid schedule.");
    }
    return {reason: now >= end ? "EVENT_ENDED" : null,
      eligibilityExpiresInMs: Math.max(0, end.getTime() - now.getTime())};
  } catch {
    return {reason: "SCHEDULE_RECONCILIATION_REQUIRED", eligibilityExpiresInMs: null};
  }
}

export function assertNewCancellationBeforeEnd(request: Readonly<Record<string, unknown>>,
  parent: Readonly<Record<string, unknown>>): void {
  const deadline = cancellationDeadline(request, parent);
  if (deadline.reason === "EVENT_ENDED") throw cancellationError("failed-precondition",
    REFUND_CANCELLATION_ERROR_REASONS.eventEnded,
    "Cancellation closed: the event has ended. New requests are no longer accepted. " +
    "Report an Issue remains available.");
  if (deadline.reason) throw cancellationError("failed-precondition",
    REFUND_CANCELLATION_ERROR_REASONS.scheduleReconciliationRequired,
    "The event schedule requires review before a new cancellation request can be accepted.");
}
