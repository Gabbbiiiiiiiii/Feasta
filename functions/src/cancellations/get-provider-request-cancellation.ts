import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";
import {
  canonicalPaymentLinkageReason,
  canonicalRequestLinkageReason,
  paymentIdForProviderRequest,
} from "../payments/payment-lifecycle.js";
import {requireSafeDocumentId} from
  "../refund-policies/refund-policy-domain.js";
import {
  calculateCancellationRefund,
  REFUND_ACCOUNTING_ERROR_REASONS,
} from "../refunds/refund-accounting-domain.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  PAYMENT_CURRENCY,
  USER_ROLES,
  parseProviderRequestStatus,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireObject, requireString} from "../shared/validation.js";
import {
  CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES,
  isCancellationWorkflowActive,
  parseProviderRequestCancellationStatus,
  type ProviderRequestCancellationStatus,
} from "./refund-cancellation-domain.js";
import {
  CANCELLATION_REFUND_ROLLOUT_DOCUMENT_ID,
  parseCancellationRefundRollout,
} from "./cancellation-rollout.js";

type UnknownRecord = Record<string, unknown>;
const INPUT_FIELDS = new Set(["providerRequestId"]);

type SafeRefund = {
  status:
    | "none"
    | "manual_review"
    | "approved"
    | "processing"
    | "failed_retry_pending"
    | "failed_reconciliation_required"
    | "partial_completed"
    | "full_completed";
  amountInCentavos: number | null;
  completedAmountInCentavos: number | null;
  currency: typeof PAYMENT_CURRENCY | null;
};

type SafeCancellation = {
  cancellationRequestId: string;
  providerRequestId: string;
  status: ProviderRequestCancellationStatus;
  policyEvidenceStatus: "policy_backed" | "legacy";
  frozenStage: "preparation_not_started" | "preparation_started" |
    "service_started" | null;
  manualReviewRequired: boolean;
  decisionStatus: "pending" | "approved" | "rejected";
  refund: SafeRefund;
  submittedAt: string;
  updatedAt: string;
};

const callableOptions = {
  ...appCheckCallableOptions,
  timeoutSeconds: 30,
} as const;

export const getProviderRequestCancellationOptions = onCall(
  callableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.customer]);
    await enforceCallableRateLimit(request, {
      scope: "providerRequestCancellation.options",
      limit: 30,
      windowSeconds: 10 * 60,
    });
    return cancellationOptions(
      actor.uid,
      providerRequestIdInput(request.data),
    );
  },
);

export const getProviderRequestCancellationStatus = onCall(
  callableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.customer, USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "providerRequestCancellation.status",
      limit: 60,
      windowSeconds: 10 * 60,
    });
    return participantCancellationStatus(
      actor.uid,
      providerRequestIdInput(request.data),
    );
  },
);

async function cancellationOptions(
  actorUid: string,
  providerRequestId: string,
): Promise<UnknownRecord> {
  const references = baseReferences(providerRequestId);
  const initial = await references.request.get();
  if (!initial.exists) throw notFound();
  const initialData = initial.data() ?? {};
  const mainEventId = storedId(initialData.mainEventId, "Main event");
  const providerId = storedId(initialData.providerId, "Provider");
  const mainEventReference = db.collection("mainEvents").doc(mainEventId);
  const providerReference = db.collection("providers").doc(providerId);
  const paymentId = paymentIdForProviderRequest(providerRequestId);
  const paymentReference = db.collection("payments").doc(paymentId);
  const rolloutReference = db.collection("appSettings")
    .doc(CANCELLATION_REFUND_ROLLOUT_DOCUMENT_ID);

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, mainEventSnapshot, providerSnapshot,
      paymentSnapshot, rolloutSnapshot] = await transaction.getAll(
      references.request,
      mainEventReference,
      providerReference,
      paymentReference,
      rolloutReference,
    );
    if (!requestSnapshot.exists || !mainEventSnapshot.exists ||
      !providerSnapshot.exists) throw notFound();
    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    const payment = paymentSnapshot.exists ? paymentSnapshot.data() ?? {} : null;
    assertCustomerContext({
      actorUid,
      providerRequestId,
      mainEventId,
      providerId,
      providerRequest,
      mainEvent,
      paymentId,
      payment,
    });
    const evidence = classifyProviderRequestRefundPolicyEvidence(providerRequest);
    if (evidence.status === "invalid") throw policyInvalid();
    const cancellationId = latestCancellationId(providerRequest, evidence.status);
    const cancellation = cancellationId
      ? await loadCancellation(transaction, cancellationId, {
          providerRequestId,
          mainEventId,
          customerId: actorUid,
          providerId,
        })
      : null;
    const operation = cancellation && cancellationId &&
      cancellation.refundOperationId
      ? await loadOperation(
          transaction,
          paymentReference,
          storedId(cancellation.refundOperationId, "Refund operation"),
          cancellationId,
          providerRequestId,
        )
      : null;
    const safeCancellation = cancellation && cancellationId
      ? safeCancellationProjection({
          cancellationRequestId: cancellationId,
          providerRequestId,
          cancellation,
          operation,
          payment,
        })
      : null;
    const rollout = parseCancellationRefundRollout({
      exists: rolloutSnapshot.exists,
      data: rolloutSnapshot.data(),
    });
    const status = parseProviderRequestStatus(providerRequest.status);
    if (!status) throw policyInvalid();
    const activeCancellation = safeCancellation &&
      isCancellationWorkflowActive(safeCancellation.status)
      ? safeCancellation
      : null;
    const policy = evidence.status === "policy_backed"
      ? policyDisclosure(providerRequest)
      : null;

    if (rollout.customerCancellationMode === "off") {
      return optionsResult(providerRequestId, false, "ROLLOUT_DISABLED",
        activeCancellation, policy, null);
    }
    if (activeCancellation) {
      return optionsResult(providerRequestId, false,
        "ACTIVE_CANCELLATION_EXISTS", activeCancellation, policy, null);
    }
    if (!CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES.includes(
      status as typeof CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES[number],
    )) {
      return optionsResult(providerRequestId, false,
        "PROVIDER_REQUEST_STATUS_INELIGIBLE", null, policy, null);
    }
    if (evidence.status === "legacy") {
      return optionsResult(providerRequestId, true, "LEGACY_MANUAL_REVIEW",
        null, null, null);
    }
    if (
      status === "payment_processing" ||
      payment?.status === "processing" ||
      payment?.status === "pending"
    ) {
      return optionsResult(providerRequestId, true,
        "PAYMENT_RECONCILIATION_REQUIRED", null, policy, null);
    }
    const eligibility = requireRefundEligibilityState(providerRequest);
    const calculation = calculateCancellationRefund({
      providerRequest,
      cancellationRequest: {
        policyEvidenceStatus: "policy_backed",
        frozenEligibility: {
          stage: eligibility.currentStage,
          stageSequence: eligibility.stageSequence,
          frozenAt: Timestamp.now(),
        },
      },
      payment,
    });
    if (calculation.calculationStatus === "manual_review_required") {
      throw policyInvalid();
    }
    return optionsResult(providerRequestId, true, "ALLOWED", null, policy, {
      calculationStatus: calculation.calculationStatus,
      frozenStage: calculation.frozenStage,
      refundAmountInCentavos: calculation.eligibleRefundAmountInCentavos,
      currency: calculation.currency,
    });
  });
}

async function participantCancellationStatus(
  actorUid: string,
  providerRequestId: string,
): Promise<{providerRequestId: string; cancellation: SafeCancellation | null}> {
  const references = baseReferences(providerRequestId);
  const initial = await references.request.get();
  if (!initial.exists) throw notFound();
  const data = initial.data() ?? {};
  const mainEventId = storedId(data.mainEventId, "Main event");
  const providerId = storedId(data.providerId, "Provider");
  const mainEventReference = db.collection("mainEvents").doc(mainEventId);
  const providerReference = db.collection("providers").doc(providerId);
  const userReference = db.collection("users").doc(actorUid);
  const paymentId = paymentIdForProviderRequest(providerRequestId);
  const paymentReference = db.collection("payments").doc(paymentId);
  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, mainEventSnapshot, providerSnapshot, userSnapshot,
      paymentSnapshot] = await transaction.getAll(
      references.request,
      mainEventReference,
      providerReference,
      userReference,
      paymentReference,
    );
    if (!requestSnapshot.exists || !mainEventSnapshot.exists ||
      !providerSnapshot.exists || !userSnapshot.exists) throw notFound();
    const providerRequest = requestSnapshot.data() ?? {};
    const mainEvent = mainEventSnapshot.data() ?? {};
    const customerId = storedId(providerRequest.customerId, "Customer");
    const payment = paymentSnapshot.exists ? paymentSnapshot.data() ?? {} : null;
    const role = userSnapshot.data()?.role;
    const customerAuthorized = role === USER_ROLES.customer &&
      customerId === actorUid && mainEvent.customerId === actorUid;
    const providerAuthorized = role === USER_ROLES.provider &&
      providerSnapshot.data()?.ownerId === actorUid &&
      providerRequest.providerId === providerId;
    if (!customerAuthorized && !providerAuthorized) throw denied();
    if (canonicalRequestLinkageReason({
      providerRequestId,
      mainEventId,
      customerId,
      providerId,
      providerRequest,
      mainEvent,
    }) || payment && canonicalPaymentLinkageReason({
      paymentId,
      providerRequestId,
      mainEventId,
      customerId,
      providerId,
      payment,
      providerRequest,
      mainEvent,
    })) throw denied();
    const evidence = classifyProviderRequestRefundPolicyEvidence(providerRequest);
    if (evidence.status === "invalid") throw policyInvalid();
    const cancellationId = latestCancellationId(providerRequest, evidence.status);
    if (!cancellationId) return {providerRequestId, cancellation: null};
    const cancellation = await loadCancellation(
      transaction,
      cancellationId,
      {providerRequestId, mainEventId, customerId, providerId},
    );
    const operation = cancellation.refundOperationId
      ? await loadOperation(
          transaction,
          paymentReference,
          storedId(cancellation.refundOperationId, "Refund operation"),
          cancellationId,
          providerRequestId,
        )
      : null;
    return {
      providerRequestId,
      cancellation: safeCancellationProjection({
        cancellationRequestId: cancellationId,
        providerRequestId,
        cancellation,
        operation,
        payment,
      }),
    };
  });
}

function safeCancellationProjection(input: {
  cancellationRequestId: string;
  providerRequestId: string;
  cancellation: UnknownRecord;
  operation: UnknownRecord | null;
  payment: UnknownRecord | null;
}): SafeCancellation {
  if (input.cancellation.providerRequestId !== input.providerRequestId) {
    throw policyInvalid();
  }
  const status = parseProviderRequestCancellationStatus(input.cancellation.status);
  const evidence = input.cancellation.policyEvidenceStatus;
  if (evidence !== "policy_backed" && evidence !== "legacy") {
    throw policyInvalid();
  }
  const frozen = input.cancellation.frozenEligibility;
  const frozenStage = evidence === "legacy" ? null : frozenStageValue(frozen);
  const decision = recordValue(input.cancellation.decision);
  const decisionStatus = decision?.outcome === "approved" ? "approved" :
    decision?.outcome === "rejected" ? "rejected" : "pending";
  const calculation = recordValue(input.cancellation.refundCalculation);
  const amount = safeOptionalCentavos(
    calculation?.eligibleRefundAmountInCentavos ?? input.operation?.amountInCentavos,
  );
  return {
    cancellationRequestId: input.cancellationRequestId,
    providerRequestId: input.providerRequestId,
    status,
    policyEvidenceStatus: evidence,
    frozenStage,
    manualReviewRequired: evidence === "legacy" ||
      status === "under_review" || status === "awaiting_payment_resolution",
    decisionStatus,
    refund: safeRefundProjection(status, amount, input.operation, input.payment),
    submittedAt: timestampIso(input.cancellation.submittedAt),
    updatedAt: timestampIso(input.cancellation.updatedAt),
  };
}

function safeRefundProjection(
  cancellationStatus: ProviderRequestCancellationStatus,
  amount: number | null,
  operation: UnknownRecord | null,
  payment: UnknownRecord | null,
): SafeRefund {
  const currency = amount === null ? null : PAYMENT_CURRENCY;
  if (cancellationStatus === "refund_completed") {
    if (!operation || operation.status !== "completed" || amount === null) {
      throw policyInvalid();
    }
    const original = safeOptionalCentavos(payment?.amountInCentavos);
    if (original === null || amount > original) throw policyInvalid();
    return {
      status: amount === original ? "full_completed" : "partial_completed",
      amountInCentavos: amount,
      completedAmountInCentavos: amount,
      currency,
    };
  }
  const progress = cancellationStatus === "refund_processing" ? "processing" :
    cancellationStatus === "refund_failed" ? refundFailureProgress(operation) :
      cancellationStatus === "approved" ? "approved" :
        cancellationStatus === "under_review" ||
          cancellationStatus === "awaiting_payment_resolution" ?
          "manual_review" : "none";
  return {
    status: progress,
    amountInCentavos: amount,
    completedAmountInCentavos: null,
    currency,
  };
}

function refundFailureProgress(
  operation: UnknownRecord | null,
): "failed_retry_pending" | "failed_reconciliation_required" {
  return operation?.gatewayFailureCertainty === "ambiguous" ||
    operation?.failureCode === "GATEWAY_MINIMUM_UNSUPPORTED" ||
    operation?.failureCode === "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED"
    ? "failed_reconciliation_required"
    : "failed_retry_pending";
}

function optionsResult(
  providerRequestId: string,
  cancellationAllowed: boolean,
  reasonCode: string,
  activeCancellation: SafeCancellation | null,
  policy: UnknownRecord | null,
  refundPreview: UnknownRecord | null,
): UnknownRecord {
  return {
    providerRequestId,
    cancellationAllowed,
    reasonCode,
    activeCancellation,
    policy,
    refundPreview,
  };
}

function policyDisclosure(providerRequest: UnknownRecord): UnknownRecord {
  const snapshot = recordValue(providerRequest.refundPolicySnapshot);
  const source = recordValue(snapshot?.source);
  if (!snapshot || !source ||
    (source.kind !== "provider_default" && source.kind !== "package_override") ||
    !Number.isSafeInteger(source.policyVersion) ||
    typeof snapshot.policyKey !== "string" ||
    !Array.isArray(snapshot.rules) ||
    (snapshot.terms !== null && typeof snapshot.terms !== "string")) {
    throw policyInvalid();
  }
  return {
    policyKey: snapshot.policyKey,
    sourceKind: source.kind,
    policyVersion: source.policyVersion,
    rules: snapshot.rules.map((rule) => ({...(rule as UnknownRecord)})),
    terms: snapshot.terms,
  };
}

function latestCancellationId(
  providerRequest: UnknownRecord,
  evidence: "policy_backed" | "legacy",
): string | null {
  const latest = nullableStoredId(providerRequest.latestCancellationRequestId);
  const approved = nullableStoredId(providerRequest.approvedCancellationRequestId);
  const eligibility = evidence === "policy_backed"
    ? requireRefundEligibilityState(providerRequest)
    : null;
  const active = evidence === "policy_backed"
    ? eligibility?.activeCancellationRequestId ?? null
    : nullableStoredId(providerRequest.activeCancellationRequestId);
  if (active && latest && active !== latest) throw policyInvalid();
  return latest ?? active ?? approved;
}

async function loadCancellation(
  transaction: FirebaseFirestore.Transaction,
  cancellationRequestId: string,
  expected: {
    providerRequestId: string;
    mainEventId: string;
    customerId: string;
    providerId: string;
  },
): Promise<UnknownRecord> {
  const snapshot = await transaction.get(
    db.collection("providerRequestCancellationRequests")
      .doc(cancellationRequestId),
  );
  const data = snapshot.data();
  if (!snapshot.exists || data?.providerRequestId !== expected.providerRequestId ||
    data?.mainEventId !== expected.mainEventId ||
    data?.customerId !== expected.customerId ||
    data?.providerId !== expected.providerId) {
    throw policyInvalid();
  }
  return data ?? {};
}

async function loadOperation(
  transaction: FirebaseFirestore.Transaction,
  paymentReference: FirebaseFirestore.DocumentReference,
  operationId: string,
  cancellationRequestId: string,
  providerRequestId: string,
): Promise<UnknownRecord> {
  const snapshot = await transaction.get(
    paymentReference.collection("refunds").doc(operationId),
  );
  const data = snapshot.data();
  if (!snapshot.exists ||
    data?.cancellationRequestId !== cancellationRequestId ||
    data?.providerRequestId !== providerRequestId ||
    data?.paymentId !== paymentReference.id) throw policyInvalid();
  return data ?? {};
}

function assertCustomerContext(input: {
  actorUid: string;
  providerRequestId: string;
  mainEventId: string;
  providerId: string;
  providerRequest: UnknownRecord;
  mainEvent: UnknownRecord;
  paymentId: string;
  payment: UnknownRecord | null;
}): void {
  if (input.providerRequest.customerId !== input.actorUid ||
    input.mainEvent.customerId !== input.actorUid ||
    canonicalRequestLinkageReason({
      providerRequestId: input.providerRequestId,
      mainEventId: input.mainEventId,
      customerId: input.actorUid,
      providerId: input.providerId,
      providerRequest: input.providerRequest,
      mainEvent: input.mainEvent,
    }) ||
    input.payment && canonicalPaymentLinkageReason({
      paymentId: input.paymentId,
      providerRequestId: input.providerRequestId,
      mainEventId: input.mainEventId,
      customerId: input.actorUid,
      providerId: input.providerId,
      payment: input.payment,
      providerRequest: input.providerRequest,
      mainEvent: input.mainEvent,
    })) throw denied();
}

function baseReferences(providerRequestId: string) {
  return {request: db.collection("providerRequests").doc(providerRequestId)};
}

function providerRequestIdInput(value: unknown): string {
  const input = requireObject(value);
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys.some((key) => !INPUT_FIELDS.has(key))) {
    throw new HttpsError("invalid-argument", "Cancellation lookup is invalid.");
  }
  return requireSafeDocumentId(
    requireString(input.providerRequestId, "providerRequestId", {
      minLength: 8,
      maxLength: 160,
    }),
    "Provider request",
  );
}

function frozenStageValue(value: unknown): SafeCancellation["frozenStage"] {
  const frozen = recordValue(value);
  const stage = frozen?.stage;
  if (stage !== "preparation_not_started" && stage !== "preparation_started" &&
    stage !== "service_started") throw policyInvalid();
  return stage;
}

function recordValue(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function safeOptionalCentavos(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw policyInvalid();
  return value as number;
}

function timestampIso(value: unknown): string {
  if (!(value instanceof Timestamp)) throw policyInvalid();
  return value.toDate().toISOString();
}

function nullableStoredId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return storedId(value, "Cancellation request");
}

function storedId(value: unknown, label: string): string {
  try {
    return requireSafeDocumentId(value, label);
  } catch {
    throw policyInvalid();
  }
}

function denied(): HttpsError {
  return new HttpsError("permission-denied", "Cancellation state is unavailable.");
}

function notFound(): HttpsError {
  return new HttpsError("not-found", "The provider request was not found.");
}

function policyInvalid(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Cancellation evidence requires secure review.",
    {reason: REFUND_ACCOUNTING_ERROR_REASONS.policyEvidenceInvalid},
  );
}
