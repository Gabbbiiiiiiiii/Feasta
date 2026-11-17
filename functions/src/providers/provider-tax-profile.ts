import {createHash} from "node:crypto";
import {createNotificationWithIdInTransaction} from "../shared/notifications.js";

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
  USER_ROLES,
} from "../shared/constants.js";
import {
  db,
} from "../shared/firestore.js";
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
  parseProviderTaxVerificationStatus,
  validateProviderTaxProfileReview,
  validateProviderTaxProfileSubmission,
} from "./provider-tax-profile-domain.js";

const PROVIDER_TAX_PROFILES_COLLECTION =
  "providerTaxProfiles";

export const submitProviderTaxProfile =
  onCall(
    appCheckCallableOptions,
    async (request) => {
      const actor =
        requireAuth(request);

      await requireRole(
        actor.uid,
        [USER_ROLES.provider],
      );

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "providerTaxProfile.submit",
          limit: 10,
          windowSeconds:
            10 * 60,
        },
      );

      const input =
        validateProviderTaxProfileSubmission(
          request.data ?? {},
        );

      const userReference =
        db.collection(
          "users",
        ).doc(actor.uid);

      const userSnapshot =
        await userReference.get();

      const providerId =
        documentId(
          userSnapshot
            .data()
            ?.providerId,
        );

      if (
        !userSnapshot.exists ||
        userSnapshot.data()
          ?.role !==
          USER_ROLES.provider ||
        !providerId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Your provider profile is not linked.",
        );
      }

      const providerReference =
        db.collection(
          "providers",
        ).doc(providerId);

      const taxProfileReference =
        db.collection(
          PROVIDER_TAX_PROFILES_COLLECTION,
        ).doc(providerId);

      // This is a bounded recipient snapshot. Never accept client-supplied Admin IDs.
      const administrators = await db.collection("users")
        .where("role", "==", USER_ROLES.admin)
        .limit(101)
        .get();
      if (administrators.size > 100) {
        throw new HttpsError("resource-exhausted", "The administrator recipient list exceeds the supported limit.");
      }
      const adminIds = administrators.docs
        .filter((doc) => {
          const data = doc.data();
          return data.role === USER_ROLES.admin &&
            data.accountStatus === "active" &&
            data.isActive !== false &&
            data.isBlocked !== true &&
            data.isDeleted !== true;
        })
        .map((doc) => doc.id);
      const verificationMatches = await db.collection("providerVerifications")
        .where("providerId", "==", providerId)
        .limit(2)
        .get();
      const verificationId = verificationMatches.size === 1
        ? verificationMatches.docs[0].id
        : null;

      return db.runTransaction(
        async (transaction) => {
          const [
            currentUserSnapshot,
            providerSnapshot,
            taxProfileSnapshot,
          ] =
            await transaction.getAll(
              userReference,
              providerReference,
              taxProfileReference,
            );

          const currentUser =
            currentUserSnapshot
              .data() ?? {};

          const provider =
            providerSnapshot
              .data() ?? {};

          if (
            !currentUserSnapshot.exists ||
            currentUser.role !==
              USER_ROLES.provider ||
            currentUser.providerId !==
              providerId ||
            !providerSnapshot.exists ||
            provider.ownerId !==
              actor.uid ||
            provider.isDeleted === true
          ) {
            throw new HttpsError(
              "permission-denied",
              "Provider tax-profile ownership could not be verified.",
            );
          }

          const existing =
            taxProfileSnapshot
              .data() ?? null;

          const currentStatus =
            existing
              ? parseProviderTaxVerificationStatus(
                  existing
                    .verificationStatus,
                )
              : null;

          if (
            existing &&
            !currentStatus
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The existing tax profile has an invalid verification state.",
            );
          }

          if (
            existing !== null &&
            (
              currentStatus ===
                "pending" ||
              currentStatus ===
                "verified"
            )
          ) {
            if (
              sameSubmittedProfile(
                existing,
                input,
              )
            ) {
              return {
                providerId,
                verificationStatus:
                  currentStatus,
                changed: false,
              };
            }

            throw new HttpsError(
              "failed-precondition",
              currentStatus ===
                "verified"
                ? "Your verified tax profile is locked. Contact FEASTA support to request a change."
                : "Your tax profile is currently pending administrator review.",
            );
          }

          const before =
            existing
              ? taxAuditSnapshot(
                  existing,
                )
              : null;

          const next = {
            providerId,
            ownerId:
              actor.uid,

            birRegisteredName:
              input
                .birRegisteredName,

            tin:
              input.tin,

            taxType:
              input.taxType,

            verificationStatus:
              "pending" as const,

            submittedAt:
              serverTimestamp(),

            verifiedAt:
              null,

            verifiedBy:
              null,

            rejectedAt:
              null,

            rejectedBy:
              null,

            rejectionReason:
              null,

            schemaVersion: 1,
            notificationRevision: Number.isSafeInteger(existing?.notificationRevision) &&
              (existing?.notificationRevision as number) >= 0 &&
              (existing?.notificationRevision as number) < Number.MAX_SAFE_INTEGER
              ? (existing?.notificationRevision as number) + 1 : 1,

            createdAt:
              existing
                ?.createdAt ??
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),

            updatedBy:
              actor.uid,
          };

          transaction.set(
            taxProfileReference,
            next,
            {
              merge: true,
            },
          );

          writeAuditLogInTransaction(
            transaction,
            {
              actorId:
                actor.uid,

              actorRole:
                USER_ROLES.provider,

              action:
                existing
                  ? "provider.tax_profile_resubmitted"
                  : "provider.tax_profile_submitted",

              targetCollection:
                PROVIDER_TAX_PROFILES_COLLECTION,

              targetId:
                providerId,

              before,

              after:
                taxAuditSnapshot({
                  ...next,
                  tin:
                    input.tin,
                }),
            },
          );

          // A replay returning changed:false above does not re-notify.
          // Stable document IDs keep retried transactions idempotent.
          for (const adminId of adminIds) {
            createNotificationWithIdInTransaction(
              transaction,
              taxNotificationId("submit", providerId, next.notificationRevision, adminId),
              {
                userId: adminId,
                title: existing ? "Provider tax profile resubmitted" : "New provider tax profile",
                message: "A provider submitted tax information for administrator review.",
                type: "provider_tax_profile_submitted",
                relatedCollection: verificationId ? "providerVerifications" : "providerTaxProfiles",
                relatedId: verificationId ?? providerId,
              },
            );
          }

          return {
            providerId,
            verificationStatus:
              "pending" as const,
            changed: true,
          };
        },
      );
    },
  );

export const reviewProviderTaxProfile =
  onCall(
    appCheckCallableOptions,
    async (request) => {
      const actor =
        requireAuth(request);

      await requireRole(
        actor.uid,
        [USER_ROLES.admin],
      );

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "providerTaxProfile.review",
          limit: 30,
          windowSeconds:
            10 * 60,
        },
      );

      const input =
        validateProviderTaxProfileReview(
          request.data ?? {},
        );

      const taxProfileReference =
        db.collection(
          PROVIDER_TAX_PROFILES_COLLECTION,
        ).doc(
          input.providerId,
        );

      const providerReference =
        db.collection(
          "providers",
        ).doc(
          input.providerId,
        );

      return db.runTransaction(
        async (transaction) => {
          const [
            taxProfileSnapshot,
            providerSnapshot,
          ] =
            await transaction.getAll(
              taxProfileReference,
              providerReference,
            );

          if (
            !taxProfileSnapshot.exists
          ) {
            throw new HttpsError(
              "not-found",
              "Provider tax profile was not found.",
            );
          }

          if (
            !providerSnapshot.exists ||
            providerSnapshot.data()
              ?.isDeleted === true
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The related provider profile is unavailable.",
            );
          }

          const current =
            taxProfileSnapshot
              .data() ?? {};

          if (
            current.providerId !==
              input.providerId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The tax profile is linked to an invalid provider.",
            );
          }

          const currentStatus =
            parseProviderTaxVerificationStatus(
              current
                .verificationStatus,
            );

          if (
            currentStatus !==
              "pending"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Only pending tax profiles can be reviewed.",
            );
          }

          const nextStatus =
            input.action ===
              "verify"
              ? "verified"
              : "rejected";

          const changes =
            input.action ===
              "verify"
              ? {
                  verificationStatus:
                    nextStatus,

                  verifiedAt:
                    serverTimestamp(),

                  verifiedBy:
                    actor.uid,

                  rejectedAt:
                    null,

                  rejectedBy:
                    null,

                  rejectionReason:
                    null,

                  updatedAt:
                    serverTimestamp(),

                  updatedBy:
                    actor.uid,
                }
              : {
                  verificationStatus:
                    nextStatus,

                  verifiedAt:
                    null,

                  verifiedBy:
                    null,

                  rejectedAt:
                    serverTimestamp(),

                  rejectedBy:
                    actor.uid,

                  rejectionReason:
                    input.reason,

                  updatedAt:
                    serverTimestamp(),

                  updatedBy:
                    actor.uid,
                };

          transaction.update(
            taxProfileReference,
            changes,
          );

          writeAuditLogInTransaction(
            transaction,
            {
              actorId:
                actor.uid,

              actorRole:
                USER_ROLES.admin,

              action:
                input.action ===
                  "verify"
                  ? "provider.tax_profile_verified"
                  : "provider.tax_profile_rejected",

              targetCollection:
                PROVIDER_TAX_PROFILES_COLLECTION,

              targetId:
                input.providerId,

              reason:
                input.reason ||
                undefined,

              before:
                taxAuditSnapshot(
                  current,
                ),

              after:
                taxAuditSnapshot({
                  ...current,
                  ...changes,
                }),
            },
          );

          // The provider's account receives the decision, without exposing TIN.
          const recipientId = providerSnapshot.data()?.ownerId;
          if (typeof recipientId !== "string" || recipientId !== current.ownerId) {
            throw new HttpsError("failed-precondition", "Provider tax-profile ownership is inconsistent.");
          }
          createNotificationWithIdInTransaction(
            transaction,
            taxNotificationId("review", input.providerId,
              Number.isSafeInteger(current.notificationRevision) ? current.notificationRevision as number : 0,
              recipientId),
            {
              userId: recipientId,
              title: nextStatus === "verified" ? "Tax profile verified" : "Tax profile needs correction",
              message: nextStatus === "verified"
                ? "FEASTA administration has verified your submitted tax profile."
                : "FEASTA administration rejected your tax profile. Open your tax profile to review the decision.",
              type: nextStatus === "verified" ? "provider_tax_profile_verified" : "provider_tax_profile_rejected",
              relatedCollection: "providerTaxProfiles",
              relatedId: input.providerId,
            },
          );

          return {
            providerId:
              input.providerId,

            verificationStatus:
              nextStatus,
          };
        },
      );
    },
  );

function taxNotificationId(kind: string, providerId: string, revision: number, recipientId: string): string {
  // Short opaque keys are safe even when provider and recipient IDs are long.
  const digest = createHash("sha256")
    .update(JSON.stringify([kind, providerId, revision, recipientId]))
    .digest("hex");
  return `tax_${digest}`;
}

function sameSubmittedProfile(
  current:
    Readonly<
      Record<string, unknown>
    >,
  input: {
    birRegisteredName: string;
    tin: string;
    taxType:
      "non_vat" |
      "vat_registered";
  },
): boolean {
  return (
    current
      .birRegisteredName ===
      input
        .birRegisteredName &&
    current.tin ===
      input.tin &&
    current.taxType ===
      input.taxType
  );
}

function taxAuditSnapshot(
  value:
    Readonly<
      Record<string, unknown>
    >,
): Record<string, unknown> {
  const tin =
    typeof value.tin ===
      "string"
      ? value.tin
      : "";

  return {
    birRegisteredName:
      typeof value
        .birRegisteredName ===
        "string"
        ? value
            .birRegisteredName
        : null,

    /*
     * Never place a complete TIN in
     * the general audit collection.
     */
    tinLast4:
      tin.length >= 4
        ? tin.slice(-4)
        : null,

    taxType:
      value.taxType ===
        "non_vat" ||
      value.taxType ===
        "vat_registered"
        ? value.taxType
        : null,

    verificationStatus:
      parseProviderTaxVerificationStatus(
        value
          .verificationStatus,
      ),
  };
}

function documentId(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return (
    /^[A-Za-z0-9_-]{1,160}$/u
      .test(normalized)
  )
    ? normalized
    : null;
}
