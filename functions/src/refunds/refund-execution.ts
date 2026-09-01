import {Timestamp} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from "firebase-functions/v2/https";

import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";
import {
  assertCancellationStatusTransition,
  assertCancellationSubmissionAllowed,
  parseProviderRequestCancellationStatus,
} from "../cancellations/refund-cancellation-domain.js";
import {
  canonicalPaymentLinkageReason,
  canonicalRequestLinkageReason,
  paymentIdForProviderRequest,
} from "../payments/payment-lifecycle.js";
import {
  createPayMongoRefund,
  payMongoFailureCertainty,
  type PayMongoFailureCertainty,
  type PayMongoRefundResource,
} from "../payments/paymongo-client.js";
import {
  calculateMainEventRequestSummary,
} from "../provider-requests/recalculate-main-event-status.js";
import {
  requireSafeDocumentId,
} from "../refund-policies/refund-policy-domain.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  isMainEventStatusTransitionAllowed,
  isProviderRequestStatusTransitionAllowed,
  parseMainEventStatus,
  parseProviderRequestStatus,
  PAYMENT_CURRENCY,
  USER_ROLES,
  type MainEventStatus,
} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  requireObject,
  requireString,
} from "../shared/validation.js";
import {
  REFUND_ACCOUNTING_ERROR_REASONS,
  REFUND_ACCOUNTING_SCHEMA_VERSION,
  REFUND_OPERATION_SCHEMA_VERSION,
  assertRefundOperationTransition,
  calculateCancellationRefund,
  derivePaymentRefundStatus,
  gatewayRefundIdempotencyKey,
  readRefundAccounting,
  refundAccountingError,
  refundOperationId,
} from "./refund-accounting-domain.js";
import {refundOperationKey} from "./refund-accounting.js";

const payMongoSecretKey = defineSecret("PAYMONGO_SECRET_KEY");
const callableOptions = {
  ...appCheckCallableOptions,
  timeoutSeconds: 30,
} as const;

export const REFUND_EXECUTION_ERROR_REASONS = {
  decisionNotAllowed: "CANCELLATION_DECISION_NOT_ALLOWED",
  alreadyDecided: "CANCELLATION_ALREADY_DECIDED",
  approvalConflict: "CANCELLATION_APPROVAL_CONFLICT",
  executionNotAllowed: "REFUND_EXECUTION_NOT_ALLOWED",
  operationNotFound: "REFUND_OPERATION_NOT_FOUND",
  operationCompleted: "REFUND_OPERATION_ALREADY_COMPLETED",
  gatewayRejected: "REFUND_GATEWAY_REJECTED",
  gatewayNotSent: "REFUND_GATEWAY_NOT_SENT",
  gatewayAmbiguous: "REFUND_GATEWAY_AMBIGUOUS",
  gatewayLinkageInvalid: "REFUND_GATEWAY_LINKAGE_INVALID",
  webhookMismatch: "REFUND_WEBHOOK_MISMATCH",
  reconciliationRequired: "REFUND_RECONCILIATION_REQUIRED",
  retryNotAllowed: "REFUND_RETRY_NOT_ALLOWED",
  gatewayMinimumUnsupported: "REFUND_GATEWAY_MINIMUM_UNSUPPORTED",
  paymentCapabilityUnconfirmed: "REFUND_PAYMENT_CAPABILITY_UNCONFIRMED",
} as const;

type ApprovalResult = {
  cancellationRequestId: string;
  providerRequestId: string;
  mainEventId: string;
  cancellationStatus: "approved" | "cancelled_no_refund";
  providerRequestStatus: "cancelled";
  mainEventStatus: MainEventStatus;
  refundOperationId: string | null;
  refundAmountInCentavos: number;
  currency: typeof PAYMENT_CURRENCY;
  idempotentReplay: boolean;
};

type RejectionResult = {
  cancellationRequestId: string;
  providerRequestId: string;
  mainEventId: string;
  cancellationStatus: "rejected";
  idempotentReplay: boolean;
};

type ExecutionResult = {
  cancellationRequestId: string;
  providerRequestId: string;
  paymentId: string;
  refundOperationId: string;
  status: "processing" | "completed" | "failed";
  gatewayStatus: string | null;
  idempotentReplay: boolean;
};

export const approveProviderRequestCancellationRefund = onCall(
  callableOptions,
  async (request): Promise<ApprovalResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    await enforceCallableRateLimit(request, {
      scope: "cancellations.approveRefund",
      limit: 20,
      windowSeconds: 60 * 60,
    });
    const input = exactInput(request, [
      "cancellationRequestId",
      "idempotencyKey",
    ]);
    const cancellationRequestId = requireSafeDocumentId(
      requireString(input.cancellationRequestId, "cancellationRequestId", {
        minLength: 8,
        maxLength: 160,
      }),
      "Cancellation request",
    );
    const clientKey = requireString(input.idempotencyKey, "idempotencyKey", {
      minLength: 8,
      maxLength: 200,
    });
    const operationKey = createIdempotencyKey({
      operation: "approveProviderRequestCancellationRefund",
      actorId: actor.uid,
      clientKey,
      payload: {cancellationRequestId},
    });
    const execution = await executeIdempotently({
      key: operationKey,
      operation: "approveProviderRequestCancellationRefund",
      actorId: actor.uid,
      handler: () => approveCancellation({
        cancellationRequestId,
        actorId: actor.uid,
      }),
    });
    return {...execution.result, idempotentReplay: execution.replayed};
  },
);

export const rejectProviderRequestCancellation = onCall(
  callableOptions,
  async (request): Promise<RejectionResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    await enforceCallableRateLimit(request, {
      scope: "cancellations.reject",
      limit: 20,
      windowSeconds: 60 * 60,
    });
    const input = exactInput(request, [
      "cancellationRequestId",
      "reason",
      "idempotencyKey",
    ]);
    const cancellationRequestId = requireSafeDocumentId(
      requireString(input.cancellationRequestId, "cancellationRequestId", {
        minLength: 8,
        maxLength: 160,
      }),
      "Cancellation request",
    );
    const reason = requireString(input.reason, "reason", {
      minLength: 5,
      maxLength: 500,
    });
    const clientKey = requireString(input.idempotencyKey, "idempotencyKey", {
      minLength: 8,
      maxLength: 200,
    });
    const operationKey = createIdempotencyKey({
      operation: "rejectProviderRequestCancellation",
      actorId: actor.uid,
      clientKey,
      payload: {cancellationRequestId, reason},
    });
    const execution = await executeIdempotently({
      key: operationKey,
      operation: "rejectProviderRequestCancellation",
      actorId: actor.uid,
      handler: () => rejectCancellation({
        cancellationRequestId,
        actorId: actor.uid,
        reason,
      }),
    });
    return {...execution.result, idempotentReplay: execution.replayed};
  },
);

export const executeProviderRequestRefund = onCall(
  {
    ...callableOptions,
    secrets: [payMongoSecretKey],
  },
  async (request): Promise<ExecutionResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    await enforceCallableRateLimit(request, {
      scope: "refunds.execute",
      limit: 20,
      windowSeconds: 60 * 60,
    });
    const input = exactInput(request, [
      "cancellationRequestId",
      "idempotencyKey",
    ]);
    const cancellationRequestId = requireSafeDocumentId(
      requireString(input.cancellationRequestId, "cancellationRequestId", {
        minLength: 8,
        maxLength: 160,
      }),
      "Cancellation request",
    );
    const clientKey = requireString(input.idempotencyKey, "idempotencyKey", {
      minLength: 8,
      maxLength: 200,
    });
    const operationKey = createIdempotencyKey({
      operation: "executeProviderRequestRefund",
      actorId: actor.uid,
      clientKey,
      payload: {cancellationRequestId},
    });
    const execution = await executeIdempotently({
      key: operationKey,
      operation: "executeProviderRequestRefund",
      actorId: actor.uid,
      handler: () => executeRefund({
        cancellationRequestId,
        actorId: actor.uid,
      }),
    });
    return {...execution.result, idempotentReplay: execution.replayed};
  },
);

export async function approveCancellation(input: {
  cancellationRequestId: string;
  actorId: string;
}): Promise<Omit<ApprovalResult, "idempotentReplay">> {
  const cancellationReference = db.collection(
    "providerRequestCancellationRequests",
  ).doc(input.cancellationRequestId);

  return db.runTransaction(async (transaction) => {
    const cancellationSnapshot = await transaction.get(cancellationReference);
    if (!cancellationSnapshot.exists) throw operationNotFound();
    const cancellation = cancellationSnapshot.data() ?? {};
    const ids = cancellationIds(cancellation);
    const requestReference = db.collection("providerRequests").doc(
      ids.providerRequestId,
    );
    const mainEventReference = db.collection("mainEvents").doc(ids.mainEventId);
    const paymentId = paymentIdForProviderRequest(ids.providerRequestId);
    const paymentReference = db.collection("payments").doc(paymentId);
    const providerReference = db.collection("providers").doc(ids.providerId);
    const allRequestsQuery = db.collection("providerRequests")
      .where("mainEventId", "==", ids.mainEventId);
    const [requestSnapshot, mainEventSnapshot, paymentSnapshot,
      providerSnapshot, allRequestsSnapshot] = await Promise.all([
      transaction.get(requestReference),
      transaction.get(mainEventReference),
      transaction.get(paymentReference),
      transaction.get(providerReference),
      transaction.get(allRequestsQuery),
    ]);
    if (!requestSnapshot.exists || !mainEventSnapshot.exists ||
      !providerSnapshot.exists) throw approvalConflict();
    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    const payment = paymentSnapshot.exists ? paymentSnapshot.data() ?? {} : null;
    assertCancellationContext({
      cancellationRequestId: input.cancellationRequestId,
      cancellation,
      ids,
      providerRequest,
      mainEvent,
      payment,
      paymentId,
      provider: providerSnapshot.data() ?? {},
      allRequestDocuments: allRequestsSnapshot.docs,
    });
    const currentCancellationStatus = parseProviderRequestCancellationStatus(
      cancellation.status,
    );
    if (
      currentCancellationStatus === "approved" ||
      currentCancellationStatus === "refund_processing" ||
      currentCancellationStatus === "refund_failed" ||
      currentCancellationStatus === "refund_completed" ||
      currentCancellationStatus === "cancelled_no_refund"
    ) {
      if (decisionOutcome(cancellation.decision) !== "approved") {
        throw alreadyDecided();
      }
      return approvalResultFromStored({
        cancellationRequestId: input.cancellationRequestId,
        cancellation,
        providerRequest,
        mainEvent,
      });
    }
    if (currentCancellationStatus !== "submitted" &&
      currentCancellationStatus !== "under_review") {
      throw decisionNotAllowed();
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
        "Automatic policy refund approval is unavailable.",
      );
    }
    const eligibility = requireRefundEligibilityState(providerRequest);
    if (eligibility.activeCancellationRequestId !== input.cancellationRequestId) {
      throw approvalConflict();
    }
    const requestStatus = parseProviderRequestStatus(providerRequest.status);
    if (!requestStatus) throw approvalConflict();
    assertCancellationSubmissionAllowed(requestStatus);
    const approvedId = nullableId(providerRequest.approvedCancellationRequestId);
    if (approvedId !== null && approvedId !== input.cancellationRequestId) {
      throw approvalConflict();
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
        "Refund approval requires manual review.",
      );
    }
    if (!isProviderRequestStatusTransitionAllowed(requestStatus, "cancelled")) {
      throw decisionNotAllowed();
    }
    const currentMainEventStatus = parseMainEventStatus(mainEvent.status);
    if (!currentMainEventStatus) throw approvalConflict();
    const summary = calculateMainEventRequestSummary(
      allRequestsSnapshot.docs,
      currentMainEventStatus,
      [{providerRequestId: ids.providerRequestId, status: "cancelled"}],
    );
    if (summary.status !== currentMainEventStatus &&
      !isMainEventStatusTransitionAllowed(currentMainEventStatus, summary.status)) {
      throw approvalConflict();
    }
    const timestamp = serverTimestamp();
    const zeroRefund = calculation.eligibleRefundAmountInCentavos === 0;
    const nextCancellationStatus = zeroRefund
      ? "cancelled_no_refund" as const
      : "approved" as const;
    assertCancellationStatusTransition(
      currentCancellationStatus,
      nextCancellationStatus,
    );
    let operationId: string | null = null;

    if (!zeroRefund) {
      if (!payment) throw approvalConflict();
      const logicalOperationKey = refundOperationKey({
        cancellationRequestId: input.cancellationRequestId,
        logicalOperationKey: "approved-policy-cancellation",
      });
      operationId = refundOperationId({
        paymentId,
        cancellationRequestId: input.cancellationRequestId,
        operationKey: logicalOperationKey,
      });
      const operationReference = paymentReference.collection("refunds")
        .doc(operationId);
      const operationSnapshot = await transaction.get(operationReference);
      if (operationSnapshot.exists) throw approvalConflict();
      if (payment.refundExecutionLock !== undefined &&
        payment.refundExecutionLock !== null) throw approvalConflict();
      const accounting = readRefundAccounting(
        payment,
        calculation.originalPaidAmountInCentavos,
      );
      const requestedAmount = calculation.eligibleRefundAmountInCentavos;
      const nextReserved = accounting.refundReservedAmountInCentavos +
        requestedAmount;
      transaction.create(operationReference, {
        schemaVersion: REFUND_OPERATION_SCHEMA_VERSION,
        providerRequestId: ids.providerRequestId,
        mainEventId: ids.mainEventId,
        cancellationRequestId: input.cancellationRequestId,
        amountInCentavos: requestedAmount,
        currency: PAYMENT_CURRENCY,
        status: "reserved",
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        failureCode: null,
        operationKey: logicalOperationKey,
        calculation,
        gateway: "paymongo",
        gatewayPaymentId: requireGatewayPaymentId(payment.paymongoResourceId),
        gatewayRefundId: null,
        gatewayStatus: null,
        gatewayExecutionKey: gatewayRefundIdempotencyKey(operationId),
        gatewayFailureCertainty: null,
        gatewayRequestedAt: null,
        gatewayAcceptedAt: null,
        gatewayReconciledAt: null,
        executionAttemptCount: 0,
        lastExecutionAt: null,
      });
      transaction.update(paymentReference, {
        refundAccountingSchemaVersion: REFUND_ACCOUNTING_SCHEMA_VERSION,
        refundedAmountInCentavos: accounting.refundedAmountInCentavos,
        refundReservedAmountInCentavos: nextReserved,
        updatedAt: timestamp,
      });
    }

    transaction.update(cancellationReference, {
      status: nextCancellationStatus,
      decision: {
        outcome: "approved",
        decidedAt: timestamp,
        reason: null,
      },
      refundCalculation: calculation,
      refundOperationId: operationId,
      refundOperationIds: operationId ? [operationId] : [],
      updatedAt: timestamp,
    });
    transaction.update(requestReference, {
      status: "cancelled",
      statusUpdatedAt: timestamp,
      cancelledAt: timestamp,
      approvedCancellationRequestId: input.cancellationRequestId,
      refundEligibilityState: {
        ...eligibility,
        activeCancellationRequestId: null,
      },
      updatedAt: timestamp,
    });
    transaction.update(mainEventReference, mainEventUpdate({
      summary,
      currentStatus: currentMainEventStatus,
      timestamp,
    }));
    transaction.create(mainEventReference.collection("timeline").doc(), {
      type: zeroRefund
        ? "cancellation_approved_no_refund"
        : "cancellation_approved",
      title: zeroRefund
        ? "Provider Service Cancelled"
        : "Cancellation Approved",
      description: zeroRefund
        ? "The Provider service was cancelled with no refund due under the agreed policy."
        : "The Provider service was cancelled and its refund is ready for processing.",
      providerRequestId: ids.providerRequestId,
      providerId: ids.providerId,
      cancellationRequestId: input.cancellationRequestId,
      createdByRole: "admin",
      createdAt: timestamp,
    });
    notifyCancellationDecision(transaction, {
      customerId: ids.customerId,
      providerOwnerId: providerOwnerId(providerSnapshot.data() ?? {}),
      providerRequestId: ids.providerRequestId,
      cancellationRequestId: input.cancellationRequestId,
      approved: true,
      zeroRefund,
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: "admin",
      action: "cancellation_request.approved",
      targetCollection: "providerRequestCancellationRequests",
      targetId: input.cancellationRequestId,
      before: {status: currentCancellationStatus, providerRequestStatus: requestStatus},
      after: {
        status: nextCancellationStatus,
        providerRequestStatus: "cancelled",
        mainEventStatus: summary.status,
      },
      metadata: {
        mainEventId: ids.mainEventId,
        providerRequestId: ids.providerRequestId,
        paymentId: payment ? paymentId : null,
        refundOperationId: operationId,
        refundAmountInCentavos: calculation.eligibleRefundAmountInCentavos,
      },
    });
    return {
      cancellationRequestId: input.cancellationRequestId,
      providerRequestId: ids.providerRequestId,
      mainEventId: ids.mainEventId,
      cancellationStatus: nextCancellationStatus,
      providerRequestStatus: "cancelled",
      mainEventStatus: summary.status,
      refundOperationId: operationId,
      refundAmountInCentavos: calculation.eligibleRefundAmountInCentavos,
      currency: PAYMENT_CURRENCY,
    };
  });
}

export async function rejectCancellation(input: {
  cancellationRequestId: string;
  actorId: string;
  reason: string;
}): Promise<Omit<RejectionResult, "idempotentReplay">> {
  const cancellationReference = db.collection(
    "providerRequestCancellationRequests",
  ).doc(input.cancellationRequestId);
  return db.runTransaction(async (transaction) => {
    const cancellationSnapshot = await transaction.get(cancellationReference);
    if (!cancellationSnapshot.exists) throw operationNotFound();
    const cancellation = cancellationSnapshot.data() ?? {};
    const ids = cancellationIds(cancellation);
    const requestReference = db.collection("providerRequests")
      .doc(ids.providerRequestId);
    const mainEventReference = db.collection("mainEvents").doc(ids.mainEventId);
    const [requestSnapshot, mainEventSnapshot] = await transaction.getAll(
      requestReference,
      mainEventReference,
    );
    if (!requestSnapshot.exists || !mainEventSnapshot.exists) {
      throw approvalConflict();
    }
    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    if (canonicalRequestLinkageReason({
      providerRequestId: ids.providerRequestId,
      mainEventId: ids.mainEventId,
      customerId: ids.customerId,
      providerId: ids.providerId,
      providerRequest,
      mainEvent,
    })) throw approvalConflict();
    const currentStatus = parseProviderRequestCancellationStatus(
      cancellation.status,
    );
    if (currentStatus === "rejected") {
      if (decisionOutcome(cancellation.decision) !== "rejected") {
        throw alreadyDecided();
      }
      return {
        cancellationRequestId: input.cancellationRequestId,
        providerRequestId: ids.providerRequestId,
        mainEventId: ids.mainEventId,
        cancellationStatus: "rejected",
      };
    }
    if (currentStatus !== "submitted" && currentStatus !== "under_review") {
      throw decisionNotAllowed();
    }
    assertCancellationStatusTransition(currentStatus, "rejected");
    const classification = classifyProviderRequestRefundPolicyEvidence(
      providerRequest,
    );
    const timestamp = serverTimestamp();
    const requestUpdate: Record<string, unknown> = {updatedAt: timestamp};
    if (classification.status === "policy_backed") {
      const eligibility = requireRefundEligibilityState(providerRequest);
      if (eligibility.activeCancellationRequestId !== input.cancellationRequestId) {
        throw approvalConflict();
      }
      requestUpdate.refundEligibilityState = {
        ...eligibility,
        activeCancellationRequestId: null,
      };
    } else if (classification.status === "legacy") {
      if (providerRequest.activeCancellationRequestId !== input.cancellationRequestId) {
        throw approvalConflict();
      }
      requestUpdate.activeCancellationRequestId = null;
    } else {
      throw approvalConflict();
    }
    transaction.update(cancellationReference, {
      status: "rejected",
      decision: {
        outcome: "rejected",
        decidedAt: timestamp,
        reason: input.reason,
      },
      updatedAt: timestamp,
    });
    transaction.update(requestReference, requestUpdate);
    transaction.create(mainEventReference.collection("timeline").doc(), {
      type: "cancellation_rejected",
      title: "Cancellation Request Rejected",
      description: "The cancellation request was reviewed and rejected.",
      providerRequestId: ids.providerRequestId,
      providerId: ids.providerId,
      cancellationRequestId: input.cancellationRequestId,
      createdByRole: "admin",
      createdAt: timestamp,
    });
    createNotificationInTransaction(transaction, {
      userId: ids.customerId,
      title: "Cancellation request reviewed",
      message: "Your Provider service cancellation request was not approved.",
      type: "booking",
      relatedId: ids.providerRequestId,
      relatedCollection: "providerRequests",
      metadata: {cancellationStatus: "rejected"},
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: "admin",
      action: "cancellation_request.rejected",
      targetCollection: "providerRequestCancellationRequests",
      targetId: input.cancellationRequestId,
      before: {status: currentStatus},
      after: {status: "rejected"},
      metadata: {
        mainEventId: ids.mainEventId,
        providerRequestId: ids.providerRequestId,
        providerId: ids.providerId,
      },
    });
    return {
      cancellationRequestId: input.cancellationRequestId,
      providerRequestId: ids.providerRequestId,
      mainEventId: ids.mainEventId,
      cancellationStatus: "rejected",
    };
  });
}

export async function executeRefund(input: {
  cancellationRequestId: string;
  actorId: string;
}): Promise<Omit<ExecutionResult, "idempotentReplay">> {
  const prepared = await prepareRefundExecution(input);
  if (prepared.completed) {
    return {
      cancellationRequestId: input.cancellationRequestId,
      providerRequestId: prepared.providerRequestId,
      paymentId: prepared.paymentId,
      refundOperationId: prepared.refundOperationId,
      status: "completed",
      gatewayStatus: "succeeded",
    };
  }
  let refund: PayMongoRefundResource;
  if (prepared.amountInCentavos < 100) {
    await recordExecutionFailure({
      ...prepared,
      actorId: input.actorId,
      certainty: "not_sent",
      failureCode: "GATEWAY_MINIMUM_UNSUPPORTED",
    });
    throw refundAccountingError(
      "failed-precondition",
      REFUND_EXECUTION_ERROR_REASONS.gatewayMinimumUnsupported,
      "The refund requires manual reconciliation because it is below the gateway minimum.",
    );
  }
  if (
    prepared.amountInCentavos < prepared.originalAmountInCentavos &&
    prepared.paymentMethodType !== "card" &&
    prepared.paymentMethodType !== "gcash"
  ) {
    await recordExecutionFailure({
      ...prepared,
      actorId: input.actorId,
      certainty: "not_sent",
      failureCode: "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED",
    });
    throw refundAccountingError(
      "failed-precondition",
      REFUND_EXECUTION_ERROR_REASONS.paymentCapabilityUnconfirmed,
      "The settled payment method is not confirmed for partial refunds.",
    );
  }
  try {
    refund = await createPayMongoRefund({
      secretKey: payMongoSecretKey.value(),
      idempotencyKey: prepared.gatewayExecutionKey,
      gatewayPaymentId: prepared.gatewayPaymentId,
      amountInCentavos: prepared.amountInCentavos,
      reason: "others",
      metadata: {
        feasta_payment_id: prepared.paymentId,
        feasta_refund_operation_id: prepared.refundOperationId,
      },
    });
  } catch (error) {
    const certainty = payMongoFailureCertainty(error);
    await recordExecutionFailure({
      ...prepared,
      actorId: input.actorId,
      certainty,
    });
    throw executionGatewayError(certainty);
  }
  const reconciled = await reconcileGatewayRefund({
    paymentId: prepared.paymentId,
    refundOperationId: prepared.refundOperationId,
    refund,
    actorId: input.actorId,
    source: "refund_execution_response",
  });
  return {
    cancellationRequestId: input.cancellationRequestId,
    providerRequestId: prepared.providerRequestId,
    paymentId: prepared.paymentId,
    refundOperationId: prepared.refundOperationId,
    status: reconciled.status,
    gatewayStatus: refund.status,
  };
}

type PreparedExecution = {
  cancellationRequestId: string;
  providerRequestId: string;
  mainEventId: string;
  paymentId: string;
  refundOperationId: string;
  amountInCentavos: number;
  originalAmountInCentavos: number;
  paymentMethodType: "card" | "gcash" | "paymaya" | null;
  gatewayPaymentId: string;
  gatewayExecutionKey: string;
  customerId: string;
  completed: boolean;
};

export async function prepareRefundExecution(input: {
  cancellationRequestId: string;
  actorId: string;
}): Promise<PreparedExecution> {
  const cancellationReference = db.collection(
    "providerRequestCancellationRequests",
  ).doc(input.cancellationRequestId);
  return db.runTransaction(async (transaction) => {
    const cancellationSnapshot = await transaction.get(cancellationReference);
    if (!cancellationSnapshot.exists) throw operationNotFound();
    const cancellation = cancellationSnapshot.data() ?? {};
    const ids = cancellationIds(cancellation);
    const operationId = requireOperationId(cancellation.refundOperationId);
    const paymentId = paymentIdForProviderRequest(ids.providerRequestId);
    const paymentReference = db.collection("payments").doc(paymentId);
    const operationReference = paymentReference.collection("refunds")
      .doc(operationId);
    const requestReference = db.collection("providerRequests")
      .doc(ids.providerRequestId);
    const mainEventReference = db.collection("mainEvents").doc(ids.mainEventId);
    const [paymentSnapshot, operationSnapshot, requestSnapshot,
      mainEventSnapshot] = await transaction.getAll(
      paymentReference,
      operationReference,
      requestReference,
      mainEventReference,
    );
    if (!paymentSnapshot.exists || !operationSnapshot.exists ||
      !requestSnapshot.exists || !mainEventSnapshot.exists) {
      throw operationNotFound();
    }
    const payment = paymentSnapshot.data() ?? {};
    const operation = operationSnapshot.data() ?? {};
    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    assertPolicyOperationLinkage({
      cancellationRequestId: input.cancellationRequestId,
      cancellation,
      ids,
      paymentId,
      payment,
      operationId,
      operation,
      providerRequest,
      mainEvent,
    });
    const amount = positiveCentavos(operation.amountInCentavos);
    const gatewayPaymentId = requireGatewayPaymentId(operation.gatewayPaymentId);
    const gatewayExecutionKey = requireGatewayExecutionKey(
      operation.gatewayExecutionKey,
      operationId,
    );
    if (operation.status === "completed") {
      return {
        cancellationRequestId: input.cancellationRequestId,
        providerRequestId: ids.providerRequestId,
        mainEventId: ids.mainEventId,
        paymentId,
        refundOperationId: operationId,
        amountInCentavos: amount,
        originalAmountInCentavos: positiveCentavos(payment.amountInCentavos),
        paymentMethodType: paymentMethodType(payment.paymentMethodType),
        gatewayPaymentId,
        gatewayExecutionKey,
        customerId: ids.customerId,
        completed: true,
      };
    }
    if (operation.status !== "reserved" && operation.status !== "failed" &&
      operation.status !== "processing") throw retryNotAllowed();
    const cancellationStatus = parseProviderRequestCancellationStatus(
      cancellation.status,
    );
    if (cancellationStatus !== "approved" &&
      cancellationStatus !== "refund_processing" &&
      cancellationStatus !== "refund_failed") throw executionNotAllowed();
    if (operation.status !== "processing") {
      assertRefundOperationTransition(operation.status, "processing");
    }
    if (cancellationStatus !== "refund_processing") {
      assertCancellationStatusTransition(cancellationStatus, "refund_processing");
    }
    const accounting = readRefundAccounting(
      payment,
      positiveCentavos(payment.amountInCentavos),
    );
    if (accounting.refundReservedAmountInCentavos < amount) {
      throw accountingInvalid();
    }
    const attemptCount = safeCount(operation.executionAttemptCount);
    assertGatewayRetryWindow(operation, attemptCount);
    const timestamp = serverTimestamp();
    transaction.update(operationReference, {
      status: "processing",
      gatewayFailureCertainty: null,
      failureCode: null,
      gatewayRequestedAt: operation.gatewayRequestedAt ?? timestamp,
      executionAttemptCount: attemptCount + 1,
      lastExecutionAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.update(cancellationReference, {
      status: "refund_processing",
      updatedAt: timestamp,
    });
    if (cancellationStatus !== "refund_processing") {
      transaction.create(mainEventReference.collection("timeline").doc(), {
        type: "refund_processing",
        title: "Refund Processing",
        description: "The approved Provider service refund is being processed.",
        providerRequestId: ids.providerRequestId,
        cancellationRequestId: input.cancellationRequestId,
        createdByRole: "admin",
        createdAt: timestamp,
      });
      createNotificationInTransaction(transaction, {
        userId: ids.customerId,
        title: "Refund processing",
        message: "Your approved Provider service refund is being processed.",
        type: "payment",
        relatedId: paymentId,
        relatedCollection: "payments",
        metadata: {cancellationStatus: "refund_processing"},
      });
    }
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: "admin",
      action: attemptCount === 0
        ? "refund_execution.started"
        : "refund_execution.retried",
      targetCollection: "payments",
      targetId: paymentId,
      before: {operationStatus: operation.status},
      after: {operationStatus: "processing"},
      metadata: {
        mainEventId: ids.mainEventId,
        providerRequestId: ids.providerRequestId,
        cancellationRequestId: input.cancellationRequestId,
        refundOperationId: operationId,
        amountInCentavos: amount,
        executionAttemptCount: attemptCount + 1,
      },
    });
    return {
      cancellationRequestId: input.cancellationRequestId,
      providerRequestId: ids.providerRequestId,
      mainEventId: ids.mainEventId,
      paymentId,
      refundOperationId: operationId,
      amountInCentavos: amount,
      originalAmountInCentavos: positiveCentavos(payment.amountInCentavos),
      paymentMethodType: paymentMethodType(payment.paymentMethodType),
      gatewayPaymentId,
      gatewayExecutionKey,
      customerId: ids.customerId,
      completed: false,
    };
  });
}

export async function recordExecutionFailure(
  input: PreparedExecution & {
    actorId: string;
    certainty: PayMongoFailureCertainty;
    failureCode?: string;
  },
): Promise<void> {
  const paymentReference = db.collection("payments").doc(input.paymentId);
  const operationReference = paymentReference.collection("refunds")
    .doc(input.refundOperationId);
  const cancellationReference = db.collection(
    "providerRequestCancellationRequests",
  ).doc(input.cancellationRequestId);
  const mainEventReference = db.collection("mainEvents").doc(input.mainEventId);
  await db.runTransaction(async (transaction) => {
    const [operationSnapshot, cancellationSnapshot] = await transaction.getAll(
      operationReference,
      cancellationReference,
    );
    if (!operationSnapshot.exists || !cancellationSnapshot.exists) {
      throw operationNotFound();
    }
    const operation = operationSnapshot.data() ?? {};
    if (operation.status === "completed") return;
    if (operation.status !== "processing") throw executionNotAllowed();
    const timestamp = serverTimestamp();
    const operationStatus = input.certainty === "ambiguous"
      ? "processing"
      : "failed";
    transaction.update(operationReference, {
      status: operationStatus,
      gatewayFailureCertainty: input.certainty,
      failureCode: input.failureCode ?? input.certainty.toUpperCase(),
      updatedAt: timestamp,
    });
    transaction.update(cancellationReference, {
      status: "refund_failed",
      updatedAt: timestamp,
    });
    createNotificationInTransaction(transaction, {
      userId: input.customerId,
      title: "Refund requires attention",
      message: "Your approved refund requires a secure retry or reconciliation.",
      type: "payment",
      relatedId: input.paymentId,
      relatedCollection: "payments",
      metadata: {cancellationStatus: "refund_failed"},
    });
    transaction.create(mainEventReference.collection("timeline").doc(), {
      type: "refund_failed",
      title: "Refund Requires Attention",
      description:
        "The refund could not be confirmed and requires a secure retry " +
        "or reconciliation.",
      providerRequestId: input.providerRequestId,
      cancellationRequestId: input.cancellationRequestId,
      createdByRole: "system",
      createdAt: timestamp,
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: "admin",
      action: "refund_execution.failed",
      targetCollection: "payments",
      targetId: input.paymentId,
      before: {operationStatus: operation.status},
      after: {operationStatus, cancellationStatus: "refund_failed"},
      metadata: {
        mainEventId: input.mainEventId,
        providerRequestId: input.providerRequestId,
        cancellationRequestId: input.cancellationRequestId,
        refundOperationId: input.refundOperationId,
        failureCertainty: input.certainty,
      },
    });
  });
}

export async function reconcileGatewayRefund(input: {
  paymentId: string;
  refundOperationId: string;
  refund: PayMongoRefundResource;
  actorId: string;
  source: "refund_execution_response" | "paymongo_webhook";
  webhookEventId?: string;
  webhookEventType?: string;
}): Promise<{status: "processing" | "completed" | "failed"; replayed: boolean}> {
  const paymentId = requireSafeDocumentId(input.paymentId, "Payment");
  const operationId = requireOperationId(input.refundOperationId);
  const paymentReference = db.collection("payments").doc(paymentId);
  const operationReference = paymentReference.collection("refunds")
    .doc(operationId);
  const eventReference = input.webhookEventId
    ? db.collection("paymentWebhookEvents").doc(input.webhookEventId)
    : null;
  return db.runTransaction(async (transaction) => {
    const baseSnapshots = await transaction.getAll(
      paymentReference,
      operationReference,
      ...(eventReference ? [eventReference] : []),
    );
    const paymentSnapshot = baseSnapshots[0];
    const operationSnapshot = baseSnapshots[1];
    const eventSnapshot = eventReference ? baseSnapshots[2] : null;
    if (eventSnapshot?.exists) {
      return replayedWebhookResult(eventSnapshot.data() ?? {}, input);
    }
    if (!paymentSnapshot.exists || !operationSnapshot.exists) {
      if (eventReference) {
        transaction.set(
          eventReference,
          refundWebhookRecord(input, "rejected", "operation_not_found"),
        );
        return {status: "failed" as const, replayed: false};
      }
      throw operationNotFound();
    }
    const payment = paymentSnapshot.data() ?? {};
    const operation = operationSnapshot.data() ?? {};
    const cancellationRequestId = storedId(
      operation.cancellationRequestId,
      "Cancellation request",
    );
    const providerRequestId = storedId(
      operation.providerRequestId,
      "Provider request",
    );
    const mainEventId = storedId(operation.mainEventId, "Main event");
    const cancellationReference = db.collection(
      "providerRequestCancellationRequests",
    ).doc(cancellationRequestId);
    const requestReference = db.collection("providerRequests")
      .doc(providerRequestId);
    const mainEventReference = db.collection("mainEvents").doc(mainEventId);
    const providerReference = db.collection("providers").doc(
      storedId(operation.providerId ?? (payment.providerId), "Provider"),
    );
    const [cancellationSnapshot, requestSnapshot, mainEventSnapshot,
      providerSnapshot] =
      await transaction.getAll(
        cancellationReference,
        requestReference,
        mainEventReference,
        providerReference,
      );
    if (!cancellationSnapshot.exists || !requestSnapshot.exists ||
      !mainEventSnapshot.exists || !providerSnapshot.exists) {
      throw gatewayLinkageInvalid();
    }
    const cancellation = cancellationSnapshot.data() ?? {};
    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    const ids = cancellationIds(cancellation);
    assertPolicyOperationLinkage({
      cancellationRequestId,
      cancellation,
      ids,
      paymentId,
      payment,
      operationId,
      operation,
      providerRequest,
      mainEvent,
    });
    assertGatewayRefundLinkage({
      paymentId,
      operationId,
      payment,
      operation,
      refund: input.refund,
    });
    if (operation.status === "completed") {
      if (eventReference) {
        transaction.set(
          eventReference,
          refundWebhookRecord(input, "duplicate", "refund_already_completed"),
        );
      }
      return {status: "completed" as const, replayed: true};
    }
    const timestamp = serverTimestamp();
    const commonOperationUpdate = {
      gatewayRefundId: input.refund.id,
      gatewayStatus: input.refund.status,
      gatewayAcceptedAt: operation.gatewayAcceptedAt ?? timestamp,
      gatewayReconciledAt: timestamp,
      gatewayFailureCertainty: null,
      updatedAt: timestamp,
    };
    if (input.refund.status === "pending" || input.refund.status === "processing") {
      transaction.update(operationReference, {
        ...commonOperationUpdate,
        status: "processing",
        failureCode: null,
      });
      transaction.update(cancellationReference, {
        status: "refund_processing",
        updatedAt: timestamp,
      });
      if (eventReference) {
        transaction.set(eventReference, refundWebhookRecord(input, "processed", null));
      }
      writeRefundAudit(transaction, input, operation, "refund_execution.accepted", "processing");
      return {status: "processing" as const, replayed: false};
    }
    if (input.refund.status === "failed") {
      transaction.update(operationReference, {
        ...commonOperationUpdate,
        status: "failed",
        gatewayFailureCertainty: "gateway_rejected",
        failureCode: "GATEWAY_REFUND_FAILED",
      });
      transaction.update(cancellationReference, {
        status: "refund_failed",
        updatedAt: timestamp,
      });
      if (eventReference) {
        transaction.set(
          eventReference,
          refundWebhookRecord(input, "processed", "gateway_refund_failed"),
        );
      }
      writeRefundAudit(transaction, input, operation, "refund_execution.failed", "failed");
      return {status: "failed" as const, replayed: false};
    }
    if (operation.status !== "processing" && operation.status !== "reserved" &&
      operation.status !== "failed") throw executionNotAllowed();
    if (operation.status !== "completed") {
      assertRefundOperationTransition(operation.status, "completed");
    }
    const amount = positiveCentavos(operation.amountInCentavos);
    const original = positiveCentavos(payment.amountInCentavos);
    const accounting = readRefundAccounting(payment, original);
    if (accounting.refundReservedAmountInCentavos < amount) {
      throw accountingInvalid();
    }
    const nextReserved = accounting.refundReservedAmountInCentavos - amount;
    const nextCompleted = accounting.refundedAmountInCentavos + amount;
    const paymentStatus = derivePaymentRefundStatus({
      originalPaidAmountInCentavos: original,
      completedRefundAmountInCentavos: nextCompleted,
    });
    transaction.update(operationReference, {
      ...commonOperationUpdate,
      status: "completed",
      completedAt: timestamp,
      failureCode: null,
    });
    transaction.update(paymentReference, {
      status: paymentStatus,
      refundAccountingSchemaVersion: REFUND_ACCOUNTING_SCHEMA_VERSION,
      refundedAmountInCentavos: nextCompleted,
      refundReservedAmountInCentavos: nextReserved,
      lastRefundCompletedAt: timestamp,
      ...(paymentStatus === "refunded" ? {refundedAt: timestamp} : {}),
      updatedAt: timestamp,
    });
    transaction.update(cancellationReference, {
      status: "refund_completed",
      refundCompletedAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.update(requestReference, {
      paymentStatus,
      ...(paymentStatus === "refunded" ? {refundedAt: timestamp} : {}),
      updatedAt: timestamp,
    });
    transaction.create(mainEventReference.collection("timeline").doc(), {
      type: "refund_completed",
      title: "Refund Completed",
      description: "The approved Provider service refund was completed.",
      providerRequestId,
      providerId: ids.providerId,
      cancellationRequestId,
      paymentId,
      createdByRole: "system",
      createdAt: timestamp,
    });
    createNotificationInTransaction(transaction, {
      userId: ids.customerId,
      title: "Refund completed",
      message: "Your approved Provider service refund was completed.",
      type: "payment",
      relatedId: paymentId,
      relatedCollection: "payments",
      metadata: {cancellationStatus: "refund_completed"},
    });
    createNotificationInTransaction(transaction, {
      userId: providerOwnerId(providerSnapshot.data() ?? {}),
      title: "Provider service refund completed",
      message: "The approved refund for one cancelled Provider service was completed.",
      type: "payment",
      relatedId: paymentId,
      relatedCollection: "payments",
      metadata: {cancellationStatus: "refund_completed"},
    });
    if (eventReference) {
      transaction.set(eventReference, refundWebhookRecord(input, "processed", null));
    }
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorId,
      actorRole: "system",
      action: input.source === "paymongo_webhook"
        ? "refund_webhook.reconciled"
        : "refund_accounting.completed",
      targetCollection: "payments",
      targetId: paymentId,
      source: input.source,
      before: {
        operationStatus: operation.status,
        refundedAmountInCentavos: accounting.refundedAmountInCentavos,
        refundReservedAmountInCentavos: accounting.refundReservedAmountInCentavos,
      },
      after: {
        operationStatus: "completed",
        paymentStatus,
        cancellationStatus: "refund_completed",
        refundedAmountInCentavos: nextCompleted,
        refundReservedAmountInCentavos: nextReserved,
      },
      metadata: {
        mainEventId,
        providerRequestId,
        cancellationRequestId,
        refundOperationId: operationId,
        amountInCentavos: amount,
        webhookEventId: input.webhookEventId ?? null,
      },
    });
    return {status: "completed" as const, replayed: false};
  });
}

function exactInput(
  request: CallableRequest<unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const input = requireObject(request.data);
  const keys = Object.keys(input);
  if (keys.length !== fields.length ||
    keys.some((key) => !fields.includes(key)) ||
    fields.some((field) => !Object.hasOwn(input, field))) {
    throw new HttpsError("invalid-argument", "Refund operation input is invalid.");
  }
  return input;
}

type CancellationIds = {
  providerRequestId: string;
  mainEventId: string;
  customerId: string;
  providerId: string;
};

function cancellationIds(data: Record<string, unknown>): CancellationIds {
  return {
    providerRequestId: storedId(data.providerRequestId, "Provider request"),
    mainEventId: storedId(data.mainEventId, "Main event"),
    customerId: storedId(data.customerId, "Customer"),
    providerId: storedId(data.providerId, "Provider"),
  };
}

function assertCancellationContext(input: {
  cancellationRequestId: string;
  cancellation: Record<string, unknown>;
  ids: CancellationIds;
  providerRequest: Record<string, unknown>;
  mainEvent: Record<string, unknown>;
  payment: Record<string, unknown> | null;
  paymentId: string;
  provider: Record<string, unknown>;
  allRequestDocuments: readonly {id: string; data(): Record<string, unknown>}[];
}): void {
  const canonicalRequestIds = Array.isArray(input.mainEvent.providerRequestIds)
    ? input.mainEvent.providerRequestIds
    : null;
  if (
    input.cancellation.providerRequestId !== input.ids.providerRequestId ||
    input.cancellation.mainEventId !== input.ids.mainEventId ||
    input.cancellation.customerId !== input.ids.customerId ||
    input.cancellation.providerId !== input.ids.providerId ||
    canonicalRequestLinkageReason({
      providerRequestId: input.ids.providerRequestId,
      mainEventId: input.ids.mainEventId,
      customerId: input.ids.customerId,
      providerId: input.ids.providerId,
      providerRequest: input.providerRequest,
      mainEvent: input.mainEvent,
    }) ||
    input.payment && canonicalPaymentLinkageReason({
      paymentId: input.paymentId,
      providerRequestId: input.ids.providerRequestId,
      mainEventId: input.ids.mainEventId,
      customerId: input.ids.customerId,
      providerId: input.ids.providerId,
      payment: input.payment,
      providerRequest: input.providerRequest,
      mainEvent: input.mainEvent,
    }) ||
    typeof input.provider.ownerId !== "string" ||
    input.provider.ownerId.trim().length === 0 ||
    canonicalRequestIds === null ||
    canonicalRequestIds.length !== input.allRequestDocuments.length ||
    input.allRequestDocuments.some((document) =>
      !canonicalRequestIds.includes(document.id) ||
      document.data().mainEventId !== input.ids.mainEventId ||
      document.data().customerId !== input.ids.customerId)
  ) {
    throw approvalConflict();
  }
}

function assertPolicyOperationLinkage(input: {
  cancellationRequestId: string;
  cancellation: Record<string, unknown>;
  ids: CancellationIds;
  paymentId: string;
  payment: Record<string, unknown>;
  operationId: string;
  operation: Record<string, unknown>;
  providerRequest: Record<string, unknown>;
  mainEvent: Record<string, unknown>;
}): void {
  if (
    canonicalPaymentLinkageReason({
      paymentId: input.paymentId,
      providerRequestId: input.ids.providerRequestId,
      mainEventId: input.ids.mainEventId,
      customerId: input.ids.customerId,
      providerId: input.ids.providerId,
      payment: input.payment,
      providerRequest: input.providerRequest,
      mainEvent: input.mainEvent,
    }) ||
    input.operation.schemaVersion !== REFUND_OPERATION_SCHEMA_VERSION ||
    input.operation.providerRequestId !== input.ids.providerRequestId ||
    input.operation.mainEventId !== input.ids.mainEventId ||
    input.operation.cancellationRequestId !== input.cancellationRequestId ||
    input.operation.currency !== PAYMENT_CURRENCY ||
    input.operation.gateway !== "paymongo" ||
    input.operation.gatewayPaymentId !== input.payment.paymongoResourceId ||
    input.cancellation.refundOperationId !== input.operationId ||
    !Array.isArray(input.cancellation.refundOperationIds) ||
    !input.cancellation.refundOperationIds.includes(input.operationId) ||
    input.providerRequest.status !== "cancelled" ||
    input.providerRequest.approvedCancellationRequestId !==
      input.cancellationRequestId ||
    input.payment.refundExecutionLock !== undefined &&
      input.payment.refundExecutionLock !== null
  ) {
    throw gatewayLinkageInvalid();
  }
}

function assertGatewayRefundLinkage(input: {
  paymentId: string;
  operationId: string;
  payment: Record<string, unknown>;
  operation: Record<string, unknown>;
  refund: PayMongoRefundResource;
}): void {
  if (
    input.refund.id !== input.operation.gatewayRefundId &&
      input.operation.gatewayRefundId !== null ||
    input.refund.amountInCentavos !== input.operation.amountInCentavos ||
    input.refund.currency !== PAYMENT_CURRENCY ||
    input.refund.gatewayPaymentId !== input.payment.paymongoResourceId ||
    input.refund.metadata.feasta_payment_id !== input.paymentId ||
    input.refund.metadata.feasta_refund_operation_id !== input.operationId
  ) {
    throw gatewayLinkageInvalid();
  }
}

function approvalResultFromStored(input: {
  cancellationRequestId: string;
  cancellation: Record<string, unknown>;
  providerRequest: Record<string, unknown>;
  mainEvent: Record<string, unknown>;
}): Omit<ApprovalResult, "idempotentReplay"> {
  const ids = cancellationIds(input.cancellation);
  const storedStatus = parseProviderRequestCancellationStatus(
    input.cancellation.status,
  );
  const status = storedStatus === "cancelled_no_refund"
    ? "cancelled_no_refund" as const
    : storedStatus === "approved" ||
      storedStatus === "refund_processing" ||
      storedStatus === "refund_failed" ||
      storedStatus === "refund_completed"
      ? "approved" as const
      : null;
  if (status === null) {
    throw alreadyDecided();
  }
  const calculation = input.cancellation.refundCalculation as
    Record<string, unknown> | null;
  const amount = calculation?.eligibleRefundAmountInCentavos;
  if (!Number.isSafeInteger(amount) || (amount as number) < 0 ||
    input.providerRequest.status !== "cancelled") throw approvalConflict();
  const mainEventStatus = parseMainEventStatus(input.mainEvent.status);
  if (!mainEventStatus) throw approvalConflict();
  return {
    cancellationRequestId: input.cancellationRequestId,
    providerRequestId: ids.providerRequestId,
    mainEventId: ids.mainEventId,
    cancellationStatus: status,
    providerRequestStatus: "cancelled",
    mainEventStatus,
    refundOperationId: nullableId(input.cancellation.refundOperationId),
    refundAmountInCentavos: amount as number,
    currency: PAYMENT_CURRENCY,
  };
}

function mainEventUpdate(input: {
  summary: ReturnType<typeof calculateMainEventRequestSummary>;
  currentStatus: MainEventStatus;
  timestamp: ReturnType<typeof serverTimestamp>;
}): Record<string, unknown> {
  return {
    ...input.summary,
    ...(input.summary.status !== input.currentStatus
      ? {statusUpdatedAt: input.timestamp}
      : {}),
    ...(input.summary.status === "cancelled" &&
      input.currentStatus !== "cancelled"
      ? {cancelledAt: input.timestamp}
      : {}),
    ...(input.summary.status === "completed" &&
      input.currentStatus !== "completed"
      ? {completedAt: input.timestamp}
      : {}),
    updatedAt: input.timestamp,
  };
}

function notifyCancellationDecision(
  transaction: FirebaseFirestore.Transaction,
  input: {
    customerId: string;
    providerOwnerId: string;
    providerRequestId: string;
    cancellationRequestId: string;
    approved: boolean;
    zeroRefund: boolean;
  },
): void {
  createNotificationInTransaction(transaction, {
    userId: input.customerId,
    title: input.approved ? "Cancellation approved" : "Cancellation reviewed",
    message: input.zeroRefund
      ? "Your Provider service was cancelled with no refund due under the agreed policy."
      : "Your Provider service was cancelled and the approved refund will be processed.",
    type: "booking",
    relatedId: input.providerRequestId,
    relatedCollection: "providerRequests",
    metadata: {
      cancellationRequestId: input.cancellationRequestId,
      cancellationStatus: input.zeroRefund ? "cancelled_no_refund" : "approved",
    },
  });
  createNotificationInTransaction(transaction, {
    userId: input.providerOwnerId,
    title: "Provider service cancelled",
    message: "A Customer cancellation was approved for one Provider service.",
    type: "booking",
    relatedId: input.providerRequestId,
    relatedCollection: "providerRequests",
    metadata: {cancellationRequestId: input.cancellationRequestId},
  });
}

function writeRefundAudit(
  transaction: FirebaseFirestore.Transaction,
  input: {
    paymentId: string;
    refundOperationId: string;
    refund: PayMongoRefundResource;
    actorId: string;
    source: string;
    webhookEventId?: string;
  },
  operation: Record<string, unknown>,
  action: string,
  nextStatus: string,
): void {
  writeAuditLogInTransaction(transaction, {
    actorId: input.actorId,
    actorRole: input.source === "paymongo_webhook" ? "system" : "admin",
    action,
    targetCollection: "payments",
    targetId: input.paymentId,
    source: input.source,
    before: {operationStatus: operation.status},
    after: {operationStatus: nextStatus, gatewayStatus: input.refund.status},
    metadata: {
      refundOperationId: input.refundOperationId,
      amountInCentavos: input.refund.amountInCentavos,
      webhookEventId: input.webhookEventId ?? null,
    },
  });
}

function refundWebhookRecord(
  input: {
    paymentId: string;
    refundOperationId: string;
    refund: PayMongoRefundResource;
    webhookEventId?: string;
    webhookEventType?: string;
  },
  status: string,
  reason: string | null,
): Record<string, unknown> {
  return {
    eventId: input.webhookEventId,
    eventType: input.webhookEventType ?? "refund",
    paymentId: input.paymentId,
    refundOperationId: input.refundOperationId,
    gatewayRefundId: input.refund.id,
    gatewayStatus: input.refund.status,
    status,
    reason,
    processedAt: serverTimestamp(),
  };
}

function providerOwnerId(provider: Record<string, unknown>): string {
  return storedId(provider.ownerId, "Provider owner");
}

function storedId(value: unknown, label: string): string {
  if (typeof value !== "string") throw gatewayLinkageInvalid();
  return requireSafeDocumentId(value, label);
}

function nullableId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return storedId(value, "Stored identity");
}

function requireOperationId(value: unknown): string {
  if (typeof value !== "string" || !/^refund_[a-f0-9]{40}$/u.test(value)) {
    throw operationNotFound();
  }
  return value;
}

function requireGatewayPaymentId(value: unknown): string {
  if (typeof value !== "string" || !/^pay_[A-Za-z0-9_-]{3,240}$/u.test(value)) {
    throw gatewayLinkageInvalid();
  }
  return value;
}

function requireGatewayExecutionKey(value: unknown, operationId: string): string {
  const expected = gatewayRefundIdempotencyKey(operationId);
  if (value !== expected) throw gatewayLinkageInvalid();
  return expected;
}

function positiveCentavos(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw accountingInvalid();
  }
  return value as number;
}

function safeCount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (!Number.isSafeInteger(value) || (value as number) < 0 ||
    (value as number) >= 100) throw accountingInvalid();
  return value as number;
}

function assertGatewayRetryWindow(
  operation: Record<string, unknown>,
  attemptCount: number,
): void {
  if (
    operation.failureCode === "GATEWAY_MINIMUM_UNSUPPORTED" ||
    operation.failureCode === "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED"
  ) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_EXECUTION_ERROR_REASONS.reconciliationRequired,
      "The refund requires manual reconciliation before retry.",
    );
  }
  if (
    attemptCount === 0 ||
    operation.gatewayFailureCertainty === "not_sent" ||
    operation.gatewayFailureCertainty === "gateway_rejected"
  ) {
    return;
  }

  const requestedAt = operation.gatewayRequestedAt;
  const conservativeWindowMs = 23 * 60 * 60 * 1_000;
  if (
    !(requestedAt instanceof Timestamp) ||
    Timestamp.now().toMillis() - requestedAt.toMillis() >=
      conservativeWindowMs
  ) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_EXECUTION_ERROR_REASONS.reconciliationRequired,
      "The prior refund attempt must be reconciled before retry.",
    );
  }
}

function paymentMethodType(
  value: unknown,
): "card" | "gcash" | "paymaya" | null {
  if (value === undefined || value === null) return null;
  if (value === "card" || value === "gcash" || value === "paymaya") {
    return value;
  }
  throw gatewayLinkageInvalid();
}

function replayedWebhookResult(
  stored: Record<string, unknown>,
  input: {
    paymentId: string;
    refundOperationId: string;
    refund: PayMongoRefundResource;
  },
): {status: "processing" | "completed" | "failed"; replayed: true} {
  if (
    stored.paymentId !== input.paymentId ||
    stored.refundOperationId !== input.refundOperationId ||
    stored.gatewayRefundId !== input.refund.id ||
    stored.gatewayStatus !== input.refund.status
  ) {
    throw refundAccountingError(
      "failed-precondition",
      REFUND_EXECUTION_ERROR_REASONS.webhookMismatch,
      "The webhook event identity does not match its recorded outcome.",
    );
  }

  return {
    status: input.refund.status === "succeeded"
      ? "completed"
      : input.refund.status === "failed"
        ? "failed"
        : "processing",
    replayed: true,
  };
}

function decisionOutcome(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outcome = (value as Record<string, unknown>).outcome;
  return outcome === "approved" || outcome === "rejected" ? outcome : null;
}

function decisionNotAllowed(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_EXECUTION_ERROR_REASONS.decisionNotAllowed,
    "Cancellation cannot be decided in its current state.",
  );
}

function alreadyDecided(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_EXECUTION_ERROR_REASONS.alreadyDecided,
    "Cancellation has already received a different decision.",
  );
}

function approvalConflict(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_EXECUTION_ERROR_REASONS.approvalConflict,
    "Cancellation approval authority is inconsistent.",
  );
}

function executionNotAllowed(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_EXECUTION_ERROR_REASONS.executionNotAllowed,
    "Refund execution is not allowed in its current state.",
  );
}

function retryNotAllowed(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_EXECUTION_ERROR_REASONS.retryNotAllowed,
    "Refund execution cannot be retried.",
  );
}

function operationNotFound(): HttpsError {
  return refundAccountingError(
    "not-found",
    REFUND_EXECUTION_ERROR_REASONS.operationNotFound,
    "The refund operation was not found.",
  );
}

function gatewayLinkageInvalid(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_EXECUTION_ERROR_REASONS.gatewayLinkageInvalid,
    "Gateway refund linkage is invalid.",
  );
}

function accountingInvalid(): HttpsError {
  return refundAccountingError(
    "failed-precondition",
    REFUND_ACCOUNTING_ERROR_REASONS.accountingInvalid,
    "Refund accounting is invalid.",
  );
}

function executionGatewayError(certainty: PayMongoFailureCertainty): HttpsError {
  return refundAccountingError(
    "unavailable",
    certainty === "ambiguous"
      ? REFUND_EXECUTION_ERROR_REASONS.gatewayAmbiguous
      : certainty === "not_sent"
        ? REFUND_EXECUTION_ERROR_REASONS.gatewayNotSent
        : REFUND_EXECUTION_ERROR_REASONS.gatewayRejected,
    certainty === "ambiguous"
      ? "Refund outcome requires reconciliation before another operation."
      : certainty === "not_sent"
        ? "The refund request was not sent and may be safely retried."
        : "The refund was not accepted and may be safely retried.",
  );
}
