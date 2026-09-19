import {FieldValue, Timestamp, type QuerySnapshot, type Transaction,
  type DocumentReference} from "firebase-admin/firestore";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {type PayMongoPaymentEvent} from "./payment-security.js";

/** Call only with signature-verified events or authenticated gateway retrieval,
 * after validating the logical payment amount, currency and relationship.
 * All reads must precede this writer. Financial evidence survives lifecycle conflicts.
 */
export function recordAttemptEvidence(input: {
  transaction: Transaction;
  paymentRef: DocumentReference;
  payment: Record<string, unknown>;
  attempts: QuerySnapshot;
  successes: QuerySnapshot;
  event: PayMongoPaymentEvent;
  source: "webhook" | "retrieval";
}): string | null {
  const {transaction, paymentRef, payment, attempts, successes, event, source} = input;
  const matches = attempts.docs.filter((doc) => {
    const data = doc.data();
    return doc.id === event.checkoutAttemptId ||
      (event.checkoutId && data.paymongoCheckoutId === event.checkoutId) ||
      (event.paymentIntentId && data.paymongoPaymentIntentIds?.includes(event.paymentIntentId)) ||
      data.paymongoPaymentIds?.includes(event.gatewayResourceId);
  });
  const attempt = matches.length === 1 ? matches[0] : null;
  const data = attempt?.data();
  const correlationConflict = (payment.attemptSchemaVersion === 1 || event.checkoutAttemptId) &&
    (!attempt || data?.paymentId !== paymentRef.id ||
      (event.checkoutAttemptId && event.checkoutAttemptId !== attempt.id) ||
      (event.checkoutId && data?.paymongoCheckoutId &&
        event.checkoutId !== data.paymongoCheckoutId));
  const knownIds = new Set(successes.docs.map((doc) => doc.id));
  // Legacy accounting identity is evidence of an earlier applied success, not its time.
  if (["paid", "partially_refunded", "refunded"].includes(String(payment.status)) &&
    typeof payment.paymongoResourceId === "string" &&
    payment.paymongoResourceId.startsWith("pay_")) {
    knownIds.add(payment.paymongoResourceId);
  }
  for (const success of event.successfulPayments) {
    knownIds.add(success.id);
    const previous = successes.docs.find((doc) => doc.id === success.id)?.data();
    const timingConflict = previous?.gatewayPaidAt instanceof Timestamp &&
      success.gatewayPaidAtMs !== null &&
      previous.gatewayPaidAt.toMillis() !== success.gatewayPaidAtMs;
    transaction.set(paymentRef.collection("gatewayPayments").doc(success.id), {
      paymentId: paymentRef.id, gatewayPaymentId: success.id,
      checkoutAttemptId: previous?.checkoutAttemptId ??
        (!correlationConflict ? attempt?.id ?? null : null),
      paymentIntentId: success.paymentIntentId,
      amountInCentavos: event.amountInCentavos, currency: event.currency,
      status: "paid", source, processedAt: serverTimestamp(),
      ...(source === "webhook" ? {webhookEventIds: FieldValue.arrayUnion(event.eventId)} : {}),
      ...(success.gatewayPaidAtMs !== null && !previous?.gatewayPaidAt ? {
        gatewayPaidAt: Timestamp.fromMillis(success.gatewayPaidAtMs),
        gatewayPaidAtSource: "payment.attributes.paid_at",
      } : {}),
      ...(timingConflict ? {timingConflict: true,
        conflictingPaidAtSeconds: FieldValue.arrayUnion(success.gatewayPaidAtMs! / 1000)} : {}),
    }, {merge: true});
  }
  if (attempt && !correlationConflict) {
    const intentIds = event.paymentIntentIds;
    const paymentIds = [...event.paymentIds];
    if (event.gatewayResourceId.startsWith("pay_")) paymentIds.push(event.gatewayResourceId);
    transaction.update(attempt.ref, {
      ...(event.checkoutId ? {paymongoCheckoutId: event.checkoutId} : {}),
      ...(intentIds.length ? {paymongoPaymentIntentIds: FieldValue.arrayUnion(...intentIds)} : {}),
      ...(paymentIds.length ? {paymongoPaymentIds: FieldValue.arrayUnion(...paymentIds)} : {}),
      // A failed payment/expired-session notification is not proof that every
      // intent in this checkout has settled. Only success resolves it here.
      ...(event.successfulPayments.length ? {resolution: "success"} : {}),
      lastEvidenceAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }
  const reason = knownIds.size > 1 ? "distinct_gateway_payment_success" :
    correlationConflict ? "checkout_attempt_correlation_conflict" : null;
  if (knownIds.size) transaction.update(paymentRef, {
    gatewaySuccessfulPaymentIds: FieldValue.arrayUnion(...knownIds),
  });
  if (reason) {
    transaction.update(paymentRef, {reconciliationRequired: true,
      reconciliationReason: reason, updatedAt: serverTimestamp()});
    writeAuditLogInTransaction(transaction, {
      actorId: "paymongo", actorRole: "system", action: "payment.attempt_evidence_conflict",
      targetCollection: "payments", targetId: paymentRef.id,
      metadata: {reason, gatewayPaymentIds: [...knownIds]},
    });
  }
  return reason;
}
