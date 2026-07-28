import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  PROVIDER_EVENT_TYPES,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  USER_ROLES,
  serviceCategoryMatchesProviderType,
  type ProviderServiceCategory,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  createIdempotencyKey,
  failIdempotentOperation,
} from "../shared/idempotency.js";
import {
  logError,
  logInfo,
} from "../shared/logger.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {
  requireEnum,
  requireObject,
  requireString,
} from "../shared/validation.js";
import {writeVerificationHistoryInTransaction} from "../shared/verification-history.js";
function buildSearchTokens(values: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    const normalizedPhrase = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .replace(/\s+/gu, " ");
    for (
      let length = 2;
      length <= Math.min(normalizedPhrase.length, 80);
      length++
    ) {
      tokens.add(normalizedPhrase.slice(0, length));
    }
    for (const word of value.toLowerCase().split(/[^a-z0-9]+/u)) {
      if (!word) continue;
      tokens.add(word);
      for (let length = 2; length <= Math.min(word.length, 20); length++) {
        tokens.add(word.slice(0, length));
      }
    }
  }
  return [...tokens].slice(0, 200);
}

export const registerProvider = onCall(
  appCheckCallableOptions,
  async (request) => {
    const authenticatedUser = requireAuth(request);

    await enforceCallableRateLimit(request, {
      scope: "registerProvider",
      limit: 5,
      windowSeconds: 15 * 60,
    });

    try {
      // requireRole also enforces that users/{uid} exists and is active.
      await requireRole(authenticatedUser.uid, [USER_ROLES.provider]);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "The provider account could not be verified.",
      );
    }

    const input = requireObject(request.data);
    rejectUnknownFields(input, [
      "businessName",
      "businessEmail",
      "businessPhone",
      "ownerFirstName",
      "ownerLastName",
      "description",
      "address",
      "city",
      "province",
      "locationCoordinates",
      "providerServiceType",
      "providerCategory",
      "serviceCategories",
      "serviceAreas",
      "maxServiceDistanceKm",
      "eventTypesSupported",
      "minGuestsPerEvent",
      "maxGuestsPerEvent",
      "guestCapacity",
      "acceptsMultipleEventsPerDay",
      "maxEventsPerDay",
      "availableStaffCount",
      "availableEquipmentCount",
      "operatingDays",
      "bookingLeadTimeDays",
      "unavailableDates",
      "logoStoragePath",
      "coverStoragePath",
      "idempotencyKey",
    ]);

    const businessName = requireString(
      input.businessName,
      "businessName",
      {
        minLength: 2,
        maxLength: 120,
      },
    );

    const businessEmail = requireString(
      input.businessEmail,
      "businessEmail",
      {
        minLength: 3,
        maxLength: 160,
      },
    )
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
      throw new HttpsError(
        "invalid-argument",
        "businessEmail must be a valid email address.",
      );
    }

    const businessPhone = normalizePhilippinePhone(requireString(
      input.businessPhone,
      "businessPhone",
      {
        minLength: 7,
        maxLength: 30,
      },
    ), "businessPhone");

    const ownerFirstName = requireString(
      input.ownerFirstName,
      "ownerFirstName",
      {
        minLength: 1,
        maxLength: 80,
      },
    );

    const ownerLastName = requireString(
      input.ownerLastName,
      "ownerLastName",
      {
        minLength: 1,
        maxLength: 80,
      },
    );

    const description = requireString(
      input.description,
      "description",
      {
        minLength: 20,
        maxLength: 2000,
      },
    );

    const address = requireString(
      input.address,
      "address",
      {
        minLength: 3,
        maxLength: 250,
      },
    );

    const city = requireString(
      input.city,
      "city",
      {
        minLength: 2,
        maxLength: 100,
      },
    );

    const province = requireString(
      input.province,
      "province",
      {
        minLength: 2,
        maxLength: 100,
      },
    );

    const providerServiceType = requireEnum(
      input.providerServiceType,
      "providerServiceType",
      PROVIDER_SERVICE_TYPES,
    );
    const providerCategory = requireString(
      input.providerCategory,
      "providerCategory",
      {minLength: 2, maxLength: 100},
    );
    const serviceCategories = optionalEnumList(
      input.serviceCategories,
      "serviceCategories",
      PROVIDER_SERVICE_CATEGORIES,
    );
    if (
      serviceCategories.some((category) =>
        !serviceCategoryMatchesProviderType(
          category as ProviderServiceCategory,
          providerServiceType,
        )
      ) ||
      (serviceCategories.length > 0 &&
        serviceCategories[0] !== providerCategory)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Service categories must match the provider service type and primary category.",
      );
    }
    const serviceAreas = optionalStringList(input.serviceAreas, "serviceAreas");
    const eventTypesSupported = input.serviceCategories === undefined
      ? optionalStringList(input.eventTypesSupported, "eventTypesSupported")
      : optionalEnumList(
          input.eventTypesSupported,
          "eventTypesSupported",
          PROVIDER_EVENT_TYPES,
        );
    const maxServiceDistanceKm = optionalNumber(
      input.maxServiceDistanceKm,
      "maxServiceDistanceKm",
      {minimum: 1, maximum: 1000},
    );
    const locationCoordinates = optionalCoordinates(
      input.locationCoordinates,
    );
    const maxGuestsPerEvent = compatibleGuestCapacity(input);
    const minGuestsPerEvent = optionalInteger(
      input.minGuestsPerEvent,
      "minGuestsPerEvent",
      {minimum: 0, maximum: 100000, fallback: 0},
    );
    if (
      maxGuestsPerEvent > 0 &&
      minGuestsPerEvent > maxGuestsPerEvent
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Minimum guests cannot exceed maximum guests.",
      );
    }
    const acceptsMultipleEventsPerDay = optionalBoolean(
      input.acceptsMultipleEventsPerDay,
      "acceptsMultipleEventsPerDay",
      false,
    );
    const maxEventsPerDay = optionalInteger(
      input.maxEventsPerDay,
      "maxEventsPerDay",
      {minimum: 1, maximum: 100, fallback: 1},
    );
    if (!acceptsMultipleEventsPerDay && maxEventsPerDay !== 1) {
      throw new HttpsError(
        "invalid-argument",
        "maxEventsPerDay must be 1 when multiple daily events are disabled.",
      );
    }
    const availableStaffCount = optionalInteger(
      input.availableStaffCount,
      "availableStaffCount",
      {minimum: 0, maximum: 100000, fallback: 0},
    );
    const availableEquipmentCount = optionalInteger(
      input.availableEquipmentCount,
      "availableEquipmentCount",
      {minimum: 0, maximum: 100000, fallback: 0},
    );
    const operatingDays = optionalEnumList(
      input.operatingDays,
      "operatingDays",
      PROVIDER_OPERATING_DAYS,
    );
    const bookingLeadTimeDays = optionalInteger(
      input.bookingLeadTimeDays,
      "bookingLeadTimeDays",
      {minimum: 0, maximum: 365, fallback: 0},
    );
    const unavailableDates = optionalIsoDateList(input.unavailableDates);
    const logoStoragePath = optionalProviderMediaPath(
      input.logoStoragePath,
      authenticatedUser.uid,
      "logo",
    );
    const coverStoragePath = optionalProviderMediaPath(
      input.coverStoragePath,
      authenticatedUser.uid,
      "cover",
    );

    const idempotencyKey = createIdempotencyKey({
      operation: "registerProvider",
      actorId: authenticatedUser.uid,
      clientKey: input.idempotencyKey,
      payload: input,
    });
    const idempotency = await beginIdempotentOperation({
      key: idempotencyKey,
      operation: "registerProvider",
      actorId: authenticatedUser.uid,
    });
    if (idempotency.state === "completed") {
      return {...idempotency.result, idempotentReplay: true};
    }

    const userReference = db
      .collection("users")
      .doc(authenticatedUser.uid);

    /*
     * Use deterministic IDs for new registrations.
     * This prevents concurrent calls from creating multiple provider
     * profiles for the same authenticated user.
     */
    const newProviderReference = db
      .collection("providers")
      .doc(authenticatedUser.uid);

    const newVerificationReference = db
      .collection("providerVerifications")
      .doc(authenticatedUser.uid);
    const onboardingDraftReference = db
      .collection("providerOnboardingDrafts")
      .doc(authenticatedUser.uid);

    const existingProviderQuery = db
      .collection("providers")
      .where(
        "ownerId",
        "==",
        authenticatedUser.uid,
      )
      .limit(1);

    const existingBusinessEmailQuery = db
      .collection("providers")
      .where("businessEmail", "==", businessEmail)
      .limit(1);

    try {
      const result = await db.runTransaction(
        async (transaction) => {
          const userSnapshot =
            await transaction.get(userReference);

          const userData = userSnapshot.data();

          if (!userSnapshot.exists) {
            throw new HttpsError(
              "failed-precondition",
              "Create the provider account identity before registering.",
            );
          }

          if (userData?.role !== USER_ROLES.provider) {
            throw new HttpsError(
              "permission-denied",
              "Only provider accounts can create provider profiles.",
            );
          }

          const accountStatus =
            typeof userData?.accountStatus === "string"
              ? userData.accountStatus
              : "";

          if (
            accountStatus !== "active" ||
            userData?.isActive === false ||
            userData?.isBlocked === true
          ) {
            throw new HttpsError(
              "permission-denied",
              "Your account is not active.",
            );
          }

          /*
           * First trust an existing users/{uid}.providerId link.
           */
          const linkedProviderId =
            typeof userData?.providerId === "string"
              ? userData.providerId.trim()
              : "";

          if (linkedProviderId.length > 0) {
            const linkedProviderReference = db
              .collection("providers")
              .doc(linkedProviderId);

            const linkedProviderSnapshot =
              await transaction.get(
                linkedProviderReference,
              );

            if (!linkedProviderSnapshot.exists) {
              throw new HttpsError(
                "failed-precondition",
                "Your account contains an invalid provider profile link.",
              );
            }

            const linkedProviderData =
              linkedProviderSnapshot.data();

            if (
              linkedProviderData?.ownerId !==
              authenticatedUser.uid
            ) {
              throw new HttpsError(
                "permission-denied",
                "The linked provider profile does not belong to your account.",
              );
            }

            const linkedVerification = await transaction.get(
              db.collection("providerVerifications")
                .where("providerId", "==", linkedProviderId)
                .limit(1),
            );

            if (linkedVerification.empty) {
              throw new HttpsError(
                "failed-precondition",
                "The linked provider registration is incomplete.",
              );
            }

            return {
              providerId: linkedProviderId,
              verificationId: linkedVerification.docs[0].id,
              created: false,
            };
          }

          /*
           * Support provider profiles created before deterministic IDs
           * were introduced.
           */
          const existingProviders =
            await transaction.get(
              existingProviderQuery,
            );

          const matchingBusinessEmails = await transaction.get(
            existingBusinessEmailQuery,
          );

          if (
            !matchingBusinessEmails.empty &&
            matchingBusinessEmails.docs[0].data().ownerId !== authenticatedUser.uid
          ) {
            throw new HttpsError(
              "already-exists",
              "A provider profile already uses this business email.",
            );
          }

          if (!existingProviders.empty) {
            const existingProvider =
              existingProviders.docs[0];

            const existingVerification = await transaction.get(
              db.collection("providerVerifications")
                .where("providerId", "==", existingProvider.id)
                .limit(1),
            );

            if (existingVerification.empty) {
              throw new HttpsError(
                "failed-precondition",
                "The existing provider registration is incomplete.",
              );
            }

            transaction.update(
              userReference,
              {
                providerId:
                  existingProvider.id,
                updatedAt:
                  serverTimestamp(),
              },
            );

            return {
              providerId:
                existingProvider.id,
              verificationId: existingVerification.docs[0].id,
              created: false,
            };
          }

          const deterministicProviderSnapshot =
            await transaction.get(
              newProviderReference,
            );

          if (
            deterministicProviderSnapshot.exists
          ) {
            const existingData =
              deterministicProviderSnapshot.data();

            if (
              existingData?.ownerId !==
              authenticatedUser.uid
            ) {
              throw new HttpsError(
                "already-exists",
                "The generated provider identifier is already in use.",
              );
            }

            const deterministicVerificationSnapshot = await transaction.get(
              newVerificationReference,
            );

            if (
              !deterministicVerificationSnapshot.exists ||
              deterministicVerificationSnapshot.data()?.providerId !==
                newProviderReference.id ||
              deterministicVerificationSnapshot.data()?.ownerId !==
                authenticatedUser.uid
            ) {
              throw new HttpsError(
                "failed-precondition",
                "The existing provider registration is incomplete or invalid.",
              );
            }

            transaction.update(
              userReference,
              {
                providerId:
                  newProviderReference.id,
                updatedAt:
                  serverTimestamp(),
              },
            );

            return {
              providerId:
                newProviderReference.id,
              verificationId: newVerificationReference.id,
              created: false,
            };
          }

          transaction.create(
            newProviderReference,
            {
              ownerId:
                authenticatedUser.uid,
              businessName,
              businessEmail,
              businessPhone,
              ownerFirstName,
              ownerLastName,
              ownerEmail:
                typeof userData?.email === "string"
                  ? userData.email.trim().toLowerCase()
                  : null,
              ownerPhone:
                typeof userData?.phoneNumber === "string"
                  ? userData.phoneNumber.trim()
                  : null,
              description,
              location:
                `${city}, ${province}`,
              address,
              city,
              province,
              locationCoordinates,
              coverImageUrl: null,
              logoUrl: null,
              coverStoragePath,
              logoStoragePath,

              providerServiceType,
              providerCategory,
              serviceCategories,
              searchTokens: buildSearchTokens([
                businessName,
                city,
                province,
                providerServiceType,
                providerCategory,
                ...serviceCategories,
                ...serviceAreas,
                ...eventTypesSupported,
              ]),
              verificationStatus: "draft",

              eventTypesSupported,
              serviceAreas,
              maxServiceDistanceKm,

              acceptsMultipleEventsPerDay:
                acceptsMultipleEventsPerDay,
              maxEventsPerDay,
              availableStaffCount,
              availableEquipmentCount,
              operatingDays,
              bookingLeadTimeDays,
              unavailableDates,
              minGuestsPerEvent,
              maxGuestsPerEvent,

              minPrice: 0,
              maxPrice: 0,
              ratingAverage: 0,
              reviewCount: 0,
              totalCompletedBookings: 0,
              totalViews: 0,
              favoriteCount: 0,

              isActive: false,
              publiclyVisible: false,
              isFeatured: false,
              isSuspended: false,
              isDeleted: false,
              deletedAt: null,
              deletedBy: null,
              deletionReason: null,

              createdAt:
                serverTimestamp(),
              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.create(
            newVerificationReference,
            {
              providerId:
                newProviderReference.id,
              ownerId:
                authenticatedUser.uid,
              businessName,
              businessEmail,
              providerServiceType,
              ownerFirstName,
              ownerLastName,
              ownerName: `${ownerFirstName} ${ownerLastName}`.trim(),
              ownerEmail:
                typeof userData?.email === "string"
                  ? userData.email.trim().toLowerCase()
                  : null,
              searchTokens: buildSearchTokens([
                newProviderReference.id,
                businessName,
                businessEmail,
                businessPhone,
                ownerFirstName,
                ownerLastName,
                `${ownerFirstName} ${ownerLastName}`,
                typeof userData?.email === "string" ? userData.email : "",
                typeof userData?.phoneNumber === "string" ?
                  userData.phoneNumber : "",
                providerServiceType,
                providerCategory,
              ]),
              termsPolicyVersion:
                typeof userData?.termsPolicyVersion === "string"
                  ? userData.termsPolicyVersion
                  : "unversioned",
              privacyPolicyVersion:
                typeof userData?.privacyPolicyVersion === "string"
                  ? userData.privacyPolicyVersion
                  : "unversioned",
              termsAcceptedAt: userData?.termsAcceptedAt ?? null,
              privacyAcceptedAt: userData?.privacyAcceptedAt ?? null,

              status: "draft",
              remarks: null,
              rejectionReason: null,
              resubmissionReason: null,
              suspensionReason: null,

              submittedAt: null,
              reviewedAt: null,
              reviewedBy: null,
              approvedAt: null,
              rejectedAt: null,
              suspendedAt: null,

              createdAt:
                serverTimestamp(),
              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.update(
            userReference,
            {
              providerId:
                newProviderReference.id,
              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.delete(onboardingDraftReference);

          const auditLogReference = writeAuditLogInTransaction(
            transaction,
            {
              actorId:
                authenticatedUser.uid,
              actorRole:
                USER_ROLES.provider,
              action:
                "provider_registration_created",
              targetCollection:
                "providers",
              targetId:
                newProviderReference.id,
              source:
                "cloud_function",
              before: null,
              after: {
                verificationStatus:
                  "draft",
                isActive: false,
              },
              metadata: {
                verificationId:
                  newVerificationReference.id,
                providerServiceType,
              },
            },
          );
          writeVerificationHistoryInTransaction(transaction, {
            verificationId: newVerificationReference.id,
            providerId: newProviderReference.id,
            actorId: authenticatedUser.uid,
            actorRole: USER_ROLES.provider,
            eventType: "verification_draft_created",
            fromStatus: null,
            toStatus: "draft",
            auditLogId: auditLogReference.id,
          });

          return {
            providerId:
              newProviderReference.id,
            verificationId:
              newVerificationReference.id,
            created: true,
          };
        },
      );

      logInfo(
        "Provider registration processed",
        {
          uid:
            authenticatedUser.uid,
          providerId:
            result.providerId,
          created:
            result.created,
        },
      );

      const response = {
        success: true,
        ...result,
      };
      await completeIdempotentOperation({
        key: idempotencyKey,
        operation: "registerProvider",
        actorId: authenticatedUser.uid,
        result: response,
      });
      return {...response, idempotentReplay: false};
    } catch (error) {
      await failIdempotentOperation({
        key: idempotencyKey,
        errorCode: error instanceof HttpsError ? error.code : "internal",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => undefined);
      logError(
        "Provider registration failed",
        error,
        {
          uid:
            authenticatedUser.uid,
          businessName,
        },
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Provider registration could not be completed.",
      );
    }
  },
);

function optionalStringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpsError("invalid-argument", `${field} must be a list.`);
  }

  const normalized = value.map((item, index) => requireString(
    item,
    `${field}[${index}]`,
    {minLength: 1, maxLength: 100},
  ));

  return [...new Set(normalized)];
}

function optionalEnumList<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T[] {
  const values = optionalStringList(value, field);
  if (values.some((item) => !allowed.includes(item as T))) {
    throw new HttpsError(
      "invalid-argument",
      `${field} contains an unsupported value.`,
    );
  }
  return values as T[];
}

function optionalNumber(
  value: unknown,
  field: string,
  options: {minimum: number; maximum: number},
): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < options.minimum ||
    value > options.maximum
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be between ${options.minimum} and ${options.maximum}.`,
    );
  }
  return value;
}

function optionalIsoDateList(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 366) {
    throw new HttpsError(
      "invalid-argument",
      "unavailableDates must be a list of at most 366 dates.",
    );
  }
  const dates = value.map((item, index) => requireString(
    item,
    `unavailableDates[${index}]`,
    {minLength: 10, maxLength: 10},
  ));
  if (dates.some((date) =>
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  )) {
    throw new HttpsError(
      "invalid-argument",
      "unavailableDates must use YYYY-MM-DD.",
    );
  }
  return [...new Set(dates)].sort();
}

function optionalCoordinates(
  value: unknown,
): {latitude: number; longitude: number} | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      "locationCoordinates must contain latitude and longitude.",
    );
  }
  const coordinates = value as Record<string, unknown>;
  const unknownFields = Object.keys(coordinates)
    .filter((field) => !["latitude", "longitude"].includes(field));
  const latitude = coordinates.latitude;
  const longitude = coordinates.longitude;
  if (
    unknownFields.length > 0 ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new HttpsError(
      "invalid-argument",
      "locationCoordinates are invalid.",
    );
  }
  return {latitude, longitude};
}

function compatibleGuestCapacity(
  input: Record<string, unknown>,
): number {
  const canonical = input.maxGuestsPerEvent;
  const legacy = input.guestCapacity;
  if (
    canonical !== undefined &&
    legacy !== undefined &&
    canonical !== legacy
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Guest capacity fields do not match.",
    );
  }
  return optionalInteger(
    canonical ?? legacy,
    "maxGuestsPerEvent",
    {minimum: 0, maximum: 100000, fallback: 0},
  );
}

function optionalInteger(
  value: unknown,
  field: string,
  options: {
    minimum: number;
    maximum: number;
    fallback: number;
  },
): number {
  if (value === undefined) return options.fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < options.minimum ||
    value > options.maximum
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be an integer between ${options.minimum} and ` +
        `${options.maximum}.`,
    );
  }
  return value;
}

function optionalBoolean(
  value: unknown,
  field: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be a boolean.`,
    );
  }
  return value;
}

function normalizePhilippinePhone(value: string, field: string): string {
  const compact = value.replace(/[\s().-]/gu, "");
  const normalized = compact.startsWith("+63")
    ? compact
    : compact.startsWith("63")
      ? `+${compact}`
      : compact.startsWith("0")
        ? `+63${compact.slice(1)}`
        : "";
  if (!/^\+63\d{8,10}$/u.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be a valid Philippine phone number.`,
    );
  }
  return normalized;
}

function optionalProviderMediaPath(
  value: unknown,
  ownerId: string,
  mediaType: "logo" | "cover",
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      `${mediaType}StoragePath is invalid.`,
    );
  }
  const prefix = `providers/${ownerId}/${mediaType}/`;
  const fileName = value.startsWith(prefix)
    ? value.slice(prefix.length)
    : "";
  if (
    fileName.length === 0 ||
    fileName.includes("/") ||
    !/\.(?:jpe?g|png|webp)$/iu.test(fileName)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${mediaType}StoragePath is invalid.`,
    );
  }
  return value;
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const unknownFields = Object.keys(input)
    .filter((field) => !allowedFields.includes(field));

  if (unknownFields.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unknown registration fields: ${unknownFields.join(", ")}.`,
    );
  }
}
