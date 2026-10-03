import type {
  ParticipantRefundProgressStatus,
  ProviderRequestCancellationStatus,
  RefundEligibilityStage,
} from "@feasta/shared-types";

export type AdminCancellationCalculationStatus =
  | "pending_backend_calculation"
  | "manual_review_required"
  | "calculated"
  | "nothing_refundable";

export type AdminCancellationQueueItem = {
  cancellationRequestId: string;
  providerRequestId: string;
  bookingCode: string;
  providerName: string;
  customerName: string;
  customerEmail: string | null;
  providerRequestStatus: string;
  cancellationStatus: ProviderRequestCancellationStatus;
  policyEvidenceStatus: "policy_backed" | "legacy";
  frozenStage: RefundEligibilityStage | null;
  customerReason: string;
  decisionReason: string | null;
  calculationStatus: AdminCancellationCalculationStatus;
  refundAmountInCentavos: number | null;
  completedRefundAmountInCentavos: number | null;
  currency: "PHP" | null;
  paymentStatus: string | null;
  operationStatus: "reserved" | "processing" | "completed" | "failed" | "released" | null;
  refundProgress: ParticipantRefundProgressStatus;
  reconciliationRequired: boolean;
  canApprove: boolean;
  canReject: boolean;
  canProcessRefund: boolean;
  canRetryRefund: boolean;
  submittedAt: string;
  updatedAt: string;
};

export type AdminCancellationQueue = {
  items: AdminCancellationQueueItem[];
  skippedMalformedCount: number;
};

export type AdminCancellationApprovalResult = {
  cancellationRequestId: string;
  providerRequestId: string;
  mainEventId: string;
  cancellationStatus: "approved" | "cancelled_no_refund";
  providerRequestStatus: "cancelled";
  mainEventStatus: string;
  refundOperationId: string | null;
  refundAmountInCentavos: number;
  currency: "PHP";
  idempotentReplay: boolean;
};

export type AdminCancellationRejectionResult = {
  cancellationRequestId: string;
  providerRequestId: string;
  mainEventId: string;
  cancellationStatus: "rejected";
  idempotentReplay: boolean;
};

export type AdminCancellationExecutionResult = {
  cancellationRequestId: string;
  providerRequestId: string;
  paymentId: string;
  refundOperationId: string;
  status: "processing" | "completed" | "failed";
  gatewayStatus: string | null;
  idempotentReplay: boolean;
};
