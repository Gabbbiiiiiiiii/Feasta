import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {PAYMENT_CURRENCY, USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {createIdempotencyKey} from "../shared/idempotency.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireRole} from "../shared/authorization.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";
import {createPayMongoCheckout} from "./paymongo-client.js";

const payMongoSecretKey = defineSecret("PAYMONGO_SECRET_KEY");

export const createPaymentSession = onCall(
  {...appCheckCallableOptions, secrets: [payMongoSecretKey], timeoutSeconds: 30},
  async (request) => {
    const user = requireAuth(request);
    await requireRole(user.uid, [USER_ROLES.customer]);
    await enforceCallableRateLimit(request, {scope: "createPaymentSession", limit: 5, windowSeconds: 10 * 60});
    const input = requireObject(request.data);
    const bookingId = requireString(input.bookingId, "bookingId", {minLength: 1, maxLength: 128});
    const clientKey = requireString(input.idempotencyKey, "idempotencyKey", {minLength: 8, maxLength: 200});
    const key = createIdempotencyKey({operation: "createPaymentSession", actorId: user.uid, clientKey, payload: {bookingId}});
    const paymentId = `payment_${key.slice(0, 32)}`;
    const paymentReference = db.collection("payments").doc(paymentId);
    const bookingReference = db.collection("mainEvents").doc(bookingId);
    const successUrl = trustedRedirectUrl("PAYMENT_SUCCESS_URL");
    const cancelUrl = trustedRedirectUrl("PAYMENT_CANCEL_URL");

    const foundation = await db.runTransaction(async (transaction) => {
      const [paymentSnapshot, bookingSnapshot] = await transaction.getAll(paymentReference, bookingReference);
      const existing = paymentSnapshot.exists ? paymentSnapshot.data() ?? {} : null;
      if (paymentSnapshot.exists) {
        if (existing?.customerId !== user.uid || existing.bookingId !== bookingId) {
          throw new HttpsError("permission-denied", "Payment ownership is invalid.");
        }
        if (typeof existing.checkoutUrl === "string" && existing.checkoutUrl.length > 0) {
          return {created: false, payment: existing};
        }
      }
      const booking = bookingSnapshot.data() ?? {};
      if (!bookingSnapshot.exists || booking.customerId !== user.uid) {
        throw new HttpsError("permission-denied", "Booking ownership is invalid.");
      }
      if (booking.status !== "waiting_for_down_payment") {
        throw new HttpsError("failed-precondition", "This booking is not awaiting payment.");
      }
      if (typeof booking.providerId !== "string" || booking.providerId.length === 0) {
        throw new HttpsError("failed-precondition", "Booking provider linkage is invalid.");
      }
      const providerSnapshot = await transaction.get(
        db.collection("providers").doc(booking.providerId),
      );
      const provider = providerSnapshot.data();
      if (!providerSnapshot.exists ||
          provider?.verificationStatus !== "approved" ||
          provider.isActive !== true ||
          provider.isSuspended === true ||
          typeof provider.ownerId !== "string") {
        throw new HttpsError("failed-precondition", "Booking provider is not approved.");
      }
      const amount = booking.downPaymentAmount;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        throw new HttpsError("failed-precondition", "Booking payment amount is invalid.");
      }
      const amountInCentavos = Math.round(amount * 100);
      if (existing) {
        if (existing.providerId !== booking.providerId ||
            existing.amountInCentavos !== amountInCentavos ||
            existing.currency !== PAYMENT_CURRENCY ||
            !["pending", "failed", "expired"].includes(existing.status)) {
          throw new HttpsError(
            "failed-precondition",
            "Existing payment details are invalid.",
          );
        }
        return {created: false, payment: existing};
      }
      const payment = {
        paymentId,
        bookingId,
        mainEventId: bookingId,
        customerId: user.uid,
        providerId: booking.providerId,
        amount,
        amountInCentavos,
        currency: PAYMENT_CURRENCY,
        paymentType: "provider_down_payment",
        gateway: "paymongo",
        status: "pending",
        paidAt: null,
        refundedAt: null,
        checkoutUrl: null,
        paymongoCheckoutId: null,
        paymongoResourceId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      transaction.set(paymentReference, payment);
      writeAuditLogInTransaction(transaction, {
        actorId: user.uid, actorRole: "customer", action: "payment.created",
        targetCollection: "payments", targetId: paymentId,
        after: {status: "pending", amountInCentavos, currency: PAYMENT_CURRENCY},
      });
      return {created: true, payment};
    });

    if (!foundation.created && typeof foundation.payment.checkoutUrl === "string") {
      return {paymentId, checkoutUrl: foundation.payment.checkoutUrl, created: false};
    }

    try {
      const checkout = await createPayMongoCheckout({
        secretKey: payMongoSecretKey.value(), idempotencyKey: paymentId,
        paymentId, bookingId, customerId: user.uid,
        amountInCentavos: foundation.payment.amountInCentavos as number,
        currency: PAYMENT_CURRENCY,
        description: `FEASTA booking ${bookingId}`,
        successUrl, cancelUrl,
      });
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(paymentReference);
        const current = snapshot.data() ?? {};
        if (current.customerId !== user.uid) throw new HttpsError("permission-denied", "Payment ownership is invalid.");
        if (current.status === "paid") return;
        if (!["pending", "failed", "expired", "processing"].includes(current.status)) {
          throw new HttpsError("failed-precondition", "Payment status is invalid.");
        }
        transaction.update(paymentReference, {
          status: "processing",
          checkoutUrl: checkout.checkoutUrl,
          paymongoCheckoutId: checkout.id,
          updatedAt: serverTimestamp(),
        });
        if (current.status !== "processing") {
          writeAuditLogInTransaction(transaction, {
            actorId: user.uid, actorRole: "customer",
            action: "payment.status_changed",
            targetCollection: "payments", targetId: paymentId,
            before: {status: current.status}, after: {status: "processing"},
          });
        }
      });
      return {paymentId, checkoutUrl: checkout.checkoutUrl, created: foundation.created};
    } catch {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(paymentReference);
        const current = snapshot.data();
        if (!current || current.customerId !== user.uid ||
            !["pending", "processing"].includes(current.status)) return;
        transaction.update(paymentReference, {
          status: "failed",
          failedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        writeAuditLogInTransaction(transaction, {
          actorId: "paymongo", actorRole: "system",
          action: "payment.status_changed",
          targetCollection: "payments", targetId: paymentId,
          before: {status: current.status}, after: {status: "failed"},
          reason: "checkout_creation_failed",
        });
      }).catch(() => undefined);
      throw new HttpsError("unavailable", "Payment checkout could not be created. Please try again.");
    }
  },
);

function trustedRedirectUrl(name: "PAYMENT_SUCCESS_URL" | "PAYMENT_CANCEL_URL"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpsError("failed-precondition", `${name} is not configured.`);
  const url = new URL(value);
  if (url.protocol !== "https:" && process.env.FUNCTIONS_EMULATOR !== "true") {
    throw new HttpsError("failed-precondition", `${name} must use HTTPS.`);
  }
  return url.toString();
}
