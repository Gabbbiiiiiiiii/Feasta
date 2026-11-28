import {Timestamp} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {fail} from "./occasion-suggestion-v2-core.js";

const PROVIDER_ID = /^[A-Za-z0-9_-]{1,128}$/u;

/**
 * Admin-only bootstrap of an empty provider eligibility authority.
 *
 * This operation grants no occasions and no service categories.
 * It must be completed before the separate audited Grant/Revoke flow.
 *
 * Deliberately not exported from functions/src/index.ts until reviewed.
 */
export const initializeProviderOccasionAuthority = onCall(
  appCheckCallableOptions,
  async (request) => {
    const {uid} = requireAuth(request);

    if (!request.app) {
      fail("APP_CHECK_REQUIRED", "unauthenticated");
    }

    await requireRole(uid, ["admin"]);

    await enforceCallableRateLimit(request, {
      scope: "providerOccasionAuthority.initialize",
      limit: 20,
      windowSeconds: 3600,
    });

    const input: unknown = request.data;

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      fail("INVALID_AUTHORITY_INITIALIZATION", "invalid-argument");
    }

    const values = input as Record<string, unknown>;

    if (
      Object.keys(values).length !== 2 ||
      !Object.hasOwn(values, "providerId") ||
      !Object.hasOwn(values, "reason") ||
      typeof values.providerId !== "string" ||
      !PROVIDER_ID.test(values.providerId) ||
      typeof values.reason !== "string" ||
      values.reason.trim().length < 10 ||
      values.reason.trim().length > 500
    ) {
      fail("INVALID_AUTHORITY_INITIALIZATION", "invalid-argument");
    }

    const providerId = values.providerId;
    const reason = values.reason.trim();

    return db.runTransaction(async (tx) => {
      const adminRef = db.collection("users").doc(uid);
      const providerRef = db.collection("providers").doc(providerId);
      const authorityRef = db
        .collection("providerEligibilityAuthorities")
        .doc(providerId);

      const [adminSnap, providerSnap, authoritySnap] =
        await Promise.all([
          tx.get(adminRef),
          tx.get(providerRef),
          tx.get(authorityRef),
        ]);

      const admin = adminSnap.data();
      const provider = providerSnap.data();

      if (
        resolveBackendAccountState({
          authDisabled: false,
          profile: admin,
          allowedRoles: ["admin"],
        }).kind !== "active"
      ) {
        fail("ADMIN_REQUIRED", "permission-denied");
      }

      if (authoritySnap.exists) {
        fail("AUTHORITY_ALREADY_INITIALIZED", "already-exists");
      }

      if (
        !provider ||
        typeof provider.ownerId !== "string" ||
        !PROVIDER_ID.test(provider.ownerId)
      ) {
        fail("PROVIDER_NOT_APPROVED", "failed-precondition");
      }

      const ownerSnap = await tx.get(
        db.collection("users").doc(provider.ownerId),
      );

      const owner = ownerSnap.data();

      if (
        owner?.providerId !== providerId ||
        owner.role !== "provider" ||
        resolveBackendAccountState({
          authDisabled: false,
          profile: owner,
          allowedRoles: ["provider"],
        }).kind !== "active" ||
        !["approved", "verified"].includes(provider.verificationStatus) ||
        provider.isActive !== true ||
        provider.isBlocked === true ||
        provider.isSuspended === true ||
        provider.isDeleted === true
      ) {
        fail("PROVIDER_NOT_APPROVED", "failed-precondition");
      }

      const now = Timestamp.now();

      // A newly initialized provider has NO approval grants.
      tx.create(authorityRef, {
        revision: 1,
        approvedOccasionIds: [],
        approvedCategoryCodes: [],
        initializedBy: uid,
        initializedAt: now,
        updatedAt: now,
      });

      tx.create(
        db.collection("providerOccasionCapabilityAudits").doc(),
        {
          action: "authority_initialized",
          actorUid: uid,
          providerId,
          reason,
          beforeRevision: null,
          afterRevision: 1,
          approvedOccasionIds: [],
          approvedCategoryCodes: [],
          createdAt: now,
        },
      );

      return {
        providerId,
        providerEligibilityRevision: 1,
        approvedOccasionIds: [],
        approvedCategoryCodes: [],
      };
    });
  },
);