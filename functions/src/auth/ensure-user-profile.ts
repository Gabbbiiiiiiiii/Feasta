import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {logError, logInfo} from "../shared/logger.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {
  authoritativeFirebasePhone,
  requireGlobalPhoneIdentityOwnership,
} from "../shared/phone-identity.js";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./customer-consent-policy.js";

/**
 * Creates or repairs the customer Firestore profile for the authenticated
 * Firebase Auth user. The caller never chooses trusted role/account fields.
 */
export const ensureUserProfile = onCall(
  appCheckCallableOptions,
  async (request) => {
    const authenticatedUser = requireAuth(request);
    await enforceCallableRateLimit(request, {
      scope: "ensureUserProfile",
      limit: 10,
      windowSeconds: 10 * 60,
    });
    const input = requireObject(request.data ?? {});
    rejectUnknownFields(input, [
      "firstName",
      "lastName",
      "acceptedTerms",
      "acceptedPrivacy",
      "termsPolicyVersion",
      "privacyPolicyVersion",
    ]);
    const authUser = await getAuth().getUser(authenticatedUser.uid);
    if (authUser.disabled) {
      throw new HttpsError("permission-denied", "This account is disabled.");
    }

    const suppliedFirstName = optionalName(input.firstName, "firstName");
    const suppliedLastName = optionalName(input.lastName, "lastName");
    const fallbackName = splitDisplayName(
      authUser.displayName ?? "",
      authUser.email ?? authenticatedUser.email ?? "",
    );
    const firstName = suppliedFirstName ?? fallbackName.firstName;
    const lastName = suppliedLastName ?? fallbackName.lastName;
    const authoritativePhone = authoritativeFirebasePhone(authUser);
    if (authoritativePhone) {
      await requireGlobalPhoneIdentityOwnership(
        authUser,
        authoritativePhone,
      );
    }
    const email = authUser.email ?? authenticatedUser.email ?? null;
    const provider = authUser.providerData[0]?.providerId ?? "password";
    const acceptedTerms = input.acceptedTerms === true;
    const acceptedPrivacy = input.acceptedPrivacy === true;

    const userReference = db.collection("users").doc(authenticatedUser.uid);
    const customerReference = db
      .collection("customers")
      .doc(authenticatedUser.uid);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const [userSnapshot, customerSnapshot] = await transaction.getAll(
          userReference,
          customerReference,
        );

        if (
          !userSnapshot.exists &&
          (!acceptedTerms || !acceptedPrivacy)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Accept the current Terms and Privacy Policy " +
              "before creating a customer profile.",
            {
              reason: "consent-required",
            },
          );
        }

        if (userSnapshot.exists) {
          const existing = userSnapshot.data();

          if (existing?.role !== USER_ROLES.customer) {
            throw new HttpsError(
              "permission-denied",
              "Customer sign-in cannot be used for this account role.",
              {reason: "unsupported-role"},
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
              {reason: existing.isBlocked === true ? "blocked" : "disabled"},
            );
          }

          requireConsistentPhoneProjection(
            existing,
            customerSnapshot.data(),
            authoritativePhone,
          );

          transaction.update(userReference, {
            firstName,
            lastName,
            email,
            ...(authoritativePhone ? {phoneNumber: authoritativePhone} : {}),
            profileImageUrl: authUser.photoURL ?? existing.profileImageUrl ?? null,
            isEmailVerified: authUser.emailVerified,
            authProvider: provider,
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            ...(acceptedTerms &&
            (
              existing?.termsAcceptedAt == null ||
              existing?.termsVersion !==
                CURRENT_TERMS_VERSION
            ) ? {
                termsAcceptedAt:
                  serverTimestamp(),
                termsVersion:
                  CURRENT_TERMS_VERSION,
              } : {}),
            ...(acceptedPrivacy &&
            (
              existing?.privacyAcceptedAt == null ||
              existing?.privacyVersion !==
                CURRENT_PRIVACY_VERSION
            ) ? {
                privacyAcceptedAt:
                  serverTimestamp(),
                privacyVersion:
                  CURRENT_PRIVACY_VERSION,
              } : {}),
          });
        } else {
          transaction.create(userReference, {
            uid: authenticatedUser.uid,
            firstName,
            lastName,
            email,
            phoneNumber: authoritativePhone ?? "",
            role: USER_ROLES.customer,
            accountStatus: "active",
            providerId: null,
            profileImageUrl: authUser.photoURL ?? null,
            isEmailVerified: authUser.emailVerified,
            isPhoneVerified: false,
            isActive: true,
            isBlocked: false,
            authProvider: provider,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            termsAcceptedAt:
              serverTimestamp(),
            termsVersion:
              CURRENT_TERMS_VERSION,
            privacyAcceptedAt:
              serverTimestamp(),
            privacyVersion:
              CURRENT_PRIVACY_VERSION,
          });
        }

        if (customerSnapshot.exists) {
          transaction.update(customerReference, {
            firstName,
            lastName,
            email,
            ...(authoritativePhone ? {phoneNumber: authoritativePhone} : {}),
            profileImageUrl: authUser.photoURL ??
              customerSnapshot.data()?.profileImageUrl ?? null,
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.create(customerReference, {
            userId: authenticatedUser.uid,
            firstName,
            lastName,
            email,
            phoneNumber: authoritativePhone ?? "",
            address: "",
            city: "Ormoc City",
            province: "Leyte",
            profileImageUrl: authUser.photoURL ?? null,
            totalBookings: 0,
            completedBookings: 0,
            cancelledBookings: 0,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return {created: !userSnapshot.exists};
      });

      logInfo("Customer profile ensured", {
        uid: authenticatedUser.uid,
        created: result.created,
        authProvider: provider,
      });

      return {
        success: true,
        created: result.created,
        user: {
          uid: authenticatedUser.uid,
          role: USER_ROLES.customer,
          accountStatus: "active",
        },
      };
    } catch (error) {
      logError("Failed to ensure customer profile", error, {
        uid: authenticatedUser.uid,
      });
      throw error;
    }
  },
);

function optionalName(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return requireString(value, field, {minLength: 1, maxLength: 80});
}

function splitDisplayName(
  displayName: string,
  email: string,
): {firstName: string; lastName: string} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);

  if (parts.length > 0) {
    return {
      firstName: parts[0].slice(0, 80),
      lastName: parts.slice(1).join(" ").slice(0, 80),
    };
  }

  const emailName = email.split("@")[0]?.trim() || "Customer";
  return {firstName: emailName.slice(0, 80), lastName: ""};
}

function requireConsistentPhoneProjection(
  user: Record<string, unknown> | undefined,
  customer: Record<string, unknown> | undefined,
  authoritativePhone: string | null,
): void {
  for (const projected of [user?.phoneNumber, customer?.phoneNumber]) {
    if (
      typeof projected === "string" &&
      projected.trim() !== "" &&
      projected !== authoritativePhone
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The mobile identity relationship is inconsistent. Contact support.",
      );
    }
  }
  if (user?.isPhoneVerified === true && !authoritativePhone) {
    throw new HttpsError(
      "failed-precondition",
      "The verified mobile identity is unavailable or inconsistent.",
    );
  }
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(input).filter(
    (field) => !allowed.includes(field),
  );
  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unsupported customer identity fields: ${unknown.join(", ")}.`,
    );
  }
}
