import {
  FieldValue,
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

export const rejectProviderRequest = onCall(
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
      scope: "providerRequests.reject",
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

    const rejectionReason =
      requireString(
        input.reason,
        "reason",
        {
          minLength: 5,
          maxLength: 500,
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
            transaction.get(
              providerReference,
            ),

            transaction.get(
              mainEventReference,
            ),

            transaction.get(
              allRequestsQuery,
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
            authorized.status === "rejected"
          ) {
            return {
              providerRequestId,
              mainEventId,
              status: "rejected",
              rejected: false,
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
              "This event can no longer receive provider responses.",
            );
          }

          const summary =
            calculateMainEventRequestSummary(
              allRequestsSnapshot.docs,
              currentMainEventStatus,
              [
                {
                  providerRequestId,
                  status: "rejected",
                },
              ],
            );

          transaction.update(
            providerRequestReference,
            {
              status: "rejected",

              rejectionReason,

              respondedAt:
                serverTimestamp(),

              rejectedAt:
                serverTimestamp(),

              replacementStatus:
                "required",

              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.update(
            mainEventReference,
            {
              ...summary,

              recoveryStatus:
                "required",

              rejectedByProviderIds:
                FieldValue.arrayUnion(
                  providerId,
                ),

              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.create(
            mainEventReference
              .collection("timeline")
              .doc(),
            {
              type: "provider_rejected",
              status: summary.status,

              title:
                "Provider Request Rejected",

              description:
                "A selected provider rejected the booking request.",

              reason: rejectionReason,

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
                "Provider Request Rejected",

              message:
                "A provider could not accept your request. You may select a replacement provider.",

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
                "provider_request.rejected",

              targetCollection:
                "providerRequests",

              targetId:
                providerRequestId,

              before: {
                status: authorized.status,
              },

              after: {
                status: "rejected",
                replacementStatus:
                  "required",
              },

              reason: rejectionReason,

              metadata: {
                mainEventId,
                providerId,
                requestType:
                  authorized.type,
              },
            },
          );

          return {
            providerRequestId,
            mainEventId,
            status: "rejected",
            rejected: true,
          };
        },
      );

      logSecurityEvent({
        action:
          "provider_request_rejection",

        outcome: "succeeded",
        actorUid: actor.uid,

        targetId:
          providerRequestId,

        metadata: {
          rejected: result.rejected,
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
        "Provider request rejection failed",
        error,
        {
          actorUid: actor.uid,
          providerRequestId,
        },
      );

      throw new HttpsError(
        "internal",
        "Unable to reject the provider request.",
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