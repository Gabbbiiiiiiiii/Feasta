import {createHash} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";
import {remainingBalanceHardDeadline} from "./canonical-balance-timing.js";
import {checkoutAttemptKey, isAuthoritativelyTerminalUnsuccessful} from "./checkout-attempt-domain.js";
import {canonicalPaymentLinkageReason} from "./payment-lifecycle.js";
import {paymentIdForProviderRequestChoice} from "./payment-obligation.js";

type RecordData = Readonly<Record<string, unknown>>;
export type BalanceEnforcementStatus = "clear" | "on_hold" | "cancellation_pending" |
  "refund_processing" | "refunded" | "reconciliation_required";
export type BalanceEnforcementReason = "balance_paid" | "balance_unpaid_no_attempt" |
  "payment_in_flight_at_deadline" | "payment_settled_after_hold" | "gateway_terminal_outcome_unproven" |
  "balance_payment_terminal_unsuccessful";
export type BalanceEnforcement<T = unknown> = {
  status: BalanceEnforcementStatus; reason: BalanceEnforcementReason; dueAt: T; evaluatedAt: T;
  paymentId: string | null; checkoutAttemptId: string | null;
  cancellationRequestId: string | null; refundId: string | null;
  hardPaymentDeadlineAt?: T;
};
export type BalanceAttemptClassification = {
  kind: "none" | "existing" | "terminal_unsuccessful" | "reconciliation_required";
  paymentId: string; checkoutAttemptId: string | null;
};

export function balanceDeadlineCancellationId(requestId: string, dueAt: Date): string {
  return "cancellation_" + createHash("sha256").update(JSON.stringify([
    requestId, dueAt.toISOString(), "remaining_balance_unpaid_at_deadline",
  ])).digest("hex").slice(0, 40);
}

/** Complete durable attempt history is required; a pending payment label is insufficient. */
export function classifyBalanceDeadlineAttempt(input: {
  providerRequestId: string; providerRequest: RecordData; mainEvent: RecordData;
  payment: RecordData | null; attempts: readonly {id: string; data: RecordData}[];
  gatewaySuccessCount: number;
}): BalanceAttemptClassification {
  const {providerRequestId, providerRequest: request, payment, attempts} = input;
  const paymentId = paymentIdForProviderRequestChoice(providerRequestId, "remaining_balance");
  const result = (kind: BalanceAttemptClassification["kind"], checkoutAttemptId: string | null = null) =>
    ({kind, paymentId, checkoutAttemptId});
  const dueAt = remainingBalanceHardDeadline(request);
  const v3 = request.remainingBalanceTimingSchemaVersion === 3;
  if (!payment) return result(attempts.length || input.gatewaySuccessCount ? "reconciliation_required" : "none");
  if (canonicalPaymentLinkageReason({paymentId, providerRequestId,
    mainEventId: String(request.mainEventId), customerId: String(request.customerId),
    providerId: String(request.providerId), payment, providerRequest: request, mainEvent: input.mainEvent}) ||
    payment.paymentChoice !== "remaining_balance" || payment.attemptSchemaVersion !== 1 ||
    payment.attemptCount !== attempts.length || payment.reconciliationRequired ||
    input.gatewaySuccessCount > 0 || ["paid", "refunded", "partially_refunded"].includes(String(payment.status))) {
    return result("reconciliation_required");
  }
  if (!attempts.length) {
    // A logical reservation has not dispatched a durable attempt. The dispatch
    // transaction independently enforces dueAt before creating that first attempt.
    return result(payment.currentCheckoutAttemptId == null && payment.paymongoCheckoutId == null &&
      ["pending", "processing"].includes(String(payment.status)) ? "none" : "reconciliation_required");
  }
  const current = attempts.find((attempt) => attempt.id === payment.currentCheckoutAttemptId);
  if (!current) return result("reconciliation_required");
  for (const {id, data} of attempts) {
    const firstDispatchAt = storedDate(data.firstDispatchAt);
    if (data.attemptId !== id || data.paymentId !== paymentId ||
      data.idempotencyKey !== checkoutAttemptKey(paymentId, id) || !firstDispatchAt ||
      (v3 ? firstDispatchAt >= dueAt : firstDispatchAt > dueAt) ||
      !["unresolved", "outstanding", "success", "failed", "expired"].includes(String(data.resolution))) {
      return result("reconciliation_required", current.id);
    }
  }
  if (v3) {
    // Only exhaustive irreversible attestation proves failure. Status labels/GET
    // observations and network timeouts never cancel a potentially paid booking.
    const unresolved = attempts.filter(({data}) => !isAuthoritativelyTerminalUnsuccessful(data));
    if (!unresolved.length) return result("terminal_unsuccessful", current.id);
    if (unresolved.some(({data}) => data.resolution === "success" ||
      ["failed", "expired", "cancelled"].includes(String(data.observedCheckoutStatus)) ||
      ["failed", "expired"].includes(String(data.resolution)) || data.unsuccessfulObservation != null)) {
      return result("reconciliation_required", current.id);
    }
    return result(["pending", "processing"].includes(String(payment.status)) ? "existing" : "reconciliation_required", current.id);
  }
  const unsuccessful = ["failed", "expired", "cancelled"].includes(String(payment.status)) ||
    attempts.some(({data}) => ["failed", "expired", "success"].includes(String(data.resolution)) ||
      ["failed", "expired", "cancelled"].includes(String(data.observedCheckoutStatus)) ||
      data.lastReconciliationOutcome === "unresolved" || data.unsuccessfulObservation != null);
  // This phase never cancels a booking that has a pre-deadline attempt, even
  // if a future adapter can attest terminal failure. No terminal rules change.
  return result(unsuccessful ? "reconciliation_required" : "existing", current.id);
}

export function storedDate(value: unknown): Date | null {
  try {
    const date = (value as {toDate?: () => Date} | null)?.toDate?.();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch { return null; }
}

export function remainingBalanceDeadlinePassed(): HttpsError {
  return new HttpsError("failed-precondition", "The remaining-balance payment deadline has passed.",
    {reason: "remaining_balance_deadline_passed"});
}

/** Called only after the existing trusted webhook linkage/money validation. */
export function balanceEnforcementPaymentOutcomeUpdate(input: {
  request: RecordData; settlementUpdate: RecordData; status: unknown; timestamp: unknown;
  now?: Date;
}): Record<string, unknown> {
  const {request, settlementUpdate, status, timestamp} = input;
  if (![2, 3].includes(Number(request.remainingBalanceTimingSchemaVersion)) || request.status !== "confirmed" ||
    (input.now ?? new Date(Date.now())) < remainingBalanceHardDeadline(request)) return {};
  const previous = request.remainingBalanceEnforcement as BalanceEnforcement | undefined;
  const paid = status === "paid" && settlementUpdate.settlementStatus === "fully_settled" &&
    settlementUpdate.outstandingAmountInCentavos === 0;
  if (!paid && status !== "failed" && status !== "expired" && status !== "cancelled") return {};
  return {remainingBalanceEnforcementSchemaVersion: 1, remainingBalanceEnforcement: {
    ...previous, status: paid ? "clear" : "reconciliation_required",
    reason: paid ? previous && previous.status !== "clear" ? "payment_settled_after_hold" : "balance_paid"
      : "gateway_terminal_outcome_unproven",
    dueAt: request.remainingBalanceDueAt, evaluatedAt: timestamp,
    ...(request.remainingBalanceTimingSchemaVersion === 3 ? {hardPaymentDeadlineAt: request.hardPaymentDeadlineAt} : {}),
    paymentId: request.remainingBalancePaymentId ?? null, checkoutAttemptId: previous?.checkoutAttemptId ?? null,
    cancellationRequestId: null, refundId: null,
  }, ...(request.remainingBalanceTimingSchemaVersion === 3 ? {
    remainingBalanceNextCheckAt: timestamp, lifecycleNextTransitionAt: timestamp,
  } : {}), ...(paid ? {remainingBalanceStatus: "paid"} : {})};
}

export function assertBalanceEnforcementAllowsProgress(request: RecordData): void {
  if (request.remainingBalanceTimingSchemaVersion !== 2 && request.remainingBalanceTimingSchemaVersion !== 3) return;
  const enforcement = request.remainingBalanceEnforcement as BalanceEnforcement | undefined;
  if (request.remainingBalanceEnforcementSchemaVersion != null &&
    (request.remainingBalanceEnforcementSchemaVersion !== 1 || !enforcement || enforcement.status !== "clear")) {
    throw new HttpsError("failed-precondition", "This booking is on hold for payment confirmation.",
      {reason: "remaining_balance_enforcement_blocked"});
  }
  // Also enforce while the hourly worker has not reached this booking yet.
  if (request.status === "confirmed" && request.initialPaymentChoice === "minimum" &&
    Date.now() >= remainingBalanceHardDeadline(request).getTime() &&
    (request.settlementStatus !== "fully_settled" || request.outstandingAmountInCentavos !== 0)) {
    throw new HttpsError("failed-precondition", "The remaining balance must be confirmed before this booking can progress.",
      {reason: "remaining_balance_enforcement_blocked"});
  }
}
