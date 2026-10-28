import {requireMaintenanceOpen, recordMaintenanceAdmission} from "../shared/maintenance.js";
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
  requireActiveServiceCategoryInTransaction,
} from "../shared/service-category-policy.js";

import {
  assertCanonicalPackagePaymentTerms,
  assertCanonicalPackageServiceCategory,
  assertDraftPackage,
  assertPackageMatchesProviderCapabilities,
  assertPackagePublishable,
  authorizeOwnedPackage,
  authorizeProviderForPackageManagement,
  parsePackageInput,
} from "./package-domain.js";

import {isLegacyOccasionPackage} from "./legacy-occasion-publication-guard.js";
import {stableOccasionPublicationGeneration} from "./occasion-publication-generation.js";
import {activeOccasionAuthority} from "./occasion-publication-generation.js";

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

        if (!isLegacyOccasionPackage(packageRecord.packageData)) {
          throw new HttpsError(
            "failed-precondition",
            "V2 occasion packages require verified customer compatibility before publishing.",
          );
        }

        const validated =
          parsePackageInput(
            packageRecord.packageData,
          );
        /*
         * Historical package records remain readable, but packages
         * entering publication must use canonical category and
         * payment-term contracts.
         */
        assertCanonicalPackageServiceCategory(
          validated,
        );

        assertCanonicalPackagePaymentTerms(
          validated,
        );

        assertPackageMatchesProviderCapabilities(
          provider.providerData,
          validated,
        );

        await requireActiveServiceCategoryInTransaction(
          transaction,
          validated.serviceCategoryCode,
          "catering",
          "serviceCategoryCode",
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

        await requireMaintenanceOpen(transaction, db, "publication");

        // Read the protected generation in this SAME Firestore transaction.
        // Concurrent activation-state updates invalidate/retry this publication.
        const catalogSnapshot = await transaction.get(
          db.collection("occasionCatalog").doc("current"),
        );
        if (stableOccasionPublicationGeneration(catalogSnapshot.data()) === null) {
          throw new HttpsError(
            "failed-precondition",
            "Package publication is temporarily unavailable during occasion maintenance.",
          );
        }

        const occasionSnapshot = await transaction.get(
          db.collection("occasions").doc(validated.eventType),
        );
        if (!activeOccasionAuthority(occasionSnapshot.data(), validated.eventType,
          validated.serviceCategoryCode)) {
          throw new HttpsError("failed-precondition",
            "This occasion is inactive or unavailable for this service.",
            {reason: "OCCASION_UNAVAILABLE"});
        }

        recordMaintenanceAdmission(transaction, db);
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
