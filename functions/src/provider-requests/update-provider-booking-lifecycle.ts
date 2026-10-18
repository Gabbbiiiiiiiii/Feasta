import {isProviderOwnerAccountActive} from "../shared/constants.js";
import {trustedScheduledEventEnd, automaticCompletionAt} from "../bookings/booking-completion-policy.js";
import {assertCompletionEvidenceClear, assertCompletionSafetyInTransaction} from "../bookings/booking-completion-safety.js";
import {Timestamp} from "firebase-admin/firestore";
import {assertBalanceEnforcementAllowsProgress} from "../payments/remaining-balance-enforcement-domain.js";
import {effectiveBookingStageV3, frozenBookingPolicyTimingV3} from "../bookings/booking-policy-v3.js";
import {scheduledEventStart} from "../payments/canonical-balance-timing.js";

export function assertV3CompletionTime(request: Readonly<Record<string, unknown>>, now: Date): void {
  let end: Date;
  try { end = trustedScheduledEventEnd(request); } catch {
    throw new HttpsError("failed-precondition", "The scheduled service completion time is invalid.");
  }
  if (!Number.isFinite(now.getTime()) || now < end) throw new HttpsError("failed-precondition", "The scheduled service has not reached its completion time.");
}
import {readTrustedProviderRequestPaymentSetInTransaction} from "../payments/provider-request-payment-reader.js";
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from "firebase-functions/v2/https";

import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";
import {
  requireAuth,
} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  isMainEventStatusTransitionAllowed,
  isProviderRequestStatusTransitionAllowed,
  type MainEventStatus,
  type ProviderRequestStatus,
  USER_ROLES,
} from "../shared/constants.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  db,
} from "../shared/firestore.js";
import {
  logError,
} from "../shared/logger.js";
import {
  createNotificationInTransaction,
} from "../shared/notifications.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  logSecurityEvent,
} from "../shared/security-events.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  requireObject,
  requireString,
} from "../shared/validation.js";
import {
  authorizeProviderRequest,
} from "./provider-request-authorization.js";
import {
  areAllAssignedProvidersAccepted,
  calculateMainEventRequestSummary,
} from "./recalculate-main-event-status.js";
import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";
import {
  assertEligibilityLifecycleInvariant,
  assertRefundEligibilityUnlocked,
  cancellationError,
  legacyActiveCancellationRequestId,
  nextRefundEligibilityState,
  policyEvidenceInvalid,
  REFUND_CANCELLATION_ERROR_REASONS,
} from "../cancellations/refund-cancellation-domain.js";
import {
  assertCanonicalProviderRequestCore,
} from "./provider-request-integrity.js";
import {
  assertProviderRequestFullySettledForServiceStart,
  releaseProviderRequestEarningsForSettlementInTransaction,
} from "../provider-finance/provider-settlement-management.js";

import {
  scheduleCompletedProviderRequestDisbursementInTransaction,
} from "../provider-finance/provider-disbursement-management.js";

type LifecycleTarget =
  | "in_progress"
  | "completed";

type LifecycleResult = {
  providerRequestId: string;
  mainEventId: string;
  status: LifecycleTarget;
  mainEventStatus: MainEventStatus;
  changed: boolean;
};

const lifecycleCallableOptions = {
  ...appCheckCallableOptions,
  timeoutSeconds: 30,
} as const;

export const markProviderBookingInProgress =
  onCall(
    lifecycleCallableOptions,
    async (request) =>
      updateProviderBookingLifecycle(
        request,
        "in_progress",
      ),
  );

export const completeProviderBooking =
  onCall(
    lifecycleCallableOptions,
    async (request) =>
      updateProviderBookingLifecycle(
        request,
        "completed",
      ),
  );

async function updateProviderBookingLifecycle(
  request: CallableRequest<unknown>,
  targetStatus: LifecycleTarget,
): Promise<LifecycleResult> {
  const actor = requireAuth(request);

  await requireRole(actor.uid, [
    USER_ROLES.provider,
  ]);

  await enforceCallableRateLimit(
    request,
    {
      scope:
        targetStatus === "in_progress"
          ? "providerBookings.start"
          : "providerBookings.complete",
      limit: 20,
      windowSeconds: 10 * 60,
    },
  );

  const input = requireObject(request.data);
  const providerRequestId = requireString(
    input.providerRequestId,
    "providerRequestId",
    {
      minLength: 8,
      maxLength: 160,
    },
  );

  return executeProviderBookingLifecycle(providerRequestId, targetStatus, {kind: "provider", uid: actor.uid});
}

/** Internal server operation; callers cannot select system authority through callable data. */
export async function executeProviderBookingLifecycle(
  providerRequestId: string, targetStatus: LifecycleTarget,
  actor: {kind: "provider"; uid: string} | {kind: "system"; uid: "feasta"},
  // Capture once; transaction retries use the same completion/holding-period anchor.
  completionInstant = new Date(),
): Promise<LifecycleResult> {
  if (actor.kind === "system" && targetStatus !== "completed") throw new Error("Invalid system operation.");
  try {
    const providerRequestReference = db
      .collection("providerRequests")
      .doc(providerRequestId);
    const initialRequestSnapshot =
      await providerRequestReference.get();

    if (!initialRequestSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "The provider request was not found.",
      );
    }

    const initialRequest =
      initialRequestSnapshot.data() ?? {};
    const providerId = stringValue(
      initialRequest.providerId,
    );
    const mainEventId = stringValue(
      initialRequest.mainEventId ??
        initialRequest.bookingId,
    );

    if (!providerId || !mainEventId) {
      throw new HttpsError(
        "failed-precondition",
        "The provider request linkage is invalid.",
      );
    }

    const providerReference = db
      .collection("providers")
      .doc(providerId);
    const mainEventReference = db
      .collection("mainEvents")
      .doc(mainEventId);
    const result = await db.runTransaction(
      async (transaction) => {
        const requestSnapshot =
          await transaction.get(
            providerRequestReference,
          );

        if (!requestSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The provider request was not found.",
          );
        }

        const requestData =
          requestSnapshot.data() ?? {};
        const currentProviderId =
          stringValue(requestData.providerId);
        const currentMainEventId =
          stringValue(
            requestData.mainEventId ??
              requestData.bookingId,
          );

        if (
          currentProviderId !== providerId ||
          currentMainEventId !== mainEventId
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The provider request changed during the operation.",
          );
        }

        const allRequestsQuery = db
          .collection("providerRequests")
          .where(
            "mainEventId",
            "==",
            mainEventId,
          );
        const [
          providerSnapshot,
          mainEventSnapshot,
          allRequestsSnapshot,
        ] = await Promise.all([
          transaction.get(providerReference),
          transaction.get(mainEventReference),
          transaction.get(allRequestsQuery),
        ]);
        if (actor.kind === "system" && requestData.providerOwnerId !== providerSnapshot.data()?.ownerId) {
          throw new HttpsError("failed-precondition", "Completion ownership evidence is invalid.");
        }
        if (actor.kind === "system") {
          const ownerId = providerSnapshot.data()?.ownerId;
          if (typeof ownerId !== "string" || !ownerId) throw new HttpsError("failed-precondition", "Provider owner is unavailable.");
          const owner = await transaction.get(db.collection("users").doc(ownerId));
          if (!owner.exists || !isProviderOwnerAccountActive(providerId, owner.data()!)) {
            throw new HttpsError("failed-precondition", "Provider owner is not eligible for automatic completion.");
          }
        }
        const authorized =
          authorizeProviderRequest({
            actorUid: actor.kind === "system" ? String(providerSnapshot.data()?.ownerId ?? "") : actor.uid,
            providerRequestSnapshot:
              requestSnapshot,
            providerSnapshot,
          });

        if (!mainEventSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The main event was not found.",
          );
        }

        const mainEvent =
          mainEventSnapshot.data() ?? {};
        const core =
          assertCanonicalProviderRequestCore({
            authorized,
            mainEventSnapshot,
          });
        const currentMainEventStatus =
          core.mainEventStatus;
        const canonicalRequestIds =
          mainEvent.providerRequestIds;

        const hasInvalidRequestRelation =
          !Array.isArray(canonicalRequestIds) ||
          canonicalRequestIds.length !==
            allRequestsSnapshot.size ||
          !allRequestsSnapshot.docs.some(
            (document) =>
              document.id ===
              providerRequestId,
          ) ||
          allRequestsSnapshot.docs.some(
            (document) => {
              const relatedRequest =
                document.data();

              return (
                !canonicalRequestIds.includes(
                  document.id,
                ) ||
                relatedRequest.mainEventId !==
                  mainEventId ||
                relatedRequest.customerId !==
                  authorized.customerId
              );
            },
          );

        if (hasInvalidRequestRelation) {
          throw new HttpsError(
            "failed-precondition",
            "The event provider-request relationships are invalid.",
          );
        }

        const evidenceClassification =
          classifyProviderRequestRefundPolicyEvidence(
            authorized.requestData,
          );

        if (evidenceClassification.status === "invalid" ||
          (actor.kind === "system" && evidenceClassification.status !== "policy_backed")) {
          throw policyEvidenceInvalid();
        }

        const eligibilityState =
          evidenceClassification.status === "policy_backed"
            ? requireRefundEligibilityState(
                authorized.requestData, completionInstant,
              )
            : null;
        const activeCancellationRequestId =
          eligibilityState
            ? eligibilityState.activeCancellationRequestId
            : legacyActiveCancellationRequestId(
                authorized.requestData,
              );

        if (eligibilityState) {
          assertEligibilityLifecycleInvariant({
            providerRequestStatus: authorized.status,
            state: eligibilityState,
            timingSchemaVersion: authorized.requestData.remainingBalanceTimingSchemaVersion,
          });
        }

        if (authorized.status === targetStatus && targetStatus === "in_progress") {
          throw new HttpsError("failed-precondition", "The event is already in progress.");
        }

        if (authorized.status === targetStatus) {
          assertIdempotentParentStatus(
            targetStatus,
            currentMainEventStatus,
          );

          return {
            providerRequestId,
            mainEventId,
            status: targetStatus,
            mainEventStatus:
              currentMainEventStatus,
            changed: false,
          };
        }

        if (activeCancellationRequestId !== null) {
          throw cancellationError(
            "failed-precondition",
            REFUND_CANCELLATION_ERROR_REASONS.eligibilityLocked,
            "Provider service progression is locked by cancellation.",
          );
        }

        if (eligibilityState) {
          assertRefundEligibilityUnlocked(
            eligibilityState,
          );
        }

        if (targetStatus === "in_progress") {
          const eventDate = authorized.requestData.eventDate as {toDate?: () => Date} | undefined;
          assertScheduledEventStartReached(eventDate?.toDate?.() ?? new Date(NaN), authorized.requestData.eventTime);
          assertBalanceEnforcementAllowsProgress(authorized.requestData);
          /*
           * Canonical P5 bookings cannot begin fulfillment with
           * Customer money still outstanding.
           *
           * Legacy requests without canonical settlement evidence keep
           * their historical lifecycle behavior.
           */
          assertProviderRequestFullySettledForServiceStart(
            authorized.requestData,
          );

  const currentSummary =
    calculateMainEventRequestSummary(
      allRequestsSnapshot.docs,
      currentMainEventStatus,
    );

  if (
    !areAllAssignedProvidersAccepted(
      currentSummary,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The event cannot start until every assigned provider has accepted the booking request.",
    );
  }
}

        const v3 = authorized.requestData.remainingBalanceTimingSchemaVersion === 3;
        const effectiveStarted = v3 && effectiveBookingStageV3({request: authorized.requestData,
          now: completionInstant}) === "service_started";
        const canonicalCompletion = targetStatus === "completed" &&
          ["financialSnapshot", "settlementSchemaVersion", "settlementStatus",
            "grossSettledAmountInCentavos", "outstandingAmountInCentavos"]
            .some(field => authorized.requestData[field] != null);
        if (v3) {
          frozenBookingPolicyTimingV3(authorized.requestData);
          assertBalanceEnforcementAllowsProgress(authorized.requestData);
          assertProviderRequestFullySettledForServiceStart(authorized.requestData);
          if (!effectiveStarted) throw new HttpsError("failed-precondition", "The booking cannot progress before its scheduled event start.");
        }
        if (v3 || canonicalCompletion) {
          assertBalanceEnforcementAllowsProgress(authorized.requestData);
          assertProviderRequestFullySettledForServiceStart(authorized.requestData);
          const paymentSet = await readTrustedProviderRequestPaymentSetInTransaction({transaction, providerRequestId,
            providerRequest: authorized.requestData, mainEventId, customerId: authorized.customerId, providerId,
            mainEvent, invalid: () => {throw new HttpsError("failed-precondition", "The booking's financial authority requires reconciliation.");}});
          if (paymentSet.mode !== "p5" || !paymentSet.settlement.fullySettled ||
            paymentSet.settlement.outstandingAmountInCentavos !== 0) {
            throw new HttpsError("failed-precondition", "The booking must be fully settled before progression.");
          }
          if (targetStatus === "completed") {
            if (!paymentSet.payments.length || paymentSet.payments.some(payment => payment.data.status !== "paid")) {
              throw new HttpsError("failed-precondition", "Refunded or unresolved payments cannot authorize completion.");
            }
            for (const payment of paymentSet.payments) assertCompletionEvidenceClear(payment.data);
          }
          if (!areAllAssignedProvidersAccepted(calculateMainEventRequestSummary(allRequestsSnapshot.docs, currentMainEventStatus))) {
            throw new HttpsError("failed-precondition", "Every assigned provider must accept before service starts.");
          }
        }
        if (targetStatus === "completed") {
          assertV3CompletionTime(authorized.requestData, completionInstant);
          if (actor.kind === "system" && (!v3 || completionInstant < automaticCompletionAt(authorized.requestData))) {
            throw new HttpsError("failed-precondition", "Automatic completion is not due.");
          }
          if ((actor.kind === "system" || v3 || canonicalCompletion) &&
            (authorized.requestData.settlementSchemaVersion !== 1 ||
            authorized.requestData.financialSnapshot?.providerDisbursementPolicyVersion !== 1)) {
            throw new HttpsError("failed-precondition", "Completion requires the canonical disbursement contract; missing enrollment requires explicit reconciliation.");
          }
          await assertCompletionSafetyInTransaction(transaction, authorized.requestData, mainEvent, {providerRequestId, mainEventId});
        }
        assertLifecycleTransition(
          targetStatus === "completed" && effectiveStarted ? "in_progress" : authorized.status,
          targetStatus === "completed" && effectiveStarted && currentMainEventStatus === "confirmed" ? "in_progress" : currentMainEventStatus,
          targetStatus,
        );

        const summary =
          calculateMainEventRequestSummary(
            allRequestsSnapshot.docs,
            currentMainEventStatus,
            [
              {
                providerRequestId,
                status: targetStatus,
              },
            ],
          );

        if (
          summary.status !==
            currentMainEventStatus &&
          !isMainEventStatusTransitionAllowed(
            targetStatus === "completed" && effectiveStarted && currentMainEventStatus === "confirmed"
              ? "in_progress" : currentMainEventStatus,
            summary.status,
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The main event cannot make the required status transition.",
          );
        }

        const timestamp = serverTimestamp();

        /*
         * Provider completion is the P10 clearing boundary.
         *
         * Customer payment happened earlier. Only now do canonical
         * Provider earnings become available for payout reservation.
         */
        if (targetStatus === "completed") {
          /*
           * Read Provider-disbursement settings before settlement-release
           * writes so the Firestore transaction preserves read-before-write
           * ordering.
           */
          const platformSettingsSnapshot =
            await transaction.get(
              db
                .collection("appSettings")
                .doc("platform"),
            );

          await releaseProviderRequestEarningsForSettlementInTransaction({
            transaction,

            providerRequestId,

            providerRequest:
              authorized.requestData,

            mainEventId,

            providerId,

            customerId:
              authorized.customerId,

            timestamp,
          });

          scheduleCompletedProviderRequestDisbursementInTransaction({
            transaction,

            providerRequestId,

            providerRequest:
              authorized.requestData,

            mainEventId,

            providerId,

            customerId:
              authorized.customerId,

            completedAt:
              completionInstant,

            platformSettings:
              platformSettingsSnapshot.exists
                ? platformSettingsSnapshot.data() ?? {}
                : null,

            timestamp,
          });
        }

        const requestUpdate: Record<
          string,
          unknown
        > = {
          status: targetStatus,
          statusUpdatedAt: timestamp,
          updatedAt: timestamp,
        };

        if (targetStatus === "in_progress") {
          requestUpdate.startedAt = timestamp;

          if (eligibilityState) {
            requestUpdate.refundEligibilityState =
              nextRefundEligibilityState(
                eligibilityState,
                "service_started",
                timestamp,
              );
          }
        } else {
          requestUpdate.completedAt = Timestamp.fromDate(completionInstant);
          requestUpdate.completionSource = actor.kind === "system" ? "automatic_fallback" : "provider";
          if (v3) {
            requestUpdate.lifecycleNextTransitionAt = null;
            requestUpdate.lifecycleReconciliationRequired = false;
            if (authorized.status === "confirmed") requestUpdate.startedAt = authorized.requestData.eventStartAt;
            if (eligibilityState) requestUpdate.refundEligibilityState = eligibilityState;
          }
        }

        transaction.update(
          providerRequestReference,
          requestUpdate,
        );

        const mainEventUpdate: Record<
          string,
          unknown
        > = {
          ...summary,
          updatedAt: timestamp,
        };

        if (
          summary.status !==
            currentMainEventStatus
        ) {
          mainEventUpdate.statusUpdatedAt =
            timestamp;
        }

        if (
          summary.status === "in_progress" &&
          currentMainEventStatus !==
            "in_progress"
        ) {
          mainEventUpdate.startedAt =
            timestamp;
        }

        if (
          summary.status === "completed" &&
          currentMainEventStatus !==
            "completed"
        ) {
          mainEventUpdate.completedAt =
            timestamp;
          if (v3 && currentMainEventStatus === "confirmed") mainEventUpdate.startedAt = authorized.requestData.eventStartAt;
        }

        transaction.update(
          mainEventReference,
          mainEventUpdate,
        );

        transaction.create(
          mainEventReference
            .collection("timeline")
            .doc(),
          timelineEntry({
            actorUid: actor.uid,
            automatic: actor.kind === "system",
            providerId,
            providerRequestId,
            targetStatus,
            mainEventStatus: summary.status,
          }),
        );

        createNotificationInTransaction(
          transaction,
          customerNotification({
            customerId:
              authorized.customerId,
            automatic: actor.kind === "system",
            providerRequestId,
            targetStatus,
          }),
        );

        if (actor.kind === "system") createNotificationInTransaction(transaction, {
          ...customerNotification({customerId: authorized.providerOwnerId, providerRequestId, targetStatus, automatic: true}),
        });

        writeAuditLogInTransaction(
          transaction,
          {
            actorId: actor.uid,
            actorRole: actor.kind,
            action:
              targetStatus === "in_progress"
                ? "provider_request.in_progress"
                : actor.kind === "system" ? "booking.completion_automatic" : "provider_request.completed",
            targetCollection:
              "providerRequests",
            targetId: providerRequestId,
            before: {
              status: authorized.status,
              mainEventStatus:
                currentMainEventStatus,
            },
            after: {
              status: targetStatus,
              mainEventStatus:
                summary.status,
            },
            metadata: {
              mainEventId,
              providerId,
              completionSource: actor.kind === "system" ? "automatic_fallback" : "provider",
              ...(actor.kind === "system" ? {scheduledEventEndAt: trustedScheduledEventEnd(authorized.requestData).toISOString(),
                fallbackEligibleAt: automaticCompletionAt(authorized.requestData).toISOString()} : {}),
            },
          },
        );

        if (
          targetStatus === "in_progress" &&
          eligibilityState
        ) {
          writeAuditLogInTransaction(
            transaction,
            {
              actorId: actor.uid,
              actorRole: "provider",
              action:
                "refund_eligibility.stage_advanced",
              targetCollection:
                "providerRequests",
              targetId: providerRequestId,
              before: {
                stage:
                  eligibilityState.currentStage,
                stageSequence:
                  eligibilityState.stageSequence,
              },
              after: {
                stage: "service_started",
                stageSequence:
                  eligibilityState.stageSequence + 1,
              },
              metadata: {
                mainEventId,
                providerId,
                source:
                  "provider_booking_in_progress",
              },
            },
          );
        }

        return {
          providerRequestId,
          mainEventId,
          status: targetStatus,
          mainEventStatus: summary.status,
          changed: true,
        };
      },
    );

    logSecurityEvent({
      action: "provider_booking_lifecycle",
      outcome: "succeeded",
      actorUid: actor.uid,
      targetId: providerRequestId,
      metadata: {
        mainEventId: result.mainEventId,
        changed: result.changed,
        mainEventStatus:
          result.mainEventStatus,
      },
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logError(
      "Provider booking lifecycle update failed",
      error,
      {
        actorUid: actor.uid,
        providerRequestId,
        targetStatus,
      },
    );

    throw new HttpsError(
      "internal",
      "Unable to update the provider booking.",
    );
  }
}

export function assertScheduledEventStartReached(eventDate: Date, eventTime: unknown, now = new Date()): void {
  let start: Date;
  try {
    start = scheduledEventStart(eventDate, eventTime);
  } catch {
    throw new HttpsError("failed-precondition", "The scheduled event start is invalid.");
  }
  if (!Number.isFinite(now.getTime()) || now.getTime() < start.getTime()) {
    throw new HttpsError("failed-precondition", "The scheduled event start has not been reached.");
  }
}

export function assertLifecycleTransition(
  currentRequestStatus:
    ProviderRequestStatus,
  currentMainEventStatus:
    MainEventStatus,
  targetStatus: LifecycleTarget,
): void {
  const expectedRequestStatus =
    targetStatus === "in_progress"
      ? "confirmed"
      : "in_progress";

  if (
    currentRequestStatus !==
      expectedRequestStatus ||
    !isProviderRequestStatusTransitionAllowed(
      currentRequestStatus,
      targetStatus,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      targetStatus === "in_progress"
        ? "Only a confirmed provider booking can be started."
        : "Only an in-progress provider booking can be completed.",
    );
  }

  const allowedMainEventStatuses:
    readonly MainEventStatus[] =
      targetStatus === "in_progress"
        ? ["confirmed", "in_progress"]
        : ["in_progress"];

  if (
    !allowedMainEventStatuses.includes(
      currentMainEventStatus,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The main event is not eligible for this operation.",
    );
  }
}

function assertIdempotentParentStatus(
  targetStatus: LifecycleTarget,
  currentMainEventStatus:
    MainEventStatus,
): void {
  const allowedStatuses:
    readonly MainEventStatus[] =
      targetStatus === "in_progress"
        ? ["in_progress"]
        : ["in_progress", "completed"];

  if (
    !allowedStatuses.includes(
      currentMainEventStatus,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider request and main event statuses are inconsistent.",
    );
  }
}

function timelineEntry(input: {
  actorUid: string;
  automatic?: boolean;
  providerId: string;
  providerRequestId: string;
  targetStatus: LifecycleTarget;
  mainEventStatus: MainEventStatus;
}): Record<string, unknown> {
  const completed =
    input.targetStatus === "completed";

  return {
    type: input.targetStatus,
    status: input.mainEventStatus,
    title: completed
      ? "Provider Service Completed"
      : "Provider Service In Progress",
    description: completed
      ? input.automatic ? "FEASTA automatically completed the service 24 hours after its scheduled end." : "A provider marked the requested service as completed."
      : "A provider started fulfilling the requested service.",
    providerRequestId:
      input.providerRequestId,
    providerId: input.providerId,
    createdBy: input.actorUid,
    createdByRole: input.automatic ? "system" : "provider",
    createdAt: serverTimestamp(),
  };
}

function customerNotification(input: {
  customerId: string;
  automatic?: boolean;
  providerRequestId: string;
  targetStatus: LifecycleTarget;
}): Parameters<
  typeof createNotificationInTransaction
>[1] {
  const completed =
    input.targetStatus === "completed";

  return {
    userId: input.customerId,
    title: completed
      ? "Provider Service Completed"
      : "Provider Service Started",
    message: completed
      ? input.automatic ? "FEASTA automatically completed your service 24 hours after its scheduled end." : "A provider marked your requested service as completed."
      : "A provider started fulfilling your requested service.",
    type: "booking",
    relatedId: input.providerRequestId,
    relatedCollection:
      "providerRequests",
    metadata: {
      providerRequestStatus:
        input.targetStatus,
      completionSource: input.automatic ? "automatic_fallback" : "provider",
      createdByRole: input.automatic ? "system" : "provider",
    },
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}
