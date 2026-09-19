import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";
import {
  assertPreparationReady,
  assertRefundEligibilityTransition,
  assertRefundEligibilityUnlocked,
  cancellationError,
  nextRefundEligibilityState,
  parseRefundEligibilityStage,
  policyEvidenceInvalid,
  REFUND_CANCELLATION_ERROR_REASONS,
} from "./refund-cancellation-domain.js";
import {
  assertCanonicalProviderRequestCore,
} from "../provider-requests/provider-request-integrity.js";
import {
  authorizeProviderRequest,
} from "../provider-requests/provider-request-authorization.js";
import {
  canonicalPaymentLinkageReason,
  paymentIdForProviderRequest,
} from "../payments/payment-lifecycle.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  PAYMENT_STATUSES,
  USER_ROLES,
  type PaymentStatus,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";

const INPUT_FIELDS = new Set([
  "providerRequestId",
  "targetStage",
  "evidence",
  "idempotencyKey",
]);

type StageResult = {
  providerRequestId: string;
  mainEventId: string;
  currentStage: "preparation_started";
  stageSequence: number;
  changed: boolean;
};

export const advanceProviderRequestRefundEligibilityStage = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request): Promise<StageResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "refundEligibility.advance",
      limit: 20,
      windowSeconds: 10 * 60,
    });

    const input = exactInput(request.data);
    const providerRequestId = requireString(
      input.providerRequestId,
      "providerRequestId",
      {minLength: 8, maxLength: 160},
    );
    const targetStage = parseRefundEligibilityStage(input.targetStage);

    if (targetStage !== "preparation_started") {
      throw cancellationError(
        "failed-precondition",
        REFUND_CANCELLATION_ERROR_REASONS.transitionInvalid,
        "Service start must use the provider booking lifecycle operation.",
      );
    }

    const evidence = optionalEvidence(input.evidence);
    const clientKey = requireString(
      input.idempotencyKey,
      "idempotencyKey",
      {minLength: 8, maxLength: 200},
    );
    const operation = "refundEligibility.advance";
    const key = createIdempotencyKey({
      operation,
      actorId: actor.uid,
      clientKey,
      payload: {providerRequestId, targetStage},
    });
    const execution = await executeIdempotently<StageResult>({
      key,
      operation,
      actorId: actor.uid,
      handler: () => advanceStage({
        actorUid: actor.uid,
        providerRequestId,
        evidence,
      }),
    });

    logSecurityEvent({
      action: "refund_eligibility_stage_advance",
      outcome: "succeeded",
      actorUid: actor.uid,
      targetId: providerRequestId,
      metadata: {
        changed: execution.result.changed,
        replayed: execution.replayed,
      },
    });

    return execution.result;
  },
);

async function advanceStage(input: {
  actorUid: string;
  providerRequestId: string;
  evidence: string | null;
}): Promise<StageResult> {
  const requestReference = db.collection("providerRequests")
    .doc(input.providerRequestId);
  const initial = await requestReference.get();

  if (!initial.exists) {
    throw new HttpsError("not-found", "The provider request was not found.");
  }

  const initialData = initial.data() ?? {};
  const providerId = stringValue(initialData.providerId);
  const mainEventId = stringValue(initialData.mainEventId);

  if (!providerId || !mainEventId) {
    throw policyEvidenceInvalid();
  }

  const providerReference = db.collection("providers").doc(providerId);
  const mainEventReference = db.collection("mainEvents").doc(mainEventId);
  const paymentId = paymentIdForProviderRequest(input.providerRequestId);
  const paymentReference = db.collection("payments").doc(paymentId);
  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, providerSnapshot, mainEventSnapshot,
      paymentSnapshot] = await transaction.getAll(
      requestReference,
      providerReference,
      mainEventReference,
      paymentReference,
    );
    const authorized = authorizeProviderRequest({
      actorUid: input.actorUid,
      providerRequestSnapshot: requestSnapshot,
      providerSnapshot,
    });
    assertCanonicalProviderRequestCore({
      authorized,
      mainEventSnapshot,
    });

    const classification =
      classifyProviderRequestRefundPolicyEvidence(authorized.requestData);

    if (classification.status !== "policy_backed") {
      throw policyEvidenceInvalid();
    }

    const state = requireRefundEligibilityState(authorized.requestData);
    assertRefundEligibilityUnlocked(state);

    if (state.currentStage === "preparation_started") {
      return {
        providerRequestId: input.providerRequestId,
        mainEventId,
        currentStage: "preparation_started",
        stageSequence: state.stageSequence,
        changed: false,
      };
    }

    assertRefundEligibilityTransition(
      state.currentStage,
      "preparation_started",
    );

    const payment = paymentSnapshot.exists
      ? paymentSnapshot.data() ?? {}
      : null;
    const downPaymentAmount = authorized.requestData.downPaymentAmount;

    if (
      typeof downPaymentAmount === "number" &&
      downPaymentAmount > 0 &&
      payment
    ) {
      if (
        canonicalPaymentLinkageReason({
          paymentId,
          providerRequestId: input.providerRequestId,
          mainEventId,
          customerId: authorized.customerId,
          providerId,
          payment,
          providerRequest: authorized.requestData,
          mainEvent: mainEventSnapshot.data() ?? {},
        })
      ) {
        throw cancellationError(
          "failed-precondition",
          REFUND_CANCELLATION_ERROR_REASONS.eligibilityInvalid,
          "Provider-request payment readiness is invalid.",
        );
      }
    }

    assertPreparationReady({
      providerRequestStatus: authorized.status,
      downPaymentAmount,
      providerRequestPaymentStatus: authorized.requestData.paymentStatus,
      paidAt: authorized.requestData.paidAt,
      paymentStatus: paymentStatus(payment?.status),
    });

    const timestamp = serverTimestamp();
    const nextState = nextRefundEligibilityState(
      state,
      "preparation_started",
      timestamp,
    );

    transaction.update(requestReference, {
      refundEligibilityState: nextState,
      updatedAt: timestamp,
    });
    writeAuditLogInTransaction(transaction, {
      actorId: input.actorUid,
      actorRole: "provider",
      action: "refund_eligibility.stage_advanced",
      targetCollection: "providerRequests",
      targetId: input.providerRequestId,
      before: {
        stage: state.currentStage,
        stageSequence: state.stageSequence,
      },
      after: {
        stage: "preparation_started",
        stageSequence: nextState.stageSequence,
      },
      metadata: {
        mainEventId,
        providerId,
        evidenceProvided: input.evidence !== null,
      },
    });

    return {
      providerRequestId: input.providerRequestId,
      mainEventId,
      currentStage: "preparation_started",
      stageSequence: nextState.stageSequence,
      changed: true,
    };
  });
}

function exactInput(value: unknown): Record<string, unknown> {
  const input = requireObject(value);
  const keys = Object.keys(input);

  if (
    keys.some((field) => !INPUT_FIELDS.has(field)) ||
    !Object.hasOwn(input, "providerRequestId") ||
    !Object.hasOwn(input, "targetStage") ||
    !Object.hasOwn(input, "idempotencyKey")
  ) {
    throw new HttpsError("invalid-argument", "Stage request is invalid.");
  }

  return input;
}

function optionalEvidence(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireString(value, "evidence", {minLength: 3, maxLength: 500});
}

function paymentStatus(value: unknown): PaymentStatus | null {
  return PAYMENT_STATUSES.includes(value as PaymentStatus)
    ? value as PaymentStatus
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
