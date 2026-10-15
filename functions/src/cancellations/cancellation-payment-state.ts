import {Timestamp} from "firebase-admin/firestore";

import {
  type ProviderRequestSettlement,
  type ProviderSettlementPayment,
} from "../payments/payment-settlement.js";
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
/**
 * Multi-payment cancellation state.
 *
 * The settlement object must already have been resolved from the
 * transactionally read, canonically linked payment set.
 */
export function cancellationPaymentSetState(
  request:
    Readonly<Record<string, unknown>>,

  settlement:
    Readonly<ProviderRequestSettlement>,

  payments:
    readonly ProviderSettlementPayment[],
): "ready" | "awaiting_payment_resolution" | "refund_ineligible" {
  const paymentById =
    new Map<
      string,
      Readonly<Record<string, unknown>>
    >();

  for (const payment of payments) {
    if (paymentById.has(payment.id)) {
      throw paymentResolutionRequired();
    }

    paymentById.set(
      payment.id,
      payment.data,
    );

    if (hasRefundActivity(payment.data)) {
      return "refund_ineligible";
    }
  }

  for (
    const paymentId of
    settlement.settledPaymentIds
  ) {
    const payment =
      paymentById.get(paymentId);

    if (
      !payment ||
      !(payment.paidAt instanceof Timestamp)
    ) {
      throw paymentResolutionRequired();
    }
  }

  const paidService =
    request.paymentStatus === "paid" ||
    (
      (
        request.status === "confirmed" ||
        request.status === "in_progress"
      ) &&
      typeof request.downPaymentAmount ===
        "number" &&
      request.downPaymentAmount > 0
    );

  if (
    paidService &&
    settlement
      .grossSettledAmountInCentavos <= 0
  ) {
    throw paymentResolutionRequired();
  }

  /*
   * payment_processing is the initial checkout lifecycle.
   * Balance processing deliberately leaves the booking confirmed.
   */
  if (
    request.status ===
      "payment_processing" &&
    settlement.status !==
      "initial_payment_processing"
  ) {
    throw paymentResolutionRequired();
  }

  return (
    request.status ===
      "payment_processing" ||
    settlement
      .unresolvedPaymentIds.length > 0
  )
    ? "awaiting_payment_resolution"
    : "ready";
}

function hasRefundActivity(
  payment:
    Readonly<Record<string, unknown>>,
): boolean {
  return (
    payment.status === "refunded" ||
    payment.status ===
      "partially_refunded" ||
    payment.refundStatus ===
      "requested" ||
    payment.refundStatus ===
      "processing" ||
    payment.refundStatus ===
      "completed" ||
    Number(
      payment
        .refundReservedAmountInCentavos ??
      0,
    ) > 0 ||
    Number(
      payment
        .refundedAmountInCentavos ??
      0,
    ) > 0 ||
    payment.refundExecutionLock != null
  );
}

function paymentResolutionRequired():
  ReturnType<typeof cancellationError> {
  return cancellationError(
    "failed-precondition",
    REFUND_CANCELLATION_ERROR_REASONS
      .paymentResolutionRequired,
    "The recorded payment set must be reconciled before cancellation.",
  );
}
