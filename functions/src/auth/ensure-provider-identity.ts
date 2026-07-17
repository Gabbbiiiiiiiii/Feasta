import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {FUNCTION_REGION, USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {logError, logInfo} from "../shared/logger.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";

/** Creates the trusted users/{uid} provider identity before registration. */
export const ensureProviderIdentity = onCall(
  {region: FUNCTION_REGION},
  async (request) => {
    const authenticatedUser = requireAuth(request);

    try {
      const input = requireObject(request.data);
      const firstName = requireString(input.firstName, "firstName", {
        minLength: 1,
        maxLength: 80,
      });
      const lastName = requireString(input.lastName, "lastName", {
        minLength: 1,
        maxLength: 80,
      });
      const phoneNumber = requireString(input.phoneNumber, "phoneNumber", {
        minLength: 7,
        maxLength: 30,
      });
      const authUser = await getAuth().getUser(authenticatedUser.uid);
      const userReference = db.collection("users").doc(authenticatedUser.uid);

      const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userReference);
        const existing = snapshot.data();

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

          transaction.update(userReference, {
            firstName,
            lastName,
            phoneNumber,
            email: authUser.email ?? authenticatedUser.email ?? null,
            profileImageUrl: authUser.photoURL ?? existing.profileImageUrl ?? null,
            isEmailVerified: authUser.emailVerified,
            authProvider: authUser.providerData[0]?.providerId ?? "password",
            updatedAt: serverTimestamp(),
          });
        } else {
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
            isPhoneVerified: false,
            isActive: true,
            isBlocked: false,
            authProvider: authUser.providerData[0]?.providerId ?? "password",
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
