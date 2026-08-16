import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  isProviderPubliclyEligible,
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
  assertPackagePublishable,
  authorizeOwnedPackage,
  authorizeProviderForPackageManagement,
  parsePackageInput,
} from "./package-domain.js";

export const publishProviderPackage = onCall(
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
          "packages.publishProviderPackage",
        limit: 30,
        windowSeconds: 60 * 60,
      },
    );

    const input = requireObject(
      request.data,
    );

    rejectUnknownFields(
      input,
      ["packageId"],
    );

    const packageId =
      requireDocumentId(
        input.packageId,
        "packageId",
      );

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

        const validated =
          parsePackageInput(
            packageRecord.packageData,
          );

        assertPackageMatchesProviderCapabilities(
          provider.providerData,
          validated,
        );

        assertPackagePublishable(
          packageRecord.packageData,
        );

        if (
          !isProviderPubliclyEligible(
            {
              ...provider.providerData,
              id: provider.providerId,
            },
            user,
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Complete your approved public provider profile before publishing packages.",
          );
        }

        transaction.update(
          packageReference,
          {
            status: "published",

            isActive: true,
            isPublished: true,
            providerPubliclyVisible:
              true,

            publishedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),

            updatedBy:
              actor.uid,
          },
        );

        return {
          success: true,
          packageId,
          status: "published" as const,
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
      "Package request is invalid.",
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
  allowed: readonly string[],
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
    `Unsupported fields: ${unknown
      .sort()
      .join(", ")}.`,
  );
}