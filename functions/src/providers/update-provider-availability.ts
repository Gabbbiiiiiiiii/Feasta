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
  providerCapacityCapabilities,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  type ProviderServiceCategory,
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
  requireBoolean,
  requireNumber,
  requireObject,
  requireString,
} from "../shared/validation.js";

const MAX_UNAVAILABLE_DATES = 366;

type AvailabilityAction =
  | "mark_unavailable"
  | "mark_available";

const AVAILABILITY_SETTINGS_FIELDS = [
  "operatingDays",
  "bookingLeadTimeDays",
  "acceptsMultipleEventsPerDay",
  "maxEventsPerDay",
  "minGuestsPerEvent",
  "maxGuestsPerEvent",
  "availableStaffCount",
  "availableEquipmentCount",
] as const;

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

      const providerReference =
        await ownedProviderReference(
          actor.uid,
        );

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

export const updateProviderAvailabilitySettings =
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
            "providerAvailability.settings",
          limit: 15,
          windowSeconds: 10 * 60,
        },
      );

      const input = requireObject(
        request.data,
      );

      rejectUnknownFields(
        input,
        AVAILABILITY_SETTINGS_FIELDS,
      );

      const operatingDays =
        requireOperatingDays(
          input.operatingDays,
        );

      const bookingLeadTimeDays =
        requireInteger(
          input.bookingLeadTimeDays,
          "bookingLeadTimeDays",
          0,
          365,
        );

      const acceptsMultipleEventsPerDay =
        requireBoolean(
          input.acceptsMultipleEventsPerDay,
          "acceptsMultipleEventsPerDay",
        );

      const maxEventsPerDay =
        requireInteger(
          input.maxEventsPerDay,
          "maxEventsPerDay",
          1,
          100,
        );

      if (
        !acceptsMultipleEventsPerDay &&
        maxEventsPerDay !== 1
      ) {
        throw new HttpsError(
          "invalid-argument",
          "maxEventsPerDay must be 1 when multiple daily events are disabled.",
        );
      }

      const submittedCapacity = {
        minGuestsPerEvent:
          requireInteger(
            input.minGuestsPerEvent,
            "minGuestsPerEvent",
            0,
            100_000,
          ),
        maxGuestsPerEvent:
          requireInteger(
            input.maxGuestsPerEvent,
            "maxGuestsPerEvent",
            0,
            100_000,
          ),
        availableStaffCount:
          requireInteger(
            input.availableStaffCount,
            "availableStaffCount",
            0,
            100_000,
          ),
        availableEquipmentCount:
          requireInteger(
            input.availableEquipmentCount,
            "availableEquipmentCount",
            0,
            100_000,
          ),
      };
      const providerReference =
        await ownedProviderReference(
          actor.uid,
        );

      return db.runTransaction(
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

          const capabilities =
            providerCapacityCapabilities(
              providerServiceCategories(
                providerData,
              ),
            );
          const capacity =
            validateSubmittedCapacity(
              submittedCapacity,
              capabilities,
            );
          const settings = {
            operatingDays,
            bookingLeadTimeDays,
            acceptsMultipleEventsPerDay,
            maxEventsPerDay,
            ...capacity,
          };

          transaction.update(
            providerReference,
            {
              ...settings,
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
                "provider.availability_settings_updated",
              targetCollection:
                "providers",
              targetId:
                providerReference.id,
              before:
                availabilitySettingsSnapshot(
                  providerData,
                ),
              after: settings,
              metadata: {
                capacityCapabilities:
                  capabilities,
              },
            },
          );

          return {
            providerId:
              providerReference.id,
            settings,
            capacityCapabilities:
              capabilities,
          };
        },
      );
    },
  );

async function ownedProviderReference(
  actorUid: string,
) {
  const providerQuery = await db
    .collection("providers")
    .where("ownerId", "==", actorUid)
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

  return providerQuery.docs[0].ref;
}

function validateSubmittedCapacity(
  capacity: {
    minGuestsPerEvent: number;
    maxGuestsPerEvent: number;
    availableStaffCount: number;
    availableEquipmentCount: number;
  },
  capabilities: {
    requiresGuestCapacity: boolean;
    usesStaffCapacity: boolean;
    usesEquipmentCapacity: boolean;
  },
) {
  if (capabilities.requiresGuestCapacity) {
    if (
      capacity.minGuestsPerEvent < 1 ||
      capacity.maxGuestsPerEvent <
        capacity.minGuestsPerEvent
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The guest capacity range is invalid.",
      );
    }
  } else if (
    capacity.minGuestsPerEvent !== 0 ||
    capacity.maxGuestsPerEvent !== 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Guest capacity does not apply to this provider's services.",
    );
  }

  if (
    !capabilities.usesStaffCapacity &&
    capacity.availableStaffCount !== 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Staff capacity does not apply to this provider's services.",
    );
  }

  if (
    !capabilities.usesEquipmentCapacity &&
    capacity.availableEquipmentCount !== 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Equipment capacity does not apply to this provider's services.",
    );
  }

  return capacity;
}

function providerServiceCategories(
  provider:
    Readonly<Record<string, unknown>>,
): ProviderServiceCategory[] {
  const values =
    Array.isArray(
      provider.serviceCategories,
    )
      ? provider.serviceCategories
      : [provider.providerCategory];

  return [
    ...new Set(
      values.filter(
        (
          value,
        ): value is ProviderServiceCategory =>
          typeof value === "string" &&
          PROVIDER_SERVICE_CATEGORIES
            .includes(
              value as
                ProviderServiceCategory,
            ),
      ),
    ),
  ];
}

function availabilitySettingsSnapshot(
  provider:
    Readonly<Record<string, unknown>>,
) {
  return Object.fromEntries(
    AVAILABILITY_SETTINGS_FIELDS.map(
      (field) => [
        field,
        provider[field] ?? null,
      ],
    ),
  );
}

function requireOperatingDays(
  value: unknown,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "operatingDays must contain at least one day.",
    );
  }

  const days = [
    ...new Set(
      value.map((day) => {
        if (
          typeof day !== "string" ||
          !PROVIDER_OPERATING_DAYS
            .includes(
              day as
                (typeof PROVIDER_OPERATING_DAYS)[number],
            )
        ) {
          throw new HttpsError(
            "invalid-argument",
            "operatingDays contains an invalid day.",
          );
        }

        return day;
      }),
    ),
  ];

  return PROVIDER_OPERATING_DAYS
    .filter((day) =>
      days.includes(day)
    );
}

function requireInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const number = requireNumber(
    value,
    field,
    {
      min: minimum,
      max: maximum,
    },
  );

  if (!Number.isSafeInteger(number)) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be an integer.`,
    );
  }

  return number;
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(input)
    .filter((field) =>
      !allowed.includes(field)
    );

  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      "The availability settings contain unsupported fields.",
    );
  }
}

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
