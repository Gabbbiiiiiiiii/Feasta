import {Timestamp} from "firebase-admin/firestore";
import {
  cancellationPaymentSetState,
  cancellationPaymentState,
} from "./cancellation-payment-state.js";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";
import {
  canonicalPaymentLinkageReason,
  canonicalRequestLinkageReason,
} from "../payments/payment-lifecycle.js";
import {
  readTrustedProviderRequestPaymentSetInTransaction,
} from "../payments/provider-request-payment-reader.js";
import {requireSafeDocumentId} from
  "../refund-policies/refund-policy-domain.js";
import {
  calculateCancellationRefund,
  calculateCancellationRefundForPaymentSet,
  REFUND_ACCOUNTING_ERROR_REASONS,
} from "../refunds/refund-accounting-domain.js";
import {
  readRefundOperationBindings,
  refundOperationSetCancellationStatus,
  type RefundOperationBinding,
  type RefundOperationSetEntry,
} from "../refunds/refund-operation-set.js";
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
  assertEligibilityLifecycleInvariant,
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


  const rolloutReference = db.collection("appSettings")
    .doc(CANCELLATION_REFUND_ROLLOUT_DOCUMENT_ID);

  return db.runTransaction(async (transaction) => {
    const [
      requestSnapshot,
      mainEventSnapshot,
      providerSnapshot,
      rolloutSnapshot,
    ] = await transaction.getAll(
      references.request,
      mainEventReference,
      providerReference,
      rolloutReference,
    );
    if (!requestSnapshot.exists || !mainEventSnapshot.exists ||
      !providerSnapshot.exists) throw notFound();
    const providerRequest =
      requestSnapshot.data() ?? {};

    const mainEvent =
      mainEventSnapshot.data() ?? {};

    const paymentSet =
      await readTrustedProviderRequestPaymentSetInTransaction({
        transaction,
        providerRequestId,
        providerRequest,
        mainEventId,
        customerId:
          actorUid,
        providerId,
        mainEvent,
        invalid: (): never => {
          throw policyInvalid();
        },
      });

    const paymentId =
      paymentSet.currentPaymentId;

    const paymentReference =
      paymentSet.currentPaymentReference;

    const payment =
      paymentSet.currentPayment;

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
    let refundProjection:
      RefundProjectionState | null =
        null;

    if (
      cancellation &&
      cancellationId
    ) {
      refundProjection =
        await loadRefundProjectionState({
          transaction,
          cancellationRequestId:
            cancellationId,
          cancellation,
          providerRequestId,
          providerRequest,
          mainEventId,
          mainEvent,
          customerId:
            actorUid,
          providerId,
          legacyPaymentReference:
            paymentReference,
          legacyPayment:
            payment,
        });
    }

    const safeCancellation =
      cancellation &&
      cancellationId &&
      refundProjection
        ? safeCancellationProjection({
            cancellationRequestId:
              cancellationId,
            providerRequestId,
            cancellation,
            refundProjection,
          })
        : null;
    const rollout = parseCancellationRefundRollout({
      exists: rolloutSnapshot.exists,
      data: rolloutSnapshot.data(),
    });
    const status = parseProviderRequestStatus(providerRequest.status);
    if (!status) throw policyInvalid();
    const result = (...args: Parameters<typeof optionsResult>) => ({
      ...optionsResult(...args), providerRequestStatus: status,
    });
    const activeCancellation = safeCancellation &&
      isCancellationWorkflowActive(safeCancellation.status)
      ? safeCancellation
      : null;
    const policy = evidence.status === "policy_backed"
      ? policyDisclosure(providerRequest)
      : null;

    if (rollout.customerCancellationMode === "off") {
      return result(providerRequestId, false, "ROLLOUT_DISABLED",
        activeCancellation, policy, null);
    }
    if (activeCancellation) {
      return result(providerRequestId, false,
        "ACTIVE_CANCELLATION_EXISTS", activeCancellation, policy, null);
    }
    if (!CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES.includes(
      status as typeof CANCELLATION_ELIGIBLE_PROVIDER_REQUEST_STATUSES[number],
    )) {
      return result(providerRequestId, false,
        "PROVIDER_REQUEST_STATUS_INELIGIBLE", null, policy, null);
    }
    const paymentState =
      paymentSet.mode === "p5"
        ? cancellationPaymentSetState(
            providerRequest,
            paymentSet.settlement,
            paymentSet.payments,
          )
        : cancellationPaymentState(
            providerRequest,
            payment,
          );
    if (paymentState === "refund_ineligible") {
      return result(providerRequestId, false, "PAYMENT_REFUND_INELIGIBLE",
        null, policy, null);
    }
    if (evidence.status === "legacy") {
      return result(providerRequestId, true, "LEGACY_MANUAL_REVIEW",
        null, null, null);
    }
    if (
      paymentState === "awaiting_payment_resolution"
    ) {
      return result(providerRequestId, true,
        "PAYMENT_RECONCILIATION_REQUIRED", null, policy, null);
    }
    const eligibility = requireRefundEligibilityState(providerRequest);
    assertEligibilityLifecycleInvariant({providerRequestStatus: status, state: eligibility});
    const cancellationEvidence = {
      policyEvidenceStatus:
        "policy_backed",

      frozenEligibility: {
        stage:
          eligibility.currentStage,

        stageSequence:
          eligibility.stageSequence,

        frozenAt:
          Timestamp.now(),
      },
    };

    const calculation =
      paymentSet.mode === "p5"
        ? calculateCancellationRefundForPaymentSet({
            providerRequest,
            cancellationRequest:
              cancellationEvidence,
            settlement:
              paymentSet.settlement,
            payments:
              paymentSet.payments,
          })
        : calculateCancellationRefund({
            providerRequest,
            cancellationRequest:
              cancellationEvidence,
            payment,
          });
    if (calculation.calculationStatus === "manual_review_required") {
      throw policyInvalid();
    }
    return result(providerRequestId, true, "ALLOWED", null, policy, {
      calculationStatus: calculation.calculationStatus,
      frozenStage: calculation.frozenStage,
      refundAmountInCentavos: calculation.eligibleRefundAmountInCentavos,
      paidAmountInCentavos: calculation.originalPaidAmountInCentavos,
      nonRefundableAmountInCentavos: calculation.originalPaidAmountInCentavos -
        calculation.targetTotalRefundAmountInCentavos,
      currency: calculation.currency,
    });
  });
}

async function participantCancellationStatus(
  actorUid: string,
  providerRequestId: string,
): Promise<{
  providerRequestId:
    string;

  cancellation:
    SafeCancellation | null;
}> {
  const references =
    baseReferences(
      providerRequestId,
    );

  const initial =
    await references.request.get();

  if (!initial.exists) {
    throw notFound();
  }

  const data =
    initial.data() ?? {};

  const mainEventId =
    storedId(
      data.mainEventId,
      "Main event",
    );

  const providerId =
    storedId(
      data.providerId,
      "Provider",
    );

  const mainEventReference =
    db.collection(
      "mainEvents",
    ).doc(
      mainEventId,
    );

  const providerReference =
    db.collection(
      "providers",
    ).doc(
      providerId,
    );

  const userReference =
    db.collection(
      "users",
    ).doc(
      actorUid,
    );

  return db.runTransaction(
    async (transaction) => {
      const [
        requestSnapshot,
        mainEventSnapshot,
        providerSnapshot,
        userSnapshot,
      ] =
        await transaction.getAll(
          references.request,
          mainEventReference,
          providerReference,
          userReference,
        );

      if (
        !requestSnapshot.exists ||
        !mainEventSnapshot.exists ||
        !providerSnapshot.exists ||
        !userSnapshot.exists
      ) {
        throw notFound();
      }

      const providerRequest =
        requestSnapshot.data() ??
        {};

      const mainEvent =
        mainEventSnapshot.data() ??
        {};

      const customerId =
        storedId(
          providerRequest.customerId,
          "Customer",
        );

      const role =
        userSnapshot.data()?.role;

      const customerAuthorized =
        role ===
          USER_ROLES.customer &&
        customerId ===
          actorUid &&
        mainEvent.customerId ===
          actorUid;

      const providerAuthorized =
        role ===
          USER_ROLES.provider &&
        providerSnapshot
          .data()?.ownerId ===
          actorUid &&
        providerRequest.providerId ===
          providerId;

      if (
        !customerAuthorized &&
        !providerAuthorized
      ) {
        throw denied();
      }

      if (
        canonicalRequestLinkageReason({
          providerRequestId,
          mainEventId,
          customerId,
          providerId,
          providerRequest,
          mainEvent,
        })
      ) {
        throw denied();
      }

      const paymentSet =
        await readTrustedProviderRequestPaymentSetInTransaction({
          transaction,
          providerRequestId,
          providerRequest,
          mainEventId,
          customerId,
          providerId,
          mainEvent,

          invalid: (): never => {
            throw denied();
          },
        });

      const paymentId =
        paymentSet.currentPaymentId;

      const payment =
        paymentSet.currentPayment;

      if (
        payment &&
        canonicalPaymentLinkageReason({
          paymentId,
          providerRequestId,
          mainEventId,
          customerId,
          providerId,
          payment,
          providerRequest,
          mainEvent,
        })
      ) {
        throw denied();
      }

      const evidence =
        classifyProviderRequestRefundPolicyEvidence(
          providerRequest,
        );

      if (
        evidence.status ===
        "invalid"
      ) {
        throw policyInvalid();
      }

      const cancellationId =
        latestCancellationId(
          providerRequest,
          evidence.status,
        );

      if (!cancellationId) {
        return {
          providerRequestId,
          cancellation:
            null,
        };
      }

      const cancellation =
        await loadCancellation(
          transaction,
          cancellationId,
          {
            providerRequestId,
            mainEventId,
            customerId,
            providerId,
          },
        );

      const refundProjection =
        await loadRefundProjectionState({
          transaction,
          cancellationRequestId:
            cancellationId,
          cancellation,
          providerRequestId,
          providerRequest,
          mainEventId,
          mainEvent,
          customerId,
          providerId,
          legacyPaymentReference:
            paymentSet
              .currentPaymentReference,
          legacyPayment:
            payment,
        });

      return {
        providerRequestId,

        cancellation:
          safeCancellationProjection({
            cancellationRequestId:
              cancellationId,
            providerRequestId,
            cancellation,
            refundProjection,
          }),
      };
    },
  );
}

function safeCancellationProjection(input: {
  cancellationRequestId:
    string;

  providerRequestId:
    string;

  cancellation:
    UnknownRecord;

  refundProjection:
    RefundProjectionState;
}): SafeCancellation {
  if (
    input.cancellation
      .providerRequestId !==
    input.providerRequestId
  ) {
    throw policyInvalid();
  }

  const status =
    parseProviderRequestCancellationStatus(
      input.cancellation.status,
    );

  const evidence =
    input.cancellation
      .policyEvidenceStatus;

  if (
    evidence !== "policy_backed" &&
    evidence !== "legacy"
  ) {
    throw policyInvalid();
  }

  const frozen =
    input.cancellation
      .frozenEligibility;

  const frozenStage =
    evidence === "legacy"
      ? null
      : frozenStageValue(
          frozen,
        );

  const decision =
    recordValue(
      input.cancellation
        .decision,
    );

  const decisionStatus =
    decision?.outcome ===
      "approved"
      ? "approved"
      : decision?.outcome ===
          "rejected"
        ? "rejected"
        : "pending";

  const calculation =
    recordValue(
      input.cancellation
        .refundCalculation,
    );

  const amount =
    safeOptionalCentavos(
      calculation
        ?.eligibleRefundAmountInCentavos ??
      input.refundProjection
        .legacyOperation
        ?.amountInCentavos,
    );

  const originalPaidAmount =
    safeOptionalCentavos(
      calculation
        ?.originalPaidAmountInCentavos ??
      input.refundProjection
        .legacyPayment
        ?.amountInCentavos,
    );

  return {
    cancellationRequestId:
      input.cancellationRequestId,

    providerRequestId:
      input.providerRequestId,

    status,

    policyEvidenceStatus:
      evidence,

    frozenStage,

    manualReviewRequired:
      evidence === "legacy" ||
      status ===
        "under_review" ||
      status ===
        "awaiting_payment_resolution",

    decisionStatus,

    refund:
      safeRefundProjection({
        cancellationStatus:
          status,

        amount,

        originalPaidAmount,

        refundProjection:
          input.refundProjection,
      }),

    submittedAt:
      timestampIso(
        input.cancellation
          .submittedAt,
      ),

    updatedAt:
      timestampIso(
        input.cancellation
          .updatedAt,
      ),
  };
}

function safeRefundProjection(input: {
  cancellationStatus:
    ProviderRequestCancellationStatus;

  amount:
    number | null;

  originalPaidAmount:
    number | null;

  refundProjection:
    RefundProjectionState;
}): SafeRefund {
  if (
    input.refundProjection
      .operationSet !==
    null
  ) {
    return safeOperationSetRefundProjection(
      input,
    );
  }

  return safeLegacyRefundProjection(
    input,
  );
}

function safeLegacyRefundProjection(input: {
  cancellationStatus:
    ProviderRequestCancellationStatus;

  amount:
    number | null;

  originalPaidAmount:
    number | null;

  refundProjection:
    RefundProjectionState;
}): SafeRefund {
  const currency =
    input.amount === null
      ? null
      : PAYMENT_CURRENCY;

  const operation =
    input.refundProjection
      .legacyOperation;

  if (
    input.cancellationStatus ===
      "refund_completed"
  ) {
    if (
      !operation ||
      operation.status !==
        "completed" ||
      input.amount === null ||
      input.originalPaidAmount ===
        null ||
      input.amount >
        input.originalPaidAmount
    ) {
      throw policyInvalid();
    }

    return {
      status:
        input.amount ===
          input.originalPaidAmount
          ? "full_completed"
          : "partial_completed",

      amountInCentavos:
        input.amount,

      completedAmountInCentavos:
        input.amount,

      currency,
    };
  }

  const progress =
    input.cancellationStatus ===
      "refund_processing"
      ? "processing"
      : input.cancellationStatus ===
          "refund_failed"
        ? refundFailureProgress(
            operation,
          )
        : input.cancellationStatus ===
            "approved"
          ? "approved"
          : input.cancellationStatus ===
                "under_review" ||
              input.cancellationStatus ===
                "awaiting_payment_resolution"
            ? "manual_review"
            : "none";

  return {
    status:
      progress,

    amountInCentavos:
      input.amount,

    completedAmountInCentavos:
      null,

    currency,
  };
}

function safeOperationSetRefundProjection(input: {
  cancellationStatus:
    ProviderRequestCancellationStatus;

  amount:
    number | null;

  originalPaidAmount:
    number | null;

  refundProjection:
    RefundProjectionState;
}): SafeRefund {
  const records =
    input.refundProjection
      .operationSet;

  if (records === null) {
    throw policyInvalid();
  }

  const currency =
    input.amount === null
      ? null
      : PAYMENT_CURRENCY;

  if (records.length === 0) {
    if (
      input.cancellationStatus !==
        "cancelled_no_refund"
    ) {
      throw policyInvalid();
    }

    return {
      status:
        "none",

      amountInCentavos:
        input.amount,

      completedAmountInCentavos:
        null,

      currency,
    };
  }

  const entries:
    RefundOperationSetEntry[] =
      records.map(
        (record) => ({
          paymentId:
            record.binding
              .paymentId,

          refundOperationId:
            record.binding
              .refundOperationId,

          status:
            projectionOperationStatus(
              record.operation
                .status,
            ),

          gatewayFailureCertainty:
            record.operation
              .gatewayFailureCertainty,

          failureCode:
            record.operation
              .failureCode,
        }),
      );

  const aggregateStatus =
    refundOperationSetCancellationStatus(
      entries,
    );

  const allocatedAmount =
    records.reduce(
      (sum, record) =>
        safeCentavoAdd(
          sum,
          record.binding
            .amountInCentavos,
        ),
      0,
    );

  const completedAmount =
    records.reduce(
      (sum, record) =>
        record.operation.status ===
          "completed"
          ? safeCentavoAdd(
              sum,
              record.binding
                .amountInCentavos,
            )
          : sum,
      0,
    );

  if (
    input.amount === null ||
    allocatedAmount !==
      input.amount ||
    completedAmount >
      allocatedAmount
  ) {
    throw policyInvalid();
  }

  if (
    input.cancellationStatus ===
      "refund_completed"
  ) {
    if (
      aggregateStatus !==
        "refund_completed" ||
      completedAmount !==
        input.amount ||
      input.originalPaidAmount ===
        null ||
      input.amount >
        input.originalPaidAmount
    ) {
      throw policyInvalid();
    }

    return {
      status:
        input.amount ===
          input.originalPaidAmount
          ? "full_completed"
          : "partial_completed",

      amountInCentavos:
        input.amount,

      completedAmountInCentavos:
        completedAmount,

      currency,
    };
  }

  if (
    input.cancellationStatus ===
      "refund_processing"
  ) {
    if (
      aggregateStatus !==
        "refund_processing"
    ) {
      throw policyInvalid();
    }

    return {
      status:
        "processing",

      amountInCentavos:
        input.amount,

      completedAmountInCentavos:
        null,

      currency,
    };
  }

  if (
    input.cancellationStatus ===
      "refund_failed"
  ) {
    if (
      aggregateStatus !==
        "refund_failed"
    ) {
      throw policyInvalid();
    }

    return {
      status:
        refundOperationSetFailureProgress(
          records,
        ),

      amountInCentavos:
        input.amount,

      completedAmountInCentavos:
        null,

      currency,
    };
  }

  if (
    input.cancellationStatus ===
      "approved"
  ) {
    if (
      aggregateStatus !==
        "refund_processing"
    ) {
      throw policyInvalid();
    }

    return {
      status:
        "approved",

      amountInCentavos:
        input.amount,

      completedAmountInCentavos:
        null,

      currency,
    };
  }

  throw policyInvalid();
}

function refundFailureProgress(
  operation:
    UnknownRecord | null,
):
  "failed_retry_pending" |
  "failed_reconciliation_required" {
  return (
    operation
      ?.gatewayFailureCertainty ===
      "ambiguous" ||
    operation
      ?.failureCode ===
      "GATEWAY_MINIMUM_UNSUPPORTED" ||
    operation
      ?.failureCode ===
      "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED"
  )
    ? "failed_reconciliation_required"
    : "failed_retry_pending";
}

function refundOperationSetFailureProgress(
  records:
    readonly RefundProjectionOperation[],
):
  "failed_retry_pending" |
  "failed_reconciliation_required" {
  return records.some(
    (record) =>
      record.operation
        .gatewayFailureCertainty ===
        "ambiguous" ||
      record.operation
        .failureCode ===
        "GATEWAY_MINIMUM_UNSUPPORTED" ||
      record.operation
        .failureCode ===
        "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED",
  )
    ? "failed_reconciliation_required"
    : "failed_retry_pending";
}

function projectionOperationStatus(
  value:
    unknown,
): RefundOperationSetEntry["status"] {
  if (
    value === "reserved" ||
    value === "processing" ||
    value === "failed" ||
    value === "completed"
  ) {
    return value;
  }

  throw policyInvalid();
}

function safeCentavoAdd(
  left:
    number,

  right:
    number,
): number {
  const result =
    left + right;

  if (
    !Number.isSafeInteger(
      result,
    ) ||
    result < 0
  ) {
    throw policyInvalid();
  }

  return result;
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

type RefundProjectionOperation = {
  binding:
    RefundOperationBinding;

  payment:
    UnknownRecord;

  operation:
    UnknownRecord;
};

type RefundProjectionState = {
  legacyOperation:
    UnknownRecord | null;

  legacyPayment:
    UnknownRecord | null;

  operationSet:
    readonly RefundProjectionOperation[] |
    null;
};

async function loadRefundProjectionState(input: {
  transaction:
    FirebaseFirestore.Transaction;

  cancellationRequestId:
    string;

  cancellation:
    UnknownRecord;

  providerRequestId:
    string;

  providerRequest:
    UnknownRecord;

  mainEventId:
    string;

  mainEvent:
    UnknownRecord;

  customerId:
    string;

  providerId:
    string;

  legacyPaymentReference:
    FirebaseFirestore.DocumentReference |
    null;

  legacyPayment:
    UnknownRecord | null;
}): Promise<RefundProjectionState> {
  const bindings =
    readRefundOperationBindings(
      input.cancellation,
    );

  /*
   * Old cancellation records keep the historical singular
   * operation lookup exactly as before.
   */
  if (bindings === null) {
    let legacyOperation:
      UnknownRecord | null =
        null;

    if (
      input.cancellation
        .refundOperationId
    ) {
      if (
        !input
          .legacyPaymentReference
      ) {
        throw policyInvalid();
      }

      legacyOperation =
        await loadOperation(
          input.transaction,
          input.legacyPaymentReference,
          storedId(
            input.cancellation
              .refundOperationId,
            "Refund operation",
          ),
          input.cancellationRequestId,
          input.providerRequestId,
        );
    }

    return {
      legacyOperation,

      legacyPayment:
        input.legacyPayment,

      operationSet:
        null,
    };
  }

  if (bindings.length === 0) {
    return {
      legacyOperation:
        null,

      legacyPayment:
        null,

      operationSet:
        [],
    };
  }

  const references:
    FirebaseFirestore.DocumentReference[] =
      [];

  for (
    const binding of
    bindings
  ) {
    const paymentReference =
      db.collection(
        "payments",
      ).doc(
        binding.paymentId,
      );

    references.push(
      paymentReference,
    );

    references.push(
      paymentReference
        .collection(
          "refunds",
        )
        .doc(
          binding
            .refundOperationId,
        ),
    );
  }

  const snapshots =
    await input.transaction.getAll(
      ...references,
    );

  const operationSet:
    RefundProjectionOperation[] =
      [];

  for (
    let index = 0;
    index <
      bindings.length;
    index += 1
  ) {
    const binding =
      bindings[index];

    const paymentSnapshot =
      snapshots[index * 2];

    const operationSnapshot =
      snapshots[
        index * 2 + 1
      ];

    if (
      !paymentSnapshot.exists ||
      !operationSnapshot.exists
    ) {
      throw policyInvalid();
    }

    const payment =
      paymentSnapshot.data() ??
      {};

    const operation =
      operationSnapshot.data() ??
      {};

    if (
      canonicalPaymentLinkageReason({
        paymentId:
          binding.paymentId,

        providerRequestId:
          input.providerRequestId,

        mainEventId:
          input.mainEventId,

        customerId:
          input.customerId,

        providerId:
          input.providerId,

        payment,

        providerRequest:
          input.providerRequest,

        mainEvent:
          input.mainEvent,
      })
    ) {
      throw policyInvalid();
    }

    if (
      operation.paymentId !==
        binding.paymentId ||
      operation.providerRequestId !==
        input.providerRequestId ||
      operation.mainEventId !==
        input.mainEventId ||
      operation.cancellationRequestId !==
        input.cancellationRequestId ||
      operation.currency !==
        PAYMENT_CURRENCY ||
      operation.amountInCentavos !==
        binding.amountInCentavos ||
      operation
        .refundOperationSetSchemaVersion !==
        1 ||
      operation
        .refundOperationSetIndex !==
        index ||
      operation
        .refundOperationSetSize !==
        bindings.length
    ) {
      throw policyInvalid();
    }

    operationSet.push({
      binding,
      payment,
      operation,
    });
  }

  return {
    legacyOperation:
      null,

    legacyPayment:
      null,

    operationSet,
  };
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
