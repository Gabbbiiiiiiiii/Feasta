import {Timestamp, type Transaction} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {createNotificationWithIdInTransaction} from "../shared/notifications.js";
import {INITIAL_EXPIRATION_REASON, initialExpirationDecision,
  initialExpirationPaymentIds} from "../payments/initial-payment-expiration.js";
import {resolveProviderRequestDocuments} from "../provider-requests/provider-request-relationship-integrity.js";
import {issueStrike, readViolationState, ViolationStateIntegrityError,
  type ViolationState, OBSERVATION_MS} from "./customer-violation-policy.js";

export const MAX_VIOLATION_EVENT_REQUESTS = 20;
export function validViolationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

export function writeViolationState(transaction: Transaction, customerId: string, state: ViolationState): void {
  transaction.set(db.collection("customerViolationStates").doc(customerId), {...state,
    nextReviewAt: state.restriction ? Timestamp.fromMillis(state.restriction.untilMs) : null,
    updatedAt: serverTimestamp()});
}

export function violationNotification(transaction: Transaction, customerId: string, id: string,
  title: string, message: string): void {
  createNotificationWithIdInTransaction(transaction, `violation_${id}`, {
    userId: customerId, title, message, type: "account", relatedId: customerId,
    relatedCollection: "users",
  });
}

function safeParent(data: Record<string, unknown>): boolean {
  const refund = data.refundEligibilityState as Record<string, unknown> | null;
  return data.status === "expired" && data.paymentStatus === "unpaid" &&
    refund?.activeCancellationRequestId == null &&
    ["reconciliationRequired", "lifecycleReconciliationRequired"].every(k => data[k] !== true) &&
    ["refundExecutionLock", "activeCancellationRequestId", "approvedCancellationRequestId",
      "remainingBalanceEnforcement", "initialPaymentReview", "paymentId", "paidAt", "refundedAt",
      "settlementSchemaVersion", "settlementStatus", "paymongoPaymentId", "paymongoCheckoutId",
      "initialPaymentDispatchReservedAt", "initialPaymentId", "initialPaymentChoice", "initialPaymentSelectedAt",
      "remainingBalancePaymentId", "grossSettledAmountInCentavos", "outstandingAmountInCentavos",
      "paymongoPaymentIntentId", "checkoutUrl", "paymongoResourceId", "paymongoPaymentIds",
      "paymongoPaymentIntentIds", "checkoutCreationStatus", "cancelledAt", "rejectedAt"]
      .every(k => data[k] == null) &&
    ["refundAmount", "refundedAmount", "refundedAmountInCentavos"].every(k => data[k] == null || data[k] === 0) &&
    ["refundStatus", "cancellationStatus"].every(k => data[k] == null || data[k] === "none");
}

/** Independent post-expiration adjudication. Never writes booking, provider,
 * payment, refund, availability, deadline or expiration-worker documents. */
export async function adjudicateCustomerExpiration(mainEventId: string): Promise<string> {
  if (!validViolationId(mainEventId)) return "invalid_identity";
  return db.runTransaction(async transaction => {
    const now = Date.now();
    const parent = (await transaction.get(db.collection("mainEvents").doc(mainEventId))).data();
    if (!parent || parent.customerViolationPolicyVersion !== 1 || !safeParent(parent) ||
      !(parent.createdAt instanceof Timestamp) || !validViolationId(parent.customerId)) return "ineligible";
    const customerId = parent.customerId;
    const stateRef = db.collection("customerViolationStates").doc(customerId);
    const recordRef = stateRef.collection("violations").doc(mainEventId);
    const reviewRef = db.collection("customerViolationAdjudicationReviews").doc(mainEventId);
    const [receipt, stateSnapshot, customer, siblings, reviewSnapshot] = await Promise.all([
      transaction.get(recordRef), transaction.get(stateRef),
      transaction.get(db.collection("users").doc(customerId)),
      transaction.get(db.collection("providerRequests").where("mainEventId", "==", mainEventId)
        .limit(MAX_VIOLATION_EVENT_REQUESTS + 1)),
      transaction.get(reviewRef),
    ]);
    if (receipt.exists) return "duplicate";
    const review = (reason: string): string => {
      // A deterministic receipt bounds permanent-failure processing and audit writes.
      if (reviewSnapshot.data()?.reason !== reason || reviewSnapshot.data()?.status !== "open") {
        transaction.set(reviewRef, {mainEventId, customerId, reason, status: "open", updatedAt: serverTimestamp()});
        writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system",
          action: "customer_violation.review_required", targetCollection: "customerViolationAdjudicationReviews",
          targetId: mainEventId, reason, metadata: {customerId}});
      }
      return "review";
    };
    if (customer.data()?.role !== "customer") return review("invalid_customer_role");
    if (siblings.size > MAX_VIOLATION_EVENT_REQUESTS) return review("event_request_limit_exceeded");
    const relations = resolveProviderRequestDocuments({mainEventId, mainEvent: parent, requests: siblings.docs});
    if (!relations.ok || relations.historicalRequests.length || !siblings.size) return "ineligible";
    let occurredAtMs = 0;
    for (const document of siblings.docs) {
      const request = document.data();
      const expired = request.initialPaymentExpiredAt;
      const recorded = request.initialPaymentExpirationRecordedAt;
      if (request.status !== "expired" || request.initialPaymentExpirationReason !== INITIAL_EXPIRATION_REASON ||
        ["cancelledAt", "rejectedAt", "cancellationReason", "rejectionReason"].some(k => request[k] != null) ||
        !(expired instanceof Timestamp) || !(recorded instanceof Timestamp) ||
        recorded.toMillis() > now || recorded.toMillis() < expired.toMillis() ||
        !(request.createdAt instanceof Timestamp) || request.createdAt.toMillis() < parent.createdAt.toMillis()) return "ineligible";
      // Reuse the engine's read-only financial safety decision; the reconstructed
      // status only permits validation of its original, frozen acceptance evidence.
      const decision = initialExpirationDecision({...request, status: "accepted"}, new Date(now));
      if (decision.kind !== "candidate" || decision.deadline.toMillis() !== expired.toMillis()) return "ineligible";
      occurredAtMs = Math.max(occurredAtMs, expired.toMillis());
    }
    // A delayed event cannot turn an old expiration into a fresh strike.
    if (occurredAtMs <= now - OBSERVATION_MS) return "outside_window";
    const evidence = await Promise.all(siblings.docs.flatMap(document => {
      const refs = initialExpirationPaymentIds(document.id).map(id => db.collection("payments").doc(id));
      return [
        ...refs.map(ref => transaction.get(ref)),
        ...refs.flatMap(ref => ["checkoutAttempts", "gatewayPayments", "refunds", "events"]
          .map(name => transaction.get(ref.collection(name).limit(1)))),
        transaction.get(db.collection("payments").where("providerRequestId", "==", document.id).limit(1)),
        transaction.get(db.collection("providerRequestCancellationRequests")
          .where("providerRequestId", "==", document.id).limit(1)),
      ];
    }));
    const eventEvidence = await Promise.all([
      transaction.get(db.collection("payments").where("mainEventId", "==", mainEventId).limit(1)),
      transaction.get(db.collection("providerRequestCancellationRequests").where("mainEventId", "==", mainEventId).limit(1)),
    ]);
    if ([...evidence, ...eventEvidence].some(s => "exists" in s ? s.exists : !s.empty)) return "payment_or_cancellation_evidence";
    let before;
    try { before = readViolationState(stateSnapshot.data()); }
    catch (error) {
      if (!(error instanceof ViolationStateIntegrityError)) throw error;
      return review("invalid_violation_state");
    }
    const result = issueStrike(before, {id: mainEventId, occurredAtMs}, now);
    if (result.began) {
      const basis = await Promise.all(result.state.restriction!.basis.filter(s => s.id !== mainEventId)
        .map(s => transaction.get(stateRef.collection("violations").doc(s.id))));
      if (basis.some(doc => !doc.exists || doc.data()?.reversedAt != null || doc.data()?.consumedCycleId != null)) {
        return review("invalid_pending_strike_history");
      }
    }
    if (reviewSnapshot.exists) transaction.update(reviewRef, {status: "resolved", resolvedAt: serverTimestamp()});
    // Notify a previous expiry even if its independent sweep was delayed.
    if (before.restriction && before.restriction.untilMs <= now) {
      violationNotification(transaction, customerId, `${before.restriction.id}_ended`, "Booking restriction ended",
        "Your seven-day booking restriction has ended. You may submit new bookings.");
    }
    transaction.create(recordRef, {schemaVersion: 1, mainEventId, customerId,
      providerRequestIds: siblings.docs.map(d => d.id), reason: INITIAL_EXPIRATION_REASON,
      occurredAt: Timestamp.fromMillis(occurredAtMs), issuedAt: Timestamp.fromMillis(now),
      adjudication: result.began ? "restriction" : result.cycleId ? "consumed_during_restriction" :
        result.count === 2 ? "final_warning" : "warning",
      restrictionStartedAt: result.began ? Timestamp.fromMillis(now) : null,
      restrictionExpiresAt: result.began ? Timestamp.fromMillis(result.state.restriction!.untilMs) : null,
      reversedAt: null, consumedCycleId: result.cycleId, revision: 1});
    if (result.began) {
      for (const strike of result.state.restriction!.basis.filter(s => s.id !== mainEventId)) {
        transaction.update(stateRef.collection("violations").doc(strike.id), {consumedCycleId: result.cycleId});
      }
    }
    writeViolationState(transaction, customerId, result.state);
    if (result.began || !result.cycleId) {
      const until = result.state.restriction?.untilMs;
      violationNotification(transaction, customerId, mainEventId,
        result.began ? "Seven-day booking restriction" : result.count === 1 ? "Unpaid booking warning" : "Final unpaid booking warning",
        result.began ? `Three verified unpaid booking expirations occurred within 30 days. New bookings are restricted until ${new Date(until!).toISOString()}. Existing bookings, permitted payments, messages and support remain available.` :
          `You have ${result.count} of 3 active unpaid booking strikes in the rolling 30-day period. ${result.count === 2 ? "A third strike results in a seven-day restriction on new bookings." : "Please pay within the payment window or use a permitted cancellation."}`);
    }
    writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system", action: "customer_violation.issued",
      targetCollection: "customerViolationStates", targetId: customerId,
      reason: INITIAL_EXPIRATION_REASON, metadata: {mainEventId, cycleId: result.cycleId, activeCount: result.count,
        restrictionExpiresAt: result.state.restriction ? new Date(result.state.restriction.untilMs).toISOString() : null}});
    return "issued";
  });
}

export async function endCustomerRestriction(customerId: string): Promise<boolean> {
  return db.runTransaction(async transaction => {
    const state = readViolationState((await transaction.get(db.collection("customerViolationStates").doc(customerId))).data());
    if (!state.restriction || state.restriction.untilMs > Date.now()) return false;
    violationNotification(transaction, customerId, `${state.restriction.id}_ended`, "Booking restriction ended",
      "Your seven-day booking restriction has ended. You may submit new bookings.");
    writeViolationState(transaction, customerId, {...state, restriction: null, revision: state.revision + 1});
    writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system", action: "customer_violation.restriction_ended",
      targetCollection: "customerViolationStates", targetId: customerId, metadata: {cycleId: state.restriction.id}});
    return true;
  });
}
