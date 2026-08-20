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
  isApprovedProviderForOperations,
  USER_ROLES,
} from "../shared/constants.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  db,
} from "../shared/firestore.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  requireObject,
  requireString,
} from "../shared/validation.js";

const MAX_UNAVAILABLE_DATES = 366;

type AvailabilityAction =
  | "mark_unavailable"
  | "mark_available";

export const updateProviderAvailability =
  onCall(
    {
      ...appCheckCallableOptions,
      timeoutSeconds: 30,
    },
    async (request) => {
      const actor = requireAuth(request);

      await requireRole(actor.uid, [
        USER_ROLES.provider,
      ]);

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "providerAvailability.update",
          limit: 30,
          windowSeconds: 10 * 60,
        },
      );

      const input = requireObject(
        request.data,
      );

      const date = requireString(
        input.date,
        "date",
        {
          minLength: 10,
          maxLength: 10,
        },
      );

      const action = requireString(
        input.action,
        "action",
        {
          minLength: 1,
          maxLength: 32,
        },
      );

      if (!isIsoDate(date)) {
        throw new HttpsError(
          "invalid-argument",
          "The availability date must use YYYY-MM-DD.",
        );
      }

      if (!isAvailabilityAction(action)) {
        throw new HttpsError(
          "invalid-argument",
          "The availability action is invalid.",
        );
      }

      const providerQuery = await db
        .collection("providers")
        .where("ownerId", "==", actor.uid)
        .limit(2)
        .get();

      if (providerQuery.empty) {
        throw new HttpsError(
          "not-found",
          "Your provider account was not found.",
        );
      }

      if (providerQuery.size !== 1) {
        throw new HttpsError(
          "failed-precondition",
          "Your provider account linkage is invalid.",
        );
      }

      const providerReference =
        providerQuery.docs[0].ref;

      const result = await db.runTransaction(
        async (transaction) => {
          const providerSnapshot =
            await transaction.get(
              providerReference,
            );

          if (!providerSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "Your provider account was not found.",
            );
          }

          const providerData =
            providerSnapshot.data() ?? {};

          if (
            providerData.ownerId !==
            actor.uid
          ) {
            throw new HttpsError(
              "permission-denied",
              "You do not own this provider account.",
            );
          }

          if (
            !isApprovedProviderForOperations(
              providerData,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Your provider account is not available for operations.",
            );
          }

          const currentDates =
            normalizeUnavailableDates(
              providerData.unavailableDates,
            );

          const nextDates =
            new Set(currentDates);

          if (
            action ===
            "mark_unavailable"
          ) {
            nextDates.add(date);
          } else {
            nextDates.delete(date);
          }

          const unavailableDates =
            [...nextDates].sort();

          if (
            unavailableDates.length >
            MAX_UNAVAILABLE_DATES
          ) {
            throw new HttpsError(
              "failed-precondition",
              "You can manage at most 366 unavailable dates.",
            );
          }

          transaction.update(
            providerReference,
            {
              unavailableDates,
              updatedAt:
                serverTimestamp(),
            },
          );

          writeAuditLogInTransaction(
            transaction,
            {
                actorId: actor.uid,
                actorRole: "provider",

                action:
                "provider.availability_updated",

                targetCollection:
                "providers",

                targetId:
                providerReference.id,

                before: {
                unavailableDates:
                    currentDates,
                },

                after: {
                unavailableDates,
                },

                metadata: {
                date,
                availabilityAction:
                    action,
                },
            },
            );

          return {
            providerId:
              providerReference.id,
            date,
            action,
            unavailableDates,
          };
        },
      );

      return result;
    },
  );

function isAvailabilityAction(
  value: string,
): value is AvailabilityAction {
  return (
    value === "mark_unavailable" ||
    value === "mark_available"
  );
}

function normalizeUnavailableDates(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = new Set<string>();

  for (const item of value) {
    if (
      typeof item === "string" &&
      isIsoDate(item)
    ) {
      result.add(item);
    }
  }

  return [...result].sort();
}

function isIsoDate(
  value: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
    ),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() === day
  );
}