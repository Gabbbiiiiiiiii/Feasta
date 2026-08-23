import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {logError, logInfo} from "../shared/logger.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  requireObject,
  requirePhilippineMobile,
  requireString,
} from "../shared/validation.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {isAuthoritativeAuthPhone} from "../shared/provider-identity-prerequisites.js";

/** Creates the trusted users/{uid} provider identity before registration. */
export const ensureProviderIdentity = onCall(
  appCheckCallableOptions,
  async (request) => {
    const authenticatedUser = requireAuth(request);
    await enforceCallableRateLimit(request, {
      scope: "ensureProviderIdentity",
      limit: 5,
      windowSeconds: 15 * 60,
    });

    try {
      const input = requireObject(request.data);
      rejectUnknownFields(input, [
        "firstName",
        "lastName",
        "phoneNumber",
        "acceptedTerms",
        "acceptedPrivacy",
        "termsPolicyVersion",
        "privacyPolicyVersion",
      ]);
      const firstName = requireString(input.firstName, "firstName", {
        minLength: 1,
        maxLength: 80,
      });
      const lastName = requireString(input.lastName, "lastName", {
        minLength: 1,
        maxLength: 80,
      });
      const phoneNumber = requirePhilippineMobile(input.phoneNumber);
      const acceptedTerms = input.acceptedTerms === true;
      const acceptedPrivacy = input.acceptedPrivacy === true;
      const termsPolicyVersion = policyVersion(
        input.termsPolicyVersion,
        "termsPolicyVersion",
      );
      const privacyPolicyVersion = policyVersion(
        input.privacyPolicyVersion,
        "privacyPolicyVersion",
      );
      const authUser = await getAuth().getUser(authenticatedUser.uid);
      if (authUser.disabled) {
        throw new HttpsError("permission-denied", "This account is disabled.");
      }
      const userReference = db.collection("users").doc(authenticatedUser.uid);

      const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userReference);
        const existing = snapshot.data();
        const phoneVerified = isAuthoritativeAuthPhone(authUser, phoneNumber);

        if (snapshot.exists) {
          if (existing?.role !== USER_ROLES.provider) {
            throw new HttpsError(
              "permission-denied",
              "Provider registration cannot be used for this account role.",
            );
          }
          if (
            existing.accountStatus !== "active" ||
            existing.isActive === false ||
            existing.isBlocked === true
          ) {
            throw new HttpsError(
              "permission-denied",
              "This account is blocked or disabled.",
            );
          }
          requireProviderConsent(existing, acceptedTerms, acceptedPrivacy);

          const providerId = typeof existing.providerId === "string" ?
            existing.providerId.trim() :
            "";
          if (providerId) {
            const providerSnapshot = await transaction.get(
              db.collection("providers").doc(providerId),
            );
            if (
              !providerSnapshot.exists ||
              providerSnapshot.data()?.ownerId !== authenticatedUser.uid
            ) {
              throw new HttpsError(
                "failed-precondition",
                "The provider account relationship is invalid.",
              );
            }
          }

          transaction.update(userReference, {
            firstName,
            lastName,
            phoneNumber,
            email: authUser.email ?? authenticatedUser.email ?? null,
            profileImageUrl: authUser.photoURL ?? existing.profileImageUrl ?? null,
            isEmailVerified: authUser.emailVerified,
            isPhoneVerified: phoneVerified,
            phoneVerifiedAt: phoneVerified ?
              existing.phoneVerifiedAt ?? serverTimestamp() :
              null,
            authProvider: authUser.providerData[0]?.providerId ?? "password",
            updatedAt: serverTimestamp(),
            ...(acceptedTerms && existing.termsAcceptedAt == null ? {
              termsAcceptedAt: serverTimestamp(),
              termsPolicyVersion,
            } : {}),
            ...(acceptedPrivacy && existing.privacyAcceptedAt == null ? {
              privacyAcceptedAt: serverTimestamp(),
              privacyPolicyVersion,
            } : {}),
          });
        } else {
          requireProviderConsent(null, acceptedTerms, acceptedPrivacy);
          transaction.create(userReference, {
            uid: authenticatedUser.uid,
            firstName,
            lastName,
            email: authUser.email ?? authenticatedUser.email ?? null,
            phoneNumber,
            role: USER_ROLES.provider,
            accountStatus: "active",
            providerId: null,
            profileImageUrl: authUser.photoURL ?? null,
            isEmailVerified: authUser.emailVerified,
            isPhoneVerified: phoneVerified,
            phoneVerifiedAt: phoneVerified ? serverTimestamp() : null,
            isActive: true,
            isBlocked: false,
            authProvider: authUser.providerData[0]?.providerId ?? "password",
            ...(acceptedTerms ? {
              termsAcceptedAt: serverTimestamp(),
              termsPolicyVersion,
            } : {}),
            ...(acceptedPrivacy ? {
              privacyAcceptedAt: serverTimestamp(),
              privacyPolicyVersion,
            } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return {created: !snapshot.exists};
      });

      logInfo("Provider identity ensured", {
        uid: authenticatedUser.uid,
        created: result.created,
      });
      return {success: true, ...result, role: USER_ROLES.provider};
    } catch (error) {
      logError("Failed to ensure provider identity", error, {
        uid: authenticatedUser.uid,
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "The provider account could not be initialized.",
      );
    }
  },
);

function policyVersion(value: unknown, field: string): string {
  if (value === undefined) return "unversioned";
  return requireString(value, field, {minLength: 1, maxLength: 80});
}

function requireProviderConsent(
  existing: Record<string, unknown> | null | undefined,
  acceptedTerms: boolean,
  acceptedPrivacy: boolean,
): void {
  if (existing?.termsAcceptedAt == null && !acceptedTerms) {
    throw new HttpsError(
      "failed-precondition",
      "Accept the Terms of Service before creating a provider account.",
    );
  }
  if (existing?.privacyAcceptedAt == null && !acceptedPrivacy) {
    throw new HttpsError(
      "failed-precondition",
      "Accept the Privacy Policy before creating a provider account.",
    );
  }
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
      `Unknown provider identity fields: ${unknownFields.join(", ")}.`,
    );
  }
}
