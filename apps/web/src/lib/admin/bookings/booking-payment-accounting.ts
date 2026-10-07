import type {AdminBookingPayment} from "./admin-booking-types";

/** Only cumulative completed refunds reduce retained funds; reservations never do. */
export function bookingPaymentAccounting(payment: Pick<AdminBookingPayment, "status" | "amountInCentavos" | "refundedAmountInCentavos">) {
  if (!["paid", "partially_refunded", "refunded"].includes(payment.status)) return {paid: 0, refunded: 0};
  const original = payment.amountInCentavos;
  if (!Number.isSafeInteger(original) || original < 0) return null;
  const canonical = payment.refundedAmountInCentavos;
  const refunded = canonical == null
    ? payment.status === "refunded" ? original : payment.status === "paid" ? 0 : null
    : Number.isSafeInteger(canonical) && canonical >= 0 && canonical <= original ? canonical : null;
  if (refunded === null) return null;
  return {paid: original - refunded, refunded};
}

export function bookingPaymentTotals(payments: readonly AdminBookingPayment[]) {
  let paid = 0;
  let refunded = 0;
  for (const payment of payments) {
    const amounts = bookingPaymentAccounting(payment);
    if (!amounts) return {paid: null, refunded: null};
    paid += amounts.paid;
    refunded += amounts.refunded;
    if (!Number.isSafeInteger(paid) || !Number.isSafeInteger(refunded)) return {paid: null, refunded: null};
  }
  return {paid: paid / 100, refunded: refunded / 100};
}

/** Above this, partial-refund rows are not read into the platform total. */
export const PARTIAL_REFUND_STATISTICS_LIMIT = 100;

/** Pesos from a single-field sum of payment.amount. */
export type BookingFinancialAggregate = {
  grossPesos: number;
};

/**
 * Platform paid/refunded totals.
 * Paid is fully paid amount plus retained principal on partial refunds.
 * Refunded is fully refunded amount plus completed partial refunds.
 * Fully refunded payments contribute nothing to Paid.
 * A partial group is included only when every row has a trusted completed
 * amount and the group does not exceed PARTIAL_REFUND_STATISTICS_LIMIT.
 */
export function bookingFinancialStatistics(input: {
  paid: BookingFinancialAggregate;
  refunded: BookingFinancialAggregate;
  partialCount: number;
  partials: readonly Pick<AdminBookingPayment, "status" | "amountInCentavos" | "refundedAmountInCentavos">[];
}): {paid: number | null; refunded: number | null} {
  if (
    !Number.isSafeInteger(input.partialCount) ||
    input.partialCount < 0 ||
    input.partialCount > PARTIAL_REFUND_STATISTICS_LIMIT ||
    input.partials.length !== input.partialCount
  ) {
    return {paid: null, refunded: null};
  }

  const paidGross = pesosToCentavos(input.paid.grossPesos);
  const refundedGross = pesosToCentavos(input.refunded.grossPesos);
  if (paidGross === null || refundedGross === null) {
    return {paid: null, refunded: null};
  }

  let partialPaid = 0;
  let partialRefunded = 0;
  for (const payment of input.partials) {
    const amounts = bookingPaymentAccounting({
      status: "partially_refunded",
      amountInCentavos: payment.amountInCentavos,
      refundedAmountInCentavos: payment.refundedAmountInCentavos,
    });
    if (!amounts) return {paid: null, refunded: null};
    partialPaid += amounts.paid;
    partialRefunded += amounts.refunded;
  }

  const paid = paidGross + partialPaid;
  const refunded = refundedGross + partialRefunded;
  if (
    paid < 0 ||
    refunded < 0 ||
    !Number.isSafeInteger(paid) ||
    !Number.isSafeInteger(refunded)
  ) {
    return {paid: null, refunded: null};
  }

  return {paid: paid / 100, refunded: refunded / 100};
}

function pesosToCentavos(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const centavos = Math.round(value * 100);
  if (!Number.isSafeInteger(centavos)) return null;
  return centavos;
}
