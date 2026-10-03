import type {
  DocumentData,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  authorizeOwnedPackage,
  authorizeProviderForPackageManagement,
} from "../packages/package-domain.js";
import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  USER_ROLES,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  requireString,
} from "../shared/validation.js";
import {
  buildNextRefundPolicy,
  effectiveRefundPolicyKey,
  parseRefundPolicyDraft,
  parseStoredRefundPolicy,
  type RefundPolicyDraft,
} from "./refund-policy-domain.js";

const PROVIDER_INPUT_FIELDS = new Set([
  "policy",
  "idempotencyKey",
]);

const PACKAGE_INPUT_FIELDS = new Set([
  "packageId",
  "override",
  "idempotencyKey",
]);

const PACKAGE_POLICY_EDITABLE_STATUSES =
  new Set([
    "draft",
    "published",
  ]);

export const publishProviderRefundPolicy = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);

    await requireRole(
      actor.uid,
      [USER_ROLES.provider],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "refundPolicies.publishProviderDefault",
        limit: 30,
        windowSeconds: 60 * 60,
      },
    );

    const input = requireInputObject(
      request.data,
    );

    rejectUnknownFields(
      input,
      PROVIDER_INPUT_FIELDS,
    );

    const draft = parseRefundPolicyDraft(
      input.policy,
    );

    const clientIdempotencyKey =
      requireString(
        input.idempotencyKey,
        "idempotencyKey",
        {
          minLength: 8,
          maxLength: 200,
        },
      );

    const executionKey =
      createIdempotencyKey({
        operation:
          "publishProviderRefundPolicy",
        actorId: actor.uid,
        clientKey:
          clientIdempotencyKey,
        payload: {policy: draft},
      });

    const execution =
      await executeIdempotently({
        key: executionKey,
        operation:
          "publishProviderRefundPolicy",
        actorId: actor.uid,
        handler: () =>
          publishProviderPolicy({
            actorUid: actor.uid,
            draft,
          }),
      });

    return {
      ...execution.result,
      idempotentReplay:
        execution.replayed,
    };
  },
);

export const setPackageRefundPolicyOverride = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);

    await requireRole(
      actor.uid,
      [USER_ROLES.provider],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "refundPolicies.setPackageOverride",
        limit: 60,
        windowSeconds: 60 * 60,
      },
    );

    const input = requireInputObject(
      request.data,
    );

    rejectUnknownFields(
      input,
      PACKAGE_INPUT_FIELDS,
    );

    const packageId = requireDocumentId(
      input.packageId,
      "packageId",
    );

    if (!Object.hasOwn(input, "override")) {
      throw new HttpsError(
        "invalid-argument",
        "Package refund policy override is required.",
      );
    }

    const override = input.override === null
      ? null
      : parseRefundPolicyDraft(
          input.override,
        );

    const clientIdempotencyKey =
      requireString(
        input.idempotencyKey,
        "idempotencyKey",
        {
          minLength: 8,
          maxLength: 200,
        },
      );

    const executionKey =
      createIdempotencyKey({
        operation:
          "setPackageRefundPolicyOverride",
        actorId: actor.uid,
        clientKey:
          clientIdempotencyKey,
        payload: {
          packageId,
          override,
        },
      });

    const execution =
      await executeIdempotently({
        key: executionKey,
        operation:
          "setPackageRefundPolicyOverride",
        actorId: actor.uid,
        handler: () =>
          setPackagePolicyOverride({
            actorUid: actor.uid,
            packageId,
            override,
          }),
      });

    return {
      ...execution.result,
      idempotentReplay:
        execution.replayed,
    };
  },
);

async function publishProviderPolicy(
  input: {
    actorUid: string;
    draft: RefundPolicyDraft;
  },
): Promise<Record<string, unknown>> {
  const userReference = db
    .collection("users")
    .doc(input.actorUid);

  return db.runTransaction(
    async (transaction) => {
      const userSnapshot =
        await transaction.get(
          userReference,
        );

      const providerId =
        requireCanonicalProviderId(
          userSnapshot.data(),
        );

      const providerReference = db
        .collection("providers")
        .doc(providerId);

      const providerSnapshot =
        await transaction.get(
          providerReference,
        );

      const provider =
        authorizeProviderForPackageManagement(
          {
            actorUid: input.actorUid,
            providerSnapshot,
          },
        );

      const currentPolicy =
        parseStoredRefundPolicy(
          provider.providerData
            .refundPolicy,
          "Provider refund policy",
        );

      const timestamp =
        serverTimestamp();

      const nextPolicy =
        buildNextRefundPolicy({
          currentPolicyVersion:
            currentPolicy
              ?.policyVersion ?? null,
          draft: input.draft,
          effectiveAt: timestamp,
        });

      transaction.update(
        providerReference,
        {
          refundPolicy: nextPolicy,
          updatedAt: timestamp,
        },
      );

      writeAuditLogInTransaction(
        transaction,
        {
          actorId: input.actorUid,
          actorRole: "provider",
          action:
            "refund_policy.published",
          targetCollection: "providers",
          targetId: provider.providerId,
          before: {
            policyVersion:
              currentPolicy
                ?.policyVersion ?? null,
          },
          after: {
            policyVersion:
              nextPolicy.policyVersion,
          },
          metadata: {
            providerId:
              provider.providerId,
          },
        },
      );

      return {
        success: true,
        providerId:
          provider.providerId,
        policyVersion:
          nextPolicy.policyVersion,
        effectivePolicyKey:
          effectiveRefundPolicyKey({
            kind: "provider_default",
            sourceId:
              provider.providerId,
            policyVersion:
              nextPolicy.policyVersion,
          }),
      };
    },
  );
}

async function setPackagePolicyOverride(
  input: {
    actorUid: string;
    packageId: string;
    override: RefundPolicyDraft | null;
  },
): Promise<Record<string, unknown>> {
  const userReference = db
    .collection("users")
    .doc(input.actorUid);

  const packageReference = db
    .collection("packages")
    .doc(input.packageId);

  return db.runTransaction(
    async (transaction) => {
      const userSnapshot =
        await transaction.get(
          userReference,
        );

      const providerId =
        requireCanonicalProviderId(
          userSnapshot.data(),
        );

      const providerReference = db
        .collection("providers")
        .doc(providerId);

      const [
        providerSnapshot,
        packageSnapshot,
      ] = await Promise.all([
        transaction.get(
          providerReference,
        ),
        transaction.get(
          packageReference,
        ),
      ]);

      const provider =
        authorizeProviderForPackageManagement(
          {
            actorUid: input.actorUid,
            providerSnapshot,
          },
        );

      const packageRecord =
        authorizeOwnedPackage({
          providerId:
            provider.providerId,
          packageSnapshot,
        });

      if (
        !PACKAGE_POLICY_EDITABLE_STATUSES
          .has(packageRecord.status)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Archived package policies cannot be changed.",
        );
      }

      const providerPolicy =
        parseStoredRefundPolicy(
          provider.providerData
            .refundPolicy,
          "Provider refund policy",
        );

      if (!providerPolicy) {
        throw new HttpsError(
          "failed-precondition",
          "Create a Provider default refund policy before managing package overrides.",
        );
      }

      const currentOverride =
        parseStoredRefundPolicy(
          packageRecord.packageData
            .refundPolicyOverride,
          "Package refund policy override",
        );

      const versionFloor =
        packageOverrideVersionFloor(
          packageRecord.packageData,
          currentOverride?.policyVersion ??
            null,
        );

      const providerEffectiveKey =
        effectiveRefundPolicyKey({
          kind: "provider_default",
          sourceId:
            provider.providerId,
          policyVersion:
            providerPolicy.policyVersion,
        });

      if (!input.override) {
        if (!currentOverride) {
          return {
            success: true,
            packageId: input.packageId,
            overrideRemoved: false,
            effectivePolicyKey:
              providerEffectiveKey,
          };
        }

        const timestamp =
          serverTimestamp();

        transaction.update(
          packageReference,
          {
            refundPolicyOverride: null,
            refundPolicyOverrideVersion:
              versionFloor,
            updatedAt: timestamp,
          },
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId: input.actorUid,
            actorRole: "provider",
            action:
              "refund_policy.override_removed",
            targetCollection: "packages",
            targetId: input.packageId,
            before: {
              policyVersion:
                currentOverride
                  .policyVersion,
            },
            after: {
              policyVersion: null,
            },
            metadata: {
              providerId:
                provider.providerId,
              packageId:
                input.packageId,
              fallbackPolicyVersion:
                providerPolicy
                  .policyVersion,
            },
          },
        );

        return {
          success: true,
          packageId: input.packageId,
          overrideRemoved: true,
          effectivePolicyKey:
            providerEffectiveKey,
        };
      }

      const timestamp =
        serverTimestamp();

      const nextOverride =
        buildNextRefundPolicy({
          currentPolicyVersion:
            versionFloor === 0
              ? null
              : versionFloor,
          draft: input.override,
          effectiveAt: timestamp,
        });

      transaction.update(
        packageReference,
        {
          refundPolicyOverride:
            nextOverride,
          refundPolicyOverrideVersion:
            nextOverride.policyVersion,
          updatedAt: timestamp,
        },
      );

      writeAuditLogInTransaction(
        transaction,
        {
          actorId: input.actorUid,
          actorRole: "provider",
          action:
            "refund_policy.override_published",
          targetCollection: "packages",
          targetId: input.packageId,
          before: {
            policyVersion:
              currentOverride
                ?.policyVersion ?? null,
          },
          after: {
            policyVersion:
              nextOverride.policyVersion,
          },
          metadata: {
            providerId:
              provider.providerId,
            packageId:
              input.packageId,
          },
        },
      );

      return {
        success: true,
        packageId: input.packageId,
        overrideRemoved: false,
        policyVersion:
          nextOverride.policyVersion,
        effectivePolicyKey:
          effectiveRefundPolicyKey({
            kind: "package_override",
            sourceId: input.packageId,
            policyVersion:
              nextOverride.policyVersion,
          }),
      };
    },
  );
}

function requireCanonicalProviderId(
  userData: DocumentData | undefined,
): string {
  if (
    !userData ||
    userData.role !==
      USER_ROLES.provider ||
    typeof userData.providerId !==
      "string" ||
    userData.providerId.trim() === ""
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider business setup is incomplete.",
    );
  }

  return requireDocumentId(
    userData.providerId,
    "Provider",
  );
}

function packageOverrideVersionFloor(
  packageData:
    Readonly<Record<string, unknown>>,
  currentPolicyVersion: number | null,
): number {
  const storedCounter =
    packageData
      .refundPolicyOverrideVersion;

  if (
    storedCounter === undefined ||
    storedCounter === null
  ) {
    return currentPolicyVersion ?? 0;
  }

  if (
    !Number.isSafeInteger(storedCounter) ||
    (storedCounter as number) < 1 ||
    (
      currentPolicyVersion !== null &&
      storedCounter !==
        currentPolicyVersion
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The package refund policy version is invalid.",
    );
  }

  return storedCounter as number;
}

function requireInputObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Refund policy request is invalid.",
    );
  }

  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Readonly<
    Record<string, unknown>
  >,
  allowed: ReadonlySet<string>,
): void {
  if (
    Object.keys(value).some(
      (field) => !allowed.has(field),
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Refund policy request contains unsupported fields.",
    );
  }
}

function requireDocumentId(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${field} identifier is invalid.`,
    );
  }

  const normalized = value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/u.test(
      normalized,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} identifier is invalid.`,
    );
  }

  return normalized;
}
