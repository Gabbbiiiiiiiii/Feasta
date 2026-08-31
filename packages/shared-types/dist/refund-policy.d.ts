export declare const REFUND_POLICY_SCHEMA_VERSION: 1;
export declare const REFUND_ELIGIBILITY_STAGES: readonly ["preparation_not_started", "preparation_started", "service_started"];
export type RefundEligibilityStage = (typeof REFUND_ELIGIBILITY_STAGES)[number];
export declare const REFUND_BASIS_POINTS_MIN = 0;
export declare const REFUND_BASIS_POINTS_MAX = 10000;
export declare const REFUND_POLICY_TERMS_MAX_LENGTH = 4000;
export type RefundPolicyRule = {
    stage: RefundEligibilityStage;
    refundBasisPoints: number;
};
export type RefundPolicy<TTimestamp = unknown> = {
    schemaVersion: typeof REFUND_POLICY_SCHEMA_VERSION;
    policyVersion: number;
    rules: readonly RefundPolicyRule[];
    terms: string | null;
    effectiveAt: TTimestamp;
};
export type RefundPolicySource = {
    kind: "provider_default";
    sourceId: string;
    policyVersion: number;
} | {
    kind: "package_override";
    sourceId: string;
    policyVersion: number;
};
export type EffectiveRefundPolicy<TTimestamp = unknown> = {
    effectivePolicyKey: string;
    source: RefundPolicySource;
    policy: RefundPolicy<TTimestamp>;
};
export declare const REFUND_POLICY_AGREEMENT_SCHEMA_VERSION: 1;
export declare const REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION: 1;
export type RefundPolicyAcknowledgement = {
    providerId: string;
    effectivePolicyKey: string;
};
export type EffectiveRefundPolicyDisclosure = {
    providerId: string;
    providerName: string;
    effectivePolicyKey: string;
    sourceKind: RefundPolicySource["kind"];
    policyVersion: number;
    rules: readonly RefundPolicyRule[];
    terms: string | null;
};
export type RefundPolicySnapshot<TTimestamp = unknown> = {
    schemaVersion: typeof REFUND_POLICY_SCHEMA_VERSION;
    policyKey: string;
    source: RefundPolicySource;
    rules: readonly RefundPolicyRule[];
    terms: string | null;
    capturedAt: TTimestamp;
};
export type CustomerRefundPolicyAgreement<TTimestamp = unknown> = {
    schemaVersion: typeof REFUND_POLICY_AGREEMENT_SCHEMA_VERSION;
    policyKey: string;
    agreedAt: TTimestamp;
    channel: "booking_submission";
};
export type RefundEligibilityState<TTimestamp = unknown> = {
    schemaVersion: typeof REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION;
    currentStage: RefundEligibilityStage;
    stageSequence: number;
    enteredAt: TTimestamp;
    activeCancellationRequestId: string | null;
};
export declare const PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION: 1;
export declare const PROVIDER_REQUEST_CANCELLATION_STATUSES: readonly ["submitted", "awaiting_payment_resolution", "under_review", "approved", "rejected", "refund_processing", "refund_failed", "refund_completed", "cancelled_no_refund"];
export type ProviderRequestCancellationStatus = (typeof PROVIDER_REQUEST_CANCELLATION_STATUSES)[number];
export type FrozenRefundEligibility<TTimestamp = unknown> = {
    stage: RefundEligibilityStage;
    stageSequence: number;
    frozenAt: TTimestamp;
};
export type ProviderRequestCancellationRequest<TTimestamp = unknown> = {
    schemaVersion: typeof PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION;
    mainEventId: string;
    providerRequestId: string;
    customerId: string;
    providerId: string;
    status: ProviderRequestCancellationStatus;
    reason: string;
    policyEvidenceStatus: "policy_backed" | "legacy";
    frozenEligibility: FrozenRefundEligibility<TTimestamp> | null;
    submittedAt: TTimestamp;
    updatedAt: TTimestamp;
    decision: CancellationDecision<TTimestamp> | null;
    refundCalculation: RefundCalculation | null;
    refundOperationId: string | null;
    refundOperationIds: readonly string[];
};
export type CancellationDecision<TTimestamp = unknown> = {
    outcome: "approved" | "rejected";
    decidedAt: TTimestamp;
    reason: string | null;
};
export declare const REFUND_CALCULATION_SCHEMA_VERSION: 1;
export declare const REFUND_ACCOUNTING_SCHEMA_VERSION: 1;
export declare const REFUND_OPERATION_SCHEMA_VERSION: 1;
export type RefundCalculationStatus = "calculated" | "manual_review_required" | "nothing_refundable";
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
    currency: "PHP";
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
export type RefundCalculation = CalculatedRefund | ManualReviewRefundCalculation;
export type RefundPaymentAccounting = {
    refundAccountingSchemaVersion: typeof REFUND_ACCOUNTING_SCHEMA_VERSION;
    refundedAmountInCentavos: number;
    refundReservedAmountInCentavos: number;
};
export declare const REFUND_OPERATION_STATUSES: readonly ["reserved", "processing", "completed", "failed", "released"];
export type RefundOperationStatus = (typeof REFUND_OPERATION_STATUSES)[number];
export type RefundOperation<TTimestamp = unknown> = {
    schemaVersion: typeof REFUND_OPERATION_SCHEMA_VERSION;
    providerRequestId: string;
    mainEventId: string;
    cancellationRequestId: string;
    amountInCentavos: number;
    currency: "PHP";
    status: RefundOperationStatus;
    createdAt: TTimestamp;
    updatedAt: TTimestamp;
    completedAt: TTimestamp | null;
    failureCode: string | null;
    operationKey: string;
    calculation: CalculatedRefund;
    gateway: "paymongo";
    gatewayPaymentId: string | null;
    gatewayRefundId: string | null;
    gatewayStatus: "pending" | "processing" | "succeeded" | "failed" | null;
    gatewayExecutionKey: string;
    gatewayFailureCertainty: "not_sent" | "gateway_rejected" | "ambiguous" | null;
    gatewayRequestedAt: TTimestamp | null;
    gatewayAcceptedAt: TTimestamp | null;
    gatewayReconciledAt: TTimestamp | null;
    executionAttemptCount: number;
    lastExecutionAt: TTimestamp | null;
};
//# sourceMappingURL=refund-policy.d.ts.map