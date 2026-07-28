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
  parseMainEventStatus,
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
  calculateMainEventRequestSummary,
} from "./recalculate-main-event-status.js";

const ACTIVE_PROVIDER_STATUSES = [
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
] as const;

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

      const paymentDeadline =
        Timestamp.fromMillis(
          Date.now() +
            PAYMENT_WINDOW_HOURS *
              60 *
              60 *
              1_000,
        );

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
              requestData.mainEventId ??
                requestData.bookingId,
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
              "==",
              eventDate,
            )
            .where(
              "status",
              "in",
              [...ACTIVE_PROVIDER_STATUSES],
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

          requirePendingProviderRequest(
            authorized,
          );

          if (!mainEventSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "The main event was not found.",
            );
          }

          const mainEvent =
            mainEventSnapshot.data() ?? {};

          if (
            mainEvent.customerId !==
              authorized.customerId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The main-event ownership is invalid.",
            );
          }

          const currentMainEventStatus =
            parseMainEventStatus(
              mainEvent.status,
            );

          if (!currentMainEventStatus) {
            throw new HttpsError(
              "failed-precondition",
              "The main-event status is invalid.",
            );
          }

          if (
            [
              "completed",
              "cancelled",
              "expired",
            ].includes(
              currentMainEventStatus,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "This event can no longer accept provider responses.",
            );
          }

          assertProviderCapacity({
            providerData:
              authorized.providerData,

            requestType:
              authorized.type,

            requestGuestCount:
              authorized.guestCount,

            currentRequestId:
              providerRequestId,

            activeRequestIds:
              activeRequestsSnapshot.docs.map(
                (document) => document.id,
              ),
          });

          const nextStatus =
            authorized.downPaymentAmount > 0
              ? "waiting_for_down_payment"
              : "confirmed";

          const summary =
            calculateMainEventRequestSummary(
              allRequestsSnapshot.docs,
              currentMainEventStatus,
              [
                {
                  providerRequestId,
                  status: nextStatus,
                },
              ],
            );

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
                nextStatus ===
                  "waiting_for_down_payment"
                  ? "A provider accepted the request. Down payment is required."
                  : "A provider accepted and confirmed the request.",

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
                nextStatus ===
                  "waiting_for_down_payment"
                  ? "A provider accepted your request. Complete the required down payment."
                  : "A provider accepted and confirmed your request.",

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
                  authorized
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

function assertProviderCapacity(
  input: {
    providerData:
      Record<string, unknown>;

    requestType:
      "catering" | "addon";

    requestGuestCount: number;

    currentRequestId: string;

    activeRequestIds:
      readonly string[];
  },
): void {
  const otherActiveRequestCount =
    input.activeRequestIds.filter(
      (requestId) =>
        requestId !==
        input.currentRequestId,
    ).length;

  const acceptsMultipleEvents =
    input.providerData
      .acceptsMultipleEventsPerDay ===
    true;

  const configuredMaximum =
    input.providerData.maxEventsPerDay;

  const maximumEvents =
    acceptsMultipleEvents &&
    Number.isSafeInteger(
      configuredMaximum,
    ) &&
    (configuredMaximum as number) > 0
      ? configuredMaximum as number
      : 1;

  if (
    otherActiveRequestCount >=
    maximumEvents
  ) {
    throw new HttpsError(
      "resource-exhausted",
      "The provider has reached its event capacity for this date.",
    );
  }

  if (input.requestType !== "catering") {
    return;
  }

  const maximumGuests =
    input.providerData.maxGuestsPerEvent;

  if (
    typeof maximumGuests === "number" &&
    Number.isFinite(maximumGuests) &&
    maximumGuests > 0 &&
    input.requestGuestCount >
      maximumGuests
  ) {
    throw new HttpsError(
      "resource-exhausted",
      "The requested guest count exceeds the provider's capacity.",
    );
  }
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}