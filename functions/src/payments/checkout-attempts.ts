import {randomUUID, createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {canRetryCheckout, checkoutAttemptKey,
  isAuthoritativelyTerminalUnsuccessful} from "./checkout-attempt-domain.js";
import {validStoredCheckoutReason} from "./payment-lifecycle.js";
import {createPayMongoCheckout} from "./paymongo-client.js";

type CheckoutInput = Parameters<typeof createPayMongoCheckout>[0];

/** Called only after the existing ownership, amount and ALL-provider gates.
 * The normal checkout persistence transaction still revalidates those gates.
 * Recording gateway identity here must survive failure of that later transaction.
 */
export async function createDurableCheckout(
  input: CheckoutInput,
  createCheckout: typeof createPayMongoCheckout,
): Promise<{id: string; checkoutUrl: string}> {
  const paymentRef = db.collection("payments").doc(input.paymentId);
  const attemptsRef = paymentRef.collection("checkoutAttempts");
  const candidateId = randomUUID();
  const {secretKey, idempotencyKey: unusedKey, ...parameters} = input;
  void unusedKey;
  const fingerprint = createHash("sha256").update(JSON.stringify(parameters)).digest("hex");
  const selected = await db.runTransaction(async (transaction) => {
    const [paymentSnapshot, attemptsSnapshot] = await Promise.all([
      transaction.get(paymentRef), transaction.get(attemptsRef),
    ]);
    const payment = paymentSnapshot.data();
    if (!payment || payment.attemptSchemaVersion !== 1 || payment.reconciliationRequired ||
      !["pending", "processing", "failed", "expired"].includes(payment.status) ||
      payment.attemptCount !== attemptsSnapshot.size) throw reconciliationRequired();
    const attempts = attemptsSnapshot.docs;
    if (attempts.some((doc) => doc.data().attemptId !== doc.id ||
      doc.data().paymentId !== input.paymentId ||
      doc.data().idempotencyKey !== checkoutAttemptKey(input.paymentId, doc.id))) {
      throw reconciliationRequired();
    }
    const current = attempts.find((doc) => doc.id === payment.currentCheckoutAttemptId);
    const older = attempts.filter((doc) => doc.id !== current?.id);
    if (older.some((doc) => !isAuthoritativelyTerminalUnsuccessful(doc.data()))) {
      throw reconciliationRequired();
    }
    if (current) {
      const attempt = current.data();
      if (attempt.fingerprint !== fingerprint || attempt.paymentId !== input.paymentId) {
        throw reconciliationRequired();
      }
      if (attempt.resolution === "success") throw reconciliationRequired();
      if (!isAuthoritativelyTerminalUnsuccessful(attempt)) {
        if (!["unresolved", "outstanding"].includes(attempt.resolution)) {
          throw reconciliationRequired();
        }
        if (attempt.paymongoCheckoutId && attempt.checkoutUrl) {
          if (validStoredCheckoutReason(attempt)) throw reconciliationRequired();
          return {attemptId: current.id, idempotencyKey: attempt.idempotencyKey as string,
            checkout: {id: attempt.paymongoCheckoutId as string,
              checkoutUrl: attempt.checkoutUrl as string},
            firstDispatchAt: attempt.firstDispatchAt};
        }
        if (!(attempt.firstDispatchAt instanceof Timestamp) ||
          !canRetryCheckout(attempt.firstDispatchAt.toMillis(), Date.now())) {
          throw reconciliationRequired();
        }
        writeAuditLogInTransaction(transaction, {
          actorId: input.customerId, actorRole: "customer",
          action: "payment.checkout_attempt_retry",
          targetCollection: "payments", targetId: input.paymentId,
          metadata: {attemptId: current.id},
        });
        return {attemptId: current.id, idempotencyKey: attempt.idempotencyKey as string,
          checkout: null, firstDispatchAt: attempt.firstDispatchAt};
      }
    } else if (attempts.length > 0 || payment.currentCheckoutAttemptId) {
      throw reconciliationRequired();
    }
    const firstDispatchAt = Timestamp.now();
    const key = checkoutAttemptKey(input.paymentId, candidateId);
    transaction.create(attemptsRef.doc(candidateId), {
      attemptId: candidateId, paymentId: input.paymentId, fingerprint,
      idempotencyKey: key, firstDispatchAt, createdAt: serverTimestamp(),
      resolution: "unresolved", paymongoCheckoutId: null, checkoutUrl: null,
      paymongoPaymentIntentIds: [], paymongoPaymentIds: [], updatedAt: serverTimestamp(),
    });
    transaction.update(paymentRef, {currentCheckoutAttemptId: candidateId,
      attemptCount: attempts.length + 1, updatedAt: serverTimestamp()});
    writeAuditLogInTransaction(transaction, {
      actorId: input.customerId, actorRole: "customer", action: "payment.checkout_attempt_created",
      targetCollection: "payments", targetId: input.paymentId, metadata: {attemptId: candidateId},
    });
    return {attemptId: candidateId, idempotencyKey: key, checkout: null, firstDispatchAt};
  });
  if (selected.checkout) return selected.checkout;
  // Recheck immediately before dispatch; an invocation may have paused after commit.
  if (!canRetryCheckout(selected.firstDispatchAt.toMillis(), Date.now())) {
    throw reconciliationRequired();
  }
  const attemptRef = attemptsRef.doc(selected.attemptId);
  try {
    const checkout = await createCheckout({...input, secretKey,
      idempotencyKey: selected.idempotencyKey, checkoutAttemptId: selected.attemptId});
    if (validStoredCheckoutReason({paymongoCheckoutId: checkout.id,
      checkoutUrl: checkout.checkoutUrl})) throw reconciliationRequired();
    const canUse = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(attemptRef);
      const attempt = snapshot.data();
      if (!attempt) throw reconciliationRequired();
      if (attempt.paymongoCheckoutId && attempt.paymongoCheckoutId !== checkout.id) {
        transaction.update(attemptRef, {
          conflictingCheckoutIds: FieldValue.arrayUnion(checkout.id),
          updatedAt: serverTimestamp(),
        });
        transaction.update(paymentRef, {reconciliationRequired: true,
          reconciliationReason: "checkout_identity_conflict"});
        return false;
      }
      transaction.update(attemptRef, {paymongoCheckoutId: checkout.id,
        checkoutUrl: checkout.checkoutUrl,
        ...(checkout.paymentIds?.length ? {
          paymongoPaymentIds: FieldValue.arrayUnion(...checkout.paymentIds),
        } : {}),
        ...(checkout.paymentIntentIds?.length ? {
          paymongoPaymentIntentIds: FieldValue.arrayUnion(...checkout.paymentIntentIds),
        } : {}),
        resolution: attempt.resolution === "unresolved" ? "outstanding" : attempt.resolution,
        updatedAt: serverTimestamp()});
      return !["success", "failed", "expired"].includes(attempt.resolution);
    });
    if (!canUse) throw reconciliationRequired();
    return checkout;
  } catch (error) {
    // Never downgrade a concurrent successful response or financial success.
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(attemptRef);
      if (!snapshot.exists) return;
      transaction.update(attemptRef, {lastCreationOutcome: "unknown",
        updatedAt: serverTimestamp()});
      writeAuditLogInTransaction(transaction, {
        actorId: "paymongo", actorRole: "system", action: "payment.checkout_attempt_ambiguous",
        targetCollection: "payments", targetId: input.paymentId,
        metadata: {attemptId: selected.attemptId},
      });
    });
    throw error;
  }
}

function reconciliationRequired(): HttpsError {
  return new HttpsError("failed-precondition", "Payment attempt requires reconciliation.",
    {reason: "CHECKOUT_RECONCILIATION_REQUIRED"});
}
