import {Timestamp} from "firebase-admin/firestore";
import {PAYMONGO_SAFE_RETRY_WINDOW_MS} from "../payments/checkout-attempt-domain.js";
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
  currentPaymentIdForProviderRequest,
} from "../payments/payment-lifecycle.js";
import {
  readTrustedProviderRequestPaymentSetInTransaction,
} from "../payments/provider-request-payment-reader.js";
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
  calculateCancellationRefundForPaymentSet,
  derivePaymentRefundStatus,
  gatewayRefundIdempotencyKey,
  readRefundAccounting,
  refundAccountingError,
} from "./refund-accounting-domain.js";
import {refundOperationKey} from "./refund-accounting.js";
import {
  allocateCancellationRefundAcrossPayments,
} from "./refund-allocation-domain.js";
import {
  createRefundOperationReservationPlan,
} from "./refund-operation-plan.js";
import {
  readRefundOperationBindings,
  refundOperationBindingFor,
  refundOperationSetCancellationStatus,
  type RefundOperationBinding,
  type RefundOperationSetEntry,
} from "./refund-operation-set.js";

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
  const cancellationReference =
    db.collection(
      "providerRequestCancellationRequests",
    ).doc(
      input.cancellationRequestId,
    );

  return db.runTransaction(
    async (transaction) => {
      const cancellationSnapshot =
        await transaction.get(
          cancellationReference,
        );

      if (!cancellationSnapshot.exists) {
        throw operationNotFound();
      }

      const cancellation =
        cancellationSnapshot.data() ??
        {};

      const ids =
        cancellationIds(
          cancellation,
        );

      const requestReference =
        db.collection(
          "providerRequests",
        ).doc(
          ids.providerRequestId,
        );

      const mainEventReference =
        db.collection(
          "mainEvents",
        ).doc(
          ids.mainEventId,
        );

      const providerReference =
        db.collection(
          "providers",
        ).doc(
          ids.providerId,
        );

      const allRequestsQuery =
        db.collection(
          "providerRequests",
        ).where(
          "mainEventId",
          "==",
          ids.mainEventId,
        );

      const requestSnapshot =
        await transaction.get(
          requestReference,
        );

      if (!requestSnapshot.exists) {
        throw approvalConflict();
      }

      const providerRequest =
        requestSnapshot.data() ??
        {};

      const [
        mainEventSnapshot,
        providerSnapshot,
        allRequestsSnapshot,
      ] = await Promise.all([
        transaction.get(
          mainEventReference,
        ),

        transaction.get(
          providerReference,
        ),

        transaction.get(
          allRequestsQuery,
        ),
      ]);

      if (
        !mainEventSnapshot.exists ||
        !providerSnapshot.exists
      ) {
        throw approvalConflict();
      }

      const mainEvent =
        mainEventSnapshot.data() ??
        {};

      const paymentSet =
        await readTrustedProviderRequestPaymentSetInTransaction({
          transaction,

          providerRequestId:
            ids.providerRequestId,

          providerRequest,

          mainEventId:
            ids.mainEventId,

          customerId:
            ids.customerId,

          providerId:
            ids.providerId,

          mainEvent,

          invalid: (): never => {
            throw approvalConflict();
          },
        });

      const paymentId =
        paymentSet.currentPaymentId;

      const payment =
        paymentSet.currentPayment;

      assertCancellationContext({
        cancellationRequestId:
          input.cancellationRequestId,

        cancellation,

        ids,

        providerRequest,

        mainEvent,

        payment,

        paymentId,

        provider:
          providerSnapshot.data() ??
          {},

        allRequestDocuments:
          allRequestsSnapshot.docs,
      });

      const currentCancellationStatus =
        parseProviderRequestCancellationStatus(
          cancellation.status,
        );

      if (
        currentCancellationStatus ===
          "approved" ||
        currentCancellationStatus ===
          "refund_processing" ||
        currentCancellationStatus ===
          "refund_failed" ||
        currentCancellationStatus ===
          "refund_completed" ||
        currentCancellationStatus ===
          "cancelled_no_refund"
      ) {
        if (
          decisionOutcome(
            cancellation.decision,
          ) !== "approved"
        ) {
          throw alreadyDecided();
        }

        return approvalResultFromStored({
          cancellationRequestId:
            input.cancellationRequestId,

          cancellation,

          providerRequest,

          mainEvent,
        });
      }

      if (
        currentCancellationStatus !==
          "submitted" &&
        currentCancellationStatus !==
          "under_review"
      ) {
        throw decisionNotAllowed();
      }

      const classification =
        classifyProviderRequestRefundPolicyEvidence(
          providerRequest,
        );

      if (
        classification.status !==
        "policy_backed"
      ) {
        throw refundAccountingError(
          "failed-precondition",

          classification.status ===
            "legacy"
            ? REFUND_ACCOUNTING_ERROR_REASONS
                .manualReviewRequired
            : REFUND_ACCOUNTING_ERROR_REASONS
                .policyEvidenceInvalid,

          "Automatic policy refund approval is unavailable.",
        );
      }

      const eligibility =
        requireRefundEligibilityState(
          providerRequest,
        );

      if (
        eligibility
          .activeCancellationRequestId !==
        input.cancellationRequestId
      ) {
        throw approvalConflict();
      }

      const requestStatus =
        parseProviderRequestStatus(
          providerRequest.status,
        );

      if (!requestStatus) {
        throw approvalConflict();
      }

      assertCancellationSubmissionAllowed(
        requestStatus,
      );

      const approvedId =
        nullableId(
          providerRequest
            .approvedCancellationRequestId,
        );

      if (
        approvedId !== null &&
        approvedId !==
          input.cancellationRequestId
      ) {
        throw approvalConflict();
      }

      const calculation =
        paymentSet.mode === "p5"
          ? calculateCancellationRefundForPaymentSet({
              providerRequest,

              cancellationRequest:
                cancellation,

              settlement:
                paymentSet.settlement,

              payments:
                paymentSet.payments,
            })
          : calculateCancellationRefund({
              providerRequest,

              cancellationRequest:
                cancellation,

              payment,
            });

      if (
        calculation
          .calculationStatus ===
        "manual_review_required"
      ) {
        throw refundAccountingError(
          "failed-precondition",
          REFUND_ACCOUNTING_ERROR_REASONS
            .manualReviewRequired,
          "Refund approval requires manual review.",
        );
      }

      if (
        !isProviderRequestStatusTransitionAllowed(
          requestStatus,
          "cancelled",
        )
      ) {
        throw decisionNotAllowed();
      }

      const currentMainEventStatus =
        parseMainEventStatus(
          mainEvent.status,
        );

      if (!currentMainEventStatus) {
        throw approvalConflict();
      }

      const summary =
        calculateMainEventRequestSummary(
          allRequestsSnapshot.docs,
          currentMainEventStatus,
          [
            {
              providerRequestId:
                ids.providerRequestId,

              status:
                "cancelled",
            },
          ],
        );

      if (
        summary.status !==
          currentMainEventStatus &&
        !isMainEventStatusTransitionAllowed(
          currentMainEventStatus,
          summary.status,
        )
      ) {
        throw approvalConflict();
      }

      const timestamp =
        serverTimestamp();

      const zeroRefund =
        calculation
          .eligibleRefundAmountInCentavos ===
        0;

      const nextCancellationStatus =
        zeroRefund
          ? "cancelled_no_refund" as const
          : "approved" as const;

      assertCancellationStatusTransition(
        currentCancellationStatus,
        nextCancellationStatus,
      );

      const logicalOperationKey =
        refundOperationKey({
          cancellationRequestId:
            input.cancellationRequestId,

          logicalOperationKey:
            "approved-policy-cancellation",
        });

      let operationId:
        string | null =
          null;

      let operationIds:
        string[] =
          [];

      let operationBindings:
        Array<{
          paymentId:
            string;

          refundOperationId:
            string;

          amountInCentavos:
            number;
        }> =
          [];

      if (!zeroRefund) {
        let reservationPlan;

        if (paymentSet.mode === "p5") {
          const allocation =
            allocateCancellationRefundAcrossPayments({
              calculation,

              settlement:
                paymentSet.settlement,

              payments:
                paymentSet.payments,
            });

          reservationPlan =
            createRefundOperationReservationPlan({
              cancellationRequestId:
                input.cancellationRequestId,

              operationKey:
                logicalOperationKey,

              allocation,
            });
        }
        else {
          if (!payment) {
            throw approvalConflict();
          }

          const original =
            calculation
              .originalPaidAmountInCentavos;

          const completed =
            calculation
              .completedRefundAmountInCentavos;

          const reserved =
            calculation
              .reservedRefundAmountInCentavos;

          const requested =
            calculation
              .eligibleRefundAmountInCentavos;

          if (
            !Number.isSafeInteger(original) ||
            !Number.isSafeInteger(completed) ||
            !Number.isSafeInteger(reserved) ||
            !Number.isSafeInteger(requested) ||
            original <= 0 ||
            completed < 0 ||
            reserved < 0 ||
            requested <= 0
          ) {
            throw approvalConflict();
          }

          reservationPlan =
            createRefundOperationReservationPlan({
              cancellationRequestId:
                input.cancellationRequestId,

              operationKey:
                logicalOperationKey,

              allocation: {
                requestedAmountInCentavos:
                  requested,

                totalAllocatedAmountInCentavos:
                  requested,

                allocations: [
                  {
                    paymentId,

                    originalPaidAmountInCentavos:
                      original,

                    completedRefundAmountInCentavos:
                      completed,

                    reservedRefundAmountInCentavos:
                      reserved,

                    availableRefundCapacityInCentavos:
                      original -
                      completed -
                      reserved,

                    allocatedRefundAmountInCentavos:
                      requested,
                  },
                ],
              },
            });
        }

        operationId =
          reservationPlan
            .compatibilityRefundOperationId;

        operationIds =
          [
            ...reservationPlan
              .refundOperationIds,
          ];

        operationBindings =
          reservationPlan
            .reservations
            .map(
              (reservation) => ({
                paymentId:
                  reservation.paymentId,

                refundOperationId:
                  reservation
                    .refundOperationId,

                amountInCentavos:
                  reservation
                    .amountInCentavos,
              }),
            );

        const operationReferences =
          reservationPlan
            .reservations
            .map(
              (reservation) =>
                db.collection(
                  "payments",
                )
                  .doc(
                    reservation.paymentId,
                  )
                  .collection(
                    "refunds",
                  )
                  .doc(
                    reservation
                      .refundOperationId,
                  ),
            );

        const operationSnapshots =
          await transaction.getAll(
            ...operationReferences,
          );

        if (
          operationSnapshots.some(
            (snapshot) =>
              snapshot.exists,
          )
        ) {
          throw approvalConflict();
        }

        for (
          const reservation of
          reservationPlan.reservations
        ) {
          const paymentEntry =
            paymentSet.payments.find(
              (entry) =>
                entry.id ===
                reservation.paymentId,
            );

          if (!paymentEntry) {
            throw approvalConflict();
          }

          const reservationPayment =
            paymentEntry.data;

          if (
            reservationPayment
              .refundExecutionLock !==
              undefined &&
            reservationPayment
              .refundExecutionLock !==
              null
          ) {
            throw approvalConflict();
          }

          const original =
            positiveCentavos(
              reservationPayment
                .amountInCentavos,
            );

          const accounting =
            readRefundAccounting(
              reservationPayment,
              original,
            );

          const nextReserved =
            accounting
              .refundReservedAmountInCentavos +
            reservation
              .amountInCentavos;

          if (
            !Number.isSafeInteger(
              nextReserved,
            ) ||
            nextReserved > original
          ) {
            throw approvalConflict();
          }

          const reservationPaymentReference =
            db.collection(
              "payments",
            ).doc(
              reservation.paymentId,
            );

          const reservationOperationReference =
            reservationPaymentReference
              .collection(
                "refunds",
              )
              .doc(
                reservation
                  .refundOperationId,
              );

          transaction.create(
            reservationOperationReference,
            {
              schemaVersion:
                REFUND_OPERATION_SCHEMA_VERSION,

              paymentId:
                reservation.paymentId,

              providerRequestId:
                ids.providerRequestId,

              mainEventId:
                ids.mainEventId,

              cancellationRequestId:
                input.cancellationRequestId,

              amountInCentavos:
                reservation
                  .amountInCentavos,

              currency:
                PAYMENT_CURRENCY,

              status:
                "reserved",

              createdAt:
                timestamp,

              updatedAt:
                timestamp,

              completedAt:
                null,

              failureCode:
                null,

              operationKey:
                logicalOperationKey,

              calculation,

              gateway:
                "paymongo",

              gatewayPaymentId:
                requireGatewayPaymentId(
                  reservationPayment
                    .paymongoResourceId,
                ),

              gatewayRefundId:
                null,

              gatewayStatus:
                null,

              gatewayExecutionKey:
                gatewayRefundIdempotencyKey(
                  reservation
                    .refundOperationId,
                ),

              gatewayFailureCertainty:
                null,

              gatewayRequestedAt:
                null,

              gatewayAcceptedAt:
                null,

              gatewayReconciledAt:
                null,

              executionAttemptCount:
                0,

              lastExecutionAt:
                null,

              refundOperationSetSchemaVersion:
                1,

              refundOperationSetIndex:
                operationBindings.findIndex(
                  (binding) =>
                    binding.refundOperationId ===
                    reservation
                      .refundOperationId,
                ),

              refundOperationSetSize:
                operationBindings.length,
            },
          );

          transaction.update(
            reservationPaymentReference,
            {
              refundAccountingSchemaVersion:
                REFUND_ACCOUNTING_SCHEMA_VERSION,

              refundedAmountInCentavos:
                accounting
                  .refundedAmountInCentavos,

              refundReservedAmountInCentavos:
                nextReserved,

              updatedAt:
                timestamp,
            },
          );
        }
      }

      transaction.update(
        cancellationReference,
        {
          status:
            nextCancellationStatus,

          decision: {
            outcome:
              "approved",

            decidedAt:
              timestamp,

            reason:
              null,
          },

          refundCalculation:
            calculation,

          refundOperationId:
            operationId,

          refundOperationIds:
            operationIds,

          refundOperationPlanSchemaVersion:
            1,

          refundOperationBindings:
            operationBindings,

          updatedAt:
            timestamp,
        },
      );

      transaction.update(
        requestReference,
        {
          status:
            "cancelled",

          statusUpdatedAt:
            timestamp,

          cancelledAt:
            timestamp,

          approvedCancellationRequestId:
            input.cancellationRequestId,

          refundEligibilityState: {
            ...eligibility,

            activeCancellationRequestId:
              null,
          },

          updatedAt:
            timestamp,
        },
      );

      transaction.update(
        mainEventReference,
        mainEventUpdate({
          summary,
          currentStatus:
            currentMainEventStatus,
          timestamp,
        }),
      );

      transaction.create(
        mainEventReference
          .collection(
            "timeline",
          )
          .doc(),
        {
          type:
            zeroRefund
              ? "cancellation_approved_no_refund"
              : "cancellation_approved",

          title:
            zeroRefund
              ? "Provider Service Cancelled"
              : "Cancellation Approved",

          description:
            zeroRefund
              ? "The Provider service was cancelled with no refund due under the agreed policy."
              : "The Provider service was cancelled and its refund is ready for processing.",

          providerRequestId:
            ids.providerRequestId,

          providerId:
            ids.providerId,

          cancellationRequestId:
            input.cancellationRequestId,

          createdByRole:
            "admin",

          createdAt:
            timestamp,
        },
      );

      notifyCancellationDecision(
        transaction,
        {
          customerId:
            ids.customerId,

          providerOwnerId:
            providerOwnerId(
              providerSnapshot.data() ??
              {},
            ),

          providerRequestId:
            ids.providerRequestId,

          cancellationRequestId:
            input.cancellationRequestId,

          approved:
            true,

          zeroRefund,
        },
      );

      writeAuditLogInTransaction(
        transaction,
        {
          actorId:
            input.actorId,

          actorRole:
            "admin",

          action:
            "cancellation_request.approved",

          targetCollection:
            "providerRequestCancellationRequests",

          targetId:
            input.cancellationRequestId,

          before: {
            status:
              currentCancellationStatus,

            providerRequestStatus:
              requestStatus,
          },

          after: {
            status:
              nextCancellationStatus,

            providerRequestStatus:
              "cancelled",

            mainEventStatus:
              summary.status,
          },

          metadata: {
            mainEventId:
              ids.mainEventId,

            providerRequestId:
              ids.providerRequestId,

            paymentId:
              payment
                ? paymentId
                : null,

            paymentIds:
              paymentSet.payments.map(
                (entry) =>
                  entry.id,
              ),

            refundOperationId:
              operationId,

            refundOperationIds:
              operationIds,

            refundAmountInCentavos:
              calculation
                .eligibleRefundAmountInCentavos,
          },
        },
      );

      return {
        cancellationRequestId:
          input.cancellationRequestId,

        providerRequestId:
          ids.providerRequestId,

        mainEventId:
          ids.mainEventId,

        cancellationStatus:
          nextCancellationStatus,

        providerRequestStatus:
          "cancelled",

        mainEventStatus:
          summary.status,

        refundOperationId:
          operationId,

        refundAmountInCentavos:
          calculation
            .eligibleRefundAmountInCentavos,

        currency:
          PAYMENT_CURRENCY,
      };
    },
  );
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
  /*
   * One callable remains the public contract.
   *
   * For operation-set approvals, successful synchronous refunds
   * continue to the next bound payment in deterministic order.
   *
   * A pending/processing/failed gateway result stops the loop and
   * waits for retry or webhook reconciliation.
   */
  for (
    let operationStep = 0;
    operationStep < 25;
    operationStep += 1
  ) {
    const prepared =
      await prepareRefundExecution(
        input,
      );

    if (prepared.completed) {
      return {
        cancellationRequestId:
          input.cancellationRequestId,

        providerRequestId:
          prepared.providerRequestId,

        paymentId:
          prepared.paymentId,

        refundOperationId:
          prepared.refundOperationId,

        status:
          "completed",

        gatewayStatus:
          "succeeded",
      };
    }

    let refund:
      PayMongoRefundResource;

    if (
      prepared
        .amountInCentavos < 100
    ) {
      await recordExecutionFailure({
        ...prepared,

        actorId:
          input.actorId,

        certainty:
          "not_sent",

        failureCode:
          "GATEWAY_MINIMUM_UNSUPPORTED",
      });

      throw refundAccountingError(
        "failed-precondition",

        REFUND_EXECUTION_ERROR_REASONS
          .gatewayMinimumUnsupported,

        "The refund requires manual reconciliation because it is below the gateway minimum.",
      );
    }

    if (
      prepared
        .amountInCentavos <
        prepared
          .originalAmountInCentavos &&
      prepared.paymentMethodType !==
        "card" &&
      prepared.paymentMethodType !==
        "gcash"
    ) {
      await recordExecutionFailure({
        ...prepared,

        actorId:
          input.actorId,

        certainty:
          "not_sent",

        failureCode:
          "PARTIAL_REFUND_CAPABILITY_UNCONFIRMED",
      });

      throw refundAccountingError(
        "failed-precondition",

        REFUND_EXECUTION_ERROR_REASONS
          .paymentCapabilityUnconfirmed,

        "The settled payment method is not confirmed for partial refunds.",
      );
    }

    try {
      refund =
        await createPayMongoRefund({
          secretKey:
            payMongoSecretKey.value(),

          idempotencyKey:
            prepared.gatewayExecutionKey,

          gatewayPaymentId:
            prepared.gatewayPaymentId,

          amountInCentavos:
            prepared
              .amountInCentavos,

          reason:
            "others",

          metadata: {
            feasta_payment_id:
              prepared.paymentId,

            feasta_refund_operation_id:
              prepared
                .refundOperationId,
          },
        });
    }
    catch (error) {
      const certainty =
        payMongoFailureCertainty(
          error,
        );

      await recordExecutionFailure({
        ...prepared,

        actorId:
          input.actorId,

        certainty,
      });

      throw executionGatewayError(
        certainty,
      );
    }

    const reconciled =
      await reconcileGatewayRefund({
        paymentId:
          prepared.paymentId,

        refundOperationId:
          prepared.refundOperationId,

        refund,

        actorId:
          input.actorId,

        source:
          "refund_execution_response",
      });

    const result = {
      cancellationRequestId:
        input.cancellationRequestId,

      providerRequestId:
        prepared.providerRequestId,

      paymentId:
        prepared.paymentId,

      refundOperationId:
        prepared.refundOperationId,

      status:
        reconciled.status,

      gatewayStatus:
        refund.status,
    };

    /*
     * A synchronous successful physical refund may leave another
     * operation reserved. Continue only in that exact case.
     *
     * Pending/processing gateway resources wait for webhooks.
     * Failed aggregate state waits for retry/reconciliation.
     */
    if (
      refund.status ===
        "succeeded" &&
      reconciled.status ===
        "processing"
    ) {
      continue;
    }

    return result;
  }

  throw accountingInvalid();
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
    const cancellation =
      cancellationSnapshot.data() ?? {};

    const operationBindings =
      readRefundOperationBindings(
        cancellation,
      );

    if (operationBindings !== null) {
      return prepareRefundOperationSetExecution({
        transaction,
        cancellationRequestId:
          input.cancellationRequestId,
        actorId:
          input.actorId,
        cancellation,
        operationBindings,
      });
    }

    const ids =
      cancellationIds(cancellation);

    const operationId =
      requireOperationId(
        cancellation.refundOperationId,
      );

    const requestReference =
      db.collection("providerRequests")
        .doc(ids.providerRequestId);

    const mainEventReference =
      db.collection("mainEvents")
        .doc(ids.mainEventId);

    const requestSnapshot =
      await transaction.get(
        requestReference,
      );

    if (!requestSnapshot.exists) {
      throw operationNotFound();
    }

    const providerRequest =
      requestSnapshot.data() ?? {};

    const paymentId =
      currentPaymentIdForProviderRequest(
        ids.providerRequestId,
        providerRequest,
      );

    if (!paymentId) {
      throw operationNotFound();
    }

    const paymentReference =
      db.collection("payments")
        .doc(paymentId);

    const operationReference =
      paymentReference
        .collection("refunds")
        .doc(operationId);

    const [
      paymentSnapshot,
      operationSnapshot,
      mainEventSnapshot,
    ] = await transaction.getAll(
      paymentReference,
      operationReference,
      mainEventReference,
    );

    if (
      !paymentSnapshot.exists ||
      !operationSnapshot.exists ||
      !mainEventSnapshot.exists
    ) {
      throw operationNotFound();
    }

    const payment =
      paymentSnapshot.data() ?? {};

    const operation =
      operationSnapshot.data() ?? {};

    const mainEvent =
      mainEventSnapshot.data() ?? {};
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

type RefundOperationSetRecord = {
  binding:
    RefundOperationBinding;

  paymentReference:
    FirebaseFirestore.DocumentReference;

  operationReference:
    FirebaseFirestore.DocumentReference;

  payment:
    Record<string, unknown>;

  operation:
    Record<string, unknown>;
};

async function prepareRefundOperationSetExecution(input: {
  transaction:
    FirebaseFirestore.Transaction;

  cancellationRequestId:
    string;

  actorId:
    string;

  cancellation:
    Record<string, unknown>;

  operationBindings:
    readonly RefundOperationBinding[];
}): Promise<PreparedExecution> {
  if (
    input.operationBindings.length === 0
  ) {
    throw executionNotAllowed();
  }

  const ids =
    cancellationIds(
      input.cancellation,
    );

  const requestReference =
    db.collection(
      "providerRequests",
    ).doc(
      ids.providerRequestId,
    );

  const mainEventReference =
    db.collection(
      "mainEvents",
    ).doc(
      ids.mainEventId,
    );

  const [
    requestSnapshot,
    mainEventSnapshot,
  ] =
    await input.transaction.getAll(
      requestReference,
      mainEventReference,
    );

  if (
    !requestSnapshot.exists ||
    !mainEventSnapshot.exists
  ) {
    throw operationNotFound();
  }

  const providerRequest =
    requestSnapshot.data() ??
    {};

  const mainEvent =
    mainEventSnapshot.data() ??
    {};

  const records =
    await readRefundOperationSetRecordsInTransaction({
      transaction:
        input.transaction,

      cancellationRequestId:
        input.cancellationRequestId,

      cancellation:
        input.cancellation,

      ids,

      providerRequest,

      mainEvent,

      operationBindings:
        input.operationBindings,
    });

  if (
    records === null ||
    records.length === 0
  ) {
    throw executionNotAllowed();
  }

  const aggregateStatus =
    refundOperationSetCancellationStatus(
      operationSetEntries(
        records,
      ),
    );

  const cancellationStatus =
    parseProviderRequestCancellationStatus(
      input.cancellation.status,
    );

  if (!cancellationStatus) {
    throw executionNotAllowed();
  }

  if (
    aggregateStatus ===
      "refund_completed"
  ) {
    if (
      cancellationStatus !==
        "refund_completed"
    ) {
      throw refundAccountingError(
        "failed-precondition",

        REFUND_EXECUTION_ERROR_REASONS
          .reconciliationRequired,

        "Refund operations are complete but cancellation finalization requires reconciliation.",
      );
    }

    const completedRecord =
      records[0];

    const amount =
      positiveCentavos(
        completedRecord
          .operation
          .amountInCentavos,
      );

    return {
      cancellationRequestId:
        input.cancellationRequestId,

      providerRequestId:
        ids.providerRequestId,

      mainEventId:
        ids.mainEventId,

      paymentId:
        completedRecord
          .binding
          .paymentId,

      refundOperationId:
        completedRecord
          .binding
          .refundOperationId,

      amountInCentavos:
        amount,

      originalAmountInCentavos:
        positiveCentavos(
          completedRecord
            .payment
            .amountInCentavos,
        ),

      paymentMethodType:
        paymentMethodType(
          completedRecord
            .payment
            .paymentMethodType,
        ),

      gatewayPaymentId:
        requireGatewayPaymentId(
          completedRecord
            .operation
            .gatewayPaymentId,
        ),

      gatewayExecutionKey:
        requireGatewayExecutionKey(
          completedRecord
            .operation
            .gatewayExecutionKey,

          completedRecord
            .binding
            .refundOperationId,
        ),

      customerId:
        ids.customerId,

      completed:
        true,
    };
  }

  if (
    cancellationStatus !==
      "approved" &&
    cancellationStatus !==
      "refund_processing" &&
    cancellationStatus !==
      "refund_failed"
  ) {
    throw executionNotAllowed();
  }

  /*
   * Deterministic sequential execution:
   * never advance past the first unresolved operation.
   */
  const selected =
    records.find(
      (record) =>
        record.operation.status !==
        "completed",
    );

  if (!selected) {
    throw accountingInvalid();
  }

  const paymentId =
    selected.binding.paymentId;

  const operationId =
    selected.binding
      .refundOperationId;

  const payment =
    selected.payment;

  const operation =
    selected.operation;

  const amount =
    positiveCentavos(
      operation.amountInCentavos,
    );

  if (
    amount !==
      selected.binding
        .amountInCentavos
  ) {
    throw gatewayLinkageInvalid();
  }

  const gatewayPaymentId =
    requireGatewayPaymentId(
      operation.gatewayPaymentId,
    );

  const gatewayExecutionKey =
    requireGatewayExecutionKey(
      operation.gatewayExecutionKey,
      operationId,
    );

  if (
    operation.status !==
      "reserved" &&
    operation.status !==
      "failed" &&
    operation.status !==
      "processing"
  ) {
    throw retryNotAllowed();
  }

  if (
    operation.status !==
      "processing"
  ) {
    assertRefundOperationTransition(
      operation.status,
      "processing",
    );
  }

  if (
    cancellationStatus !==
      "refund_processing"
  ) {
    assertCancellationStatusTransition(
      cancellationStatus,
      "refund_processing",
    );
  }

  const accounting =
    readRefundAccounting(
      payment,
      positiveCentavos(
        payment.amountInCentavos,
      ),
    );

  if (
    accounting
      .refundReservedAmountInCentavos <
    amount
  ) {
    throw accountingInvalid();
  }

  const attemptCount =
    safeCount(
      operation.executionAttemptCount,
    );

  assertGatewayRetryWindow(
    operation,
    attemptCount,
  );

  const timestamp =
    serverTimestamp();

  input.transaction.update(
    selected.operationReference,
    {
      status:
        "processing",

      gatewayFailureCertainty:
        null,

      failureCode:
        null,

      gatewayRequestedAt:
        operation.gatewayRequestedAt ??
        timestamp,

      executionAttemptCount:
        attemptCount + 1,

      lastExecutionAt:
        timestamp,

      updatedAt:
        timestamp,
    },
  );

  const cancellationReference =
    db.collection(
      "providerRequestCancellationRequests",
    ).doc(
      input.cancellationRequestId,
    );

  input.transaction.update(
    cancellationReference,
    {
      status:
        "refund_processing",

      updatedAt:
        timestamp,
    },
  );

  if (
    cancellationStatus !==
      "refund_processing"
  ) {
    input.transaction.create(
      mainEventReference
        .collection(
          "timeline",
        )
        .doc(),
      {
        type:
          "refund_processing",

        title:
          "Refund Processing",

        description:
          "The approved Provider service refund is being processed.",

        providerRequestId:
          ids.providerRequestId,

        cancellationRequestId:
          input.cancellationRequestId,

        createdByRole:
          "admin",

        createdAt:
          timestamp,
      },
    );

    createNotificationInTransaction(
      input.transaction,
      {
        userId:
          ids.customerId,

        title:
          "Refund processing",

        message:
          "Your approved Provider service refund is being processed.",

        type:
          "payment",

        relatedId:
          paymentId,

        relatedCollection:
          "payments",

        metadata: {
          cancellationStatus:
            "refund_processing",
        },
      },
    );
  }

  writeAuditLogInTransaction(
    input.transaction,
    {
      actorId:
        input.actorId,

      actorRole:
        "admin",

      action:
        attemptCount === 0
          ? "refund_execution.started"
          : "refund_execution.retried",

      targetCollection:
        "payments",

      targetId:
        paymentId,

      before: {
        operationStatus:
          operation.status,
      },

      after: {
        operationStatus:
          "processing",
      },

      metadata: {
        mainEventId:
          ids.mainEventId,

        providerRequestId:
          ids.providerRequestId,

        cancellationRequestId:
          input.cancellationRequestId,

        refundOperationId:
          operationId,

        amountInCentavos:
          amount,

        executionAttemptCount:
          attemptCount + 1,
      },
    },
  );

  return {
    cancellationRequestId:
      input.cancellationRequestId,

    providerRequestId:
      ids.providerRequestId,

    mainEventId:
      ids.mainEventId,

    paymentId,

    refundOperationId:
      operationId,

    amountInCentavos:
      amount,

    originalAmountInCentavos:
      positiveCentavos(
        payment.amountInCentavos,
      ),

    paymentMethodType:
      paymentMethodType(
        payment.paymentMethodType,
      ),

    gatewayPaymentId,

    gatewayExecutionKey,

    customerId:
      ids.customerId,

    completed:
      false,
  };
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
    const operation =
      operationSnapshot.data() ?? {};

    const cancellation =
      cancellationSnapshot.data() ?? {};

    const operationBindings =
      readRefundOperationBindings(
        cancellation,
      );

    if (
      operationBindings !== null &&
      refundOperationBindingFor(
        cancellation,
        input.paymentId,
        input.refundOperationId,
      ) === null
    ) {
      throw gatewayLinkageInvalid();
    }

    if (
      operation.status ===
        "completed"
    ) {
      return;
    }
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
}): Promise<{
  status:
    "processing" | "completed" | "failed";

  replayed:
    boolean;
}> {
  const paymentId =
    requireSafeDocumentId(
      input.paymentId,
      "Payment",
    );

  const operationId =
    requireOperationId(
      input.refundOperationId,
    );

  const paymentReference =
    db.collection(
      "payments",
    ).doc(
      paymentId,
    );

  const operationReference =
    paymentReference
      .collection(
        "refunds",
      )
      .doc(
        operationId,
      );

  const eventReference =
    input.webhookEventId
      ? db.collection(
          "paymentWebhookEvents",
        ).doc(
          input.webhookEventId,
        )
      : null;

  return db.runTransaction(
    async (transaction) => {
      const baseSnapshots =
        await transaction.getAll(
          paymentReference,
          operationReference,

          ...(
            eventReference
              ? [eventReference]
              : []
          ),
        );

      const paymentSnapshot =
        baseSnapshots[0];

      const operationSnapshot =
        baseSnapshots[1];

      const eventSnapshot =
        eventReference
          ? baseSnapshots[2]
          : null;

      if (eventSnapshot?.exists) {
        return replayedWebhookResult(
          eventSnapshot.data() ??
            {},
          input,
        );
      }

      if (
        !paymentSnapshot.exists ||
        !operationSnapshot.exists
      ) {
        if (eventReference) {
          transaction.set(
            eventReference,

            refundWebhookRecord(
              input,
              "rejected",
              "operation_not_found",
            ),
          );

          return {
            status:
              "failed" as const,

            replayed:
              false,
          };
        }

        throw operationNotFound();
      }

      const payment =
        paymentSnapshot.data() ??
        {};

      const operation =
        operationSnapshot.data() ??
        {};

      const cancellationRequestId =
        storedId(
          operation
            .cancellationRequestId,

          "Cancellation request",
        );

      const providerRequestId =
        storedId(
          operation
            .providerRequestId,

          "Provider request",
        );

      const mainEventId =
        storedId(
          operation.mainEventId,
          "Main event",
        );

      const cancellationReference =
        db.collection(
          "providerRequestCancellationRequests",
        ).doc(
          cancellationRequestId,
        );

      const requestReference =
        db.collection(
          "providerRequests",
        ).doc(
          providerRequestId,
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
          storedId(
            operation.providerId ??
              payment.providerId,

            "Provider",
          ),
        );

      const [
        cancellationSnapshot,
        requestSnapshot,
        mainEventSnapshot,
        providerSnapshot,
      ] =
        await transaction.getAll(
          cancellationReference,
          requestReference,
          mainEventReference,
          providerReference,
        );

      if (
        !cancellationSnapshot.exists ||
        !requestSnapshot.exists ||
        !mainEventSnapshot.exists ||
        !providerSnapshot.exists
      ) {
        throw gatewayLinkageInvalid();
      }

      const cancellation =
        cancellationSnapshot.data() ??
        {};

      const providerRequest =
        requestSnapshot.data() ??
        {};

      const mainEvent =
        mainEventSnapshot.data() ??
        {};

      const ids =
        cancellationIds(
          cancellation,
        );

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
        refund:
          input.refund,
      });

      const operationSetRecords =
        await readRefundOperationSetRecordsInTransaction({
          transaction,
          cancellationRequestId,
          cancellation,
          ids,
          providerRequest,
          mainEvent,
        });

      if (
        operation.status ===
          "completed"
      ) {
        if (eventReference) {
          transaction.set(
            eventReference,

            refundWebhookRecord(
              input,
              "duplicate",
              "refund_already_completed",
            ),
          );
        }

        const replayStatus =
          operationSetRecords === null
            ? "completed"
            : refundOperationSetCancellationStatus(
                operationSetEntries(
                  operationSetRecords,
                ),
              ) ===
              "refund_completed"
              ? "completed"
              : refundOperationSetCancellationStatus(
                    operationSetEntries(
                      operationSetRecords,
                    ),
                  ) ===
                  "refund_failed"
                ? "failed"
                : "processing";

        return {
          status:
            replayStatus,

          replayed:
            true,
        };
      }

      const timestamp =
        serverTimestamp();

      const commonOperationUpdate = {
        gatewayRefundId:
          input.refund.id,

        gatewayStatus:
          input.refund.status,

        gatewayAcceptedAt:
          operation.gatewayAcceptedAt ??
          timestamp,

        gatewayReconciledAt:
          timestamp,

        gatewayFailureCertainty:
          null,

        updatedAt:
          timestamp,
      };

      if (
        input.refund.status ===
          "pending" ||
        input.refund.status ===
          "processing"
      ) {
        const aggregateStatus =
          operationSetRecords === null
            ? "refund_processing" as const
            : refundOperationSetStatusAfter({
                records:
                  operationSetRecords,

                paymentId,

                refundOperationId:
                  operationId,

                status:
                  "processing",

                gatewayFailureCertainty:
                  null,

                failureCode:
                  null,
              });

        transaction.update(
          operationReference,
          {
            ...commonOperationUpdate,

            status:
              "processing",

            failureCode:
              null,
          },
        );

        updateCancellationRefundStatus(
          transaction,
          cancellationReference,
          cancellation,
          aggregateStatus,
          timestamp,
        );

        if (eventReference) {
          transaction.set(
            eventReference,

            refundWebhookRecord(
              input,
              "processed",
              null,
            ),
          );
        }

        writeRefundAudit(
          transaction,
          input,
          operation,
          "refund_execution.accepted",
          "processing",
        );

        return {
          status:
            aggregateResultStatus(
              aggregateStatus,
            ),

          replayed:
            false,
        };
      }

      if (
        input.refund.status ===
          "failed"
      ) {
        const aggregateStatus =
          operationSetRecords === null
            ? "refund_failed" as const
            : refundOperationSetStatusAfter({
                records:
                  operationSetRecords,

                paymentId,

                refundOperationId:
                  operationId,

                status:
                  "failed",

                gatewayFailureCertainty:
                  "gateway_rejected",

                failureCode:
                  "GATEWAY_REFUND_FAILED",
              });

        transaction.update(
          operationReference,
          {
            ...commonOperationUpdate,

            status:
              "failed",

            gatewayFailureCertainty:
              "gateway_rejected",

            failureCode:
              "GATEWAY_REFUND_FAILED",
          },
        );

        updateCancellationRefundStatus(
          transaction,
          cancellationReference,
          cancellation,
          aggregateStatus,
          timestamp,
        );

        if (eventReference) {
          transaction.set(
            eventReference,

            refundWebhookRecord(
              input,
              "processed",
              "gateway_refund_failed",
            ),
          );
        }

        writeRefundAudit(
          transaction,
          input,
          operation,
          "refund_execution.failed",
          "failed",
        );

        return {
          status:
            aggregateResultStatus(
              aggregateStatus,
            ),

          replayed:
            false,
        };
      }

      if (
        operation.status !==
          "processing" &&
        operation.status !==
          "reserved" &&
        operation.status !==
          "failed"
      ) {
        throw executionNotAllowed();
      }

      if (
        operation.status !==
          "completed"
      ) {
        assertRefundOperationTransition(
          operation.status,
          "completed",
        );
      }

      const amount =
        positiveCentavos(
          operation.amountInCentavos,
        );

      const original =
        positiveCentavos(
          payment.amountInCentavos,
        );

      const accounting =
        readRefundAccounting(
          payment,
          original,
        );

      if (
        accounting
          .refundReservedAmountInCentavos <
        amount
      ) {
        throw accountingInvalid();
      }

      const nextReserved =
        accounting
          .refundReservedAmountInCentavos -
        amount;

      const nextCompleted =
        accounting
          .refundedAmountInCentavos +
        amount;

      if (
        !Number.isSafeInteger(
          nextReserved,
        ) ||
        !Number.isSafeInteger(
          nextCompleted,
        ) ||
        nextReserved < 0 ||
        nextCompleted > original
      ) {
        throw accountingInvalid();
      }

      const paymentStatus =
        derivePaymentRefundStatus({
          originalPaidAmountInCentavos:
            original,

          completedRefundAmountInCentavos:
            nextCompleted,
        });

      const aggregateStatus =
        operationSetRecords === null
          ? "refund_completed" as const
          : refundOperationSetStatusAfter({
              records:
                operationSetRecords,

              paymentId,

              refundOperationId:
                operationId,

              status:
                "completed",

              gatewayFailureCertainty:
                null,

              failureCode:
                null,
            });

      transaction.update(
        operationReference,
        {
          ...commonOperationUpdate,

          status:
            "completed",

          completedAt:
            timestamp,

          failureCode:
            null,
        },
      );

      transaction.update(
        paymentReference,
        {
          status:
            paymentStatus,

          refundAccountingSchemaVersion:
            REFUND_ACCOUNTING_SCHEMA_VERSION,

          refundedAmountInCentavos:
            nextCompleted,

          refundReservedAmountInCentavos:
            nextReserved,

          lastRefundCompletedAt:
            timestamp,

          ...(
            paymentStatus ===
              "refunded"
              ? {
                  refundedAt:
                    timestamp,
                }
              : {}
          ),

          updatedAt:
            timestamp,
        },
      );

      const bookingPaymentStatus =
        operationSetRecords === null
          ? paymentStatus
          : aggregateStatus ===
              "refund_completed"
            ? providerRequestRefundStatusForCompletedCancellation(
                cancellation,
              )
            : null;

      if (
        aggregateStatus ===
          "refund_completed"
      ) {
        updateCancellationRefundStatus(
          transaction,
          cancellationReference,
          cancellation,
          "refund_completed",
          timestamp,
        );

        if (!bookingPaymentStatus) {
          throw accountingInvalid();
        }

        transaction.update(
          requestReference,
          {
            paymentStatus:
              bookingPaymentStatus,

            ...(
              bookingPaymentStatus ===
                "refunded"
                ? {
                    refundedAt:
                      timestamp,
                  }
                : {}
            ),

            updatedAt:
              timestamp,
          },
        );

        transaction.create(
          mainEventReference
            .collection(
              "timeline",
            )
            .doc(),
          {
            type:
              "refund_completed",

            title:
              "Refund Completed",

            description:
              "The approved Provider service refund was completed.",

            providerRequestId,

            providerId:
              ids.providerId,

            cancellationRequestId,

            paymentId,

            createdByRole:
              "system",

            createdAt:
              timestamp,
          },
        );

        createNotificationInTransaction(
          transaction,
          {
            userId:
              ids.customerId,

            title:
              "Refund completed",

            message:
              "Your approved Provider service refund was completed.",

            type:
              "payment",

            relatedId:
              providerRequestId,

            relatedCollection:
              "providerRequests",

            metadata: {
              cancellationStatus:
                "refund_completed",
            },
          },
        );

        createNotificationInTransaction(
          transaction,
          {
            userId:
              providerOwnerId(
                providerSnapshot.data() ??
                {},
              ),

            title:
              "Provider service refund completed",

            message:
              "The approved refund for one cancelled Provider service was completed.",

            type:
              "payment",

            relatedId:
              providerRequestId,

            relatedCollection:
              "providerRequests",

            metadata: {
              cancellationStatus:
                "refund_completed",
            },
          },
        );
      }
      else {
        updateCancellationRefundStatus(
          transaction,
          cancellationReference,
          cancellation,
          aggregateStatus,
          timestamp,
        );
      }

      if (eventReference) {
        transaction.set(
          eventReference,

          refundWebhookRecord(
            input,
            "processed",
            null,
          ),
        );
      }

      writeAuditLogInTransaction(
        transaction,
        {
          actorId:
            input.actorId,

          actorRole:
            "system",

          action:
            input.source ===
              "paymongo_webhook"
              ? "refund_webhook.reconciled"
              : "refund_accounting.completed",

          targetCollection:
            "payments",

          targetId:
            paymentId,

          source:
            input.source,

          before: {
            operationStatus:
              operation.status,

            refundedAmountInCentavos:
              accounting
                .refundedAmountInCentavos,

            refundReservedAmountInCentavos:
              accounting
                .refundReservedAmountInCentavos,
          },

          after: {
            operationStatus:
              "completed",

            paymentStatus,

            cancellationStatus:
              aggregateStatus,

            refundedAmountInCentavos:
              nextCompleted,

            refundReservedAmountInCentavos:
              nextReserved,
          },

          metadata: {
            mainEventId,

            providerRequestId,

            cancellationRequestId,

            refundOperationId:
              operationId,

            amountInCentavos:
              amount,

            webhookEventId:
              input.webhookEventId ??
              null,
          },
        },
      );

      return {
        status:
          aggregateResultStatus(
            aggregateStatus,
          ),

        replayed:
          false,
      };
    },
  );
}

async function readRefundOperationSetRecordsInTransaction(input: {
  transaction:
    FirebaseFirestore.Transaction;

  cancellationRequestId:
    string;

  cancellation:
    Record<string, unknown>;

  ids:
    CancellationIds;

  providerRequest:
    Record<string, unknown>;

  mainEvent:
    Record<string, unknown>;

  operationBindings?:
    readonly RefundOperationBinding[];
}): Promise<
  readonly RefundOperationSetRecord[] |
  null
> {
  const operationBindings =
    input.operationBindings ??
    readRefundOperationBindings(
      input.cancellation,
    );

  if (operationBindings === null) {
    return null;
  }

  if (
    operationBindings.length === 0
  ) {
    throw gatewayLinkageInvalid();
  }

  const references:
    FirebaseFirestore.DocumentReference[] =
      [];

  for (
    const binding of
    operationBindings
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
          binding.refundOperationId,
        ),
    );
  }

  const snapshots =
    await input.transaction.getAll(
      ...references,
    );

  const records:
    RefundOperationSetRecord[] =
      [];

  for (
    let index = 0;
    index <
      operationBindings.length;
    index += 1
  ) {
    const binding =
      operationBindings[index];

    const paymentSnapshot =
      snapshots[index * 2];

    const operationSnapshot =
      snapshots[index * 2 + 1];

    if (
      !paymentSnapshot.exists ||
      !operationSnapshot.exists
    ) {
      throw operationNotFound();
    }

    const payment =
      paymentSnapshot.data() ??
      {};

    const operation =
      operationSnapshot.data() ??
      {};

    assertPolicyOperationLinkage({
      cancellationRequestId:
        input.cancellationRequestId,

      cancellation:
        input.cancellation,

      ids:
        input.ids,

      paymentId:
        binding.paymentId,

      payment,

      operationId:
        binding.refundOperationId,

      operation,

      providerRequest:
        input.providerRequest,

      mainEvent:
        input.mainEvent,
    });

    if (
      positiveCentavos(
        operation.amountInCentavos,
      ) !==
      binding.amountInCentavos
    ) {
      throw gatewayLinkageInvalid();
    }

    const paymentReference =
      references[index * 2];

    const operationReference =
      references[index * 2 + 1];

    records.push({
      binding,
      paymentReference,
      operationReference,
      payment,
      operation,
    });
  }

  return records;
}

function operationSetEntries(
  records:
    readonly RefundOperationSetRecord[],
): readonly RefundOperationSetEntry[] {
  return records.map(
    (record) => ({
      paymentId:
        record.binding.paymentId,

      refundOperationId:
        record.binding
          .refundOperationId,

      status:
        refundOperationStatus(
          record.operation.status,
        ),

      gatewayFailureCertainty:
        record.operation
          .gatewayFailureCertainty,

      failureCode:
        record.operation.failureCode,
    }),
  );
}

function refundOperationSetStatusAfter(input: {
  records:
    readonly RefundOperationSetRecord[];

  paymentId:
    string;

  refundOperationId:
    string;

  status:
    RefundOperationSetEntry["status"];

  gatewayFailureCertainty:
    unknown;

  failureCode:
    unknown;
}):
  "refund_processing" |
  "refund_failed" |
  "refund_completed" {
  const entries =
    operationSetEntries(
      input.records,
    ).map(
      (entry) =>
        entry.paymentId ===
          input.paymentId &&
        entry.refundOperationId ===
          input.refundOperationId
          ? {
              ...entry,

              status:
                input.status,

              gatewayFailureCertainty:
                input
                  .gatewayFailureCertainty,

              failureCode:
                input.failureCode,
            }
          : entry,
    );

  return refundOperationSetCancellationStatus(
    entries,
  );
}

function refundOperationStatus(
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

  throw gatewayLinkageInvalid();
}

function aggregateResultStatus(
  status:
    "refund_processing" |
    "refund_failed" |
    "refund_completed",
): "processing" | "failed" | "completed" {
  return status ===
    "refund_completed"
    ? "completed"
    : status ===
        "refund_failed"
      ? "failed"
      : "processing";
}

function updateCancellationRefundStatus(
  transaction:
    FirebaseFirestore.Transaction,

  cancellationReference:
    FirebaseFirestore.DocumentReference,

  cancellation:
    Record<string, unknown>,

  nextStatus:
    "refund_processing" |
    "refund_failed" |
    "refund_completed",

  timestamp:
    ReturnType<typeof serverTimestamp>,
): void {
  const currentStatus =
    parseProviderRequestCancellationStatus(
      cancellation.status,
    );

  if (!currentStatus) {
    throw gatewayLinkageInvalid();
  }

  if (
    currentStatus !==
      nextStatus
  ) {
    assertCancellationStatusTransition(
      currentStatus,
      nextStatus,
    );
  }

  transaction.update(
    cancellationReference,
    {
      status:
        nextStatus,

      ...(
        nextStatus ===
          "refund_completed"
          ? {
              refundCompletedAt:
                timestamp,
            }
          : {}
      ),

      updatedAt:
        timestamp,
    },
  );
}

function providerRequestRefundStatusForCompletedCancellation(
  cancellation:
    Record<string, unknown>,
): "partially_refunded" | "refunded" {
  const calculation =
    cancellation
      .refundCalculation;

  if (
    !calculation ||
    typeof calculation !==
      "object" ||
    Array.isArray(calculation)
  ) {
    throw accountingInvalid();
  }

  const record =
    calculation as
      Record<string, unknown>;

  const original =
    positiveCentavos(
      record
        .originalPaidAmountInCentavos,
    );

  const completedBefore =
    nonNegativeCentavos(
      record
        .completedRefundAmountInCentavos,
    );

  const newlyCompleted =
    positiveCentavos(
      record
        .eligibleRefundAmountInCentavos,
    );

  const completedAfter =
    completedBefore +
    newlyCompleted;

  if (
    !Number.isSafeInteger(
      completedAfter,
    ) ||
    completedAfter > original
  ) {
    throw accountingInvalid();
  }

  const status =
    derivePaymentRefundStatus({
      originalPaidAmountInCentavos:
        original,

      completedRefundAmountInCentavos:
        completedAfter,
    });

  if (status === "paid") {
    throw accountingInvalid();
  }

  return status;
}

function nonNegativeCentavos(
  value:
    unknown,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0
  ) {
    throw accountingInvalid();
  }

  return value as number;
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
  const operationBindings =
    readRefundOperationBindings(
      input.cancellation,
    );

  const operationSetBinding =
    operationBindings === null
      ? null
      : refundOperationBindingFor(
          input.cancellation,
          input.paymentId,
          input.operationId,
        );

  const operationSetIndex =
    operationBindings === null
      ? -1
      : operationBindings.findIndex(
          (binding) =>
            binding.paymentId ===
              input.paymentId &&
            binding.refundOperationId ===
              input.operationId,
        );

  const legacyOperationLinked =
    operationBindings === null &&
    input.cancellation
      .refundOperationId ===
      input.operationId &&
    Array.isArray(
      input.cancellation
        .refundOperationIds,
    ) &&
    input.cancellation
      .refundOperationIds
      .includes(
        input.operationId,
      );

  const operationSetLinked =
    operationBindings !== null &&
    operationSetBinding !== null &&
    operationSetBinding
      .amountInCentavos ===
      input.operation
        .amountInCentavos &&
    input.operation
      .refundOperationSetSchemaVersion ===
      1 &&
    input.operation
      .refundOperationSetIndex ===
      operationSetIndex &&
    input.operation
      .refundOperationSetSize ===
      operationBindings.length;

  if (
    canonicalPaymentLinkageReason({
      paymentId:
        input.paymentId,

      providerRequestId:
        input.ids.providerRequestId,

      mainEventId:
        input.ids.mainEventId,

      customerId:
        input.ids.customerId,

      providerId:
        input.ids.providerId,

      payment:
        input.payment,

      providerRequest:
        input.providerRequest,

      mainEvent:
        input.mainEvent,
    }) ||
    input.operation.schemaVersion !==
      REFUND_OPERATION_SCHEMA_VERSION ||
    input.operation.providerRequestId !==
      input.ids.providerRequestId ||
    input.operation.mainEventId !==
      input.ids.mainEventId ||
    input.operation.cancellationRequestId !==
      input.cancellationRequestId ||
    input.operation.currency !==
      PAYMENT_CURRENCY ||
    input.operation.gateway !==
      "paymongo" ||
    input.operation.gatewayPaymentId !==
      input.payment
        .paymongoResourceId ||
    (
      !legacyOperationLinked &&
      !operationSetLinked
    ) ||
    input.providerRequest.status !==
      "cancelled" ||
    input.providerRequest
      .approvedCancellationRequestId !==
      input.cancellationRequestId ||
    (
      input.payment
        .refundExecutionLock !==
        undefined &&
      input.payment
        .refundExecutionLock !==
        null
    )
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
  const conservativeWindowMs = PAYMONGO_SAFE_RETRY_WINDOW_MS;
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
