import type {DocumentData} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {authorizeProviderForPackageManagement} from "../packages/package-domain.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {createIdempotencyKey, executeIdempotently} from "../shared/idempotency.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireString} from "../shared/validation.js";
import {
  buildNextRefundPolicy,
  buildUnifiedCutoffRefundRules,
  parseStoredRefundPolicy,
} from "../refund-policies/refund-policy-domain.js";
import {
  CANCELLATION_POLICY_SCHEMA_VERSION,
  CANCELLATION_POLICY_SETTINGS_DOC_ID,
  parseAdminCancellationPolicyDraft,
  parseProviderCancellationPolicyDraft,
  parseStoredAdminCancellationPolicy,
  parseStoredProviderCancellationPolicy,
  type AdminDefaultCancellationPolicyDraft,
} from "./cancellation-policy-domain.js";

const ADMIN_INPUT_FIELDS = new Set([
  "policy",
  "idempotencyKey",
]);

const PROVIDER_INPUT_FIELDS = new Set([
  "policy",
  "idempotencyKey",
]);

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

function requireInputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Request payload must be an object.");
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new HttpsError("invalid-argument", `Unsupported field: ${key}.`);
    }
  }
}

function requireCanonicalProviderId(userData: DocumentData | undefined): string {
  const providerId = typeof userData?.providerId === "string"
    ? userData.providerId.trim()
    : "";
  if (!providerId || !SAFE_DOCUMENT_ID.test(providerId)) {
    throw new HttpsError(
      "failed-precondition",
      "Your Provider account is not linked to an active business profile.",
    );
  }
  return providerId;
}

export const updateAdminDefaultCancellationPolicy = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    await enforceCallableRateLimit(request, {
      scope: "cancellationPolicy.updateAdminDefault",
      limit: 30,
      windowSeconds: 60 * 60,
    });

    const input = requireInputObject(request.data);
    rejectUnknownFields(input, ADMIN_INPUT_FIELDS);

    const draft = parseAdminCancellationPolicyDraft(input.policy);
    const clientIdempotencyKey = requireString(input.idempotencyKey, "idempotencyKey", {
      minLength: 8,
      maxLength: 200,
    });

    const executionKey = createIdempotencyKey({
      operation: "updateAdminDefaultCancellationPolicy",
      actorId: actor.uid,
      clientKey: clientIdempotencyKey,
      payload: {policy: draft},
    });

    const execution = await executeIdempotently({
      key: executionKey,
      operation: "updateAdminDefaultCancellationPolicy",
      actorId: actor.uid,
      handler: () => saveAdminDefaultPolicy({actorUid: actor.uid, draft}),
    });

    return {
      ...execution.result,
      idempotentReplay: execution.replayed,
    };
  },
);

export const saveProviderCancellationPolicy = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "cancellationPolicy.saveProviderPolicy",
      limit: 30,
      windowSeconds: 60 * 60,
    });

    const input = requireInputObject(request.data);
    rejectUnknownFields(input, PROVIDER_INPUT_FIELDS);

    const clientIdempotencyKey = requireString(input.idempotencyKey, "idempotencyKey", {
      minLength: 8,
      maxLength: 200,
    });

    const executionKey = createIdempotencyKey({
      operation: "saveProviderCancellationPolicy",
      actorId: actor.uid,
      clientKey: clientIdempotencyKey,
      payload: {policy: input.policy ?? null},
    });

    const execution = await executeIdempotently({
      key: executionKey,
      operation: "saveProviderCancellationPolicy",
      actorId: actor.uid,
      handler: () =>
        persistProviderCancellationPolicy({
          actorUid: actor.uid,
          rawPolicy: input.policy,
        }),
    });

    return {
      ...execution.result,
      idempotentReplay: execution.replayed,
    };
  },
);

async function saveAdminDefaultPolicy(input: {
  actorUid: string;
  draft: AdminDefaultCancellationPolicyDraft;
}): Promise<Record<string, unknown>> {
  const settingsRef = db
    .collection("appSettings")
    .doc(CANCELLATION_POLICY_SETTINGS_DOC_ID);

  return db.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(settingsRef);
    const current = existingSnap.exists
      ? parseStoredAdminCancellationPolicy(existingSnap.data())
      : null;

    const nextVersion = current ? current.policyVersion + 1 : 1;
    const timestamp = serverTimestamp();

    const nextDoc = {
      schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
      policyVersion: nextVersion,
      defaultCutoffHoursBeforeEvent: input.draft.defaultCutoffHoursBeforeEvent,
      minCutoffHoursBeforeEvent: input.draft.minCutoffHoursBeforeEvent,
      maxCutoffHoursBeforeEvent: input.draft.maxCutoffHoursBeforeEvent,
      guidanceNote: input.draft.guidanceNote,
      isPublic: false,
      updatedAt: timestamp,
      updatedBy: input.actorUid,
    };

    transaction.set(settingsRef, nextDoc);

    writeAuditLogInTransaction(transaction, {
      actorId: input.actorUid,
      actorRole: "admin",
      action: "cancellation_policy.admin_default_updated",
      targetCollection: "appSettings",
      targetId: CANCELLATION_POLICY_SETTINGS_DOC_ID,
      before: current
        ? {
            policyVersion: current.policyVersion,
            defaultCutoffHoursBeforeEvent: current.defaultCutoffHoursBeforeEvent,
            minCutoffHoursBeforeEvent: current.minCutoffHoursBeforeEvent,
            maxCutoffHoursBeforeEvent: current.maxCutoffHoursBeforeEvent,
          }
        : null,
      after: {
        policyVersion: nextVersion,
        defaultCutoffHoursBeforeEvent: input.draft.defaultCutoffHoursBeforeEvent,
        minCutoffHoursBeforeEvent: input.draft.minCutoffHoursBeforeEvent,
        maxCutoffHoursBeforeEvent: input.draft.maxCutoffHoursBeforeEvent,
      },
    });

    return {
      success: true,
      policyVersion: nextVersion,
      defaultCutoffHoursBeforeEvent: input.draft.defaultCutoffHoursBeforeEvent,
      minCutoffHoursBeforeEvent: input.draft.minCutoffHoursBeforeEvent,
      maxCutoffHoursBeforeEvent: input.draft.maxCutoffHoursBeforeEvent,
      guidanceNote: input.draft.guidanceNote,
    };
  });
}

async function persistProviderCancellationPolicy(input: {
  actorUid: string;
  rawPolicy: unknown;
}): Promise<Record<string, unknown>> {
  const userRef = db.collection("users").doc(input.actorUid);
  const adminPolicyRef = db
    .collection("appSettings")
    .doc(CANCELLATION_POLICY_SETTINGS_DOC_ID);

  return db.runTransaction(async (transaction) => {
    const [userSnap, adminPolicySnap] = await transaction.getAll(
      userRef,
      adminPolicyRef,
    );

    const providerId = requireCanonicalProviderId(userSnap.data());
    const providerRef = db.collection("providers").doc(providerId);
    const providerSnap = await transaction.get(providerRef);

    const provider = authorizeProviderForPackageManagement({
      actorUid: input.actorUid,
      providerSnapshot: providerSnap,
    });

    const adminPolicy = parseStoredAdminCancellationPolicy(
      adminPolicySnap.exists ? adminPolicySnap.data() : null,
    );

    const draft = parseProviderCancellationPolicyDraft(input.rawPolicy, adminPolicy);
    const current = parseStoredProviderCancellationPolicy(
      provider.providerData.cancellationPolicy,
    );

    const nextVersion = current ? current.policyVersion + 1 : 1;
    const timestamp = serverTimestamp();

    const nextPolicy = draft.mode === "admin_default"
      ? {
          schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
          mode: "admin_default" as const,
          policyVersion: nextVersion,
          effectiveAt: timestamp,
        }
      : {
          schemaVersion: CANCELLATION_POLICY_SCHEMA_VERSION,
          mode: "provider_custom" as const,
          cutoffHoursBeforeEvent: draft.cutoffHoursBeforeEvent,
          policyVersion: nextVersion,
          effectiveAt: timestamp,
        };

    const effectiveCutoffHoursBeforeEvent =
      nextPolicy.mode === "provider_custom"
        ? nextPolicy.cutoffHoursBeforeEvent
        : adminPolicy.defaultCutoffHoursBeforeEvent;

    const existingRefundPolicy = parseStoredRefundPolicy(
      provider.providerData.refundPolicy,
      "Provider refund policy",
    );

    const providerUpdates: Record<string, unknown> = {
      cancellationPolicy: nextPolicy,
      updatedAt: timestamp,
    };

    if (existingRefundPolicy) {
      const syncedRules = buildUnifiedCutoffRefundRules({
        beforeCutoffBasisPoints:
          existingRefundPolicy.rules[0].refundBasisPoints,
        effectiveCutoffHoursBeforeEvent,
      });
      const rulesChanged = syncedRules.some(
        (rule, index) =>
          existingRefundPolicy.rules[index]?.refundBasisPoints !==
            rule.refundBasisPoints,
      );
      if (rulesChanged) {
        providerUpdates.refundPolicy = buildNextRefundPolicy({
          currentPolicyVersion: existingRefundPolicy.policyVersion,
          draft: {
            rules: syncedRules,
            terms: existingRefundPolicy.terms,
          },
          effectiveAt: timestamp,
        });
      }
    }

    transaction.update(providerRef, providerUpdates);

    writeAuditLogInTransaction(transaction, {
      actorId: input.actorUid,
      actorRole: "provider",
      action: "cancellation_policy.provider_updated",
      targetCollection: "providers",
      targetId: provider.providerId,
      before: current
        ? {
            mode: current.mode,
            cutoffHoursBeforeEvent:
              current.mode === "provider_custom"
                ? current.cutoffHoursBeforeEvent
                : null,
            policyVersion: current.policyVersion,
          }
        : null,
      after: {
        mode: nextPolicy.mode,
        cutoffHoursBeforeEvent:
          nextPolicy.mode === "provider_custom"
            ? nextPolicy.cutoffHoursBeforeEvent
            : null,
        policyVersion: nextVersion,
      },
      metadata: {
        providerId: provider.providerId,
        adminPolicyVersion: adminPolicy.policyVersion,
      },
    });

    return {
      success: true,
      providerId: provider.providerId,
      mode: nextPolicy.mode,
      cutoffHoursBeforeEvent:
        nextPolicy.mode === "provider_custom"
          ? nextPolicy.cutoffHoursBeforeEvent
          : null,
      effectiveCutoffHoursBeforeEvent:
        nextPolicy.mode === "provider_custom"
          ? nextPolicy.cutoffHoursBeforeEvent
          : adminPolicy.defaultCutoffHoursBeforeEvent,
      policyVersion: nextVersion,
    };
  });
}
