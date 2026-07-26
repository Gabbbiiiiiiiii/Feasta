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
const editableVerificationStatuses = new Set([
  "draft",
  "resubmission_required",
]);
const activeProviderRequestStatuses = [
  "pending",
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
] as const;

export const updateRoleAccountProfile = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    const role = await requireRole(actor.uid, ["provider", "admin"]);
    await enforceCallableRateLimit(request, {
      scope: "account.updateRoleProfile",
      limit: 20,
      windowSeconds: 10 * 60,
    });
    const input = requireObject(request.data ?? {});
    if (role === "admin") {
      rejectUnknownFields(input, ["firstName", "lastName"]);
      const firstName = requiredName(input.firstName, "firstName");
      const lastName = requiredName(input.lastName, "lastName");
      const userReference = db.collection("users").doc(actor.uid);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userReference);
        if (!snapshot.exists || snapshot.data()?.role !== "admin") {
          throw new HttpsError("permission-denied", "Admin profile is invalid.");
        }
        transaction.update(userReference, {
          firstName,
          lastName,
          updatedAt: serverTimestamp(),
        });
        writeAuditLogInTransaction(transaction, {
          actorId: actor.uid,
          actorRole: "admin",
          action: "admin_profile_updated",
          targetCollection: "users",
          targetId: actor.uid,
          metadata: {fields: ["firstName", "lastName"]},
        });
      });
      return {success: true, role};
    }

    rejectUnknownFields(input, [
      "ownerFirstName",
      "ownerLastName",
      "businessName",
      "businessEmail",
      "businessPhone",
      "description",
      "address",
      "city",
      "province",
    ]);
    const ownerFirstName = requiredName(input.ownerFirstName, "ownerFirstName");
    const ownerLastName = requiredName(input.ownerLastName, "ownerLastName");
    const businessName = requireString(input.businessName, "businessName", {
      minLength: 2,
      maxLength: 120,
    });
    const businessEmail = normalizeEmail(
      requireString(input.businessEmail, "businessEmail", {
        minLength: 3,
        maxLength: 160,
      }),
    );
    const businessPhone = requireString(
      input.businessPhone,
      "businessPhone",
      {minLength: 7, maxLength: 30},
    );
    const description = requireString(input.description, "description", {
      minLength: 20,
      maxLength: 2000,
    });
    const address = requireString(input.address, "address", {
      minLength: 3,
      maxLength: 250,
    });
    const city = requireString(input.city, "city", {
      minLength: 2,
      maxLength: 100,
    });
    const province = requireString(input.province, "province", {
      minLength: 2,
      maxLength: 100,
    });
    const userReference = db.collection("users").doc(actor.uid);

    await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userReference);
      const providerId = stringValue(userSnapshot.data()?.providerId);
      if (
        !userSnapshot.exists ||
        userSnapshot.data()?.role !== "provider" ||
        !providerId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Provider profile is not linked.",
        );
      }
      const providerReference = db.collection("providers").doc(providerId);
      const providerSnapshot = await transaction.get(providerReference);
      const provider = providerSnapshot.data();
      if (!providerSnapshot.exists || provider?.ownerId !== actor.uid) {
        throw new HttpsError(
          "permission-denied",
          "The provider profile does not belong to this account.",
        );
      }
      const legalIdentityChanged =
        provider.businessName !== businessName ||
        stringValue(provider.businessEmail).toLowerCase() !== businessEmail;
      const businessEmailChanged =
        stringValue(provider.businessEmail).toLowerCase() !== businessEmail;
      if (
        legalIdentityChanged &&
        !editableVerificationStatuses.has(String(provider.verificationStatus))
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Verified business identity changes require FEASTA review.",
        );
      }
      const verificationQuery = db.collection("providerVerifications")
        .where("providerId", "==", providerId)
        .limit(1);
      const matchingBusinessEmail = businessEmailChanged
        ? await transaction.get(
            db.collection("providers")
              .where("businessEmail", "==", businessEmail)
              .limit(2),
          )
        : null;
      if (
        matchingBusinessEmail?.docs.some(
          (document) =>
            document.id !== providerId &&
            document.data().ownerId !== actor.uid,
        )
      ) {
        throw new HttpsError(
          "already-exists",
          "Another provider profile already uses this business email.",
        );
      }
      const verificationSnapshot = legalIdentityChanged
        ? await transaction.get(verificationQuery)
        : null;
      transaction.update(userReference, {
        firstName: ownerFirstName,
        lastName: ownerLastName,
        updatedAt: serverTimestamp(),
      });
      transaction.update(providerReference, {
        ownerFirstName,
        ownerLastName,
        businessName,
        businessEmail,
        businessPhone,
        description,
        address,
        city,
        province,
        location: `${city}, ${province}`,
        searchTokens: buildSearchTokens([
          businessName,
          city,
          province,
          stringValue(provider.providerServiceType),
          stringValue(provider.providerCategory),
        ]),
        updatedAt: serverTimestamp(),
      });
      if (verificationSnapshot && !verificationSnapshot.empty) {
        transaction.update(verificationSnapshot.docs[0].ref, {
          businessName,
          updatedAt: serverTimestamp(),
        });
      }
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: "provider",
        action: "provider_account_profile_updated",
        targetCollection: "providers",
        targetId: providerId,
        metadata: {
          fields: [
            "ownerFirstName",
            "ownerLastName",
            "businessName",
            "businessEmail",
            "businessPhone",
            "description",
            "address",
            "city",
            "province",
          ],
          legalIdentityChanged,
        },
      });
    });
    return {success: true, role};
  },
);

export const updateAccountPreferences = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    const role = await requireRole(actor.uid, [
      "customer",
      "provider",
      "admin",
    ]);
    await enforceCallableRateLimit(request, {
      scope: "account.updatePreferences.shared",
      limit: 30,
      windowSeconds: 10 * 60,
    });
    const input = requireObject(request.data ?? {});
    rejectUnknownFields(input, [
      "marketingConsent",
      "pushNotificationsEnabled",
      "emailNotificationsEnabled",
    ]);
    const marketingConsent = requireBoolean(
      input.marketingConsent,
      "marketingConsent",
    );
    const pushNotificationsEnabled = requireBoolean(
      input.pushNotificationsEnabled,
      "pushNotificationsEnabled",
    );
    const emailNotificationsEnabled = requireBoolean(
      input.emailNotificationsEnabled,
      "emailNotificationsEnabled",
    );
    const reference = db.collection("users").doc(actor.uid);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.data()?.role !== role) {
        throw new HttpsError("permission-denied", "Account profile is invalid.");
      }
      transaction.update(reference, {
        marketingConsent,
        pushNotificationsEnabled,
        emailNotificationsEnabled,
        marketingConsentUpdatedAt: serverTimestamp(),
        preferencesUpdatedAt: serverTimestamp(),
        termsPolicyVersion:
          snapshot.data()?.termsPolicyVersion ?? policyVersionPlaceholder,
        privacyPolicyVersion:
          snapshot.data()?.privacyPolicyVersion ?? policyVersionPlaceholder,
        updatedAt: serverTimestamp(),
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: role,
        action: "account_preferences_updated",
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

export const revokeAllAccountSessions = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    const role = await requireRole(actor.uid, [
      "customer",
      "provider",
      "admin",
    ]);
    requireRecentAuthentication(request.auth?.token.auth_time);
    await enforceCallableRateLimit(request, {
      scope: "account.revokeSessions.shared",
      limit: 5,
      windowSeconds: 24 * 60 * 60,
    });
    rejectUnknownFields(requireObject(request.data ?? {}), []);
    await getAuth().revokeRefreshTokens(actor.uid);
    await db.collection("adminLogs").add({
      actorId: actor.uid,
      actorRole: role,
      action: "account_sessions_revoked",
      targetCollection: "users",
      targetId: actor.uid,
      source: "cloud_function",
      createdAt: serverTimestamp(),
    });
    return {success: true};
  },
);

export const deactivateProviderAccount = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["provider"]);
    requireRecentAuthentication(request.auth?.token.auth_time);
    await enforceCallableRateLimit(request, {
      scope: "account.deactivateProvider",
      limit: 3,
      windowSeconds: 24 * 60 * 60,
    });
    const input = requireObject(request.data ?? {});
    rejectUnknownFields(input, ["reason"]);
    const reason = optionalString(input.reason, "reason", 300);
    const userReference = db.collection("users").doc(actor.uid);

    await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userReference);
      const providerId = stringValue(userSnapshot.data()?.providerId);
      if (
        !userSnapshot.exists ||
        userSnapshot.data()?.role !== "provider" ||
        !providerId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Provider profile is not linked.",
        );
      }
      const providerReference = db.collection("providers").doc(providerId);
      const providerSnapshot = await transaction.get(providerReference);
      if (
        !providerSnapshot.exists ||
        providerSnapshot.data()?.ownerId !== actor.uid
      ) {
        throw new HttpsError(
          "permission-denied",
          "Provider ownership could not be verified.",
        );
      }
      const activeObligations = await transaction.get(
        db.collection("providerRequests")
          .where("providerId", "==", providerId)
          .where("status", "in", [...activeProviderRequestStatuses])
          .limit(1),
      );
      if (!activeObligations.empty) {
        throw new HttpsError(
          "failed-precondition",
          "Resolve active event obligations before deactivating this account.",
        );
      }
      transaction.update(userReference, {
        accountStatus: "pending_deletion",
        isActive: false,
        deactivatedAt: serverTimestamp(),
        deactivationReason: reason || null,
        updatedAt: serverTimestamp(),
      });
      transaction.update(providerReference, {
        isActive: false,
        deactivatedAt: serverTimestamp(),
        deactivationReason: reason || null,
        updatedAt: serverTimestamp(),
      });
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: "provider",
        action: "provider_account_deactivated",
        targetCollection: "providers",
        targetId: providerId,
        reason: reason || "provider_requested",
      });
    });
    await getAuth().revokeRefreshTokens(actor.uid);
    return {
      success: true,
      accountStatus: "pending_deletion",
      retentionPolicy:
        "Bookings, payments, disputes, and audit records are retained.",
    };
  },
);

function requiredName(value: unknown, field: string): string {
  return requireString(value, field, {minLength: 1, maxLength: 80});
}

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

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      "businessEmail must be a valid email address.",
    );
  }
  return normalized;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(input).filter((field) => !allowed.includes(field));
  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unsupported account fields: ${unknown.join(", ")}.`,
    );
  }
}

function buildSearchTokens(values: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const word of value.toLowerCase().split(/[^a-z0-9]+/u)) {
      if (!word) continue;
      tokens.add(word);
      for (let length = 2; length <= Math.min(word.length, 20); length++) {
        tokens.add(word.slice(0, length));
      }
    }
  }
  return [...tokens].slice(0, 200);
}
