import {createHash} from "node:crypto";

import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {
  REFUND_ELIGIBILITY_STAGES,
  type RefundEligibilityStage,
} from "../refund-policies/refund-policy-domain.js";
import {
  type PaymentStatus,
  type ProviderRequestStatus,
} from "../shared/constants.js";
import {
  REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION,
  type RefundEligibilityState,
} from "../bookings/booking-refund-policy.js";

export const PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION = 1 as const;

export const PROVIDER_REQUEST_CANCELLATION_STATUSES = [
  "submitted",
  "awaiting_payment_resolution",
  "under_review",
  "approved",
  "rejected",
  "refund_processing",
  "refund_failed",
  "refund_completed",
  "cancelled_no_refund",
] as const;

export type ProviderRequestCancellationStatus =
  (typeof PROVIDER_REQUEST_CANCELLATION_STATUSES)[number];

export type CancellationPolicyEvidenceStatus =
  | "policy_backed"
  | "legacy";

export type FrozenRefundEligibility<TTimestamp = unknown> = {
  stage: RefundEligibilityStage;
  stageSequence: number;
  frozenAt: TTimestamp;
};

export const REFUND_CANCELLATION_ERROR_REASONS = {
  eligibilityInvalid: "REFUND_ELIGIBILITY_INVALID",
  transitionInvalid: "REFUND_ELIGIBILITY_TRANSITION_INVALID",
  eligibilityLocked: "REFUND_ELIGIBILITY_LOCKED",
  cancellationNotAllowed: "CANCELLATION_NOT_ALLOWED",
  cancellationAlreadyActive: "CANCELLATION_ALREADY_ACTIVE",
  policyEvidenceInvalid: "CANCELLATION_POLICY_EVIDENCE_INVALID",
  paymentResolutionRequired: "CANCELLATION_PAYMENT_RESOLUTION_REQUIRED",
} as const;

export const CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES = [
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
] as const satisfies readonly ProviderRequestStatus[];

const ACTIVE_CANCELLATION_STATUSES = new Set<
  ProviderRequestCancellationStatus
>([
  "submitted",
  "awaiting_payment_resolution",
  "under_review",
  "approved",
  "refund_processing",
  "refund_failed",
]);

const CANCELLATION_TRANSITIONS: Readonly<
  Record<
    ProviderRequestCancellationStatus,
    readonly ProviderRequestCancellationStatus[]
  >
> = {
  submitted: [
    "awaiting_payment_resolution",
    "under_review",
    "approved",
    "rejected",
    "cancelled_no_refund",
  ],
  awaiting_payment_resolution: [
    "submitted",
    "under_review",
  ],
  under_review: [
    "approved",
    "rejected",
    "cancelled_no_refund",
  ],
  approved: [
    "refund_processing",
    "cancelled_no_refund",
  ],
  rejected: [],
  refund_processing: [
    "refund_failed",
    "refund_completed",
  ],
  refund_failed: [
    "refund_processing",
    "refund_completed",
  ],
  refund_completed: [],
  cancelled_no_refund: [],
};

export function parseRefundEligibilityStage(
  value: unknown,
): RefundEligibilityStage {
  if (
    typeof value !== "string" ||
    !REFUND_ELIGIBILITY_STAGES.includes(
      value as RefundEligibilityStage,
    )
  ) {
    throw cancellationError(
      "invalid-argument",
      REFUND_CANCELLATION_ERROR_REASONS.eligibilityInvalid,
      "Refund eligibility stage is invalid.",
    );
  }

  return value as RefundEligibilityStage;
}

export function assertRefundEligibilityTransition(
  currentStage: RefundEligibilityStage,
  targetStage: RefundEligibilityStage,
): boolean {
  if (currentStage === targetStage) {
    return false;
  }

  const allowed =
    currentStage === "preparation_not_started"
      ? ["preparation_started", "service_started"]
      : currentStage === "preparation_started"
        ? ["service_started"]
        : [];

  if (!allowed.includes(targetStage)) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.transitionInvalid,
      "Refund eligibility stage cannot make that transition.",
    );
  }

  return true;
}

export function nextRefundEligibilityState<TTimestamp>(
  current: RefundEligibilityState<unknown>,
  targetStage: RefundEligibilityStage,
  timestamp: TTimestamp,
): RefundEligibilityState<TTimestamp> {
  assertRefundEligibilityTransition(
    current.currentStage,
    targetStage,
  );
  assertRefundEligibilityUnlocked(current);

  return {
    schemaVersion: REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION,
    currentStage: targetStage,
    stageSequence: current.stageSequence + 1,
    enteredAt: timestamp,
    activeCancellationRequestId: null,
  };
}

export function assertRefundEligibilityUnlocked(
  state: RefundEligibilityState<unknown>,
): void {
  if (state.activeCancellationRequestId !== null) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.eligibilityLocked,
      "Refund eligibility is locked by an active cancellation request.",
    );
  }
}

export function assertPreparationReady(input: {
  providerRequestStatus: ProviderRequestStatus;
  downPaymentAmount: unknown;
  providerRequestPaymentStatus: unknown;
  paidAt: unknown;
  paymentStatus: PaymentStatus | null;
}): void {
  if (input.providerRequestStatus !== "confirmed") {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.transitionInvalid,
      "Preparation can begin only for a confirmed provider request.",
    );
  }

  if (
    typeof input.downPaymentAmount !== "number" ||
    !Number.isFinite(input.downPaymentAmount) ||
    input.downPaymentAmount < 0
  ) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.eligibilityInvalid,
      "Provider-request payment readiness is invalid.",
    );
  }

  if (input.downPaymentAmount === 0) {
    return;
  }

  if (
    input.providerRequestPaymentStatus !== "paid" ||
    input.paymentStatus !== "paid" ||
    !(input.paidAt instanceof Timestamp)
  ) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.transitionInvalid,
      "The required down payment must be confirmed before preparation begins.",
    );
  }
}

export function assertCancellationSubmissionAllowed(
  status: ProviderRequestStatus,
): void {
  if (
    !CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES.includes(
      status as (typeof CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES)[number],
    )
  ) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.cancellationNotAllowed,
      "This provider request cannot enter cancellation.",
    );
  }
}

export function assertEligibilityLifecycleInvariant(input: {
  providerRequestStatus: ProviderRequestStatus;
  state: RefundEligibilityState<unknown>;
}): void {
  const {providerRequestStatus, state} = input;

  if (
    providerRequestStatus === "in_progress" &&
    state.currentStage !== "service_started"
  ) {
    throw policyEvidenceInvalid();
  }

  if (
    (
      providerRequestStatus === "waiting_for_down_payment" ||
      providerRequestStatus === "payment_processing"
    ) &&
    state.currentStage !== "preparation_not_started"
  ) {
    throw policyEvidenceInvalid();
  }

  if (
    providerRequestStatus === "confirmed" &&
    state.currentStage === "service_started"
  ) {
    throw policyEvidenceInvalid();
  }
}

export function cancellationInitialStatus(input: {
  policyEvidenceStatus: CancellationPolicyEvidenceStatus;
  paymentResolutionPending: boolean;
}): ProviderRequestCancellationStatus {
  if (input.paymentResolutionPending) {
    return "awaiting_payment_resolution";
  }

  return input.policyEvidenceStatus === "legacy"
    ? "under_review"
    : "submitted";
}

export function assertCancellationStatusTransition(
  currentValue: unknown,
  targetValue: unknown,
): void {
  const currentStatus = parseProviderRequestCancellationStatus(
    currentValue,
  );
  const targetStatus = parseProviderRequestCancellationStatus(
    targetValue,
  );

  if (!CANCELLATION_TRANSITIONS[currentStatus].includes(targetStatus)) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.cancellationNotAllowed,
      "Cancellation request cannot make that transition.",
    );
  }
}

export function parseProviderRequestCancellationStatus(
  value: unknown,
): ProviderRequestCancellationStatus {
  if (
    typeof value !== "string" ||
    !PROVIDER_REQUEST_CANCELLATION_STATUSES.includes(
      value as ProviderRequestCancellationStatus,
    )
  ) {
    throw cancellationError(
      "failed-precondition",
      REFUND_CANCELLATION_ERROR_REASONS.cancellationNotAllowed,
      "Cancellation request status is invalid.",
    );
  }

  return value as ProviderRequestCancellationStatus;
}

export function isCancellationWorkflowActive(
  value: unknown,
): boolean {
  return typeof value === "string" &&
    ACTIVE_CANCELLATION_STATUSES.has(
      value as ProviderRequestCancellationStatus,
    );
}

export function cancellationRequestIdForAttempt(input: {
  providerRequestId: string;
  customerId: string;
  operationKey: string;
}): string {
  return `cancellation_${createHash("sha256")
    .update([
      "provider-request",
      input.providerRequestId,
      "customer",
      input.customerId,
      "operation",
      input.operationKey,
    ].join(":"))
    .digest("hex")
    .slice(0, 40)}`;
}

export function legacyActiveCancellationRequestId(
  providerRequest: Record<string, unknown>,
): string | null {
  const value = providerRequest.activeCancellationRequestId;

  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^cancellation_[a-f0-9]{40}$/u.test(value)
  ) {
    throw policyEvidenceInvalid();
  }

  return value;
}

export function cancellationError(
  code: "invalid-argument" | "failed-precondition" | "permission-denied",
  reason: string,
  message: string,
  details: Record<string, unknown> = {},
): HttpsError {
  return new HttpsError(code, message, {
    reason,
    ...details,
  });
}

export function policyEvidenceInvalid(): HttpsError {
  return cancellationError(
    "failed-precondition",
    REFUND_CANCELLATION_ERROR_REASONS.policyEvidenceInvalid,
    "Cancellation policy evidence requires system review.",
  );
}
