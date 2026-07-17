import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {FUNCTION_REGION, USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {logError, logInfo} from "../shared/logger.js";
import {serverTimestamp} from "../shared/timestamps.js";

/** Synchronizes Auth-owned metadata without allowing trusted client writes. */
export const syncUserAuthState = onCall(
  {region: FUNCTION_REGION},
  async (request) => {
    const authenticatedUser = requireAuth(request);
    const reference = db.collection("users").doc(authenticatedUser.uid);

    try {
      const [snapshot, authUser] = await Promise.all([
        reference.get(),
        getAuth().getUser(authenticatedUser.uid),
      ]);

      if (!snapshot.exists) {
        throw new HttpsError("not-found", "User profile was not found.");
      }

      const data = snapshot.data();
      if (
        data?.role !== USER_ROLES.customer &&
        data?.role !== USER_ROLES.provider &&
        data?.role !== USER_ROLES.admin
      ) {
        throw new HttpsError("permission-denied", "Account role is invalid.");
      }
      if (
        data.accountStatus !== "active" ||
        data.isActive === false ||
        data.isBlocked === true ||
        authUser.disabled
      ) {
        throw new HttpsError(
          "permission-denied",
          "This account is blocked or disabled.",
        );
      }

      await reference.update({
        email: authUser.email ?? authenticatedUser.email ?? null,
        isEmailVerified: authUser.emailVerified,
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      logInfo("User Auth state synchronized", {
        uid: authenticatedUser.uid,
        role: data.role,
      });

      return {
        success: true,
        user: {
          uid: authenticatedUser.uid,
          role: data.role,
          accountStatus: data.accountStatus,
          isEmailVerified: authUser.emailVerified,
        },
      };
    } catch (error) {
      logError("Failed to synchronize Auth state", error, {
        uid: authenticatedUser.uid,
      });
      throw error;
    }
  },
);
