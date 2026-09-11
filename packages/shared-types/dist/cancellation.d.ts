import type { RefundEligibilityStage, RefundPolicyRule, RefundPolicySource, ProviderRequestCancellationStatus } from "./refund-policy.js";
/** Browser-safe cancellation/refund presentation types. */
export type ParticipantRefundProgressStatus = "none" | "manual_review" | "approved" | "processing" | "failed_retry_pending" | "failed_reconciliation_required" | "partial_completed" | "full_completed";
export type ParticipantRefundProjection = {
    status: ParticipantRefundProgressStatus;
    amountInCentavos: number | null;
    completedAmountInCentavos: number | null;
    currency: "PHP" | null;
};
export type ParticipantCancellationProjection = {
    cancellationRequestId: string;
    providerRequestId: string;
    status: ProviderRequestCancellationStatus;
    policyEvidenceStatus: "policy_backed" | "legacy";
    frozenStage: RefundEligibilityStage | null;
    manualReviewRequired: boolean;
    decisionStatus: "pending" | "approved" | "rejected";
    refund: ParticipantRefundProjection;
    submittedAt: string;
    updatedAt: string;
};
export type CancellationPolicyDisclosure = {
    policyKey: string;
    sourceKind: RefundPolicySource["kind"];
    policyVersion: number;
    rules: readonly RefundPolicyRule[];
    terms: string | null;
};
export type CancellationRefundPreview = {
    calculationStatus: "calculated" | "nothing_refundable";
    frozenStage: RefundEligibilityStage;
    refundAmountInCentavos: number;
    currency: "PHP";
};
export type CustomerCancellationReasonCode = "ALLOWED" | "ROLLOUT_DISABLED" | "ACTIVE_CANCELLATION_EXISTS" | "PROVIDER_REQUEST_STATUS_INELIGIBLE" | "PAYMENT_RECONCILIATION_REQUIRED" | "LEGACY_MANUAL_REVIEW";
export type CustomerCancellationOptions = {
    providerRequestId: string;
    cancellationAllowed: boolean;
    reasonCode: CustomerCancellationReasonCode;
    activeCancellation: ParticipantCancellationProjection | null;
    policy: CancellationPolicyDisclosure | null;
    refundPreview: CancellationRefundPreview | null;
};
export type ParticipantCancellationStatusResult = {
    providerRequestId: string;
    cancellation: ParticipantCancellationProjection | null;
};
export type RefundReconciliationInspection = {
    cancellationRequestId: string;
    providerRequestId: string;
    paymentId: string | null;
    refundOperationId: string | null;
    cancellationStatus: ProviderRequestCancellationStatus;
    operationStatus: "reserved" | "processing" | "completed" | "failed" | "released" | null;
    refundAmountInCentavos: number | null;
    currency: "PHP" | null;
    gatewayStatus: "pending" | "processing" | "succeeded" | "failed" | null;
    failureCode: string | null;
    reconciliationRequired: boolean;
    updatedAt: string;
};
//# sourceMappingURL=cancellation.d.ts.map