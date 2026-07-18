import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireRecentAuthentication} from "../shared/recent-auth.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";

const policyVersionPlaceholder = "unversioned";

export const updateCustomerProfile = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    await enforceCallableRateLimit(request, {
      scope: "account.updateProfile",
      limit: 20,
      windowSeconds: 10 * 60,
    });
    const input = requireObject(request.data ?? {});
    const firstName = requireString(input.firstName, "firstName", {
      minLength: 1,
      maxLength: 80,
    });
    const lastName = requireString(input.lastName, "lastName", {
      minLength: 1,
      maxLength: 80,
    });
    const address = optionalString(input.address, "address", 300);
    const city = optionalString(input.city, "city", 120);
    const province = optionalString(input.province, "province", 120);

    const userReference = db.collection("users").doc(actor.uid);
    const customerReference = db.collection("customers").doc(actor.uid);
    await db.runTransaction(async (transaction) => {
      const [userSnapshot, customerSnapshot] = await transaction.getAll(
        userReference,
        customerReference,
      );
      if (!userSnapshot.exists || !customerSnapshot.exists) {
        throw new HttpsError("not-found", "Customer profile was not found.");
      }
      transaction.update(userReference, {
        firstName,
        lastName,
        updatedAt: serverTimestamp(),
      });
      transaction.update(customerReference, {
        firstName,
        lastName,
        address,
        city,
        province,
        updatedAt: serverTimestamp(),
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: "customer",
        action: "customer_profile_updated",
        targetCollection: "customers",
        targetId: actor.uid,
        metadata: {fields: ["firstName", "lastName", "address", "city", "province"]},
      });
    });
    return {success: true};
  },
);

export const updateCustomerPreferences = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    await enforceCallableRateLimit(request, {
      scope: "account.updatePreferences",
      limit: 30,
      windowSeconds: 10 * 60,
    });
    const input = requireObject(request.data ?? {});
    const marketingConsent = requireBoolean(input.marketingConsent, "marketingConsent");
    const pushNotificationsEnabled = requireBoolean(
      input.pushNotificationsEnabled,
      "pushNotificationsEnabled",
    );
    const emailNotificationsEnabled = requireBoolean(
      input.emailNotificationsEnabled,
      "emailNotificationsEnabled",
    );
    const userReference = db.collection("users").doc(actor.uid);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userReference);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "Customer profile was not found.");
      }
      const existing = snapshot.data() ?? {};
      transaction.update(userReference, {
        marketingConsent,
        pushNotificationsEnabled,
        emailNotificationsEnabled,
        marketingConsentUpdatedAt: serverTimestamp(),
        preferencesUpdatedAt: serverTimestamp(),
        termsPolicyVersion: existing.termsPolicyVersion ?? policyVersionPlaceholder,
        privacyPolicyVersion: existing.privacyPolicyVersion ?? policyVersionPlaceholder,
        updatedAt: serverTimestamp(),
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: "customer",
        action: "customer_preferences_updated",
        targetCollection: "users",
        targetId: actor.uid,
        metadata: {
          marketingConsent,
          pushNotificationsEnabled,
          emailNotificationsEnabled,
        },
      });
    });
    return {success: true, policyVersion: policyVersionPlaceholder};
  },
);

export const deactivateCustomerAccount = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    requireRecentAuthentication(request.auth?.token.auth_time);
    await enforceCallableRateLimit(request, {
      scope: "account.deactivate",
      limit: 3,
      windowSeconds: 24 * 60 * 60,
    });
    const input = requireObject(request.data ?? {});
    const reason = optionalString(input.reason, "reason", 300);
    const userReference = db.collection("users").doc(actor.uid);
    const customerReference = db.collection("customers").doc(actor.uid);

    await db.runTransaction(async (transaction) => {
      const [userSnapshot, customerSnapshot] = await transaction.getAll(
        userReference,
        customerReference,
      );
      if (!userSnapshot.exists || !customerSnapshot.exists) {
        throw new HttpsError("not-found", "Customer profile was not found.");
      }
      transaction.update(userReference, {
        accountStatus: "pending_deletion",
        isActive: false,
        deactivatedAt: serverTimestamp(),
        deactivationReason: reason || null,
        updatedAt: serverTimestamp(),
      });
      transaction.update(customerReference, {
        isActive: false,
        deactivatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: "customer",
        action: "customer_account_deactivated",
        targetCollection: "users",
        targetId: actor.uid,
        reason: reason || "customer_requested",
      });
    });
    await getAuth().revokeRefreshTokens(actor.uid);
    return {
      success: true,
      accountStatus: "pending_deletion",
      reactivationPolicy: "Contact FEASTA support for account review.",
    };
  },
);

export const revokeAllCustomerSessions = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    requireRecentAuthentication(request.auth?.token.auth_time);
    await enforceCallableRateLimit(request, {
      scope: "account.revokeSessions",
      limit: 5,
      windowSeconds: 24 * 60 * 60,
    });
    await getAuth().revokeRefreshTokens(actor.uid);
    await db.collection("adminLogs").add({
      actorId: actor.uid,
      actorRole: "customer",
      action: "customer_sessions_revoked",
      targetCollection: "users",
      targetId: actor.uid,
      source: "cloud_function",
      createdAt: serverTimestamp(),
    });
    return {success: true};
  },
);

function optionalString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (value == null) return "";
  return requireString(value, field, {minLength: 0, maxLength: maximumLength});
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new HttpsError("invalid-argument", `${field} must be a boolean.`);
  }
  return value;
}
