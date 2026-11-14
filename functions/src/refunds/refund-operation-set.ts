import {
  REFUND_ACCOUNTING_ERROR_REASONS,
  refundAccountingError,
} from "./refund-accounting-domain.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type RefundOperationBinding = {
  paymentId:
    string;

  refundOperationId:
    string;

  amountInCentavos:
    number;
};

export type RefundOperationSetEntry = {
  paymentId:
    string;

  refundOperationId:
    string;

  status:
    "reserved" |
    "processing" |
    "failed" |
    "completed";

  gatewayFailureCertainty:
    unknown;

  failureCode:
    unknown;
};

export type RefundOperationSetCancellationStatus =
  | "refund_processing"
  | "refund_failed"
  | "refund_completed";

/**
 * Reads the immutable payment-to-refund-operation bindings created
 * by multi-payment refund approval.
 *
 * null means a legacy cancellation with no operation-set contract.
 */
export function readRefundOperationBindings(
  cancellation:
    UnknownRecord,
): readonly RefundOperationBinding[] | null {
  const schemaVersion =
    cancellation
      .refundOperationPlanSchemaVersion;

  if (
    schemaVersion ===
      undefined ||
    schemaVersion ===
      null
  ) {
    return null;
  }

  if (schemaVersion !== 1) {
    throw operationSetInvalid();
  }

  const rawBindings =
    cancellation
      .refundOperationBindings;

  const rawOperationIds =
    cancellation
      .refundOperationIds;

  if (
    !Array.isArray(rawBindings) ||
    !Array.isArray(rawOperationIds) ||
    rawBindings.length !==
      rawOperationIds.length ||
    rawBindings.length > 25
  ) {
    throw operationSetInvalid();
  }

  if (rawBindings.length === 0) {
    if (
      cancellation.refundOperationId !==
        null ||
      rawOperationIds.length !== 0
    ) {
      throw operationSetInvalid();
    }

    return [];
  }

  const seenPayments =
    new Set<string>();

  const seenOperations =
    new Set<string>();

  const bindings =
    rawBindings.map(
      (rawBinding, index) => {
        if (
          !rawBinding ||
          typeof rawBinding !== "object" ||
          Array.isArray(rawBinding)
        ) {
          throw operationSetInvalid();
        }

        const binding =
          rawBinding as
            Record<string, unknown>;

        const paymentId =
          requirePaymentId(
            binding.paymentId,
          );

        const refundOperationId =
          requireRefundOperationId(
            binding.refundOperationId,
          );

        const amountInCentavos =
          requirePositiveCentavos(
            binding.amountInCentavos,
          );

        if (
          seenPayments.has(paymentId) ||
          seenOperations.has(
            refundOperationId,
          ) ||
          rawOperationIds[index] !==
            refundOperationId
        ) {
          throw operationSetInvalid();
        }

        seenPayments.add(
          paymentId,
        );

        seenOperations.add(
          refundOperationId,
        );

        return {
          paymentId,
          refundOperationId,
          amountInCentavos,
        };
      },
    );

  if (
    cancellation.refundOperationId !==
      bindings[0]
        ?.refundOperationId
  ) {
    throw operationSetInvalid();
  }

  return bindings;
}

export function refundOperationBindingFor(
  cancellation:
    UnknownRecord,

  paymentId:
    string,

  refundOperationId:
    string,
): RefundOperationBinding | null {
  const bindings =
    readRefundOperationBindings(
      cancellation,
    );

  if (bindings === null) {
    return null;
  }

  return (
    bindings.find(
      (binding) =>
        binding.paymentId ===
          paymentId &&
        binding.refundOperationId ===
          refundOperationId,
    ) ??
    null
  );
}

/**
 * Booking-level refund status.
 *
 * Completion is intentionally all-or-nothing at the cancellation
 * level: one physical payment completing does not complete the
 * cancellation while another operation remains unresolved.
 */
export function refundOperationSetCancellationStatus(
  entries:
    readonly RefundOperationSetEntry[],
): RefundOperationSetCancellationStatus {
  if (
    entries.length === 0 ||
    entries.length > 25
  ) {
    throw operationSetInvalid();
  }

  const validated =
    entries.map(
      (entry) => {
        if (
          !isOperationStatus(
            entry.status,
          )
        ) {
          throw operationSetInvalid();
        }

        return entry;
      },
    );

  if (
    validated.every(
      (entry) =>
        entry.status ===
        "completed",
    )
  ) {
    return "refund_completed";
  }

  if (
    validated.some(
      (entry) =>
        entry.status ===
          "failed" ||
        (
          entry.status ===
            "processing" &&
          entry
            .gatewayFailureCertainty ===
            "ambiguous"
        ) ||
        entry.failureCode ===
          "GATEWAY_MINIMUM_UNSUPPORTED" ||
        entry.failureCode ===
          "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED",
    )
  ) {
    return "refund_failed";
  }

  return "refund_processing";
}

function isOperationStatus(
  value:
    unknown,
): value is RefundOperationSetEntry["status"] {
  return (
    value === "reserved" ||
    value === "processing" ||
    value === "failed" ||
    value === "completed"
  );
}

function requirePaymentId(
  value:
    unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^payment_[a-f0-9]{32}$/u
      .test(value)
  ) {
    throw operationSetInvalid();
  }

  return value;
}

function requireRefundOperationId(
  value:
    unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^refund_[a-f0-9]{40}$/u
      .test(value)
  ) {
    throw operationSetInvalid();
  }

  return value;
}

function requirePositiveCentavos(
  value:
    unknown,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0
  ) {
    throw operationSetInvalid();
  }

  return value as number;
}

function operationSetInvalid():
  ReturnType<typeof refundAccountingError> {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS
      .operationConflict,
    "Refund operation-set linkage is invalid.",
  );
}
