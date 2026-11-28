import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {logError, logInfo} from "../shared/logger.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";

/** Synchronizes Auth-owned metadata without allowing trusted client writes. */
export const syncUserAuthState = onCall(
  appCheckCallableOptions,
  async (request) => {
    const authenticatedUser = requireAuth(request);
    await enforceCallableRateLimit(request, {
      scope: "syncUserAuthState",
      limit: 20,
      windowSeconds: 10 * 60,
    });
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

      const trustedEmail = authUser.email ?? authenticatedUser.email ?? null;
      const customerReference = db.collection("customers").doc(
        authenticatedUser.uid,
      );
      const emailChanged = data?.email !== trustedEmail;
      await db.runTransaction(async (transaction) => {
        const customerSnapshot = data?.role === USER_ROLES.customer ?
          await transaction.get(customerReference) : null;
        transaction.update(reference, {
          email: trustedEmail,
          isEmailVerified: authUser.emailVerified,
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (customerSnapshot?.exists) {
          transaction.update(customerReference, {
            email: trustedEmail,
            updatedAt: serverTimestamp(),
          });
        }
        if (emailChanged) {
          writeAuditLogInTransaction(transaction, {
            actorId: authenticatedUser.uid,
            actorRole: data?.role ?? "unknown",
            action: "account_email_synchronized",
            targetCollection: "users",
            targetId: authenticatedUser.uid,
            before: {email: data?.email ?? null},
            after: {email: trustedEmail},
          });
          transaction.create(db.collection("notifications").doc(), {
            userId: authenticatedUser.uid,
            title: "Email address updated",
            message: "Your verified account email was updated.",
            type: "account",
            relatedId: authenticatedUser.uid,
            relatedCollection: "users",
            isRead: false,
            readAt: null,
            createdAt: serverTimestamp(),
          });
        }
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
