import {FieldValue} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {retrievePayMongoCheckout} from "./paymongo-client.js";
import {parsePayMongoPaymentEvent} from "./payment-security.js";
import {recordAttemptEvidence} from "./payment-attempt-evidence.js";
import {resolveLogicalPayment, isAuthoritativelyTerminalUnsuccessful,
  type AttemptResolution} from "./checkout-attempt-domain.js";

/** Internal service only. Retrieval records financial facts, never confirms a
 * booking or releases capacity. A missing session ID remains unresolved.
 * Expired sessions are observations, not proof that every intent has settled.
 */
export async function reconcileCheckoutAttempts(input: {
  paymentId: string;
  secretKey: string;
  retrieve?: typeof retrievePayMongoCheckout;
}) {
  const paymentRef = db.collection("payments").doc(input.paymentId);
  const initial = await paymentRef.collection("checkoutAttempts").get();
  for (const document of initial.docs) {
    const attempt = document.data();
    if (typeof attempt.paymongoCheckoutId !== "string") continue;
    try {
      const response = await (input.retrieve ?? retrievePayMongoCheckout)(
        input.secretKey, attempt.paymongoCheckoutId);
      const root = record(response);
      const resource = record(root.data);
      const attributes = record(resource.attributes);
      const metadata = record(attributes.metadata);
      if (resource.id !== attempt.paymongoCheckoutId || resource.type !== "checkout_session" ||
        metadata.payment_id !== input.paymentId ||
        metadata.feasta_checkout_attempt_id !== document.id ||
        !Array.isArray(attributes.payments)) throw new Error("Gateway relationship mismatch.");
      const payments = attributes.payments.map(record);
      const intent = attributes.payment_intent ? record(attributes.payment_intent) : null;
      const paymentIds: string[] = [];
      const intentIds: string[] = [];
      if (intent) intentIds.push(gatewayId(intent.id, "pi_"));
      for (const item of payments) {
        if (item.type !== "payment") throw new Error("Gateway payment type invalid.");
        paymentIds.push(gatewayId(item.id, "pay_"));
        const attrs = record(item.attributes);
        if (attrs.payment_intent_id) intentIds.push(gatewayId(attrs.payment_intent_id, "pi_"));
      }
      const successful = payments.some((item) => record(item.attributes).status === "paid");
      const event = successful ? parsePayMongoPaymentEvent(Buffer.from(JSON.stringify({data: {
        id: "retrieval", attributes: {type: "checkout_session.payment.paid", data: resource},
      }}))) : null;
      await db.runTransaction(async (transaction) => {
        const [paymentSnapshot, attempts, successes] = await Promise.all([
          transaction.get(paymentRef), transaction.get(paymentRef.collection("checkoutAttempts")),
          transaction.get(paymentRef.collection("gatewayPayments")),
        ]);
        const payment = paymentSnapshot.data();
        const current = attempts.docs.find((item) => item.id === document.id)?.data();
        if (!payment || !current || current.paymongoCheckoutId !== resource.id) {
          throw new Error("Attempt changed during retrieval.");
        }
        if (metadata.provider_request_id !== payment.providerRequestId ||
          metadata.customer_id !== payment.customerId ||
          metadata.booking_id !== (payment.mainEventId ?? payment.bookingId) ||
          (event && (event.amountInCentavos !== payment.amountInCentavos ||
            event.currency !== payment.currency || event.currency !== "PHP"))) {
          throw new Error("Gateway payment validation failed.");
        }
        if (event) {
          const conflict = recordAttemptEvidence({transaction, paymentRef, payment,
            attempts, successes, event, source: "retrieval"});
          if (!conflict && !["paid", "partially_refunded", "refunded"].includes(payment.status)) {
            transaction.update(paymentRef, {reconciliationRequired: true,
              reconciliationReason: "gateway_success_pending_application"});
          }
        }
        transaction.update(document.ref, {
          ...(paymentIds.length ? {paymongoPaymentIds: FieldValue.arrayUnion(...paymentIds)} : {}),
          ...(intentIds.length ? {
            paymongoPaymentIntentIds: FieldValue.arrayUnion(...intentIds),
          } : {}),
          lastReconciledAt: serverTimestamp(), lastReconciliationOutcome: "retrieved",
          observedCheckoutStatus: typeof attributes.status === "string" ? attributes.status : null,
          // Success cannot be downgraded by a stale GET or a failed later payment.
          ...(!event && current.resolution !== "success" ? {
            resolution: attributes.status === "active" ? "outstanding" : "unresolved",
          } : {}),
        });
        writeAuditLogInTransaction(transaction, {
          actorId: "paymongo", actorRole: "system", action: "payment.checkout_attempt_reconciled",
          targetCollection: "payments", targetId: input.paymentId,
          metadata: {attemptId: document.id, successful},
        });
      });
    } catch {
      // Network, missing/invalid gateway evidence and stale reads never prove unpaid.
      await db.runTransaction(async (transaction) => {
        const latest = (await transaction.get(document.ref)).data();
        if (!latest) return;
        transaction.update(document.ref, {lastReconciledAt: serverTimestamp(),
          lastReconciliationOutcome: "unresolved",
          ...(latest.resolution !== "success" ? {resolution: "unresolved"} : {}),
        });
      });
    }
  }
  return readCheckoutAttemptResolution(input.paymentId);
}

/** Transactional snapshot of ALL known attempts; latest-only is never sufficient. */
export async function readCheckoutAttemptResolution(paymentId: string) {
  const reference = db.collection("payments").doc(paymentId);
  return db.runTransaction(async (transaction) => {
    const [snapshot, attempts, successes] = await Promise.all([
      transaction.get(reference), transaction.get(reference.collection("checkoutAttempts")),
      transaction.get(reference.collection("gatewayPayments")),
    ]);
    const payment = snapshot.data() ?? {};
    const historyComplete = payment.attemptSchemaVersion === 1 &&
      payment.attemptCount === attempts.size &&
      attempts.docs.every((item) => item.data().paymentId === paymentId) &&
      attempts.docs.some((item) => item.id === payment.currentCheckoutAttemptId);
    const knownSuccess = successes.size > 0 ||
      ["paid", "partially_refunded", "refunded"].includes(payment.status);
    const states = attempts.docs.map((item): AttemptResolution => {
      const attempt = item.data();
      if (attempt.resolution === "success") return "success";
      if (isAuthoritativelyTerminalUnsuccessful(attempt)) return attempt.resolution;
      return attempt.resolution === "outstanding" ? "outstanding" : "unresolved";
    });
    const resolution = knownSuccess ? "success" as const :
      resolveLogicalPayment(states, historyComplete && !payment.reconciliationRequired);
    return {resolution, historyComplete, reconciliationRequired: !!payment.reconciliationRequired,
      attempts: attempts.docs.map((item) => ({attemptId: item.id, ...item.data()})),
      // Legacy paidAt is never promoted to gateway evidence.
      successfulPayments: successes.docs.map((item) => ({
        gatewayPaymentId: item.id, ...item.data(),
      }))};
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid gateway resource.");
  }
  return value as Record<string, unknown>;
}

function gatewayId(value: unknown, prefix: string): string {
  if (typeof value !== "string" || !value.startsWith(prefix) ||
    !/^[A-Za-z0-9_]+$/u.test(value)) throw new Error("Invalid gateway id.");
  return value;
}
