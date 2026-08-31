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
    decision: null;
    refundCalculation: null;
    refundOperationId: null;
};
//# sourceMappingURL=refund-policy.d.ts.map