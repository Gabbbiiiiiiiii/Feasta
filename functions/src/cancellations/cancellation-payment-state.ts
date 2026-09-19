import {Timestamp} from "firebase-admin/firestore";

import {cancellationError, REFUND_CANCELLATION_ERROR_REASONS} from
  "./refund-cancellation-domain.js";

/** Called with transactionally read, canonically linked records only. */
export function cancellationPaymentState(
  request: Readonly<Record<string, unknown>>,
  payment: Readonly<Record<string, unknown>> | null,
): "ready" | "awaiting_payment_resolution" | "refund_ineligible" {
  if (payment && (
    payment.status === "refunded" ||
    payment.status === "partially_refunded" ||
    payment.refundStatus === "requested" ||
    payment.refundStatus === "processing" ||
    payment.refundStatus === "completed" ||
    Number(payment.refundReservedAmountInCentavos ?? 0) > 0 ||
    Number(payment.refundedAmountInCentavos ?? 0) > 0 ||
    payment.refundExecutionLock != null
  )) return "refund_ineligible";

  const settled = payment?.status === "paid";
  const paidService = request.paymentStatus === "paid" ||
    ((request.status === "confirmed" || request.status === "in_progress") &&
      typeof request.downPaymentAmount === "number" &&
      request.downPaymentAmount > 0);
  if ((paidService && !settled) ||
    (settled && !(payment.paidAt instanceof Timestamp)) ||
    (request.status === "payment_processing" && payment?.status !== "processing")) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.paymentResolutionRequired,
      "The recorded down payment must be reconciled before cancellation.",
    );
  }
  return request.status === "payment_processing" ||
    payment?.status === "processing" || payment?.status === "pending"
    ? "awaiting_payment_resolution" : "ready";
}
