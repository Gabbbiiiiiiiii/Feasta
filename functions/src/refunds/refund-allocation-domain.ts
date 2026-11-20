import {
  PAYMENT_CURRENCY,
} from "../shared/constants.js";
import {
  type ProviderRequestSettlement,
  type ProviderSettlementPayment,
} from "../payments/payment-settlement.js";
import {
  REFUND_ACCOUNTING_ERROR_REASONS,
  readRefundAccounting,
  refundAccountingError,
  type CalculatedRefund,
} from "./refund-accounting-domain.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type RefundPaymentAllocation = {
  paymentId:
    string;

  originalPaidAmountInCentavos:
    number;

  completedRefundAmountInCentavos:
    number;

  reservedRefundAmountInCentavos:
    number;

  availableRefundCapacityInCentavos:
    number;

  allocatedRefundAmountInCentavos:
    number;
};

export type RefundAllocationPlan = {
  requestedAmountInCentavos:
    number;

  totalAllocatedAmountInCentavos:
    number;

  allocations:
    readonly RefundPaymentAllocation[];
};

/**
 * Splits the booking-level eligible refund across the individual
 * PayMongo payment resources that historically settled.
 *
 * Allocation order follows settlement.settledPaymentIds, which is
 * deterministic and keeps immutable payment-history ordering.
 *
 * This function does not mutate payment accounting and does not
 * contact PayMongo.
 */
export function allocateCancellationRefundAcrossPayments(
  input: {
    calculation:
      Readonly<CalculatedRefund>;

    settlement:
      Readonly<ProviderRequestSettlement>;

    payments:
      readonly ProviderSettlementPayment[];
  },
): RefundAllocationPlan {
  const requestedAmount =
    requireNonNegativeCentavos(
      input.calculation
        .eligibleRefundAmountInCentavos,
    );

  if (
    input.settlement
      .unresolvedPaymentIds.length > 0
  ) {
    throw refundNotReady(
      "Payment reconciliation must finish before refund allocation.",
    );
  }

  if (
    input.calculation
      .originalPaidAmountInCentavos !==
      input.settlement
        .grossSettledAmountInCentavos
  ) {
    throw accountingInvalid();
  }

  const paymentById =
    new Map<
      string,
      UnknownRecord
    >();

  for (const payment of input.payments) {
    if (paymentById.has(payment.id)) {
      throw accountingInvalid();
    }

    paymentById.set(
      payment.id,
      payment.data,
    );
  }

  let aggregateOriginal =
    0;

  let aggregateCompleted =
    0;

  let aggregateReserved =
    0;

  const availableAllocations:
    RefundPaymentAllocation[] =
      [];

  for (
    const paymentId of
    input.settlement.settledPaymentIds
  ) {
    const payment =
      paymentById.get(paymentId);

    if (!payment) {
      throw accountingInvalid();
    }

    if (
      payment.currency !==
      PAYMENT_CURRENCY
    ) {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS
          .currencyUnsupported,
        "The payment currency is not supported for refunds.",
      );
    }

    const original =
      requirePositiveCentavos(
        payment.amountInCentavos,
      );

    const accounting =
      readRefundAccounting(
        payment,
        original,
      );

    const available =
      original -
      accounting
        .refundedAmountInCentavos -
      accounting
        .refundReservedAmountInCentavos;

    if (
      available < 0 ||
      !Number.isSafeInteger(
        available,
      )
    ) {
      throw accountingInvalid();
    }

    aggregateOriginal =
      checkedAdd(
        aggregateOriginal,
        original,
      );

    aggregateCompleted =
      checkedAdd(
        aggregateCompleted,
        accounting
          .refundedAmountInCentavos,
      );

    aggregateReserved =
      checkedAdd(
        aggregateReserved,
        accounting
          .refundReservedAmountInCentavos,
      );

    availableAllocations.push({
      paymentId,

      originalPaidAmountInCentavos:
        original,

      completedRefundAmountInCentavos:
        accounting
          .refundedAmountInCentavos,

      reservedRefundAmountInCentavos:
        accounting
          .refundReservedAmountInCentavos,

      availableRefundCapacityInCentavos:
        available,

      allocatedRefundAmountInCentavos:
        0,
    });
  }

  if (
    aggregateOriginal !==
      input.calculation
        .originalPaidAmountInCentavos ||
    aggregateCompleted !==
      input.calculation
        .completedRefundAmountInCentavos ||
    aggregateReserved !==
      input.calculation
        .reservedRefundAmountInCentavos
  ) {
    throw accountingInvalid();
  }

  let remaining =
    requestedAmount;

  const allocations =
    availableAllocations.map(
      (allocation) => {
        const amount =
          Math.min(
            remaining,
            allocation
              .availableRefundCapacityInCentavos,
          );

        remaining -=
          amount;

        return {
          ...allocation,

          allocatedRefundAmountInCentavos:
            amount,
        };
      },
    );

  if (remaining !== 0) {
    throw accountingInvalid();
  }

  const nonZeroAllocations =
    allocations.filter(
      (allocation) =>
        allocation
          .allocatedRefundAmountInCentavos >
        0,
    );

  const totalAllocatedAmountInCentavos =
    nonZeroAllocations.reduce(
      (total, allocation) =>
        checkedAdd(
          total,
          allocation
            .allocatedRefundAmountInCentavos,
        ),
      0,
    );

  if (
    totalAllocatedAmountInCentavos !==
      requestedAmount
  ) {
    throw accountingInvalid();
  }

  return {
    requestedAmountInCentavos:
      requestedAmount,

    totalAllocatedAmountInCentavos,

    allocations:
      nonZeroAllocations,
  };
}

function checkedAdd(
  left:
    number,

  right:
    number,
): number {
  const result =
    left + right;

  if (!Number.isSafeInteger(result)) {
    throw accountingInvalid();
  }

  return result;
}

function requirePositiveCentavos(
  value:
    unknown,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0
  ) {
    throw accountingInvalid();
  }

  return value as number;
}

function requireNonNegativeCentavos(
  value:
    unknown,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0
  ) {
    throw accountingInvalid();
  }

  return value as number;
}

function accountingInvalid():
  ReturnType<typeof refundAccountingError> {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS
      .accountingInvalid,
    "Refund allocation accounting is invalid.",
  );
}

function refundNotReady(
  message:
    string,
): ReturnType<typeof refundAccountingError> {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS
      .paymentNotSettled,
    message,
  );
}
