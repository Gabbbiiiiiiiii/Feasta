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
  USER_ROLES,
} from "../shared/constants.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  isServiceCategoryCode,
  type ServiceCategoryCode,
} from "../shared/service-category-code.js";
import {Timestamp} from "firebase-admin/firestore";
import {
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  manilaDateFromKey,
  manilaDateKey,
  manilaDateRange,
  providerRequestOccupiesAvailability,
} from "../provider-availability/validate-provider-availability.js";

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

import {projectPublicOccasionV2} from "../packages/provider-package-v2-public-occasion-contract.js";
import {isGloballyEligibleOccasion} from "../packages/global-occasion-eligibility.js";
import {loadOccasionCatalogReadPolicy} from "../packages/provider-package-v2-policy-read.js";

const MAX_UNAVAILABLE_DATES = 366;

type AvailabilityAction =
  | "mark_unavailable"
  | "mark_available";

const AVAILABILITY_SETTINGS_FIELDS = [
  "supportedOccasionIds",
  "expectedSettingsRevision",
  "occasionCatalogRevision",
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
      maxInstances: 20, memory: "256MiB", concurrency: 80,
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

      const parsedDate = manilaDateFromKey(date);
      const dateRange = parsedDate ? manilaDateRange(parsedDate) : null;

      if (!dateRange) {
        throw new HttpsError(
          "invalid-argument",
          "The selected calendar date is invalid.",
        );
      }

      if (date < manilaDateKey(new Date())) {
        throw new HttpsError(
          "failed-precondition",
          "Past calendar dates cannot be changed.",
        );
      }

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

          if (action === "mark_unavailable") {
            const activeRequests = await transaction.get(
              db.collection("providerRequests")
                .where("providerId", "==", providerReference.id)
                .where(
                  "eventDate",
                  ">=",
                  Timestamp.fromDate(dateRange.start),
                )
                .where(
                  "eventDate",
                  "<",
                  Timestamp.fromDate(dateRange.end),
                )
                .where(
                  "status",
                  "in",
                  [...AVAILABILITY_COUNTED_REQUEST_STATUSES],
                ),
            );

            const now = new Date();

            const hasExistingReservation = activeRequests.docs.some(
              (document) => {
                const booking = document.data();

                return providerRequestOccupiesAvailability({
                  ...booking,
                  status: booking.status,
                  acceptedAt: booking.acceptedAt,
                  expiresAt: booking.expiresAt,
                  now,
                });
              },
            );

            if (hasExistingReservation) {
              throw new HttpsError(
                "failed-precondition",
                "This date already has a FEASTA reservation and cannot be manually blocked.",
              );
            }
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

      const expectedSettingsRevision = requireInteger(
        input.expectedSettingsRevision, "expectedSettingsRevision", 0, Number.MAX_SAFE_INTEGER - 1,
      );
      // Schedule-only changes remain available if the catalog cannot be loaded.
      // Omitting this field preserves the existing event preferences.
      const selectedIds = input.supportedOccasionIds === undefined ? undefined :
        requireSupportedOccasionIds(input.supportedOccasionIds);
      const occasionCatalogRevision = selectedIds === undefined ? undefined : requireInteger(
        input.occasionCatalogRevision, "occasionCatalogRevision", 1, Number.MAX_SAFE_INTEGER,
      );
      if (selectedIds !== undefined) await loadOccasionCatalogReadPolicy();

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
        acceptsMultipleEventsPerDay ||
        maxEventsPerDay !== 1
      ) {
        throw new HttpsError(
          "invalid-argument",
          "FEASTA currently permits only one event per provider per day.",
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

          if ((providerData.availabilitySettingsRevision ?? 0) !== expectedSettingsRevision) {
            throw new HttpsError("aborted",
              "Availability settings changed. Reload before saving; " +
              "your edits have not been saved.");
          }
          if (providerData.isBlocked === true) {
            throw new HttpsError("failed-precondition",
              "Your provider account is not available for operations.");
          }
          if (selectedIds !== undefined) {
            const catalog = await readAvailabilityOccasions(transaction, providerData);
            if (catalog.revision !== occasionCatalogRevision) {
              throw new HttpsError("aborted",
                "Event types changed. Reload and review your selections before saving.");
            }
            if (selectedIds.some(id => !catalog.items.some(item => item.id === id))) {
              throw new HttpsError("invalid-argument",
                "Select only currently approved event types available to your services.");
            }
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
            // Provider acceptance preferences do not grant package eligibility.
            // Legacy eventTypesSupported and eligibility authorities stay protected.
            ...(selectedIds === undefined ? {} : {supportedOccasionIds: selectedIds}),
            availabilitySettingsRevision: expectedSettingsRevision + 1,
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
            settings: {
              ...settings,
              supportedOccasionIds: selectedIds ?? providerData.supportedOccasionIds ?? [],
            },
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
): ServiceCategoryCode[] {
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
        ): value is ServiceCategoryCode =>
          isServiceCategoryCode(value),
      ),
    ),
  ];
}

function availabilitySettingsSnapshot(
  provider:
    Readonly<Record<string, unknown>>,
) {
  return Object.fromEntries(
    AVAILABILITY_SETTINGS_FIELDS.filter(field =>
      field !== "expectedSettingsRevision" && field !== "occasionCatalogRevision"
    ).map(
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

function requireSupportedOccasionIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 200 ||
      value.some(id => typeof id !== "string" || !/^[a-z][a-z0-9_]{1,63}$/u.test(id)) ||
      new Set(value).size !== value.length) {
    throw new HttpsError("invalid-argument",
      "Supported event types must contain unique valid occasion IDs.");
  }
  return [...value].sort();
}

async function readAvailabilityOccasions(
  transaction: FirebaseFirestore.Transaction,
  provider: FirebaseFirestore.DocumentData,
) {
  const catalog = (await transaction.get(db.collection("occasionCatalog").doc("current"))).data();
  if (!catalog || catalog.activationState !== "stable" ||
      !Number.isSafeInteger(catalog.revision) || catalog.revision < 1) {
    throw new HttpsError("failed-precondition",
      "The event type catalog is temporarily unavailable.");
  }
  const categories: string[] = [];
  for (const code of providerServiceCategories(provider)) {
    const category = (await transaction.get(db.collection("serviceCategories").doc(code))).data();
    if (category?.code === code && category.status === "active" &&
        ["catering", "addon"].includes(category.serviceType)) categories.push(code);
  }
  const occasions = await transaction.get(
    db.collection("occasions").where("active", "==", true).limit(201),
  );
  if (occasions.size > 200) {
    throw new HttpsError("failed-precondition", "The event type catalog requires reconciliation.");
  }
  const items = occasions.docs.flatMap(document => {
    const occasion = document.data();
    if (!categories.some(serviceCategoryCode => isGloballyEligibleOccasion({
          occasion, provider, serviceCategoryCode, occasionId: document.id,
        }))) return [];
    return [projectPublicOccasionV2(document.id, occasion)];
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return {revision: catalog.revision as number, items};
}

export const getProviderAvailabilityOccasions = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 30},
  async request => {
    const actor = requireAuth(request);
    rejectUnknownFields(requireObject(request.data), []);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "providerAvailability.occasions", limit: 60, windowSeconds: 3600,
    });
    await loadOccasionCatalogReadPolicy();
    const reference = await ownedProviderReference(actor.uid);
    return db.runTransaction(async transaction => {
      const provider = (await transaction.get(reference)).data();
      if (!provider || provider.ownerId !== actor.uid) {
        throw new HttpsError("permission-denied", "You do not own this provider account.");
      }
      if (!isApprovedProviderForOperations(provider) || provider.isBlocked === true) {
        throw new HttpsError("failed-precondition",
          "Your provider account is not available for operations.");
      }
      return readAvailabilityOccasions(transaction, provider);
    });
  },
);
