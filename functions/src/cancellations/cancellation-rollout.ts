import {HttpsError} from "firebase-functions/v2/https";

export const CANCELLATION_REFUND_ROLLOUT_DOCUMENT_ID =
  "cancellationRefundRollout";
export const CANCELLATION_REFUND_ROLLOUT_SCHEMA_VERSION = 1 as const;

export const CANCELLATION_ROLLOUT_ERROR_REASONS = {
  invalid: "CANCELLATION_ROLLOUT_INVALID",
  disabled: "CUSTOMER_CANCELLATION_DISABLED",
} as const;

export type CancellationRefundRollout = {
  customerCancellationMode: "off" | "review_only" | "enabled";
  automaticPolicyRefundApprovalMode: "off" | "enabled";
};

const CLOSED_ROLLOUT: CancellationRefundRollout = {
  customerCancellationMode: "off",
  automaticPolicyRefundApprovalMode: "off",
};

export function parseCancellationRefundRollout(input: {
  exists: boolean;
  data: Readonly<Record<string, unknown>> | undefined;
}): CancellationRefundRollout {
  if (!input.exists) return CLOSED_ROLLOUT;

  const data = input.data;
  if (
    !data ||
    data.schemaVersion !== CANCELLATION_REFUND_ROLLOUT_SCHEMA_VERSION ||
    data.isPublic !== false ||
    (
      data.customerCancellationMode !== "off" &&
      data.customerCancellationMode !== "review_only" &&
      data.customerCancellationMode !== "enabled"
    ) ||
    (
      data.automaticPolicyRefundApprovalMode !== "off" &&
      data.automaticPolicyRefundApprovalMode !== "enabled"
    ) ||
    (
      data.automaticPolicyRefundApprovalMode === "enabled" &&
      data.customerCancellationMode !== "enabled"
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Customer cancellation rollout configuration is unavailable.",
      {reason: CANCELLATION_ROLLOUT_ERROR_REASONS.invalid},
    );
  }

  return {
    customerCancellationMode: data.customerCancellationMode,
    automaticPolicyRefundApprovalMode:
      data.automaticPolicyRefundApprovalMode,
  };
}

export function assertCustomerCancellationEnabled(
  rollout: CancellationRefundRollout,
): void {
  if (rollout.customerCancellationMode === "off") {
    throw new HttpsError(
      "failed-precondition",
      "Customer cancellation is not currently available.",
      {reason: CANCELLATION_ROLLOUT_ERROR_REASONS.disabled},
    );
  }
}
