import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {requireInitialPaymentHold, originalInitialPaymentDeadline} from "../payments/initial-payment-reservation.js";
import {providerPaymentObligationForChoice} from "../payments/payment-obligation.js";
import {enforceInitialPaymentEligibility} from "../payments/initial-payment-eligibility.js";
import {scheduledEventStart} from "../payments/canonical-balance-timing.js";
import {classifyProviderRequestRefundPolicyEvidence, requireRefundEligibilityState} from "../bookings/booking-refund-policy.js";

/** Explicit provider retry only; no migration and no new financial/policy evidence. */
export function existingAcceptancePlan(request: Readonly<Record<string, unknown>>, now: Date) {
  const invalid = () => {throw new HttpsError("failed-precondition",
    "This historical acceptance requires reconciliation of its original reservation and financial evidence.",
    {reason: "accepted_request_reconciliation_required"});};
  const acceptedAt = request.acceptedAt;
  const capturedAt = request.financialSnapshotCapturedAt;
  const eventDate = request.eventDate;
  if (request.status !== "accepted" || !(acceptedAt instanceof Timestamp) ||
    !(capturedAt instanceof Timestamp) || capturedAt.toMillis() !== acceptedAt.toMillis() ||
    !(eventDate instanceof Timestamp) || typeof request.eventTime !== "string" ||
    request.providerOwnerId == null || request.initialPaymentReview != null || request.reconciliationRequired === true ||
    request.lifecycleReconciliationRequired === true || request.refundExecutionLock != null ||
    request.activeCancellationRequestId != null || request.approvedCancellationRequestId != null ||
    ["paymentId", "initialPaymentId", "initialPaymentChoice", "remainingBalancePaymentId", "settlementSchemaVersion"]
      .some(field => request[field] != null) ||
    ![undefined, null, "unpaid"].includes(request.paymentStatus as string | null | undefined) ||
    request.initialPaymentEligibilitySchemaVersion == null) return invalid();
  enforceInitialPaymentEligibility(request, "full");
  const eligibility = request.initialPaymentEligibility as Record<string, unknown>;
  const eventStart = scheduledEventStart(eventDate.toDate(), request.eventTime);
  if (!(eligibility.eventStartAt instanceof Timestamp) || eligibility.eventStartAt.toMillis() !== eventStart.getTime() ||
    (request.initialPaymentEligibilitySchemaVersion === 1 &&
      (!(eligibility.evaluatedAt instanceof Timestamp) || eligibility.evaluatedAt.toMillis() !== acceptedAt.toMillis()))) return invalid();
  const evidence = classifyProviderRequestRefundPolicyEvidence(request);
  if (evidence.status === "invalid" || (evidence.status === "policy_backed" &&
    requireRefundEligibilityState(request, now).activeCancellationRequestId !== null)) return invalid();
  const obligation = providerPaymentObligationForChoice({financialSnapshot: request.financialSnapshot, paymentChoice: "full"});
  const snapshot = request.financialSnapshot as Record<string, unknown>;
  if (obligation.amountInCentavos !== Math.round(Number(request.amount) * 100) ||
    snapshot.requiredUpfrontAmountInCentavos !== Math.round(Number(request.downPaymentAmount) * 100)) return invalid();
  let expiresAt: Timestamp;
  try { expiresAt = originalInitialPaymentDeadline(request); } catch { return invalid(); }
  requireInitialPaymentHold({...request, expiresAt}, now);
  return {expiresAt};
}
