import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
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
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {
  requireEnum,
  requireObject,
  requireString,
} from "../shared/validation.js";

const PROVIDER_SERVICE_TYPES = [
  "catering",
  "addon",
  "both",
] as const;

function buildSearchTokens(values: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
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
  {
    region: "asia-southeast1",
  },
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
      "providerServiceType",
      "providerCategory",
      "serviceAreas",
      "eventTypesSupported",
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

    const businessPhone = requireString(
      input.businessPhone,
      "businessPhone",
      {
        minLength: 7,
        maxLength: 30,
      },
    );

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
    const serviceAreas = optionalStringList(input.serviceAreas, "serviceAreas");
    const eventTypesSupported = optionalStringList(
      input.eventTypesSupported,
      "eventTypesSupported",
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
              description,
              location:
                `${city}, ${province}`,
              address,
              city,
              province,
              coverImageUrl: null,
              logoUrl: null,

              providerServiceType,
              providerCategory,
              searchTokens: buildSearchTokens([
                businessName,
                city,
                province,
                providerServiceType,
                providerCategory,
                ...serviceAreas,
                ...eventTypesSupported,
              ]),
              verificationStatus: "draft",

              eventTypesSupported,
              serviceAreas,

              acceptsMultipleEventsPerDay:
                false,
              maxEventsPerDay: 1,
              availableStaffCount: 0,
              availableEquipmentCount: 0,
              maxGuestsPerEvent: 0,

              minPrice: 0,
              maxPrice: 0,
              ratingAverage: 0,
              reviewCount: 0,
              totalCompletedBookings: 0,
              totalViews: 0,
              favoriteCount: 0,

              isActive: false,
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
              providerServiceType,

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

          writeAuditLogInTransaction(
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
