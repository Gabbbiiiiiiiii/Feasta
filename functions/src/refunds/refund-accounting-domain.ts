import {createHash} from "node:crypto";

import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {
  classifyProviderRequestRefundPolicyEvidence,
} from "../bookings/booking-refund-policy.js";
import {
  REFUND_ELIGIBILITY_STAGES,
  type RefundEligibilityStage,
} from "../refund-policies/refund-policy-domain.js";
import {
  PAYMENT_CURRENCY,
  type PaymentStatus,
} from "../shared/constants.js";

export const REFUND_CALCULATION_SCHEMA_VERSION = 1 as const;
export const REFUND_ACCOUNTING_SCHEMA_VERSION = 1 as const;
export const REFUND_OPERATION_SCHEMA_VERSION = 1 as const;

export const REFUND_OPERATION_STATUSES = [
  "reserved",
  "processing",
  "completed",
  "failed",
  "released",
] as const;

export type RefundOperationStatus =
  (typeof REFUND_OPERATION_STATUSES)[number];

export const REFUND_ACCOUNTING_ERROR_REASONS = {
  calculationUnavailable: "REFUND_CALCULATION_NOT_AVAILABLE",
  policyEvidenceInvalid: "REFUND_POLICY_EVIDENCE_INVALID",
  frozenEligibilityInvalid: "REFUND_FROZEN_ELIGIBILITY_INVALID",
  paymentInvalid: "REFUND_PAYMENT_INVALID",
  paymentNotSettled: "REFUND_PAYMENT_NOT_SETTLED",
  currencyUnsupported: "REFUND_CURRENCY_UNSUPPORTED",
  nothingAvailable: "REFUND_NOTHING_AVAILABLE",
  reservationConflict: "REFUND_RESERVATION_CONFLICT",
  accountingInvalid: "REFUND_ACCOUNTING_INVALID",
  operationConflict: "REFUND_OPERATION_CONFLICT",
  manualReviewRequired: "REFUND_MANUAL_REVIEW_REQUIRED",
} as const;

export type RefundAccounting = {
  refundedAmountInCentavos: number;
  refundReservedAmountInCentavos: number;
  compatibility: "canonical" | "legacy_unrefunded" | "legacy_fully_refunded";
};

export type CalculatedRefund = {
  schemaVersion: typeof REFUND_CALCULATION_SCHEMA_VERSION;
  calculationStatus: "calculated" | "nothing_refundable";
  frozenStage: RefundEligibilityStage;
  refundBasisPoints: number;
  originalPaidAmountInCentavos: number;
  targetTotalRefundAmountInCentavos: number;
  completedRefundAmountInCentavos: number;
  reservedRefundAmountInCentavos: number;
  eligibleRefundAmountInCentavos: number;
  remainingRefundableAmountInCentavos: number;
  currency: typeof PAYMENT_CURRENCY;
};

export type ManualReviewRefundCalculation = {
  schemaVersion: typeof REFUND_CALCULATION_SCHEMA_VERSION;
  calculationStatus: "manual_review_required";
  frozenStage: null;
  refundBasisPoints: null;
  originalPaidAmountInCentavos: null;
  targetTotalRefundAmountInCentavos: null;
  completedRefundAmountInCentavos: null;
  reservedRefundAmountInCentavos: null;
  eligibleRefundAmountInCentavos: null;
  remainingRefundableAmountInCentavos: null;
  currency: null;
};

export type RefundCalculation =
  | CalculatedRefund
  | ManualReviewRefundCalculation;

type UnknownRecord = Record<string, unknown>;

const REQUIRED_POLICY_STAGES = new Set<RefundEligibilityStage>(
  REFUND_ELIGIBILITY_STAGES,
);

export function calculateCancellationRefund(input: {
  providerRequest: Readonly<UnknownRecord>;
  cancellationRequest: Readonly<UnknownRecord>;
  payment: Readonly<UnknownRecord> | null;
}): RefundCalculation {
  const evidence = classifyProviderRequestRefundPolicyEvidence(
    input.providerRequest,
  );

  if (evidence.status === "invalid") {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
      "Refund policy evidence is invalid.",
    );
  }

  if (evidence.status === "legacy") {
    if (
      input.cancellationRequest.policyEvidenceStatus !== "legacy" ||
      input.cancellationRequest.frozenEligibility !== null
    ) {
      throw refundAccountingError(
        "failed-precondition",
        REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
        "Legacy refund evidence is inconsistent.",
      );
    }

    return manualReviewRefundCalculation();
  }

  if (input.cancellationRequest.policyEvidenceStatus !== "policy_backed") {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
      "Cancellation policy evidence is inconsistent.",
    );
  }

  const frozenStage = requireFrozenStage(
    input.cancellationRequest.frozenEligibility,
  );
  const snapshot = exactRecord(
    input.providerRequest.refundPolicySnapshot,
    REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
  );
  const rules = parsePolicyRules(snapshot.rules);
  const matchingRule = rules.find(
    (rule) => rule.stage === frozenStage,
  );

  if (!matchingRule) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
      "The agreed refund policy does not cover the frozen stage.",
    );
  }

  const payment = input.payment;

  if (!payment) {
    return nothingRefundableWithoutSettledPayment(
      frozenStage,
      matchingRule.refundBasisPoints,
    );
  }

  if (payment.currency !== PAYMENT_CURRENCY) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.currencyUnsupported,
      "The payment currency is not supported for refunds.",
    );
  }

  if (
    payment.status === "pending" ||
    payment.status === "processing"
  ) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.paymentNotSettled,
      "Payment reconciliation must finish before refund calculation.",
    );
  }

  if (payment.status === "failed" || payment.status === "expired") {
    return nothingRefundableWithoutSettledPayment(
      frozenStage,
      matchingRule.refundBasisPoints,
    );
  }

  const originalPaidAmountInCentavos = requirePositiveCentavos(
    payment.amountInCentavos,
    REFUND_ACCOUNTING_ERROR_REASONS.paymentInvalid,
  );

  if (!(payment.paidAt instanceof Timestamp)) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.paymentNotSettled,
      "The payment is not authoritatively settled.",
    );
  }

  const accounting = readRefundAccounting(
    payment,
    originalPaidAmountInCentavos,
  );

  return calculateRefundAmounts({
    originalPaidAmountInCentavos,
    refundBasisPoints: matchingRule.refundBasisPoints,
    completedRefundAmountInCentavos:
      accounting.refundedAmountInCentavos,
    reservedRefundAmountInCentavos:
      accounting.refundReservedAmountInCentavos,
    frozenStage,
  });
}

function nothingRefundableWithoutSettledPayment(
  frozenStage: RefundEligibilityStage,
  refundBasisPoints: number,
): CalculatedRefund {
  return {
    schemaVersion: REFUND_CALCULATION_SCHEMA_VERSION,
    calculationStatus: "nothing_refundable",
    frozenStage,
    refundBasisPoints: requireBasisPoints(refundBasisPoints),
    originalPaidAmountInCentavos: 0,
    targetTotalRefundAmountInCentavos: 0,
    completedRefundAmountInCentavos: 0,
    reservedRefundAmountInCentavos: 0,
    eligibleRefundAmountInCentavos: 0,
    remainingRefundableAmountInCentavos: 0,
    currency: PAYMENT_CURRENCY,
  };
}

export function calculateRefundAmounts(input: {
  originalPaidAmountInCentavos: number;
  refundBasisPoints: number;
  completedRefundAmountInCentavos: number;
  reservedRefundAmountInCentavos: number;
  frozenStage: RefundEligibilityStage;
}): CalculatedRefund {
  const original = requirePositiveCentavos(
    input.originalPaidAmountInCentavos,
    REFUND_ACCOUNTING_ERROR_REASONS.paymentInvalid,
  );
  const basisPoints = requireBasisPoints(input.refundBasisPoints);
  const completed = requireNonNegativeCentavos(
    input.completedRefundAmountInCentavos,
  );
  const reserved = requireNonNegativeCentavos(
    input.reservedRefundAmountInCentavos,
  );

  if (completed + reserved > original) {
    throw accountingInvalid();
  }

  const target = roundHalfUpBasisPoints(original, basisPoints);
  const remainingBalance = original - completed - reserved;
  const remainingPolicyTarget = Math.max(0, target - completed - reserved);
  const eligible = Math.min(remainingPolicyTarget, remainingBalance);

  return {
    schemaVersion: REFUND_CALCULATION_SCHEMA_VERSION,
    calculationStatus: eligible === 0
      ? "nothing_refundable"
      : "calculated",
    frozenStage: input.frozenStage,
    refundBasisPoints: basisPoints,
    originalPaidAmountInCentavos: original,
    targetTotalRefundAmountInCentavos: target,
    completedRefundAmountInCentavos: completed,
    reservedRefundAmountInCentavos: reserved,
    eligibleRefundAmountInCentavos: eligible,
    remainingRefundableAmountInCentavos: remainingBalance,
    currency: PAYMENT_CURRENCY,
  };
}

export function roundHalfUpBasisPoints(
  amountInCentavos: number,
  refundBasisPoints: number,
): number {
  const amount = requirePositiveCentavos(
    amountInCentavos,
    REFUND_ACCOUNTING_ERROR_REASONS.paymentInvalid,
  );
  const basisPoints = requireBasisPoints(refundBasisPoints);
  const denominator = 10_000n;
  const rounded = (
    BigInt(amount) * BigInt(basisPoints) + denominator / 2n
  ) / denominator;
  const result = Number(rounded);

  if (!Number.isSafeInteger(result)) {
    throw accountingInvalid();
  }

  return result;
}

export function readRefundAccounting(
  payment: Readonly<UnknownRecord>,
  originalPaidAmountInCentavos: number,
): RefundAccounting {
  const original = requirePositiveCentavos(
    originalPaidAmountInCentavos,
    REFUND_ACCOUNTING_ERROR_REASONS.paymentInvalid,
  );

  if (
    payment.refundExecutionLock !== undefined &&
    payment.refundExecutionLock !== null &&
    payment.status !== "refunded"
  ) {
    throw accountingInvalid();
  }
  const refunded = payment.refundedAmountInCentavos;
  const reserved = payment.refundReservedAmountInCentavos;
  const hasRefunded = refunded !== undefined && refunded !== null;
  const hasReserved = reserved !== undefined && reserved !== null;

  if (hasRefunded !== hasReserved) {
    throw accountingInvalid();
  }

  if (!hasRefunded) {
    if (
      payment.status === "refunded" &&
      payment.refundStatus === "completed" &&
      payment.refundedAt instanceof Timestamp
    ) {
      return {
        refundedAmountInCentavos: original,
        refundReservedAmountInCentavos: 0,
        compatibility: "legacy_fully_refunded",
      };
    }

    if (
      payment.status === "paid" &&
      !hasLegacyRefundEvidence(payment)
    ) {
      return {
        refundedAmountInCentavos: 0,
        refundReservedAmountInCentavos: 0,
        compatibility: "legacy_unrefunded",
      };
    }

    throw accountingInvalid();
  }

  if (payment.refundAccountingSchemaVersion !== REFUND_ACCOUNTING_SCHEMA_VERSION) {
    throw accountingInvalid();
  }

  const completed = requireNonNegativeCentavos(refunded);
  const inFlight = requireNonNegativeCentavos(reserved);

  if (completed + inFlight > original || hasLegacyRefundInFlight(payment)) {
    throw accountingInvalid();
  }

  const derivedStatus = derivePaymentRefundStatus({
    originalPaidAmountInCentavos: original,
    completedRefundAmountInCentavos: completed,
  });

  if (payment.status !== derivedStatus) {
    throw accountingInvalid();
  }

  return {
    refundedAmountInCentavos: completed,
    refundReservedAmountInCentavos: inFlight,
    compatibility: "canonical",
  };
}

export function derivePaymentRefundStatus(input: {
  originalPaidAmountInCentavos: number;
  completedRefundAmountInCentavos: number;
}): Extract<PaymentStatus, "paid" | "partially_refunded" | "refunded"> {
  const original = requirePositiveCentavos(
    input.originalPaidAmountInCentavos,
    REFUND_ACCOUNTING_ERROR_REASONS.paymentInvalid,
  );
  const completed = requireNonNegativeCentavos(
    input.completedRefundAmountInCentavos,
  );

  if (completed > original) {
    throw accountingInvalid();
  }
  if (completed === 0) return "paid";
  return completed === original ? "refunded" : "partially_refunded";
}

export function refundOperationId(input: {
  paymentId: string;
  cancellationRequestId: string;
  operationKey: string;
}): string {
  return `refund_${createHash("sha256")
    .update([
      "payment",
      input.paymentId,
      "cancellation",
      input.cancellationRequestId,
      "operation",
      input.operationKey,
    ].join(":"))
    .digest("hex")
    .slice(0, 40)}`;
}

export function gatewayRefundIdempotencyKey(
  refundOperationIdValue: string,
): string {
  if (!/^refund_[a-f0-9]{40}$/u.test(refundOperationIdValue)) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.operationConflict,
      "Refund operation identity is invalid.",
    );
  }

  return `feasta-policy-${refundOperationIdValue}`;
}

export function assertRefundOperationTransition(
  current: RefundOperationStatus,
  target: RefundOperationStatus,
): void {
  const allowed: Record<RefundOperationStatus, readonly RefundOperationStatus[]> = {
    reserved: ["processing", "released", "completed"],
    processing: ["completed", "failed"],
    completed: [],
    failed: ["processing"],
    released: [],
  };

  if (!allowed[current].includes(target)) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.operationConflict,
      "Refund operation cannot make that transition.",
    );
  }
}

export function manualReviewRefundCalculation(): ManualReviewRefundCalculation {
  return {
    schemaVersion: REFUND_CALCULATION_SCHEMA_VERSION,
    calculationStatus: "manual_review_required",
    frozenStage: null,
    refundBasisPoints: null,
    originalPaidAmountInCentavos: null,
    targetTotalRefundAmountInCentavos: null,
    completedRefundAmountInCentavos: null,
    reservedRefundAmountInCentavos: null,
    eligibleRefundAmountInCentavos: null,
    remainingRefundableAmountInCentavos: null,
    currency: null,
  };
}

export function refundAccountingError(
  code:
    | "invalid-argument"
    | "failed-precondition"
    | "already-exists"
    | "not-found"
    | "unavailable",
  reason: string,
  message: string,
): HttpsError {
  return new HttpsError(code, message, {reason});
}

function requireFrozenStage(value: unknown): RefundEligibilityStage {
  const frozen = exactRecord(
    value,
    REFUND_ACCOUNTING_ERROR_REASONS.frozenEligibilityInvalid,
  );

  if (
    Object.keys(frozen).length !== 3 ||
    !Object.hasOwn(frozen, "stage") ||
    !Object.hasOwn(frozen, "stageSequence") ||
    !Object.hasOwn(frozen, "frozenAt") ||
    !REFUND_ELIGIBILITY_STAGES.includes(
      frozen.stage as RefundEligibilityStage,
    ) ||
    !Number.isSafeInteger(frozen.stageSequence) ||
    (frozen.stageSequence as number) < 0 ||
    (
      frozen.stage === "preparation_not_started" &&
      frozen.stageSequence !== 0
    ) ||
    (
      frozen.stage === "preparation_started" &&
      frozen.stageSequence !== 1
    ) ||
    (
      frozen.stage === "service_started" &&
      frozen.stageSequence !== 1 &&
      frozen.stageSequence !== 2
    ) ||
    !(frozen.frozenAt instanceof Timestamp)
  ) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_ACCOUNTING_ERROR_REASONS.frozenEligibilityInvalid,
      "Frozen refund eligibility is invalid.",
    );
  }

  return frozen.stage as RefundEligibilityStage;
}

function parsePolicyRules(value: unknown): Array<{
  stage: RefundEligibilityStage;
  refundBasisPoints: number;
}> {
  if (!Array.isArray(value) || value.length !== REQUIRED_POLICY_STAGES.size) {
    throw policyInvalid();
  }

  const stages = new Set<RefundEligibilityStage>();
  const rules = value.map((raw) => {
    const rule = exactRecord(
      raw,
      REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
    );

    if (
      Object.keys(rule).length !== 2 ||
      !Object.hasOwn(rule, "stage") ||
      !Object.hasOwn(rule, "refundBasisPoints") ||
      !REFUND_ELIGIBILITY_STAGES.includes(
        rule.stage as RefundEligibilityStage,
      )
    ) {
      throw policyInvalid();
    }

    const stage = rule.stage as RefundEligibilityStage;
    if (stages.has(stage)) throw policyInvalid();
    stages.add(stage);

    return {
      stage,
      refundBasisPoints: requireBasisPoints(rule.refundBasisPoints),
    };
  });

  if ([...REQUIRED_POLICY_STAGES].some((stage) => !stages.has(stage))) {
    throw policyInvalid();
  }

  return rules;
}

function requireBasisPoints(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10_000
  ) {
    throw policyInvalid();
  }
  return value as number;
}

function requirePositiveCentavos(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw refundAccountingError(
      "failed-precondition",
      reason,
      "The authoritative payment amount is invalid.",
    );
  }
  return value as number;
}

function requireNonNegativeCentavos(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw accountingInvalid();
  }
  return value as number;
}

function exactRecord(value: unknown, reason: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw refundAccountingError(
      "failed-precondition",
      reason,
      "Refund evidence is invalid.",
    );
  }
  return value as UnknownRecord;
}

function hasLegacyRefundEvidence(payment: Readonly<UnknownRecord>): boolean {
  return hasLegacyRefundInFlight(payment) ||
    payment.refundStatus === "completed" ||
    payment.refundedAt !== undefined && payment.refundedAt !== null ||
    typeof payment.refundId === "string" && payment.refundId.length > 0;
}

function hasLegacyRefundInFlight(payment: Readonly<UnknownRecord>): boolean {
  return payment.refundStatus === "requested" ||
    payment.refundStatus === "processing";
}

function policyInvalid(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid,
    "The agreed refund policy is invalid.",
  );
}

function accountingInvalid(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS.accountingInvalid,
    "Refund accounting is invalid.",
  );
}
