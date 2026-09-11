import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";
import {
  assertCancellationSubmissionAllowed,
  assertEligibilityLifecycleInvariant,
  cancellationError,
  cancellationInitialStatus,
  cancellationRequestIdForAttempt,
  legacyActiveCancellationRequestId,
  parseProviderRequestCancellationStatus,
  parseRefundEligibilityStage,
  policyEvidenceInvalid,
  PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION,
  REFUND_CANCELLATION_ERROR_REASONS,
  type CancellationPolicyEvidenceStatus,
  type FrozenRefundEligibility,
  type ProviderRequestCancellationStatus,
} from "./refund-cancellation-domain.js";
import {
  canonicalPaymentLinkageReason,
  canonicalRequestLinkageReason,
  paymentIdForProviderRequest,
} from "../payments/payment-lifecycle.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  PAYMENT_STATUSES,
  USER_ROLES,
  parseProviderRequestStatus,
  type PaymentStatus,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";
import {
  assertCustomerCancellationEnabled,
  CANCELLATION_REFUND_ROLLOUT_DOCUMENT_ID,
  parseCancellationRefundRollout,
} from "./cancellation-rollout.js";

const INPUT_FIELDS = new Set([
  "providerRequestId",
  "reason",
  "idempotencyKey",
]);

type CancellationResult = {
  cancellationRequestId: string;
  providerRequestId: string;
  status: ProviderRequestCancellationStatus;
  policyEvidenceStatus: CancellationPolicyEvidenceStatus;
  frozenEligibility: {
    stage: string;
    stageSequence: number;
  } | null;
  manualReviewRequired: boolean;
  created: boolean;
};

export const submitProviderRequestCancellation = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request): Promise<CancellationResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.customer]);
    await enforceCallableRateLimit(request, {
      scope: "providerRequestCancellation.submit",
      limit: 10,
      windowSeconds: 10 * 60,
    });

    const input = exactInput(request.data);
    const providerRequestId = requireString(
      input.providerRequestId,
      "providerRequestId",
      {minLength: 8, maxLength: 160},
    );
    const reason = requireString(input.reason, "reason", {
      minLength: 5,
      maxLength: 1_000,
    });
    const clientKey = requireString(
      input.idempotencyKey,
      "idempotencyKey",
      {minLength: 8, maxLength: 200},
    );
    const operation = "providerRequestCancellation.submit";
    const operationKey = createIdempotencyKey({
      operation,
      actorId: actor.uid,
      clientKey,
      payload: {providerRequestId},
    });
    const execution = await executeIdempotently<CancellationResult>({
      key: operationKey,
      operation,
      actorId: actor.uid,
      handler: () => submitCancellation({
        actorUid: actor.uid,
        providerRequestId,
        reason,
        operationKey,
      }),
    });

    logSecurityEvent({
      action: "provider_request_cancellation_submission",
      outcome: "succeeded",
      actorUid: actor.uid,
      targetId: providerRequestId,
      metadata: {
        cancellationRequestId: execution.result.cancellationRequestId,
        status: execution.result.status,
        created: execution.result.created,
        replayed: execution.replayed,
      },
    });

    return execution.result;
  },
);

async function submitCancellation(input: {
  actorUid: string;
  providerRequestId: string;
  reason: string;
  operationKey: string;
}): Promise<CancellationResult> {
  const requestReference = db.collection("providerRequests")
    .doc(input.providerRequestId);
  const initial = await requestReference.get();

  if (!initial.exists) {
    throw new HttpsError("not-found", "The provider request was not found.");
  }

  const initialData = initial.data() ?? {};
  const mainEventId = stringValue(initialData.mainEventId);
  const providerId = stringValue(initialData.providerId);

  if (!mainEventId || !providerId) {
    throw cancellationNotAllowed();
  }

  const mainEventReference = db.collection("mainEvents").doc(mainEventId);
  const providerReference = db.collection("providers").doc(providerId);
  const paymentId = paymentIdForProviderRequest(input.providerRequestId);
  const paymentReference = db.collection("payments").doc(paymentId);
  const rolloutReference = db.collection("appSettings")
    .doc(CANCELLATION_REFUND_ROLLOUT_DOCUMENT_ID);
  const cancellationRequestId =
    cancellationRequestIdForAttempt({
      providerRequestId: input.providerRequestId,
      customerId: input.actorUid,
      operationKey: input.operationKey,
    });
  const cancellationReference = db
    .collection("providerRequestCancellationRequests")
    .doc(cancellationRequestId);

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, mainEventSnapshot, providerSnapshot,
      paymentSnapshot, cancellationSnapshot,
      rolloutSnapshot] = await transaction.getAll(
      requestReference,
      mainEventReference,
      providerReference,
      paymentReference,
      cancellationReference,
      rolloutReference,
    );

    assertCustomerCancellationEnabled(parseCancellationRefundRollout({
      exists: rolloutSnapshot.exists,
      data: rolloutSnapshot.data(),
    }));

    if (!requestSnapshot.exists || !mainEventSnapshot.exists) {
      throw cancellationNotAllowed();
    }

    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};

    if (
      stringValue(providerRequest.mainEventId) !== mainEventId ||
      stringValue(providerRequest.providerId) !== providerId ||
      canonicalRequestLinkageReason({
        providerRequestId: input.providerRequestId,
        mainEventId,
        customerId: input.actorUid,
        providerId,
        providerRequest,
        mainEvent,
      })
    ) {
      throw cancellationError(
        "permission-denied",
        REFUND_CANCELLATION_ERROR_REASONS.cancellationNotAllowed,
        "You cannot cancel this provider request.",
      );
    }

    if (!providerSnapshot.exists) {
      throw cancellationNotAllowed();
    }

    const providerOwnerId = stringValue(providerSnapshot.data()?.ownerId);

    if (!providerOwnerId) {
      throw cancellationNotAllowed();
    }

    const providerRequestStatus = parseProviderRequestStatus(
      providerRequest.status,
    );

    if (!providerRequestStatus) {
      throw cancellationNotAllowed();
    }

    if (cancellationSnapshot.exists) {
      const existing = cancellationSnapshot.data() ?? {};

      if (
        existing.customerId !== input.actorUid ||
        existing.providerRequestId !== input.providerRequestId ||
        existing.mainEventId !== mainEventId
      ) {
        throw cancellationNotAllowed();
      }

      if (existing.submissionOperationKey === input.operationKey) {
        return resultFromStoredCancellation(
          cancellationRequestId,
          existing,
          false,
        );
      }
      throw cancellationNotAllowed();
    }

    assertCancellationSubmissionAllowed(
      providerRequestStatus,
    );

    const classification =
      classifyProviderRequestRefundPolicyEvidence(providerRequest);

    if (classification.status === "invalid") {
      throw policyEvidenceInvalid();
    }

    const policyEvidenceStatus: CancellationPolicyEvidenceStatus =
      classification.status;
    let eligibilityState = null;

    if (policyEvidenceStatus === "policy_backed") {
      eligibilityState = requireRefundEligibilityState(providerRequest);
      assertEligibilityLifecycleInvariant({
        providerRequestStatus,
        state: eligibilityState,
      });
    }

    const activeCancellationRequestId = eligibilityState
      ? eligibilityState.activeCancellationRequestId
      : legacyActiveCancellationRequestId(providerRequest);

    if (activeCancellationRequestId !== null) {
      throw cancellationError(
        "failed-precondition",
        REFUND_CANCELLATION_ERROR_REASONS.cancellationAlreadyActive,
        "A cancellation request is already active.",
        {cancellationRequestId: activeCancellationRequestId},
      );
    }

    const payment = paymentSnapshot.exists
      ? paymentSnapshot.data() ?? {}
      : null;

    if (
      payment &&
      canonicalPaymentLinkageReason({
        paymentId,
        providerRequestId: input.providerRequestId,
        mainEventId,
        customerId: input.actorUid,
        providerId,
        payment,
        providerRequest,
        mainEvent,
      })
    ) {
      throw cancellationNotAllowed();
    }

    const paymentResolutionPending =
      providerRequestStatus === "payment_processing" ||
      payment?.status === "processing" ||
      (
        payment?.status === "pending" &&
        payment.checkoutCreationStatus === "pending"
      );

    if (
      providerRequestStatus === "payment_processing" &&
      (
        !payment ||
        paymentStatus(payment.status) !== "processing"
      )
    ) {
      throw cancellationError(
        "failed-precondition",
        REFUND_CANCELLATION_ERROR_REASONS.paymentResolutionRequired,
        "Payment state must be reconciled before cancellation can continue.",
      );
    }

    const status = cancellationInitialStatus({
      policyEvidenceStatus,
      paymentResolutionPending,
    });
    const timestamp = serverTimestamp();
    const frozenEligibility: FrozenRefundEligibility<
      ReturnType<typeof serverTimestamp>
    > | null = eligibilityState
      ? {
          stage: eligibilityState.currentStage,
          stageSequence: eligibilityState.stageSequence,
          frozenAt: timestamp,
        }
      : null;

    transaction.create(cancellationReference, {
      schemaVersion: PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION,
      mainEventId,
      providerRequestId: input.providerRequestId,
      customerId: input.actorUid,
      providerId,
      status,
      reason: input.reason,
      policyEvidenceStatus,
      frozenEligibility,
      submittedAt: timestamp,
      updatedAt: timestamp,
      decision: null,
      refundCalculation: null,
      refundOperationId: null,
      refundOperationIds: [],
      submissionOperationKey: input.operationKey,
    });

    if (eligibilityState) {
      transaction.update(requestReference, {
        latestCancellationRequestId: cancellationRequestId,
        refundEligibilityState: {
          ...eligibilityState,
          activeCancellationRequestId: cancellationRequestId,
        },
        updatedAt: timestamp,
      });
    } else {
      transaction.update(requestReference, {
        activeCancellationRequestId: cancellationRequestId,
        latestCancellationRequestId: cancellationRequestId,
        updatedAt: timestamp,
      });
    }

    transaction.create(
      mainEventReference.collection("timeline").doc(),
      {
        type: "cancellation_requested",
        status: mainEvent.status,
        title: "Provider Cancellation Requested",
        description: "The Customer submitted a cancellation request for one Provider service.",
        providerRequestId: input.providerRequestId,
        providerId,
        cancellationRequestId,
        createdBy: input.actorUid,
        createdByRole: "customer",
        createdAt: timestamp,
      },
    );
    createNotificationInTransaction(transaction, {
      userId: providerOwnerId,
      title: "Cancellation Request Submitted",
      message: "A Customer requested cancellation of one Provider service.",
      type: "booking",
      relatedId: input.providerRequestId,
      relatedCollection: "providerRequests",
      metadata: {cancellationRequestId, cancellationStatus: status},
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorUid,
      actorRole: "customer",
      action: "cancellation_request.submitted",
      targetCollection: "providerRequestCancellationRequests",
      targetId: cancellationRequestId,
      after: {status, policyEvidenceStatus},
      metadata: {
        mainEventId,
        providerRequestId: input.providerRequestId,
        providerId,
        frozenStage: eligibilityState?.currentStage ?? null,
        frozenStageSequence: eligibilityState?.stageSequence ?? null,
      },
    });

    return cancellationResult({
      cancellationRequestId,
      providerRequestId: input.providerRequestId,
      status,
      policyEvidenceStatus,
      eligibilityState,
      created: true,
    });
  });
}

function exactInput(value: unknown): Record<string, unknown> {
  const input = requireObject(value);

  if (
    Object.keys(input).length !== INPUT_FIELDS.size ||
    Object.keys(input).some((field) => !INPUT_FIELDS.has(field)) ||
    [...INPUT_FIELDS].some((field) => !Object.hasOwn(input, field))
  ) {
    throw new HttpsError("invalid-argument", "Cancellation request is invalid.");
  }

  return input;
}

function cancellationResult(input: {
  cancellationRequestId: string;
  providerRequestId: string;
  status: ProviderRequestCancellationStatus;
  policyEvidenceStatus: CancellationPolicyEvidenceStatus;
  eligibilityState: {
    currentStage: string;
    stageSequence: number;
  } | null;
  created: boolean;
}): CancellationResult {
  return {
    cancellationRequestId: input.cancellationRequestId,
    providerRequestId: input.providerRequestId,
    status: input.status,
    policyEvidenceStatus: input.policyEvidenceStatus,
    frozenEligibility: input.eligibilityState
      ? {
          stage: input.eligibilityState.currentStage,
          stageSequence: input.eligibilityState.stageSequence,
        }
      : null,
    manualReviewRequired: input.status === "under_review",
    created: input.created,
  };
}

function resultFromStoredCancellation(
  cancellationRequestId: string,
  data: Record<string, unknown>,
  created: boolean,
): CancellationResult {
  const status = parseProviderRequestCancellationStatus(data.status);
  const policyEvidenceStatus = data.policyEvidenceStatus;

  if (
    policyEvidenceStatus !== "policy_backed" &&
    policyEvidenceStatus !== "legacy"
  ) {
    throw cancellationNotAllowed();
  }

  const frozen = storedFrozenEligibility(
    data.frozenEligibility,
    policyEvidenceStatus,
  );

  return cancellationResult({
    cancellationRequestId,
    providerRequestId: stringValue(data.providerRequestId),
    status,
    policyEvidenceStatus,
    eligibilityState: frozen,
    created,
  });
}

function storedFrozenEligibility(
  value: unknown,
  policyEvidenceStatus: CancellationPolicyEvidenceStatus,
): {currentStage: string; stageSequence: number} | null {
  if (policyEvidenceStatus === "legacy") {
    if (value !== null) {
      throw cancellationNotAllowed();
    }
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw cancellationNotAllowed();
  }

  const frozen = value as Record<string, unknown>;
  const currentStage = parseRefundEligibilityStage(frozen.stage);
  const stageSequence = frozen.stageSequence;

  if (
    !Number.isSafeInteger(stageSequence) ||
    (stageSequence as number) < 0
  ) {
    throw cancellationNotAllowed();
  }

  return {
    currentStage,
    stageSequence: stageSequence as number,
  };
}

function paymentStatus(value: unknown): PaymentStatus | null {
  return PAYMENT_STATUSES.includes(value as PaymentStatus)
    ? value as PaymentStatus
    : null;
}

function cancellationNotAllowed(): HttpsError {
  return cancellationError(
    "failed-precondition",
    REFUND_CANCELLATION_ERROR_REASONS.cancellationNotAllowed,
    "This provider request cannot enter cancellation.",
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
