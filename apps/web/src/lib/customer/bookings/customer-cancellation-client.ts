"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {
  PROVIDER_REQUEST_CANCELLATION_STATUSES,
  REFUND_BASIS_POINTS_MAX,
  REFUND_BASIS_POINTS_MIN,
  REFUND_ELIGIBILITY_STAGES,
  REFUND_POLICY_TERMS_MAX_LENGTH,
  type CustomerCancellationReasonCode,
  type ParticipantRefundProgressStatus,
  type ProviderRequestCancellationStatus,
  type RefundEligibilityStage,
} from "@feasta/shared-types";

import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const OPTIONS_FUNCTION = "getProviderRequestCancellationOptions";
const STATUS_FUNCTION = "getProviderRequestCancellationStatus";
const SUBMIT_FUNCTION = "submitProviderRequestCancellation";
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{8,160}$/u;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,200}$/u;

const CANCELLATION_REASON_CODES = new Set<CustomerCancellationReasonCode>([
  "ALLOWED",
  "ROLLOUT_DISABLED",
  "ACTIVE_CANCELLATION_EXISTS",
  "PROVIDER_REQUEST_STATUS_INELIGIBLE",
  "PAYMENT_RECONCILIATION_REQUIRED",
  "LEGACY_MANUAL_REVIEW",
]);

const REFUND_PROGRESS_STATUSES = new Set<ParticipantRefundProgressStatus>([
  "none",
  "manual_review",
  "approved",
  "processing",
  "failed_retry_pending",
  "failed_reconciliation_required",
  "partial_completed",
  "full_completed",
]);

export type CustomerCancellationPolicy = {
  sourceKind: "provider_default" | "package_override";
  policyVersion: number;
  rules: readonly {
    stage: RefundEligibilityStage;
    refundBasisPoints: number;
  }[];
  terms: string | null;
};

export type CustomerCancellationRefundPreview = {
  calculationStatus: "calculated" | "nothing_refundable";
  frozenStage: RefundEligibilityStage;
  refundAmountInCentavos: number;
  currency: "PHP";
};

export type CustomerCancellationProjection = {
  status: ProviderRequestCancellationStatus;
  policyEvidenceStatus: "policy_backed" | "legacy";
  frozenStage: RefundEligibilityStage | null;
  manualReviewRequired: boolean;
  decisionStatus: "pending" | "approved" | "rejected";
  refund: {
    status: ParticipantRefundProgressStatus;
    amountInCentavos: number | null;
    completedAmountInCentavos: number | null;
    currency: "PHP" | null;
  };
  submittedAt: string;
  updatedAt: string;
};

export type CustomerCancellationOptions = {
  providerRequestId: string;
  cancellationAllowed: boolean;
  reasonCode: CustomerCancellationReasonCode;
  activeCancellation: CustomerCancellationProjection | null;
  policy: CustomerCancellationPolicy | null;
  refundPreview: CustomerCancellationRefundPreview | null;
};

export type CustomerCancellationStatusResult = {
  providerRequestId: string;
  cancellation: CustomerCancellationProjection | null;
};

export type CustomerCancellationSubmissionResult = {
  providerRequestId: string;
  status: ProviderRequestCancellationStatus;
  policyEvidenceStatus: "policy_backed" | "legacy";
  manualReviewRequired: boolean;
  created: boolean;
};

export type SubmitCustomerCancellationInput = {
  providerRequestId: string;
  reason: string;
  idempotencyKey: string;
};

export async function getCustomerProviderRequestCancellationOptions(
  providerRequestId: string,
): Promise<CustomerCancellationOptions> {
  const normalizedId = requireProviderRequestId(providerRequestId);

  try {
    await requireCustomerSession();
    const response = await cancellationCallable(OPTIONS_FUNCTION)({
      providerRequestId: normalizedId,
    });
    return parseOptions(response.data, normalizedId);
  } catch (error: unknown) {
    throw normalizeCancellationError(error, "load");
  }
}

export async function getCustomerProviderRequestCancellationStatus(
  providerRequestId: string,
): Promise<CustomerCancellationStatusResult> {
  const normalizedId = requireProviderRequestId(providerRequestId);

  try {
    await requireCustomerSession();
    const response = await cancellationCallable(STATUS_FUNCTION)({
      providerRequestId: normalizedId,
    });
    return parseStatus(response.data, normalizedId);
  } catch (error: unknown) {
    throw normalizeCancellationError(error, "load");
  }
}

export async function submitCustomerProviderRequestCancellation(
  input: SubmitCustomerCancellationInput,
): Promise<CustomerCancellationSubmissionResult> {
  const providerRequestId = requireProviderRequestId(input.providerRequestId);
  const reason = input.reason.trim();
  const idempotencyKey = input.idempotencyKey.trim();

  if (reason.length < 5 || reason.length > 1_000) {
    throw new CustomerCancellationClientError(
      "invalid_input",
      "Enter a cancellation reason between 5 and 1,000 characters.",
    );
  }
  if (!SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new CustomerCancellationClientError(
      "secure_submission_unavailable",
      "Secure cancellation submission is unavailable. Refresh and try again.",
    );
  }

  try {
    await requireCustomerSession();
    const response = await cancellationCallable(SUBMIT_FUNCTION)({
      providerRequestId,
      reason,
      idempotencyKey,
    });
    return parseSubmission(response.data, providerRequestId);
  } catch (error: unknown) {
    throw normalizeCancellationError(error, "submit");
  }
}

export function createCustomerCancellationIdempotencyKey(
  providerRequestId: string,
): string {
  requireProviderRequestId(providerRequestId);
  const randomId = globalThis.crypto?.randomUUID?.();

  if (!randomId) {
    throw new CustomerCancellationClientError(
      "secure_submission_unavailable",
      "Secure cancellation submission is unavailable. Refresh and try again.",
    );
  }

  return ["customer-cancellation", randomId].join(":");
}

function cancellationCallable(name: string) {
  initializeBrowserAppCheck();
  return httpsCallable<Record<string, unknown>, unknown>(
    functions,
    name,
    {timeout: 30_000},
  );
}

async function requireCustomerSession() {
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new CustomerCancellationClientError(
      "session_expired",
      "Your session has expired. Sign in again to manage this cancellation.",
    );
  }
}

function parseOptions(value: unknown, expectedId: string): CustomerCancellationOptions {
  const record = requireRecord(value);
  const providerRequestId = matchingProviderRequestId(
    record.providerRequestId,
    expectedId,
  );
  if (typeof record.cancellationAllowed !== "boolean") throw invalidResponse();
  if (
    typeof record.reasonCode !== "string" ||
    !CANCELLATION_REASON_CODES.has(record.reasonCode as CustomerCancellationReasonCode)
  ) {
    throw invalidResponse();
  }

  const activeCancellation = record.activeCancellation === null
    ? null
    : parseProjection(record.activeCancellation, expectedId);
  const policy = record.policy === null ? null : parsePolicy(record.policy);
  const refundPreview = record.refundPreview === null
    ? null
    : parseRefundPreview(record.refundPreview);
  const reasonCode = record.reasonCode as CustomerCancellationReasonCode;
  const shouldAllow = reasonCode === "ALLOWED" ||
    reasonCode === "PAYMENT_RECONCILIATION_REQUIRED" ||
    reasonCode === "LEGACY_MANUAL_REVIEW";

  if (
    record.cancellationAllowed !== shouldAllow ||
    (reasonCode === "ACTIVE_CANCELLATION_EXISTS" && activeCancellation === null) ||
    (activeCancellation !== null && record.cancellationAllowed) ||
    (reasonCode === "LEGACY_MANUAL_REVIEW" && (policy !== null || refundPreview !== null)) ||
    (refundPreview !== null && policy === null)
  ) {
    throw invalidResponse();
  }

  return {
    providerRequestId,
    cancellationAllowed: record.cancellationAllowed,
    reasonCode,
    activeCancellation,
    policy,
    refundPreview,
  };
}

function parseStatus(value: unknown, expectedId: string): CustomerCancellationStatusResult {
  const record = requireRecord(value);
  return {
    providerRequestId: matchingProviderRequestId(record.providerRequestId, expectedId),
    cancellation: record.cancellation === null
      ? null
      : parseProjection(record.cancellation, expectedId),
  };
}

function parseSubmission(
  value: unknown,
  expectedId: string,
): CustomerCancellationSubmissionResult {
  const record = requireRecord(value);
  requireDocumentId(record.cancellationRequestId);
  const providerRequestId = matchingProviderRequestId(
    record.providerRequestId,
    expectedId,
  );
  const status = requireCancellationStatus(record.status);
  const policyEvidenceStatus = requirePolicyEvidenceStatus(
    record.policyEvidenceStatus,
  );
  if (
    typeof record.manualReviewRequired !== "boolean" ||
    typeof record.created !== "boolean"
  ) {
    throw invalidResponse();
  }

  if (policyEvidenceStatus === "legacy") {
    if (record.frozenEligibility !== null) throw invalidResponse();
  } else {
    const frozen = requireRecord(record.frozenEligibility);
    requireStage(frozen.stage);
    if (!Number.isSafeInteger(frozen.stageSequence) || (frozen.stageSequence as number) < 0) {
      throw invalidResponse();
    }
  }

  return {
    providerRequestId,
    status,
    policyEvidenceStatus,
    manualReviewRequired: record.manualReviewRequired,
    created: record.created,
  };
}

function parseProjection(value: unknown, expectedId: string): CustomerCancellationProjection {
  const record = requireRecord(value);
  requireDocumentId(record.cancellationRequestId);
  matchingProviderRequestId(record.providerRequestId, expectedId);
  const status = requireCancellationStatus(record.status);
  const policyEvidenceStatus = requirePolicyEvidenceStatus(record.policyEvidenceStatus);
  const frozenStage = record.frozenStage === null ? null : requireStage(record.frozenStage);
  if (
    typeof record.manualReviewRequired !== "boolean" ||
    (record.decisionStatus !== "pending" &&
      record.decisionStatus !== "approved" &&
      record.decisionStatus !== "rejected")
  ) {
    throw invalidResponse();
  }
  if (policyEvidenceStatus === "legacy" && frozenStage !== null) throw invalidResponse();

  const refund = requireRecord(record.refund);
  if (
    typeof refund.status !== "string" ||
    !REFUND_PROGRESS_STATUSES.has(refund.status as ParticipantRefundProgressStatus)
  ) {
    throw invalidResponse();
  }
  const amountInCentavos = optionalCentavos(refund.amountInCentavos);
  const completedAmountInCentavos = optionalCentavos(refund.completedAmountInCentavos);
  const currency = refund.currency === null ? null : refund.currency;
  if (
    (currency !== null && currency !== "PHP") ||
    (amountInCentavos !== null && currency !== "PHP") ||
    (completedAmountInCentavos !== null && currency !== "PHP")
  ) {
    throw invalidResponse();
  }

  return {
    status,
    policyEvidenceStatus,
    frozenStage,
    manualReviewRequired: record.manualReviewRequired,
    decisionStatus: record.decisionStatus,
    refund: {
      status: refund.status as ParticipantRefundProgressStatus,
      amountInCentavos,
      completedAmountInCentavos,
      currency,
    },
    submittedAt: requireIsoDate(record.submittedAt),
    updatedAt: requireIsoDate(record.updatedAt),
  };
}

function parsePolicy(value: unknown): CustomerCancellationPolicy {
  const record = requireRecord(value);
  boundedString(record.policyKey, 180);
  if (
    record.sourceKind !== "provider_default" &&
    record.sourceKind !== "package_override"
  ) {
    throw invalidResponse();
  }
  if (!Number.isSafeInteger(record.policyVersion) || (record.policyVersion as number) < 1) {
    throw invalidResponse();
  }
  if (!Array.isArray(record.rules) || record.rules.length !== REFUND_ELIGIBILITY_STAGES.length) {
    throw invalidResponse();
  }

  const rules = new Map<RefundEligibilityStage, number>();
  for (const candidate of record.rules) {
    const rule = requireRecord(candidate);
    const stage = requireStage(rule.stage);
    if (
      rules.has(stage) ||
      !Number.isSafeInteger(rule.refundBasisPoints) ||
      (rule.refundBasisPoints as number) < REFUND_BASIS_POINTS_MIN ||
      (rule.refundBasisPoints as number) > REFUND_BASIS_POINTS_MAX
    ) {
      throw invalidResponse();
    }
    rules.set(stage, rule.refundBasisPoints as number);
  }

  const terms = record.terms;
  if (
    terms !== null &&
    (typeof terms !== "string" || terms.length > REFUND_POLICY_TERMS_MAX_LENGTH)
  ) {
    throw invalidResponse();
  }

  return {
    sourceKind: record.sourceKind,
    policyVersion: record.policyVersion as number,
    rules: REFUND_ELIGIBILITY_STAGES.map((stage) => ({
      stage,
      refundBasisPoints: rules.get(stage)!,
    })),
    terms,
  };
}

function parseRefundPreview(value: unknown): CustomerCancellationRefundPreview {
  const record = requireRecord(value);
  if (
    record.calculationStatus !== "calculated" &&
    record.calculationStatus !== "nothing_refundable"
  ) {
    throw invalidResponse();
  }
  if (record.currency !== "PHP") throw invalidResponse();

  return {
    calculationStatus: record.calculationStatus,
    frozenStage: requireStage(record.frozenStage),
    refundAmountInCentavos: requireCentavos(record.refundAmountInCentavos),
    currency: "PHP",
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  return value as Record<string, unknown>;
}

function matchingProviderRequestId(value: unknown, expectedId: string): string {
  const providerRequestId = requireProviderRequestId(value);
  if (providerRequestId !== expectedId) throw invalidResponse();
  return providerRequestId;
}

function requireProviderRequestId(value: unknown): string {
  if (typeof value !== "string") throw invalidResponse();
  const normalized = value.trim();
  if (!SAFE_DOCUMENT_ID.test(normalized)) throw invalidResponse();
  return normalized;
}

function requireDocumentId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_DOCUMENT_ID.test(value)) throw invalidResponse();
  return value;
}

function requireCancellationStatus(value: unknown): ProviderRequestCancellationStatus {
  if (
    typeof value !== "string" ||
    !PROVIDER_REQUEST_CANCELLATION_STATUSES.includes(
      value as ProviderRequestCancellationStatus,
    )
  ) {
    throw invalidResponse();
  }
  return value as ProviderRequestCancellationStatus;
}

function requirePolicyEvidenceStatus(value: unknown): "policy_backed" | "legacy" {
  if (value !== "policy_backed" && value !== "legacy") throw invalidResponse();
  return value;
}

function requireStage(value: unknown): RefundEligibilityStage {
  if (
    typeof value !== "string" ||
    !REFUND_ELIGIBILITY_STAGES.includes(value as RefundEligibilityStage)
  ) {
    throw invalidResponse();
  }
  return value as RefundEligibilityStage;
}

function optionalCentavos(value: unknown): number | null {
  return value === null ? null : requireCentavos(value);
}

function requireCentavos(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalidResponse();
  return value as number;
}

function requireIsoDate(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw invalidResponse();
  }
  return value;
}

function boundedString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value || value.length > maximum) throw invalidResponse();
  return value;
}

class CustomerCancellationClientError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "CustomerCancellationClientError";
  }
}

function invalidResponse(): CustomerCancellationClientError {
  return new CustomerCancellationClientError(
    "invalid_response",
    "FEASTA received invalid cancellation details. Refresh and try again.",
  );
}

function normalizeCancellationError(
  error: unknown,
  operation: "load" | "submit",
): CustomerCancellationClientError {
  if (error instanceof CustomerCancellationClientError) return error;
  if (!(error instanceof FirebaseError)) {
    return new CustomerCancellationClientError(
      "unknown",
      operation === "submit"
        ? "Your cancellation request could not be submitted. Please try again or contact FEASTA support."
        : "Cancellation information could not be loaded. Please try again or contact FEASTA support.",
    );
  }

  const code = error.code.replace(/^functions[/:]/u, "");
  const reason = callableErrorReason(error);
  if (code === "unauthenticated") {
    return new CustomerCancellationClientError(
      "session_expired",
      "Your session has expired. Sign in again to manage this cancellation.",
    );
  }
  if (code === "permission-denied" || code === "not-found") {
    return new CustomerCancellationClientError(
      "unavailable",
      "This Provider service is not available for cancellation.",
    );
  }
  if (
    reason === "CANCELLATION_POLICY_EVIDENCE_INVALID" ||
    reason === "REFUND_POLICY_EVIDENCE_INVALID" ||
    reason === "REFUND_CALCULATION_NOT_AVAILABLE"
  ) {
    return new CustomerCancellationClientError(
      "invalid_evidence",
      "This cancellation request cannot be processed automatically right now. Please contact FEASTA support.",
    );
  }
  if (reason === "CANCELLATION_ALREADY_ACTIVE") {
    return new CustomerCancellationClientError(
      "already_active",
      "A cancellation request is already active for this Provider service. Refresh to view its status.",
    );
  }
  if (reason === "CANCELLATION_PAYMENT_RESOLUTION_REQUIRED") {
    return new CustomerCancellationClientError(
      "payment_resolution",
      "FEASTA must resolve the current payment state before this cancellation can continue.",
    );
  }
  if (reason === "REFUND_MANUAL_REVIEW_REQUIRED") {
    return new CustomerCancellationClientError(
      "manual_review",
      "This cancellation requires manual FEASTA review before any refund decision.",
    );
  }
  if (
    code === "failed-precondition" ||
    reason === "CANCELLATION_NOT_ALLOWED" ||
    reason === "CUSTOMER_CANCELLATION_DISABLED"
  ) {
    return new CustomerCancellationClientError(
      "not_allowed",
      "This Provider service cannot be cancelled through the Customer workflow right now.",
    );
  }
  if (code === "invalid-argument") {
    return new CustomerCancellationClientError(
      "invalid_input",
      "Check the cancellation reason and try again.",
    );
  }
  if (code === "resource-exhausted") {
    return new CustomerCancellationClientError(
      "rate_limited",
      "Too many cancellation attempts were made. Wait a moment and try again.",
    );
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return new CustomerCancellationClientError(
      "temporarily_unavailable",
      "Cancellation services are temporarily unavailable. Please try again.",
    );
  }

  return new CustomerCancellationClientError(
    "unknown",
    operation === "submit"
      ? "Your cancellation request could not be submitted. Please try again or contact FEASTA support."
      : "Cancellation information could not be loaded. Please try again or contact FEASTA support.",
  );
}

function callableErrorReason(error: FirebaseError): string | null {
  const details = (error as FirebaseError & {details?: unknown}).details;
  const values = [details, error.customData?.details, error.customData];

  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const reason = (value as Record<string, unknown>).reason;
      if (typeof reason === "string" && reason.length <= 100) return reason;
    }
  }
  return null;
}
