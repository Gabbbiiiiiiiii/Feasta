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
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  manilaDateKey,
  manilaDateRange,
  validateProviderAvailability,
} from "../provider-availability/validate-provider-availability.js";

const PAYMENT_WINDOW_HOURS = 24;

export const acceptProviderRequest = onCall(
  {
    ...appCheckCallableOptions,
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
            authorized.status === "accepted" ||
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

          requirePendingProviderRequest(
            authorized,
          );

          requireProviderResponseParentStatus(
            core.mainEventStatus,
          );

          const acceptanceTime = new Date();

          const acceptanceSnapshot =
            validateAcceptanceProviderRequest({
              authorized,
              mainEventData:
                core.mainEventData,
              now: acceptanceTime,
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

          const {nextStatus, summary, overrides} = providerAcceptancePlan({
            mainEventId,
            mainEvent: core.mainEventData,
            mainEventStatus: core.mainEventStatus,
            providerRequestId,
            requests: allRequestsSnapshot.docs,
          });
          // Reuse the existing payment expiry field, starting only when the
          // entire lineup is ready and never extending beyond event start.
          const eventStart = new Date(
            `${manilaDateKey(acceptanceSnapshot.eventDate.toDate())}` +
            `T${acceptanceSnapshot.eventTime}:00+08:00`,
          );
          const paymentDeadline = Timestamp.fromMillis(Math.min(
            acceptanceTime.getTime() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1_000,
            eventStart.getTime(),
          ));

          for (const override of overrides) {
            if (override.providerRequestId === providerRequestId) continue;
            transaction.update(
              db.collection("providerRequests").doc(override.providerRequestId),
              {
                status: override.status,
                expiresAt: override.status === "waiting_for_down_payment" ? paymentDeadline : null,
                confirmedAt: override.status === "confirmed" ? serverTimestamp() : null,
                updatedAt: serverTimestamp(),
              },
            );
          }

          transaction.update(
            providerRequestReference,
            {
              status: nextStatus,
              respondedAt:
                serverTimestamp(),
              acceptedAt:
                serverTimestamp(),

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
                nextStatus === "accepted"
                  ? "A provider accepted the request. Waiting for the remaining required providers."
                  : summary.status ===
                  "waiting_for_down_payment"
                  ? "All required providers accepted. Down payment is now available."
                  : "All required providers accepted and the booking is confirmed.",

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
                nextStatus === "accepted"
                  ? "A provider accepted your request. " +
                    "Payment stays locked until all required providers are ready."
                  : summary.status ===
                  "waiting_for_down_payment"
                  ? "All required providers accepted. Complete the required down payments."
                  : "All required providers accepted and your booking is confirmed.",

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
