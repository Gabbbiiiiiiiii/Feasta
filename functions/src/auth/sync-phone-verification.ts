import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {serverTimestamp} from "../shared/timestamps.js";

const philippineMobilePattern = /^\+639\d{9}$/u;

/**
 * Copies Firebase Auth-owned phone verification into profile data.
 * The callable accepts no phone or verification boolean from the client.
 */
export const syncPhoneVerification = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    const role = await requireRole(actor.uid, ["customer", "provider"]);
    await enforceCallableRateLimit(request, {
      scope: "auth.syncPhoneVerification",
      limit: 10,
      windowSeconds: 10 * 60,
    });

    const authUser = await getAuth().getUser(actor.uid);
    const phoneNumber = authUser.phoneNumber;
    if (!phoneNumber || !philippineMobilePattern.test(phoneNumber)) {
      throw new HttpsError(
        "failed-precondition",
        "A verified Philippine mobile number is required.",
      );
    }

    const userReference = db.collection("users").doc(actor.uid);
    const customerReference = db.collection("customers").doc(actor.uid);

    await db.runTransaction(async (transaction) => {
      const [userSnapshot, customerSnapshot] = await Promise.all([
        transaction.get(userReference),
        role === "customer" ? transaction.get(customerReference) : null,
      ]);
      if (!userSnapshot.exists || (role === "customer" && !customerSnapshot?.exists)) {
        throw new HttpsError("not-found", "Account profile was not found.");
      }

      const user = userSnapshot.data();
      if (
        user?.role !== role ||
        user.accountStatus !== "active" ||
        user.isActive !== true ||
        user.isBlocked === true
      ) {
        throw new HttpsError("permission-denied", "Account is unavailable.");
      }

      if (role === "provider" && user.phoneNumber !== phoneNumber) {
        throw new HttpsError(
          "failed-precondition",
          "The verified mobile number does not match the registered number.",
        );
      }

      const providerId = role === "provider" &&
        typeof user.providerId === "string" && user.providerId.trim()
        ? user.providerId.trim()
        : null;
      const providerReference = providerId
        ? db.collection("providers").doc(providerId)
        : null;
      const providerSnapshot = providerReference
        ? await transaction.get(providerReference)
        : null;
      if (providerSnapshot && providerSnapshot.data()?.ownerId !== actor.uid) {
        throw new HttpsError("permission-denied", "Provider profile is unavailable.");
      }

      transaction.update(userReference, {
        phoneNumber,
        isPhoneVerified: true,
        phoneVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (customerSnapshot?.exists) {
        transaction.update(customerReference, {
          phoneNumber,
          phoneVerifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (providerReference && providerSnapshot?.exists) {
        transaction.update(providerReference, {
          ownerPhone: phoneNumber,
          updatedAt: serverTimestamp(),
        });
      }
    });

    logSecurityEvent({
      action: "phone_verification_synchronized",
      outcome: "succeeded",
      actorUid: actor.uid,
      targetId: actor.uid,
    });

    return {success: true, phoneNumber};
  },
);
