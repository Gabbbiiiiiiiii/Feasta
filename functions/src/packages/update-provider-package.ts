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
  assertDraftPackage,
  assertPackageMatchesProviderCapabilities,
  authorizeOwnedPackage,
  authorizeProviderForPackageManagement,
  parsePackageInput,
} from "./package-domain.js";

const ALLOWED_FIELDS = [
  "packageId",
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

export const updateProviderPackage = onCall(
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
          "packages.updateProviderPackage",
        limit: 60,
        windowSeconds: 60 * 60,
      },
    );

    const input = requireObject(
      request.data,
    );

    rejectUnknownFields(
      input,
      ALLOWED_FIELDS,
    );

    const packageId = requireDocumentId(
      input.packageId,
      "packageId",
    );

    const validated = parsePackageInput({
      name: input.name,
      description: input.description,
      eventType: input.eventType,
      price: input.price,
      downPaymentPercentage:
        input.downPaymentPercentage,
      minimumGuests:
        input.minimumGuests,
      maximumGuests:
        input.maximumGuests,
      imageUrl: input.imageUrl,
      foodInclusions:
        input.foodInclusions,
      decorInclusions:
        input.decorInclusions,
      furnitureInclusions:
        input.furnitureInclusions,
      serviceInclusions:
        input.serviceInclusions,
    });

    const userReference = db
      .collection("users")
      .doc(actor.uid);

    const packageReference = db
      .collection("packages")
      .doc(packageId);

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

        const [
          providerSnapshot,
          packageSnapshot,
        ] = await Promise.all([
          transaction.get(
            providerReference,
          ),
          transaction.get(
            packageReference,
          ),
        ]);

        const provider =
          authorizeProviderForPackageManagement(
            {
              actorUid: actor.uid,
              providerSnapshot,
            },
          );

        const packageRecord =
          authorizeOwnedPackage({
            providerId:
              provider.providerId,
            packageSnapshot,
          });

        assertDraftPackage(
          packageRecord,
        );

        assertPackageMatchesProviderCapabilities(
          provider.providerData,
          validated,
        );

        transaction.update(
          packageReference,
          {
            name:
              validated.name,

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
             * Draft editing must never
             * make the package public.
             */
            status: "draft",
            isActive: false,
            isPublished: false,
            providerPubliclyVisible:
              false,
            publishedAt: null,

            updatedAt:
              serverTimestamp(),

            updatedBy:
              actor.uid,
          },
        );

        return {
          success: true,
          packageId,
          status: "draft" as const,
        };
      },
    );
  },
);

function requireObject(
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

function requireDocumentId(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${field} is required.`,
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    normalized.includes("/") ||
    !/^[A-Za-z0-9_-]+$/u.test(
      normalized,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return normalized;
}

function rejectUnknownFields(
  input: Readonly<
    Record<string, unknown>
  >,
  allowed:
    readonly string[],
): void {
  const unknown =
    Object.keys(input).filter(
      (field) =>
        !allowed.includes(field),
    );

  if (unknown.length === 0) {
    return;
  }

  throw new HttpsError(
    "invalid-argument",
    `Unsupported package fields: ${unknown
      .sort()
      .join(", ")}.`,
  );
}