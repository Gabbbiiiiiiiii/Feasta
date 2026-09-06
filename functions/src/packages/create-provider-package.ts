import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  USER_ROLES,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";

import {
  assertPackageMatchesProviderCapabilities,
  authorizeProviderForPackageManagement,
  parsePackageInput,
} from "./package-domain.js";

const ALLOWED_FIELDS = [
  "name",
  "description",
  "eventType",
  "price",
  "downPaymentPercentage",
  "minimumGuests",
  "maximumGuests",
  "imageUrl",
  "foodInclusions",
  "decorInclusions",
  "furnitureInclusions",
  "serviceInclusions",
] as const;

export const createProviderPackage = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);

    await requireRole(
      actor.uid,
      [USER_ROLES.provider],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "packages.createProviderPackage",
        limit: 20,
        windowSeconds: 60 * 60,
      },
    );

    const input = requirePackageObject(
      request.data,
    );

    rejectUnknownFields(
      input,
      ALLOWED_FIELDS,
    );

    const validated =
      parsePackageInput(input);

    const userReference = db
      .collection("users")
      .doc(actor.uid);

    return db.runTransaction(
      async (transaction) => {
        const userSnapshot =
          await transaction.get(
            userReference,
          );

        if (!userSnapshot.exists) {
          throw new HttpsError(
            "permission-denied",
            "The provider account was not found.",
          );
        }

        const user =
          userSnapshot.data() ?? {};

        if (
          user.role !==
            USER_ROLES.provider ||
          typeof user.providerId !==
            "string" ||
          user.providerId.trim() === ""
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Provider business setup is incomplete.",
          );
        }

        const providerId =
          user.providerId.trim();

        const providerReference = db
          .collection("providers")
          .doc(providerId);

        const providerSnapshot =
          await transaction.get(
            providerReference,
          );

        const provider =
          authorizeProviderForPackageManagement(
            {
              actorUid: actor.uid,
              providerSnapshot,
            },
          );

        assertPackageMatchesProviderCapabilities(
          provider.providerData,
          validated,
        );

        const packageReference = db
          .collection("packages")
          .doc();

        transaction.create(
          packageReference,
          {
            providerId:
              provider.providerId,

            name: validated.name,
            description:
              validated.description,

            eventType:
              validated.eventType,

            price:
              validated.price,

            downPaymentPercentage:
              validated
                .downPaymentPercentage,

            minimumGuests:
              validated.minimumGuests,

            maximumGuests:
              validated.maximumGuests,

            imageUrl:
              validated.imageUrl,

            foodInclusions:
              validated.foodInclusions,

            decorInclusions:
              validated.decorInclusions,

            furnitureInclusions:
              validated
                .furnitureInclusions,

            serviceInclusions:
              validated
                .serviceInclusions,

            /*
             * Lifecycle is server-owned.
             *
             * Every newly-created package begins
             * as a non-public draft.
             */
            status: "draft",

            isActive: false,
            isPublished: false,
            providerPubliclyVisible: false,

            publishedAt: null,

            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            deletionReason: null,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),

            createdBy: actor.uid,
            updatedBy: actor.uid,
          },
        );

        return {
          success: true,
          packageId:
            packageReference.id,
          status: "draft" as const,
        };
      },
    );
  },
);

function requirePackageObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Package data is invalid.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function rejectUnknownFields(
  input: Readonly<
    Record<string, unknown>
  >,
  allowed:
    readonly string[],
): void {
  const unknownFields =
    Object.keys(input).filter(
      (key) =>
        !allowed.includes(key),
    );

  if (
    unknownFields.length === 0
  ) {
    return;
  }

  throw new HttpsError(
    "invalid-argument",
    `Unsupported package fields: ${unknownFields
      .sort()
      .join(", ")}.`,
  );
}