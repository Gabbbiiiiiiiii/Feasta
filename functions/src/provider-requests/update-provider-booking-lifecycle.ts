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
  parseMainEventStatus,
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
  calculateMainEventRequestSummary,
} from "./recalculate-main-event-status.js";

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
        const authorized =
          authorizeProviderRequest({
            actorUid: actor.uid,
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

        const hasInvalidRequestRelation =
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

        assertLifecycleTransition(
          authorized.status,
          currentMainEventStatus,
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
            currentMainEventStatus,
            summary.status,
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The main event cannot make the required status transition.",
          );
        }

        const requestUpdate: Record<
          string,
          unknown
        > = {
          status: targetStatus,
          statusUpdatedAt:
            serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (targetStatus === "in_progress") {
          requestUpdate.startedAt =
            serverTimestamp();
        } else {
          requestUpdate.completedAt =
            serverTimestamp();
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
          updatedAt: serverTimestamp(),
        };

        if (
          summary.status !==
            currentMainEventStatus
        ) {
          mainEventUpdate.statusUpdatedAt =
            serverTimestamp();
        }

        if (
          summary.status === "in_progress" &&
          currentMainEventStatus !==
            "in_progress"
        ) {
          mainEventUpdate.startedAt =
            serverTimestamp();
        }

        if (
          summary.status === "completed" &&
          currentMainEventStatus !==
            "completed"
        ) {
          mainEventUpdate.completedAt =
            serverTimestamp();
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
            providerRequestId,
            targetStatus,
          }),
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId: actor.uid,
            actorRole: "provider",
            action:
              targetStatus === "in_progress"
                ? "provider_request.in_progress"
                : "provider_request.completed",
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
            },
          },
        );

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
      ? "A provider marked the requested service as completed."
      : "A provider started fulfilling the requested service.",
    providerRequestId:
      input.providerRequestId,
    providerId: input.providerId,
    createdBy: input.actorUid,
    createdByRole: "provider",
    createdAt: serverTimestamp(),
  };
}

function customerNotification(input: {
  customerId: string;
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
      ? "A provider marked your requested service as completed."
      : "A provider started fulfilling your requested service.",
    type: "booking",
    relatedId: input.providerRequestId,
    relatedCollection:
      "providerRequests",
    metadata: {
      providerRequestStatus:
        input.targetStatus,
    },
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}
