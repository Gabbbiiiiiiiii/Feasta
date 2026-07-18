import {FieldValue} from "firebase-admin/firestore";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {db} from "../shared/firestore.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {
  parsePayMongoPaymentEvent,
  statusForPayMongoEvent,
  validateTrustedPaymentUpdate,
} from "./payment-security.js";

export async function processPayMongoWebhook(rawBody: Buffer): Promise<{
  duplicate: boolean;
  applied: boolean;
  reason?: string;
}> {
  const event = parsePayMongoPaymentEvent(rawBody);
  const nextStatus = statusForPayMongoEvent(event.eventType);
  const eventReference = db.collection("paymentWebhookEvents").doc(event.eventId);
  const paymentReference = db.collection("payments").doc(event.paymentId);

  const result = await db.runTransaction(async (transaction) => {
    const [eventSnapshot, paymentSnapshot] = await transaction.getAll(
      eventReference,
      paymentReference,
    );
    if (eventSnapshot.exists) return {duplicate: true, applied: false};
    if (!paymentSnapshot.exists || !nextStatus) {
      transaction.set(eventReference, webhookRecord(event, "ignored", nextStatus ? "payment_not_found" : "unsupported_event"));
      return {duplicate: false, applied: false, reason: nextStatus ? "payment_not_found" : "unsupported_event"};
    }

    const payment = paymentSnapshot.data() ?? {};
    const bookingId = typeof payment.bookingId === "string" ? payment.bookingId : "";
    const providerId = typeof payment.providerId === "string" ? payment.providerId : "";
    const bookingReference = db.collection("mainEvents").doc(bookingId);
    const providerReference = db.collection("providers").doc(providerId);
    const [bookingSnapshot, providerSnapshot] = await transaction.getAll(
      bookingReference,
      providerReference,
    );
    const booking = bookingSnapshot.data() ?? {};
    const provider = providerSnapshot.data() ?? {};
    if (!bookingSnapshot.exists || !providerSnapshot.exists ||
        booking.customerId !== payment.customerId || booking.providerId !== providerId ||
        typeof provider.ownerId !== "string") {
      transaction.set(eventReference, webhookRecord(event, "rejected", "ownership_mismatch"));
      return {duplicate: false, applied: false, reason: "ownership_mismatch"};
    }

    const reason = validateTrustedPaymentUpdate({
      currentStatus: payment.status,
      nextStatus,
      expectedAmountInCentavos: payment.amountInCentavos,
      actualAmountInCentavos: event.amountInCentavos,
      expectedCurrency: payment.currency,
      actualCurrency: event.currency,
    });
    if (reason) {
      transaction.set(eventReference, webhookRecord(event, reason === "already_applied" ? "duplicate" : "rejected", reason));
      return {duplicate: reason === "already_applied", applied: false, reason};
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
      paymongoStatus: nextStatus,
      paymongoResourceId: event.gatewayResourceId,
      lastWebhookEventId: event.eventId,
      updatedAt: serverTimestamp(),
    };
    if (nextStatus === "paid") {
      update.paidAt = serverTimestamp();
      update.failedAt = null;
    } else if (nextStatus === "failed") {
      update.failedAt = serverTimestamp();
    } else if (nextStatus === "expired") {
      update.expiredAt = serverTimestamp();
    } else if (nextStatus === "refunded") {
      update.refundedAt = serverTimestamp();
    }
    transaction.update(paymentReference, update);

    if (nextStatus === "paid") {
      transaction.update(bookingReference, {
        status: "confirmed",
        paymentStatus: "partially_paid",
        confirmedAt: booking.confirmedAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (nextStatus === "refunded") {
      transaction.update(bookingReference, {
        paymentStatus: "refunded",
        updatedAt: serverTimestamp(),
      });
    }

    transaction.set(eventReference, webhookRecord(event, "processed", null));
    writeAuditLogInTransaction(transaction, {
      actorId: "paymongo",
      actorRole: "system",
      action: "payment.status_changed",
      targetCollection: "payments",
      targetId: event.paymentId,
      source: "paymongo_webhook",
      before: {status: payment.status},
      after: {status: nextStatus},
      metadata: {eventId: event.eventId, eventType: event.eventType},
    });
    createNotificationInTransaction(transaction, {
      userId: payment.customerId as string,
      title: nextStatus === "paid" ? "Payment confirmed" : `Payment ${nextStatus}`,
      message: nextStatus === "paid" ? "Your payment was securely confirmed." : `Your payment is now ${nextStatus}.`,
      type: "payment",
      relatedId: event.paymentId,
      relatedCollection: "payments",
    });
    createNotificationInTransaction(transaction, {
      userId: provider.ownerId as string,
      title: nextStatus === "paid" ? "Payment received" : `Payment ${nextStatus}`,
      message: nextStatus === "paid" ? "A booking payment was confirmed." : `A booking payment is now ${nextStatus}.`,
      type: "payment",
      relatedId: event.paymentId,
      relatedCollection: "payments",
    });
    return {duplicate: false, applied: true};
  });
  logSecurityEvent({
    action: "payment_webhook",
    outcome: result.duplicate ? "replayed" :
      result.applied ? "succeeded" : "denied",
    actorUid: "paymongo",
    targetId: event.paymentId,
    correlationId: event.eventId,
    reasonCode: result.reason ?? (result.applied ? "status_applied" : undefined),
    metadata: {eventType: event.eventType},
  });
  return result;
}

function webhookRecord(
  event: ReturnType<typeof parsePayMongoPaymentEvent>,
  status: string,
  reason: string | null,
): Record<string, unknown> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    paymentId: event.paymentId,
    gatewayResourceId: event.gatewayResourceId,
    status,
    reason,
    processedAt: FieldValue.serverTimestamp(),
  };
}
