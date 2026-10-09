import {
  REFUND_ACCOUNTING_ERROR_REASONS,
  refundAccountingError,
  refundOperationId,
} from "./refund-accounting-domain.js";
import {
  type RefundAllocationPlan,
} from "./refund-allocation-domain.js";

export type RefundOperationReservation = {
  paymentId:
    string;

  refundOperationId:
    string;

  amountInCentavos:
    number;

  operationKey:
    string;
};

export type RefundOperationReservationPlan = {
  operationKey:
    string;

  requestedAmountInCentavos:
    number;

  compatibilityRefundOperationId:
    string | null;

  refundOperationIds:
    readonly string[];

  reservations:
    readonly RefundOperationReservation[];
};

/**
 * Converts a booking-level refund allocation into deterministic
 * per-payment refund operation identities.
 *
 * No Firestore writes occur here.
 * No gateway request occurs here.
 *
 * refundOperationId remains a compatibility pointer only.
 * refundOperationIds is the complete operation set.
 */
export function createRefundOperationReservationPlan(
  input: {
    cancellationRequestId:
      string;

    operationKey:
      string;

    allocation:
      Readonly<RefundAllocationPlan>;
  },
): RefundOperationReservationPlan {
  const cancellationRequestId =
    requireIdentifier(
      input.cancellationRequestId,
    );

  const operationKey =
    requireOperationKey(
      input.operationKey,
    );

  if (
    !Number.isSafeInteger(
      input.allocation
        .requestedAmountInCentavos,
    ) ||
    input.allocation
      .requestedAmountInCentavos < 0 ||
    !Number.isSafeInteger(
      input.allocation
        .totalAllocatedAmountInCentavos,
    ) ||
    input.allocation
      .totalAllocatedAmountInCentavos < 0 ||
    input.allocation
      .requestedAmountInCentavos !==
      input.allocation
        .totalAllocatedAmountInCentavos
  ) {
    throw operationConflict();
  }

  const seenPayments =
    new Set<string>();

  const seenOperations =
    new Set<string>();

  let total =
    0;

  const reservations =
    input.allocation.allocations.map(
      (allocation) => {
        const paymentId =
          requireIdentifier(
            allocation.paymentId,
          );

        const amount =
          allocation
            .allocatedRefundAmountInCentavos;

        if (
          seenPayments.has(paymentId) ||
          !Number.isSafeInteger(amount) ||
          amount <= 0
        ) {
          throw operationConflict();
        }

        seenPayments.add(
          paymentId,
        );

        const operationId =
          refundOperationId({
            paymentId,

            cancellationRequestId,

            operationKey,
          });

        if (
          seenOperations.has(
            operationId,
          )
        ) {
          throw operationConflict();
        }

        seenOperations.add(
          operationId,
        );

        total =
          checkedAdd(
            total,
            amount,
          );

        return {
          paymentId,

          refundOperationId:
            operationId,

          amountInCentavos:
            amount,

          operationKey,
        };
      },
    );

  if (
    total !==
      input.allocation
        .requestedAmountInCentavos
  ) {
    throw operationConflict();
  }

  const refundOperationIds =
    reservations.map(
      (reservation) =>
        reservation.refundOperationId,
    );

  return {
    operationKey,

    requestedAmountInCentavos:
      input.allocation
        .requestedAmountInCentavos,

    compatibilityRefundOperationId:
      refundOperationIds[0] ??
      null,

    refundOperationIds,

    reservations,
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
    throw operationConflict();
  }

  return result;
}

function requireIdentifier(
  value:
    unknown,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 3 ||
    value.length > 200
  ) {
    throw operationConflict();
  }

  return value;
}

function requireOperationKey(
  value:
    unknown,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 8 ||
    value.length > 300
  ) {
    throw operationConflict();
  }

  return value;
}

function operationConflict():
  ReturnType<typeof refundAccountingError> {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS
      .operationConflict,
    "Refund operation reservation plan is invalid.",
  );
}
