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
    const phoneNumber = typeof input.phoneNumber === "string" ?
      input.phoneNumber.trim().slice(0, 30) :
      (authUser.phoneNumber ?? "");
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

          transaction.update(userReference, {
            firstName,
            lastName,
            email,
            phoneNumber,
            profileImageUrl: authUser.photoURL ?? existing.profileImageUrl ?? null,
            isEmailVerified: authUser.emailVerified,
            authProvider: provider,
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            ...(acceptedTerms && existing?.termsAcceptedAt == null ?
              {termsAcceptedAt: serverTimestamp()} : {}),
            ...(acceptedPrivacy && existing?.privacyAcceptedAt == null ?
              {privacyAcceptedAt: serverTimestamp()} : {}),
          });
        } else {
          transaction.create(userReference, {
            uid: authenticatedUser.uid,
            firstName,
            lastName,
            email,
            phoneNumber,
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
            ...(acceptedTerms ? {termsAcceptedAt: serverTimestamp()} : {}),
            ...(acceptedPrivacy ? {privacyAcceptedAt: serverTimestamp()} : {}),
          });
        }

        if (customerSnapshot.exists) {
          transaction.update(customerReference, {
            firstName,
            lastName,
            email,
            phoneNumber,
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
            phoneNumber,
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
