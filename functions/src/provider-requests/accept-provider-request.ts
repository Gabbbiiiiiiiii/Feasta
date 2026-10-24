import {calculateInitialPaymentDeadlineV4, INITIAL_PAYMENT_DEADLINE_POLICY_VERSION} from "../payments/initial-payment-deadline.js";
import {existingAcceptancePlan} from "./existing-acceptance-plan.js";
import {requireInitialPaymentReservation} from "../payments/initial-payment-reservation.js";
import {readTrustedProviderRequestPaymentSetInTransaction} from "../payments/provider-request-payment-reader.js";
import {loadBookingPaymentPolicySnapshot} from "../bookings/load-booking-payment-policy.js";
import {bookingPolicyTimingV3, frozenBookingPolicyTimingV3, balanceStatusV3} from "../bookings/booking-policy-v3.js";
import {requireBookingPaymentPolicySnapshot} from "../bookings/booking-payment-eligibility-policy.js";
import {evaluateInitialPaymentEligibility, enforceInitialPaymentEligibility} from "../payments/initial-payment-eligibility.js";
import {BALANCE_DUE_HOURS_BEFORE_EVENT, canonicalBalanceTiming, canonicalBalanceSchedule, scheduledEventStart} from "../payments/canonical-balance-timing.js";
import {
  Timestamp,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
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
  requirePendingProviderRequest,
} from "./provider-request-authorization.js";
import {
  assertCanonicalProviderRequestCore,
  requireProviderResponseParentStatus,
  validateAcceptanceProviderRequest,
} from "./provider-request-integrity.js";
import {providerAcceptancePlan} from "./provider-acceptance-plan.js";
import {
  buildProviderRequestFinancialSnapshot,
} from "./provider-request-financial-snapshot.js";
import {
  DEFAULT_REMAINING_BALANCE_TIMING_POLICY,
  remainingBalanceSchedule,
} from "../payments/remaining-balance-domain.js";
import {
  providerPayoutReadinessReason,
} from "../provider-finance/provider-payment-account-domain.js";
import {
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  manilaDateRange,
  validateProviderAvailability,
} from "../provider-availability/validate-provider-availability.js";

export const acceptProviderRequest = onCall(
  {
    ...appCheckCallableOptions,
    maxInstances: 20,
    memory: "256MiB",
    concurrency: 80,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);

    await requireRole(actor.uid, [
      USER_ROLES.provider,
    ]);

    await enforceCallableRateLimit(request, {
      scope: "providerRequests.accept",
      limit: 20,
      windowSeconds: 10 * 60,
    });

    const input = requireObject(
      request.data,
    );

    const providerRequestId =
      requireString(
        input.providerRequestId,
        "providerRequestId",
        {
          minLength: 8,
          maxLength: 160,
        },
      );

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
        initialRequest.mainEventId,
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

      const platformSettingsReference =
        db
          .collection("appSettings")
          .doc("platform");

      const providerTaxProfileReference =
        db
          .collection(
            "providerTaxProfiles",
          )
          .doc(providerId);

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
            stringValue(
              requestData.providerId,
            );

          const currentMainEventId =
            stringValue(
              requestData.mainEventId,
            );

          if (
            currentProviderId !== providerId ||
            currentMainEventId !==
              mainEventId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The provider request changed while being reviewed.",
            );
          }

          const eventDate =
            requestData.eventDate;

          if (!(eventDate instanceof Timestamp)) {
            throw new HttpsError(
              "failed-precondition",
              "The provider request event date is invalid.",
            );
          }

          const eventDateRange =
            manilaDateRange(
              eventDate.toDate(),
            );

          if (!eventDateRange) {
            throw new HttpsError(
              "failed-precondition",
              "The provider request event date is invalid.",
            );
          }

          const allRequestsQuery = db
            .collection("providerRequests")
            .where(
              "mainEventId",
              "==",
              mainEventId,
            );

          const activeRequestsQuery = db
            .collection("providerRequests")
            .where(
              "providerId",
              "==",
              providerId,
            )
            .where(
              "eventDate",
              ">=",
              Timestamp.fromDate(
                eventDateRange.start,
              ),
            )
            .where(
              "eventDate",
              "<",
              Timestamp.fromDate(
                eventDateRange.end,
              ),
            )
            .where(
              "status",
              "in",
              [
                ...AVAILABILITY_COUNTED_REQUEST_STATUSES,
              ],
            );

          const [
            providerSnapshot,
            mainEventSnapshot,
            allRequestsSnapshot,
            activeRequestsSnapshot,
            platformSettingsSnapshot,
            providerTaxProfileSnapshot,
          ] = await Promise.all([
            transaction.get(
              providerReference,
            ),

            transaction.get(
              mainEventReference,
            ),

            transaction.get(
              allRequestsQuery,
            ),

            transaction.get(
              activeRequestsQuery,
            ),

            transaction.get(
              platformSettingsReference,
            ),

            transaction.get(
              providerTaxProfileReference,
            ),
          ]);

          const authorized =
            authorizeProviderRequest({
              actorUid: actor.uid,
              providerRequestSnapshot:
                requestSnapshot,
              providerSnapshot,
            });

          const core =
            assertCanonicalProviderRequestCore({
              authorized,
              mainEventSnapshot,
            });

          if (
            authorized.status ===
              "waiting_for_down_payment" ||
            authorized.status ===
              "confirmed"
          ) {
            return {
              providerRequestId,
              mainEventId,
              status: authorized.status,
              accepted: false,
            };
          }

          if (authorized.status !== "accepted") requirePendingProviderRequest(authorized);

          requireProviderResponseParentStatus(
            core.mainEventStatus,
          );

          const payoutAccountSnapshot =
            await transaction.get(
              db
                .collection(
                  "providerPaymentAccounts",
                )
                .doc(
                  authorized.providerId,
                ),
            );

          const payoutReadinessReason =
            providerPayoutReadinessReason({
              payoutSetupRequired:
                true,

              providerId:
                authorized.providerId,

              account:
                payoutAccountSnapshot.exists
                  ? payoutAccountSnapshot.data() ??
                    {}
                  : null,
            });

          if (payoutReadinessReason) {
            throw new HttpsError(
              "failed-precondition",
              "Complete payout setup before accepting new booking requests.",
              {
                reason:
                  payoutReadinessReason,
              },
            );
          }

          const acceptanceTime = new Date();

          const acceptanceSnapshot =
            validateAcceptanceProviderRequest({
              authorized,
              mainEventData:
                core.mainEventData,
              now: acceptanceTime,
            });

          if (authorized.status === "accepted") {
            if (authorized.requestData.providerOwnerId !== authorized.providerOwnerId) {
              throw new HttpsError("failed-precondition", "Historical provider ownership requires reconciliation.");
            }
            const original = existingAcceptancePlan(authorized.requestData, acceptanceTime);
            const payments = await readTrustedProviderRequestPaymentSetInTransaction({transaction,
              providerRequestId, providerRequest: authorized.requestData, mainEventId,
              customerId: authorized.customerId, providerId, mainEvent: core.mainEventData,
              invalid: () => {throw new HttpsError("failed-precondition", "Historical payment authority requires reconciliation.");}});
            const history = await transaction.get(db.collection("payments").where("providerRequestId", "==", providerRequestId));
            if (payments.payments.length || !history.empty) {
              throw new HttpsError("failed-precondition", "Historical payments require reconciliation.");
            }
            await requireInitialPaymentReservation(transaction, providerRequestId,
              {...authorized.requestData, expiresAt: original.expiresAt}, acceptanceTime);
            const plan = providerAcceptancePlan({mainEventId, mainEvent: core.mainEventData,
              mainEventStatus: core.mainEventStatus, providerRequestId, requests: allRequestsSnapshot.docs,
              allowExistingAcceptance: true});
            transaction.update(providerReference, {availabilityReservationUpdatedAt: serverTimestamp()});
            transaction.update(providerRequestReference, {status: plan.nextStatus,
              expiresAt: plan.nextStatus === "waiting_for_down_payment" ? original.expiresAt : null,
              ...(plan.nextStatus === "confirmed" ? {confirmedAt: serverTimestamp()} : {}), updatedAt: serverTimestamp()});
            transaction.update(mainEventReference, {...plan.summary, updatedAt: serverTimestamp()});
            writeAuditLogInTransaction(transaction, {actorId: actor.uid, actorRole: "provider",
              action: "provider_request.acceptance_recovered", targetCollection: "providerRequests", targetId: providerRequestId,
              before: {status: "accepted"}, after: {status: plan.nextStatus}, metadata: {mainEventId, providerId}});
            return {providerRequestId, mainEventId, status: plan.nextStatus, accepted: false};
          }

          const financialSnapshot =
            buildProviderRequestFinancialSnapshot(
              {
                providerId:
                  authorized.providerId,

                providerOwnerId:
                  authorized.providerOwnerId,

                providerRequest:
                  authorized.requestData,

                platformSettings:
                  platformSettingsSnapshot
                    .exists
                    ? platformSettingsSnapshot
                        .data() ?? {}
                    : null,

                providerTaxProfile:
                  providerTaxProfileSnapshot
                    .exists
                    ? providerTaxProfileSnapshot
                        .data() ?? {}
                    : null,
              },
            );

          const packagePaymentTerms =
            financialSnapshot
              .packagePaymentTerms;

          let bookingPaymentPolicySnapshot = authorized.requestData.bookingPaymentPolicySnapshot == null
            ? null : requireBookingPaymentPolicySnapshot(authorized.requestData.bookingPaymentPolicySnapshot);
          const legacyPolicyCapture = !bookingPaymentPolicySnapshot &&
            packagePaymentTerms?.paymentPolicy === "deposit_then_balance";
          if (legacyPolicyCapture) {
            // Pre-phase pending requests have no submission-time policy evidence.
            // Deposit requests must resolve the actual package category; no category fallback.
            // Full-payment/menu requests need no deposit policy, and accepted legacy requests return above unchanged.
            const packageId = typeof authorized.requestData.packageId === "string"
              ? authorized.requestData.packageId : null;
            const packageData = packageId
              ? (await transaction.get(db.collection("packages").doc(packageId))).data() ?? null : null;
            bookingPaymentPolicySnapshot = await loadBookingPaymentPolicySnapshot({transaction, packageId, packageData,
              platformSettings: platformSettingsSnapshot.data() ?? null});
          }
          const submissionEligibilityFrozen = authorized.requestData.initialPaymentEligibilitySchemaVersion === 2;
          const timingV3 = authorized.requestData.remainingBalanceTimingSchemaVersion === 3
            ? frozenBookingPolicyTimingV3(authorized.requestData) : null;
          if (submissionEligibilityFrozen) {
            enforceInitialPaymentEligibility(authorized.requestData, "full");
            const timing = bookingPolicyTimingV3(scheduledEventStart(
              acceptanceSnapshot.eventDate.toDate(), acceptanceSnapshot.eventTime));
            if (acceptanceTime >= timing.hardPaymentDeadlineAt &&
              authorized.requestData.settlementStatus !== "fully_settled") {
              throw new HttpsError("failed-precondition",
                "This request can no longer be accepted because its payment deadline has passed.",
                {reason: "booking_acceptance_payment_deadline_passed"});
            }
          }
          if (timingV3 && acceptanceTime >= timingV3.hardPaymentDeadlineAt &&
            authorized.requestData.settlementStatus !== "fully_settled") {
            throw new HttpsError("failed-precondition", "This request's payment deadline has passed.",
              {reason: "booking_acceptance_payment_deadline_passed"});
          }
          const initialPaymentEligibility = !submissionEligibilityFrozen && (packagePaymentTerms ||
            financialSnapshot.requiredUpfrontAmountInCentavos === financialSnapshot.grossAmountInCentavos
          )
            ? evaluateInitialPaymentEligibility({
                eventDate: acceptanceSnapshot.eventDate.toDate(), eventTime: acceptanceSnapshot.eventTime,
                acceptanceTime, packagePaymentTerms, bookingPaymentPolicySnapshot,
              }) : null;

          const balanceDueDaysBeforeEvent =
            financialSnapshot
              .remainingBalanceInCentavos > 0 &&
            packagePaymentTerms
              ?.paymentPolicy ===
                "deposit_then_balance"
              ? packagePaymentTerms
                  .balanceDueDaysBeforeEvent
              : null;

          /*
           * P10 freezes balance timing at Provider acceptance.
           *
           * Version 2 uses the authoritative Manila event date and clock.
           * Version 1 retains the frozen legacy package day terms. Later package
           * edits therefore cannot move the Customer's due date.
           *
           * Legacy records without canonical payment terms remain
           * explicit legacy records instead of receiving invented
           * due dates.
           */
          const canonicalTiming = !timingV3 && packagePaymentTerms?.schemaVersion === 2 &&
            packagePaymentTerms.paymentPolicy === "deposit_then_balance" && financialSnapshot.remainingBalanceInCentavos > 0
            ? canonicalBalanceTiming(acceptanceSnapshot.eventDate.toDate(), acceptanceSnapshot.eventTime) : null;
          const remainingBalanceTiming = canonicalTiming
            ? canonicalBalanceSchedule({...canonicalTiming, now: acceptanceTime,
                remainingAmountInCentavos: financialSnapshot.remainingBalanceInCentavos})
            :
            balanceDueDaysBeforeEvent === null
              ? null
              : remainingBalanceSchedule({
                  eventDate:
                    acceptanceSnapshot
                      .eventDate
                      .toDate(),

                  balanceDueDaysBeforeEvent,

                  remainingBalanceInCentavos:
                    financialSnapshot
                      .remainingBalanceInCentavos,

                  settledBalanceInCentavos: 0,

                  cancelled: false,

                  now: acceptanceTime,

                  policy:
                    DEFAULT_REMAINING_BALANCE_TIMING_POLICY,
                });

          const availability =
            validateProviderAvailability({
              providerData:
                authorized.providerData,
              request: {
                providerRequestId,
                type: authorized.type,
                eventDate:
                  acceptanceSnapshot
                    .eventDate.toDate(),
                eventTime:
                  acceptanceSnapshot
                    .eventTime,
                eventEndTime:
                  acceptanceSnapshot
                    .eventEndTime,
                guestCount:
                  acceptanceSnapshot
                    .guestCount,
                services:
                  authorized.requestData
                    .services,
              },
              existingBookings:
                activeRequestsSnapshot.docs
                  .map((document) => ({
                    ...document.data(),
                    providerRequestId:
                      document.id,
                    status:
                      document.data()
                        .status,
                    eventTime:
                      document.data()
                        .eventTime,
                    eventEndTime:
                      document.data()
                        .eventEndTime,
                    expiresAt:
                      document.data()
                        .expiresAt,
                    acceptedAt:
                      document.data()
                        .acceptedAt,
                  })),
              now: acceptanceTime,
            });

          if (!availability.available) {
            throw new HttpsError(
              "failed-precondition",
              "The provider is not available for this event.",
              {
                issues:
                  availability.issues,
              },
            );
          }

          const {nextStatus, summary} = providerAcceptancePlan({
            mainEventId,
            mainEvent: core.mainEventData,
            mainEventStatus: core.mainEventStatus,
            providerRequestId,
            requests: allRequestsSnapshot.docs,
          });
          // Reuse the existing payment expiry field, starting only when the
          // selected provider accepts, never extending beyond event start.
          const eventStart = scheduledEventStart(acceptanceSnapshot.eventDate.toDate(), acceptanceSnapshot.eventTime);
          if (authorized.requestData.hardPaymentDeadlineAt != null &&
            !(authorized.requestData.hardPaymentDeadlineAt instanceof Timestamp)) {
            throw new HttpsError("failed-precondition", "Invalid frozen payment deadline.");
          }
          const hardDeadlines = [
            ...(timingV3 ? [timingV3.hardPaymentDeadlineAt] : []),
            ...(canonicalTiming ? [canonicalTiming.dueAt] : []),
            ...(authorized.requestData.hardPaymentDeadlineAt instanceof Timestamp
              ? [authorized.requestData.hardPaymentDeadlineAt.toDate()] : []),
          ];
          let paymentDeadline: Timestamp;
          try {
            paymentDeadline = Timestamp.fromDate(calculateInitialPaymentDeadlineV4({
              acceptedAt: acceptanceTime, eventStartAt: eventStart, hardDeadlines,
            }));
          } catch {
            throw new HttpsError("failed-precondition", "This request has no valid initial payment window.");
          }

          // Serialize reservation changes for this provider.
          // Concurrent acceptances and date-blocking updates must retry.
          transaction.update(providerReference, {
            availabilityReservationUpdatedAt: serverTimestamp(),
          });

          transaction.update(
            providerRequestReference,
            {
              status: nextStatus,
              respondedAt:
                serverTimestamp(),
              acceptedAt:
                Timestamp.fromDate(acceptanceTime),
              initialPaymentDeadlinePolicyVersion: INITIAL_PAYMENT_DEADLINE_POLICY_VERSION,
              initialPaymentDeadlineAt: paymentDeadline,

              financialSnapshot,

              financialSnapshotCapturedAt:
                Timestamp.fromDate(acceptanceTime),

              /*
               * Customer settlement timing is separate from
               * Provider payout/settlement timing.
               *
               * These fields describe when the Customer owes the
               * remaining booking balance only.
               */
              ...(canonicalTiming && remainingBalanceTiming
                ? {remainingBalanceStatus: remainingBalanceTiming.status}
                : {}),
              ...(legacyPolicyCapture ? {
                bookingPaymentPolicySnapshot,
                bookingPaymentPolicyCapturedAt: Timestamp.fromDate(acceptanceTime),
                bookingPaymentPolicyCapturedAtStage: "acceptance_legacy",
              } : {}),
              ...(initialPaymentEligibility ? {
                initialPaymentEligibilitySchemaVersion: 1,
                initialPaymentEligibility: {...initialPaymentEligibility,
                  evaluatedAt: Timestamp.fromDate(initialPaymentEligibility.evaluatedAt),
                  eventStartAt: Timestamp.fromDate(initialPaymentEligibility.eventStartAt)},
              } : {}),
              providerOwnerId: authorized.providerOwnerId,
              remainingBalanceTimingSchemaVersion:
                remainingBalanceTiming
                  ? (canonicalTiming ? 2 : 1)
                  : null,

              balanceDueHoursBeforeEvent: canonicalTiming ? BALANCE_DUE_HOURS_BEFORE_EVENT : null,
              remainingBalanceReminderAt: canonicalTiming ? Timestamp.fromDate(canonicalTiming.reminderAt) : null,
              eventStartAt: Timestamp.fromDate(eventStart),
              balanceDueDaysBeforeEvent:
                balanceDueDaysBeforeEvent,

              remainingBalanceDueSoonWindowDays:
                remainingBalanceTiming && !canonicalTiming
                  ? DEFAULT_REMAINING_BALANCE_TIMING_POLICY
                      .dueSoonWindowDays
                  : null,

              remainingBalanceGracePeriodDays:
                remainingBalanceTiming && !canonicalTiming
                  ? DEFAULT_REMAINING_BALANCE_TIMING_POLICY
                      .gracePeriodDays
                  : null,

              remainingBalanceDueAt:
                remainingBalanceTiming
                  ?.dueAt
                  ? Timestamp.fromDate(
                      remainingBalanceTiming.dueAt,
                    )
                  : null,

              remainingBalanceGraceEndsAt:
                remainingBalanceTiming
                  ?.graceEndsAt
                  ? Timestamp.fromDate(
                      remainingBalanceTiming
                        .graceEndsAt,
                    )
                  : null,

              // V3 timestamps were frozen at submission. Never reconstruct them
              // from a later acceptance clock or overwrite them with v2/null.
              ...(timingV3 ? {
                remainingBalanceTimingSchemaVersion: 3, balanceDueHoursBeforeEvent: 48,
                eventStartAt: authorized.requestData.eventStartAt,
                remainingBalanceDueAt: authorized.requestData.remainingBalanceDueAt,
                hardPaymentDeadlineAt: authorized.requestData.hardPaymentDeadlineAt,
                preparationStartsAt: authorized.requestData.preparationStartsAt,
                depositEligibilityCutoffAt: authorized.requestData.depositEligibilityCutoffAt,
                remainingBalanceGraceEndsAt: authorized.requestData.hardPaymentDeadlineAt,
                remainingBalanceNextCheckAt: Timestamp.fromDate(timingV3.remainingBalanceDueAt),
                lifecycleNextTransitionAt: Timestamp.fromDate(timingV3.preparationStartsAt),
                remainingBalanceStatus: financialSnapshot.remainingBalanceInCentavos > 0
                  ? balanceStatusV3({...timingV3, now: acceptanceTime,
                      outstandingAmountInCentavos: financialSnapshot.remainingBalanceInCentavos}) : "not_applicable",
              } : {}),

              expiresAt:
                nextStatus ===
                "waiting_for_down_payment"
                  ? paymentDeadline
                  : null,

              confirmedAt:
                nextStatus === "confirmed"
                  ? serverTimestamp()
                  : null,

              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.update(
            mainEventReference,
            {
              ...summary,
              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.create(
            mainEventReference
              .collection("timeline")
              .doc(),
            {
              type: "provider_accepted",
              status: summary.status,

              title:
                "Provider Request Accepted",

              description:
                nextStatus === "waiting_for_down_payment"
                  ? "This provider accepted. Payment for this provider is now available."
                  : "This provider accepted and its booking is confirmed.",

              providerRequestId,
              providerId,

              createdBy: actor.uid,
              createdByRole: "provider",
              createdAt:
                serverTimestamp(),
            },
          );

          createNotificationInTransaction(
            transaction,
            {
              userId:
                authorized.customerId,

              title:
                "Provider Request Accepted",

              message:
                nextStatus === "waiting_for_down_payment"
                  ? "This provider accepted your request. You can choose to pay this provider."
                  : "This provider accepted and its booking is confirmed.",

              type: "booking",

              relatedId:
                providerRequestId,

              relatedCollection:
                "providerRequests",
            },
          );

          writeAuditLogInTransaction(
            transaction,
            {
              actorId: actor.uid,
              actorRole: "provider",

              action:
                "provider_request.accepted",

              targetCollection:
                "providerRequests",

              targetId:
                providerRequestId,

              before: {
                status: authorized.status,
              },

              after: {
                status: nextStatus,
              },

              metadata: {
                mainEventId,
                providerId,
                downPaymentRequired:
                  acceptanceSnapshot
                    .downPaymentAmount > 0,
              },
            },
          );

          return {
            providerRequestId,
            mainEventId,
            status: nextStatus,
            accepted: true,
          };
        },
      );

      logSecurityEvent({
        action:
          "provider_request_acceptance",

        outcome: "succeeded",
        actorUid: actor.uid,

        targetId:
          providerRequestId,

        metadata: {
          accepted: result.accepted,
          status: result.status,
          mainEventId:
            result.mainEventId,
        },
      });

      return result;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logError(
        "Provider request acceptance failed",
        error,
        {
          actorUid: actor.uid,
          providerRequestId,
        },
      );

      throw new HttpsError(
        "internal",
        "Unable to accept the provider request.",
      );
    }
  },
);

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}
