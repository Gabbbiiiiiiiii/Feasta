import {trustedScheduledEventEnd} from "../bookings/booking-completion-policy.js";
import {parseStoredCancellationPolicySnapshot} from "./cancellation-policy-domain.js";
import {cancellationError, REFUND_CANCELLATION_ERROR_REASONS} from
  "./refund-cancellation-domain.js";

export type CancellationDeadlineResult = {
  reason: "CANCELLATION_CUTOFF_PASSED" | "EVENT_ENDED" | "SCHEDULE_RECONCILIATION_REQUIRED" | null;
  eligibilityExpiresInMs: number | null;
  cancellationCutoffAt: string | null;
  cancellationCutoffHours: number | null;
};

/** Gates new customer requests only; existing cancellation/refund processing is unchanged. */
export function cancellationDeadline(
  request: Readonly<Record<string, unknown>>,
  parent: Readonly<Record<string, unknown>>,
  now = new Date(),
): CancellationDeadlineResult {
  try {
    const end = trustedScheduledEventEnd(request, parent);
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(end.getTime())) {
      throw new Error("Invalid schedule.");
    }

    const snapshot = request.cancellationPolicySnapshot !== undefined &&
      request.cancellationPolicySnapshot !== null
      ? parseStoredCancellationPolicySnapshot(request.cancellationPolicySnapshot)
      : null;

    const cutoffMs = snapshot ? snapshot.cancellationCutoffAt.toMillis() : null;
    const cutoffIso = snapshot ? snapshot.cancellationCutoffAt.toDate().toISOString() : null;
    const cutoffHours = snapshot ? snapshot.cutoffHoursBeforeEvent : null;

    if (now >= end) {
      return {
        reason: "EVENT_ENDED",
        eligibilityExpiresInMs: 0,
        cancellationCutoffAt: cutoffIso,
        cancellationCutoffHours: cutoffHours,
      };
    }

    if (cutoffMs !== null && now.getTime() >= cutoffMs) {
      return {
        reason: "CANCELLATION_CUTOFF_PASSED",
        eligibilityExpiresInMs: 0,
        cancellationCutoffAt: cutoffIso,
        cancellationCutoffHours: cutoffHours,
      };
    }

    const effectiveDeadlineMs = cutoffMs !== null
      ? Math.min(cutoffMs, end.getTime())
      : end.getTime();

    return {
      reason: null,
      eligibilityExpiresInMs: Math.max(0, effectiveDeadlineMs - now.getTime()),
      cancellationCutoffAt: cutoffIso,
      cancellationCutoffHours: cutoffHours,
    };
  } catch {
    return {
      reason: "SCHEDULE_RECONCILIATION_REQUIRED",
      eligibilityExpiresInMs: null,
      cancellationCutoffAt: null,
      cancellationCutoffHours: null,
    };
  }
}

export function assertNewCancellationBeforeEnd(
  request: Readonly<Record<string, unknown>>,
  parent: Readonly<Record<string, unknown>>,
): void {
  const deadline = cancellationDeadline(request, parent);
  if (deadline.reason === "CANCELLATION_CUTOFF_PASSED") {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.cancellationCutoffPassed,
      "Cancellation closed: the cancellation cutoff date has passed. New cancellation requests are no longer accepted. " +
      "Report an Issue remains available.",
    );
  }
  if (deadline.reason === "EVENT_ENDED") {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.eventEnded,
      "Cancellation closed: the event has ended. New requests are no longer accepted. " +
      "Report an Issue remains available.",
    );
  }
  if (deadline.reason) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.scheduleReconciliationRequired,
      "The event schedule requires review before a new cancellation request can be accepted.",
    );
  }
}
