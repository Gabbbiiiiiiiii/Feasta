import {createHash} from "node:crypto";

import {HttpsError} from "firebase-functions/v2/https";

import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";
import {parseProviderRequestCancellationStatus} from
  "../cancellations/refund-cancellation-domain.js";
import {
  canonicalPaymentLinkageReason,
  canonicalRequestLinkageReason,
  paymentIdForProviderRequest,
} from "../payments/payment-lifecycle.js";
import {requireSafeDocumentId} from "../refund-policies/refund-policy-domain.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {PAYMENT_CURRENCY} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  REFUND_ACCOUNTING_ERROR_REASONS,
  REFUND_ACCOUNTING_SCHEMA_VERSION,
  REFUND_OPERATION_SCHEMA_VERSION,
  assertRefundOperationTransition,
  calculateCancellationRefund,
  derivePaymentRefundStatus,
  readRefundAccounting,
  refundAccountingError,
  refundOperationId,
  type CalculatedRefund,
  type RefundCalculation,
  type RefundOperationStatus,
} from "./refund-accounting-domain.js";

const MAX_REFUND_OPERATIONS_PER_CANCELLATION = 20;

export type RefundReservationResult = {
  paymentId: string;
  providerRequestId: string;
  cancellationRequestId: string;
  refundOperationId: string;
  amountInCentavos: number;
  currency: typeof PAYMENT_CURRENCY;
  status: RefundOperationStatus;
  calculation: CalculatedRefund;
  replayed: boolean;
};

export async function recordCancellationRefundCalculation(input: {
  cancellationRequestId: string;
  actorId: string;
  actorRole: "admin" | "system";
}): Promise<RefundCalculation> {
  const cancellationRequestId = requireSafeDocumentId(
    input.cancellationRequestId,
    "Cancellation request",
  );
  const cancellationReference = db
    .collection("providerRequestCancellationRequests")
    .doc(cancellationRequestId);

  return db.runTransaction(async (transaction) => {
    const cancellationSnapshot = await transaction.get(cancellationReference);
    if (!cancellationSnapshot.exists) throw paymentInvalid();
    const cancellation = cancellationSnapshot.data() ?? {};
    const providerRequestId = requireStoredId(
      cancellation.providerRequestId,
      "Provider request",
    );
    const mainEventId = requireStoredId(cancellation.mainEventId, "Main event");
    const customerId = requireStoredId(cancellation.customerId, "Customer");
    const providerId = requireStoredId(cancellation.providerId, "Provider");
    const paymentId = paymentIdForProviderRequest(providerRequestId);
    const providerRequestReference = db.collection("providerRequests")
      .doc(providerRequestId);
    const mainEventReference = db.collection("mainEvents").doc(mainEventId);
    const paymentReference = db.collection("payments").doc(paymentId);
    const [providerRequestSnapshot, mainEventSnapshot, paymentSnapshot] =
      await transaction.getAll(
        providerRequestReference,
        mainEventReference,
        paymentReference,
      );

    if (!providerRequestSnapshot.exists || !mainEventSnapshot.exists) {
      throw paymentInvalid();
    }
    const providerRequest = providerRequestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    const payment = paymentSnapshot.exists ? paymentSnapshot.data() ?? {} : null;

    if (
      cancellation.providerRequestId !== providerRequestId ||
      cancellation.mainEventId !== mainEventId ||
      cancellation.customerId !== customerId ||
      cancellation.providerId !== providerId ||
      canonicalRequestLinkageReason({
        providerRequestId,
        mainEventId,
        customerId,
        providerId,
        providerRequest,
        mainEvent,
      }) ||
      payment && canonicalPaymentLinkageReason({
        paymentId,
        providerRequestId,
        mainEventId,
        customerId,
        providerId,
        payment,
        providerRequest,
        mainEvent,
      })
    ) {
      throw paymentInvalid();
    }

    const currentStatus = parseProviderRequestCancellationStatus(
      cancellation.status,
    );
    if (currentStatus === "awaiting_payment_resolution") {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.paymentNotSettled,
        "Payment reconciliation must finish before refund calculation.",
      );
    }
    if (currentStatus !== "submitted" && currentStatus !== "under_review") {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.calculationUnavailable,
        "Refund calculation cannot be recorded in the current state.",
      );
    }

    const calculation = calculateCancellationRefund({
      providerRequest,
      cancellationRequest: cancellation,
      payment,
    });
    const timestamp = serverTimestamp();
    const nextStatus = currentStatus === "submitted" ? "under_review" : currentStatus;
    transaction.update(cancellationReference, {
      status: nextStatus,
      refundCalculation: calculation,
      updatedAt: timestamp,
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: "refund_calculation.created",
      targetCollection: "providerRequestCancellationRequests",
      targetId: cancellationRequestId,
      before: {status: currentStatus},
      after: {
        status: nextStatus,
        calculationStatus: calculation.calculationStatus,
      },
      metadata: {
        mainEventId,
        providerRequestId,
        paymentId: payment ? paymentId : null,
        refundBasisPoints: calculation.refundBasisPoints,
        eligibleRefundAmountInCentavos:
          calculation.eligibleRefundAmountInCentavos,
      },
    });
    return calculation;
  });
}

export async function reserveCancellationRefund(input: {
  cancellationRequestId: string;
  operationKey: string;
  amountInCentavos: number;
  actorId: string;
  actorRole: "admin" | "system";
}): Promise<RefundReservationResult> {
  const cancellationRequestId = requireSafeDocumentId(
    input.cancellationRequestId,
    "Cancellation request",
  );
  const operationKey = requireOperationKey(input.operationKey);
  const requestedAmount = requireReservationAmount(input.amountInCentavos);
  const cancellationReference = db
    .collection("providerRequestCancellationRequests")
    .doc(cancellationRequestId);

  return db.runTransaction(async (transaction) => {
    const cancellationSnapshot = await transaction.get(cancellationReference);
    if (!cancellationSnapshot.exists) throw paymentInvalid();
    const cancellation = cancellationSnapshot.data() ?? {};
    const providerRequestId = requireStoredId(
      cancellation.providerRequestId,
      "Provider request",
    );
    const mainEventId = requireStoredId(cancellation.mainEventId, "Main event");
    const customerId = requireStoredId(cancellation.customerId, "Customer");
    const providerId = requireStoredId(cancellation.providerId, "Provider");
    const paymentId = paymentIdForProviderRequest(providerRequestId);
    const providerRequestReference = db.collection("providerRequests")
      .doc(providerRequestId);
    const mainEventReference = db.collection("mainEvents").doc(mainEventId);
    const paymentReference = db.collection("payments").doc(paymentId);
    const operationId = refundOperationId({
      paymentId,
      cancellationRequestId,
      operationKey,
    });
    const operationReference = paymentReference.collection("refunds")
      .doc(operationId);
    const [providerRequestSnapshot, mainEventSnapshot, paymentSnapshot,
      operationSnapshot] = await transaction.getAll(
      providerRequestReference,
      mainEventReference,
      paymentReference,
      operationReference,
    );

    if (
      !providerRequestSnapshot.exists ||
      !mainEventSnapshot.exists ||
      !paymentSnapshot.exists
    ) {
      throw paymentInvalid();
    }

    const providerRequest = providerRequestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    const payment = paymentSnapshot.data() ?? {};
    assertCanonicalRefundLinkage({
      cancellationRequestId,
      cancellation,
      providerRequestId,
      mainEventId,
      customerId,
      providerId,
      paymentId,
      providerRequest,
      mainEvent,
      payment,
    });

    if (operationSnapshot.exists) {
      return resultFromStoredOperation({
        operationId,
        operation: operationSnapshot.data() ?? {},
        operationKey,
        cancellationRequestId,
        providerRequestId,
        mainEventId,
        paymentId,
        requestedAmount,
        calculation: requireStoredCalculation(
          (operationSnapshot.data() ?? {}).calculation,
        ),
      });
    }

    if (parseProviderRequestCancellationStatus(cancellation.status) !== "approved") {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.calculationUnavailable,
        "Cancellation refund authority is not approved.",
      );
    }

    const classification = classifyProviderRequestRefundPolicyEvidence(
      providerRequest,
    );
    if (classification.status !== "policy_backed") {
      throw refundAccountingError(
        "failed-precondition",
        classification.status === "legacy"
          ? REFUND_ACCOUNTING_ERROR_REASONS.manualReviewRequired
          : REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
        "Automatic refund accounting is unavailable.",
      );
    }

    const eligibility = requireRefundEligibilityState(providerRequest);
    if (eligibility.activeCancellationRequestId !== cancellationRequestId) {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.operationConflict,
        "Cancellation refund authority is not active.",
      );
    }

    const approvedCancellationRequestId = nullableStoredId(
      providerRequest.approvedCancellationRequestId,
    );
    if (
      approvedCancellationRequestId !== null &&
      approvedCancellationRequestId !== cancellationRequestId
    ) {
      throw refundAccountingError(
        "already-exists",
        REFUND_ACCOUNTING_ERROR_REASONS.reservationConflict,
        "Another cancellation already owns refund authority.",
      );
    }

    if (payment.refundExecutionLock !== undefined && payment.refundExecutionLock !== null) {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.reservationConflict,
        "A legacy refund execution is already active.",
      );
    }

    const calculation = calculateCancellationRefund({
      providerRequest,
      cancellationRequest: cancellation,
      payment,
    });
    if (calculation.calculationStatus === "manual_review_required") {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.manualReviewRequired,
        "Refund calculation requires manual review.",
      );
    }
    if (
      calculation.eligibleRefundAmountInCentavos === 0 ||
      requestedAmount > calculation.eligibleRefundAmountInCentavos
    ) {
      throw refundAccountingError(
        "failed-precondition",
        calculation.eligibleRefundAmountInCentavos === 0
          ? REFUND_ACCOUNTING_ERROR_REASONS.nothingAvailable
          : REFUND_ACCOUNTING_ERROR_REASONS.reservationConflict,
        "The requested reservation exceeds the authoritative refund balance.",
      );
    }

    const operationIds = storedOperationIds(cancellation.refundOperationIds);
    if (operationIds.length >= MAX_REFUND_OPERATIONS_PER_CANCELLATION) {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.reservationConflict,
        "The refund operation limit has been reached.",
      );
    }

    const accounting = readRefundAccounting(
      payment,
      calculation.originalPaidAmountInCentavos,
    );
    const timestamp = serverTimestamp();
    const nextReserved = accounting.refundReservedAmountInCentavos + requestedAmount;

    transaction.create(operationReference, {
      schemaVersion: REFUND_OPERATION_SCHEMA_VERSION,
      providerRequestId,
      mainEventId,
      cancellationRequestId,
      amountInCentavos: requestedAmount,
      currency: PAYMENT_CURRENCY,
      status: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      failureCode: null,
      operationKey,
      calculation,
    });
    transaction.update(paymentReference, {
      refundAccountingSchemaVersion: REFUND_ACCOUNTING_SCHEMA_VERSION,
      refundedAmountInCentavos: accounting.refundedAmountInCentavos,
      refundReservedAmountInCentavos: nextReserved,
      updatedAt: timestamp,
    });
    transaction.update(providerRequestReference, {
      approvedCancellationRequestId: cancellationRequestId,
      updatedAt: timestamp,
    });
    transaction.update(cancellationReference, {
      refundCalculation: calculation,
      refundOperationIds: [...operationIds, operationId],
      updatedAt: timestamp,
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: "refund_reservation.created",
      targetCollection: "payments",
      targetId: paymentId,
      before: {
        refundedAmountInCentavos: accounting.refundedAmountInCentavos,
        refundReservedAmountInCentavos:
          accounting.refundReservedAmountInCentavos,
      },
      after: {
        refundedAmountInCentavos: accounting.refundedAmountInCentavos,
        refundReservedAmountInCentavos: nextReserved,
      },
      metadata: {
        providerRequestId,
        cancellationRequestId,
        refundOperationId: operationId,
        amountInCentavos: requestedAmount,
      },
    });

    return {
      paymentId,
      providerRequestId,
      cancellationRequestId,
      refundOperationId: operationId,
      amountInCentavos: requestedAmount,
      currency: PAYMENT_CURRENCY,
      status: "reserved",
      calculation,
      replayed: false,
    };
  });
}

export async function releaseRefundReservation(input: {
  paymentId: string;
  refundOperationId: string;
  actorId: string;
  actorRole: "admin" | "system";
  failureCode: string;
}): Promise<{status: "released"; replayed: boolean}> {
  const result = await transitionReservedOperation({
    ...input,
    target: "released",
  });
  return {status: "released", replayed: result.replayed};
}

export async function completeRefundAccounting(input: {
  paymentId: string;
  refundOperationId: string;
  actorId: string;
  actorRole: "admin" | "system";
}): Promise<{
  status: "completed";
  paymentStatus: "partially_refunded" | "refunded";
  replayed: boolean;
}> {
  const result = await transitionReservedOperation({
    ...input,
    failureCode: null,
    target: "completed",
  });
  if (result.paymentStatus === "paid") {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.accountingInvalid,
      "Completed refund accounting did not change the payment.",
    );
  }
  return {
    status: "completed",
    paymentStatus: result.paymentStatus,
    replayed: result.replayed,
  };
}

async function transitionReservedOperation(input: {
  paymentId: string;
  refundOperationId: string;
  actorId: string;
  actorRole: "admin" | "system";
  failureCode: string | null;
  target: "released" | "completed";
}): Promise<{
  status: "released" | "completed";
  paymentStatus: "paid" | "partially_refunded" | "refunded";
  replayed: boolean;
}> {
  const paymentId = requireSafeDocumentId(input.paymentId, "Payment");
  const operationId = requireSafeDocumentId(
    input.refundOperationId,
    "Refund operation",
  );
  const paymentReference = db.collection("payments").doc(paymentId);
  const operationReference = paymentReference.collection("refunds")
    .doc(operationId);

  return db.runTransaction(async (transaction) => {
    const [paymentSnapshot, operationSnapshot] = await transaction.getAll(
      paymentReference,
      operationReference,
    );
    if (!paymentSnapshot.exists || !operationSnapshot.exists) {
      throw paymentInvalid();
    }
    const payment = paymentSnapshot.data() ?? {};
    const operation = operationSnapshot.data() ?? {};
    const status = requireOperationStatus(operation.status);

    if (status === input.target) {
      const accounting = readRefundAccounting(
        payment,
        requireReservationAmount(payment.amountInCentavos),
      );
      return {
        status: input.target,
        paymentStatus: derivePaymentRefundStatus({
          originalPaidAmountInCentavos: payment.amountInCentavos as number,
          completedRefundAmountInCentavos:
            accounting.refundedAmountInCentavos,
        }),
        replayed: true,
      };
    }

    assertRefundOperationTransition(status, input.target);
    const amount = requireReservationAmount(operation.amountInCentavos);
    const original = requireReservationAmount(payment.amountInCentavos);
    const accounting = readRefundAccounting(payment, original);
    if (accounting.refundReservedAmountInCentavos < amount) {
      throw paymentInvalid();
    }

    const nextReserved = accounting.refundReservedAmountInCentavos - amount;
    const nextCompleted = input.target === "completed"
      ? accounting.refundedAmountInCentavos + amount
      : accounting.refundedAmountInCentavos;
    const nextStatus = derivePaymentRefundStatus({
      originalPaidAmountInCentavos: original,
      completedRefundAmountInCentavos: nextCompleted,
    });
    const timestamp = serverTimestamp();

    transaction.update(operationReference, {
      status: input.target,
      updatedAt: timestamp,
      completedAt: input.target === "completed" ? timestamp : null,
      failureCode: input.target === "released"
        ? boundedFailureCode(input.failureCode)
        : null,
    });
    transaction.update(paymentReference, {
      status: nextStatus,
      refundAccountingSchemaVersion: REFUND_ACCOUNTING_SCHEMA_VERSION,
      refundedAmountInCentavos: nextCompleted,
      refundReservedAmountInCentavos: nextReserved,
      ...(input.target === "completed"
        ? {lastRefundCompletedAt: timestamp}
        : {}),
      ...(nextStatus === "refunded" ? {refundedAt: timestamp} : {}),
      updatedAt: timestamp,
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.target === "completed"
        ? "refund_accounting.completed"
        : "refund_reservation.released",
      targetCollection: "payments",
      targetId: paymentId,
      before: {
        status: payment.status,
        refundedAmountInCentavos: accounting.refundedAmountInCentavos,
        refundReservedAmountInCentavos:
          accounting.refundReservedAmountInCentavos,
      },
      after: {
        status: nextStatus,
        refundedAmountInCentavos: nextCompleted,
        refundReservedAmountInCentavos: nextReserved,
      },
      metadata: {
        refundOperationId: operationId,
        providerRequestId: operation.providerRequestId,
        cancellationRequestId: operation.cancellationRequestId,
        amountInCentavos: amount,
      },
    });

    return {
      status: input.target,
      paymentStatus: nextStatus,
      replayed: false,
    };
  });
}

function assertCanonicalRefundLinkage(input: {
  cancellationRequestId: string;
  cancellation: Readonly<Record<string, unknown>>;
  providerRequestId: string;
  mainEventId: string;
  customerId: string;
  providerId: string;
  paymentId: string;
  providerRequest: Readonly<Record<string, unknown>>;
  mainEvent: Readonly<Record<string, unknown>>;
  payment: Readonly<Record<string, unknown>>;
}): void {
  if (
    input.cancellation.providerRequestId !== input.providerRequestId ||
    input.cancellation.mainEventId !== input.mainEventId ||
    input.cancellation.customerId !== input.customerId ||
    input.cancellation.providerId !== input.providerId ||
    canonicalPaymentLinkageReason({
      paymentId: input.paymentId,
      providerRequestId: input.providerRequestId,
      mainEventId: input.mainEventId,
      customerId: input.customerId,
      providerId: input.providerId,
      payment: input.payment,
      providerRequest: input.providerRequest,
      mainEvent: input.mainEvent,
    })
  ) {
    throw paymentInvalid();
  }
}

function resultFromStoredOperation(input: {
  operationId: string;
  operation: Record<string, unknown>;
  operationKey: string;
  cancellationRequestId: string;
  providerRequestId: string;
  mainEventId: string;
  paymentId: string;
  requestedAmount: number;
  calculation: CalculatedRefund;
}): RefundReservationResult {
  if (
    input.operation.schemaVersion !== REFUND_OPERATION_SCHEMA_VERSION ||
    input.operation.operationKey !== input.operationKey ||
    input.operation.cancellationRequestId !== input.cancellationRequestId ||
    input.operation.providerRequestId !== input.providerRequestId ||
    input.operation.mainEventId !== input.mainEventId ||
    input.operation.amountInCentavos !== input.requestedAmount ||
    input.operation.currency !== PAYMENT_CURRENCY
  ) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.operationConflict,
      "Refund operation replay conflicts with stored authority.",
    );
  }
  const status = requireOperationStatus(input.operation.status);
  return {
    paymentId: input.paymentId,
    providerRequestId: input.providerRequestId,
    cancellationRequestId: input.cancellationRequestId,
    refundOperationId: input.operationId,
    amountInCentavos: input.requestedAmount,
    currency: PAYMENT_CURRENCY,
    status,
    calculation: input.calculation,
    replayed: true,
  };
}

function requireStoredCalculation(value: unknown): CalculatedRefund {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.operationConflict,
      "Stored refund calculation is unavailable.",
    );
  }
  const calculation = value as Record<string, unknown>;
  if (
    calculation.schemaVersion !== 1 ||
    calculation.calculationStatus !== "calculated" &&
      calculation.calculationStatus !== "nothing_refundable" ||
    calculation.currency !== PAYMENT_CURRENCY ||
    calculation.frozenStage !== "preparation_not_started" &&
      calculation.frozenStage !== "preparation_started" &&
      calculation.frozenStage !== "service_started" ||
    !Number.isSafeInteger(calculation.refundBasisPoints) ||
    (calculation.refundBasisPoints as number) < 0 ||
    (calculation.refundBasisPoints as number) > 10_000 ||
    [
      "originalPaidAmountInCentavos",
      "targetTotalRefundAmountInCentavos",
      "completedRefundAmountInCentavos",
      "reservedRefundAmountInCentavos",
      "eligibleRefundAmountInCentavos",
      "remainingRefundableAmountInCentavos",
    ].some((field) =>
      !Number.isSafeInteger(calculation[field]) ||
      (calculation[field] as number) < 0)
  ) {
    throw paymentInvalid();
  }
  return calculation as CalculatedRefund;
}

function storedOperationIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    value.length > MAX_REFUND_OPERATIONS_PER_CANCELLATION ||
    value.some((item) =>
      typeof item !== "string" ||
      !/^refund_[a-f0-9]{40}$/u.test(item)) ||
    new Set(value).size !== value.length
  ) {
    throw paymentInvalid();
  }
  return [...value] as string[];
}

function requireOperationStatus(value: unknown): RefundOperationStatus {
  if (
    value !== "reserved" &&
    value !== "processing" &&
    value !== "completed" &&
    value !== "failed" &&
    value !== "released"
  ) {
    throw paymentInvalid();
  }
  return value;
}

function requireOperationKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw refundAccountingError(
      "invalid-argument",
      REFUND_ACCOUNTING_ERROR_REASONS.operationConflict,
      "Refund operation key is invalid.",
    );
  }
  return value;
}

function requireReservationAmount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.accountingInvalid,
      "Refund amount is invalid.",
    );
  }
  return value as number;
}

function requireStoredId(value: unknown, label: string): string {
  if (typeof value !== "string") throw paymentInvalid();
  return requireSafeDocumentId(value, label);
}

function nullableStoredId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw paymentInvalid();
  return requireSafeDocumentId(value, "Approved cancellation request");
}

function boundedFailureCode(value: string | null): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 80 ||
    !/^[A-Z0-9_:-]+$/u.test(value)
  ) {
    throw refundAccountingError(
      "invalid-argument",
      REFUND_ACCOUNTING_ERROR_REASONS.operationConflict,
      "Refund release reason is invalid.",
    );
  }
  return value;
}

function paymentInvalid(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS.paymentInvalid,
    "Canonical refund payment linkage is invalid.",
  );
}

export function refundOperationKey(input: {
  cancellationRequestId: string;
  logicalOperationKey: string;
}): string {
  return createHash("sha256")
    .update([
      "policy-refund",
      input.cancellationRequestId,
      input.logicalOperationKey,
    ].join(":"))
    .digest("hex");
}
