import {Timestamp} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {createNotificationWithIdInTransaction} from "../shared/notifications.js";
import {parseMainEventStatus, isMainEventStatusTransitionAllowed} from "../shared/constants.js";
import {calculateMainEventRequestSummary} from "../provider-requests/recalculate-main-event-status.js";
import {requireProviderRequestDocuments, requireActiveProviderRequest} from "../provider-requests/provider-request-relationship-integrity.js";
import {classifyProviderRequestRefundPolicyEvidence, requireRefundEligibilityState} from "../bookings/booking-refund-policy.js";
import {legacyActiveCancellationRequestId} from "../cancellations/refund-cancellation-domain.js";
import {executeRefund} from "../refunds/refund-execution.js";
import {reserveSystemDepositRefund, settledDepositRefundEvidence, preflightPaymentDefaultAccounting,
  SYSTEM_BALANCE_REFUND_SOURCE} from "../refunds/system-balance-deadline-refund.js";
import {remainingBalanceHardDeadline} from "./canonical-balance-timing.js";
import {readTrustedProviderRequestPaymentSetInTransaction} from "./provider-request-payment-reader.js";
import {readBalanceDeadlineAttempt} from "./remaining-balance-enforcement-reader.js";
import {balanceDeadlineCancellationId, type BalanceEnforcement, type BalanceEnforcementStatus,
  type BalanceEnforcementReason} from "./remaining-balance-enforcement-domain.js";

/** Same transaction reads settlement, ALL durable attempts and event relationships before cancelling. */
export async function evaluateRemainingBalanceEnforcement(providerRequestId: string, now: Date) {
  const ref = db.collection("providerRequests").doc(providerRequestId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const request = snapshot.data();
    if (!request || ![2, 3].includes(Number(request.remainingBalanceTimingSchemaVersion)) || request.initialPaymentChoice !== "minimum") return null;
    const v3 = request.remainingBalanceTimingSchemaVersion === 3;
    const dueAt = remainingBalanceHardDeadline(request);
    if (now < dueAt) return null;
    const old = request.remainingBalanceEnforcement as BalanceEnforcement | undefined;
    if (request.status === "cancelled") {
      return old?.status === "cancellation_pending" || old?.status === "refund_processing"
        ? old.cancellationRequestId : null;
    }
    if (request.status !== "confirmed") return null;
    const record = (status: BalanceEnforcementStatus, reason: BalanceEnforcementReason,
      paymentId: string | null = null, checkoutAttemptId: string | null = null,
      cancellationRequestId: string | null = null, refundId: string | null = null) => {
      const state: BalanceEnforcement<Timestamp> = {status, reason, dueAt: Timestamp.fromDate(dueAt),
        ...(v3 ? {hardPaymentDeadlineAt: Timestamp.fromDate(dueAt)} : {}),
        evaluatedAt: Timestamp.fromDate(now), paymentId, checkoutAttemptId, cancellationRequestId, refundId};
      if (request.remainingBalanceEnforcementSchemaVersion === 1 && old?.status === status && old.reason === reason &&
        old.paymentId === paymentId && old.checkoutAttemptId === checkoutAttemptId) return;
      transaction.update(ref, {remainingBalanceEnforcementSchemaVersion: 1, remainingBalanceEnforcement: state,
        ...(v3 ? {remainingBalanceNextCheckAt: status === "clear" ? null : Timestamp.fromMillis(now.getTime() + 60_000),
          lifecycleNextTransitionAt: status === "clear" ? Timestamp.fromDate(now) : request.lifecycleNextTransitionAt ?? null} : {}),
        updatedAt: serverTimestamp(), ...(status === "clear" ? {remainingBalanceStatus: "paid"} : {})});
      writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system",
        action: "payment.remaining_balance_enforcement", targetCollection: "providerRequests", targetId: providerRequestId,
        after: {status, reason}, metadata: {dueAt: dueAt.toISOString(), cancellationRequestId, refundId}});
      if (status === "on_hold") {
        const key = balanceDeadlineCancellationId(providerRequestId, dueAt);
        for (const [role, userId, title, message] of [
          ["customer", request.customerId, "Payment pending · Booking on hold", "FEASTA is confirming your remaining-balance payment. Your booking is temporarily on hold while payment confirmation completes."],
          ["provider", request.providerOwnerId, "Booking on hold · Payment pending", "The Customer's remaining-balance payment is being confirmed. The booking is temporarily on hold."],
        ]) createNotificationWithIdInTransaction(transaction, `${key}_hold_${role}`, {
          userId: String(userId), title: String(title), message: String(message), type: "payment",
          relatedId: providerRequestId, relatedCollection: "providerRequests",
        });
      }
    };
    // Resolve every authority before writing. Any disagreement blocks money movement.
    let evidence: ReturnType<typeof settledDepositRefundEvidence>;
    let summary: ReturnType<typeof calculateMainEventRequestSummary>;
    let parentStatus: NonNullable<ReturnType<typeof parseMainEventStatus>>;
    let parentRef: FirebaseFirestore.DocumentReference;
    let terminalAttempt = false;
    try {
      parentRef = db.collection("mainEvents").doc(request.mainEventId);
      const [parent, requests, provider] = await Promise.all([
        transaction.get(parentRef), transaction.get(db.collection("providerRequests").where("mainEventId", "==", request.mainEventId)),
        transaction.get(db.collection("providers").doc(request.providerId)),
      ]);
      if (!parent.exists || !provider.exists || provider.data()?.ownerId !== request.providerOwnerId ||
        typeof request.customerId !== "string" || typeof request.providerOwnerId !== "string") throw new Error("Invalid ownership.");
      const mainEvent = parent.data()!;
      const relationships = requireProviderRequestDocuments({mainEventId: request.mainEventId, mainEvent, requests: requests.docs});
      requireActiveProviderRequest(relationships, providerRequestId);
      const paymentSet = await readTrustedProviderRequestPaymentSetInTransaction({transaction, providerRequestId,
        providerRequest: request, mainEventId: request.mainEventId, customerId: request.customerId,
        providerId: request.providerId, mainEvent, invalid: () => {throw new Error("Invalid payment set.");}});
      if (paymentSet.mode !== "p5") throw new Error("Invalid settlement mode.");
      if (paymentSet.settlement.fullySettled && paymentSet.settlement.outstandingAmountInCentavos === 0 &&
        request.settlementStatus === "fully_settled" && request.outstandingAmountInCentavos === 0) {
        record("clear", old && old.status !== "clear" ? "payment_settled_after_hold" : "balance_paid");
        return null;
      }
      const attempt = await readBalanceDeadlineAttempt({transaction, providerRequestId, providerRequest: request, mainEvent});
      if (attempt.kind === "none" && old?.checkoutAttemptId) {
        record("reconciliation_required", "gateway_terminal_outcome_unproven", old.paymentId, old.checkoutAttemptId);
        return null;
      }
      if (attempt.kind !== "none" && attempt.kind !== "terminal_unsuccessful") {
        const held = attempt.kind === "existing" && (v3 || old?.status !== "reconciliation_required");
        record(held ? "on_hold" : "reconciliation_required",
          held ? "payment_in_flight_at_deadline" : "gateway_terminal_outcome_unproven",
          attempt.paymentId, attempt.checkoutAttemptId);
        return null;
      }
      terminalAttempt = attempt.kind === "terminal_unsuccessful";
      const policy = classifyProviderRequestRefundPolicyEvidence(request);
      if (policy.status === "invalid" || (policy.status === "policy_backed"
        ? requireRefundEligibilityState(request).activeCancellationRequestId : legacyActiveCancellationRequestId(request)) !== null ||
        request.approvedCancellationRequestId != null) throw new Error("Cancellation already active.");
      evidence = settledDepositRefundEvidence({providerRequestId, providerRequest: request, paymentSet});
      await preflightPaymentDefaultAccounting({transaction, providerRequestId, providerRequest: request, evidence});
      const parsed = parseMainEventStatus(mainEvent.status);
      if (!parsed) throw new Error("Invalid event status.");
      parentStatus = parsed;
      summary = calculateMainEventRequestSummary(relationships.activeRequests, parentStatus,
        [{providerRequestId, status: "cancelled"}]);
      if (summary.status !== parentStatus && !isMainEventStatusTransitionAllowed(parentStatus, summary.status)) throw new Error("Invalid event transition.");
    } catch {
      record("reconciliation_required", "gateway_terminal_outcome_unproven");
      return null;
    }
    const cancellationRequestId = balanceDeadlineCancellationId(providerRequestId, dueAt);
    // Reservation reads precede every write. Transaction conflicts with checkout and
    // webhook settlement force a fresh decision instead of cancelling settled money.
    const refundId = await reserveSystemDepositRefund({transaction, cancellationRequestId, providerRequestId,
      providerRequest: request, evidence});
    record("cancellation_pending", terminalAttempt ? "balance_payment_terminal_unsuccessful" : "balance_unpaid_no_attempt",
      evidence.paymentId, null, cancellationRequestId, refundId);
    transaction.update(ref, {status: "cancelled", cancelledAt: serverTimestamp(), statusUpdatedAt: serverTimestamp(),
      cancellationReason: "remaining_balance_unpaid_at_deadline", cancellationSource: SYSTEM_BALANCE_REFUND_SOURCE,
      cancellationActor: "system", approvedCancellationRequestId: cancellationRequestId, latestCancellationRequestId: cancellationRequestId,
      ...(v3 ? {remainingCollectibleAmountInCentavos: 0, remainingBalanceStatus: "cancelled",
        lifecycleNextTransitionAt: null} : {}),
      updatedAt: serverTimestamp()});
    transaction.update(parentRef!, {...summary!, updatedAt: serverTimestamp(),
      ...(summary!.status !== parentStatus! ? {statusUpdatedAt: serverTimestamp()} : {})});
    createNotificationWithIdInTransaction(transaction, `${cancellationRequestId}_provider_cancelled`, {
      userId: request.providerOwnerId, title: "Booking cancelled - payment incomplete",
      message: v3 ? `The booking was automatically cancelled because the Customer's remaining balance was not settled by the deadline. Reservation compensation: ${new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(paymentDefaultAllocation(evidence.amountInCentavos).providerReservationCompAmountInCentavos / 100)}; subject to refund completion.`
        : "This Provider service was cancelled because no remaining-balance payment was started by the deadline.",
      type: "booking", relatedId: providerRequestId, relatedCollection: "providerRequests",
    });
    if (v3) createNotificationWithIdInTransaction(transaction, `${cancellationRequestId}_customer_cancelled`, {
      userId: request.customerId, title: "Booking automatically cancelled",
      message: `Your booking was automatically cancelled because the remaining balance was not settled by the payment deadline. Your refund of ${new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(paymentDefaultAllocation(evidence.amountInCentavos).customerDefaultRefundAmountInCentavos / 100)} is being processed.`,
      type: "booking", relatedId: providerRequestId, relatedCollection: "providerRequests",
    });
    if (v3) transaction.create(parentRef!.collection("timeline").doc(`v3_default_${providerRequestId}`), {
      type: "payment_default_cancelled", title: "Final payment deadline missed - booking automatically cancelled",
      description: "The remaining balance was not settled by the final payment deadline. Refund processing.",
      providerRequestId, providerId: request.providerId, createdAt: serverTimestamp(), createdByRole: "system", status: "cancelled",
    });
    return cancellationRequestId;
  });
}

/** Gateway execution stays outside transactions, using the existing trusted engine. */
export async function enforceRemainingBalanceDeadline(providerRequestId: string, now: Date) {
  const cancellationRequestId = await evaluateRemainingBalanceEnforcement(providerRequestId, now);
  if (!cancellationRequestId) return;
  await executeRefund({cancellationRequestId, actorId: "feasta"});
}
import {paymentDefaultAllocation} from "../bookings/booking-policy-v3.js";
