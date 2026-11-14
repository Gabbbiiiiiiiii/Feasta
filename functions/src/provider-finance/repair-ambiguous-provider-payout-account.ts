import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";

import {
  requireAuth,
} from "../shared/auth.js";

import {
  requireRole,
} from "../shared/authorization.js";

import {
  USER_ROLES,
} from "../shared/constants.js";

import {
  db,
} from "../shared/firestore.js";

import {
  appCheckCallableOptions,
} from "../shared/function-options.js";

import {
  logInfo,
} from "../shared/logger.js";

import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";

import {
  serverTimestamp,
} from "../shared/timestamps.js";

import {
  requireObject,
  requireString,
} from "../shared/validation.js";

import {
  AMBIGUOUS_PROVIDER_PAYOUT_ACCOUNT_REPAIR_REASON,
  planAmbiguousProviderPayoutAccountRepair,
} from "./provider-payment-account-domain.js";

const REPAIR_INPUT_FIELDS = [
  "providerId",
  "expectedUpdatedAtMillis",
  "reason",
] as const;

type RepairInput = {
  providerId: string;
  expectedUpdatedAtMillis: number;
  reason: string;
};

export const repairAmbiguousProviderPayoutAccount =
  onCall(
    appCheckCallableOptions,

    async (request) => {
      const actor =
        requireAuth(request);

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "providerFinance.repairAmbiguousPayoutAccount",

          limit: 6,

          windowSeconds:
            60 * 60,
        },
      );

      await requireRole(
        actor.uid,
        [
          USER_ROLES.admin,
        ],
      );

      const input =
        requireRepairInput(
          request.data,
        );

      const accountReference =
        db
          .collection(
            "providerPaymentAccounts",
          )
          .doc(
            input.providerId,
          );

      const repaired =
        await db.runTransaction(
          async (transaction) => {
            const snapshot =
              await transaction.get(
                accountReference,
              );

            const account =
              snapshot.exists
                ? snapshot.data() ?? null
                : null;

            const patch =
              planAmbiguousProviderPayoutAccountRepair({
                providerId:
                  input.providerId,

                account,

                expectedUpdatedAtMillis:
                  input.expectedUpdatedAtMillis,
              });

            transaction.update(
              accountReference,
              {
                setupStatus:
                  patch.setupStatus,

                payoutReady:
                  patch.payoutReady,

                inviteCreationState:
                  patch.inviteCreationState,

                updatedAt:
                  serverTimestamp(),
              },
            );

            writeAuditLogInTransaction(
              transaction,
              {
                actorId:
                  actor.uid,

                actorRole:
                  USER_ROLES.admin,

                action:
                  "provider_payout_account.ambiguous_setup_repaired",

                targetCollection:
                  "providerPaymentAccounts",

                targetId:
                  input.providerId,

                reason:
                  input.reason,

                before: {
                  setupStatus:
                    "action_required",

                  inviteCreationState:
                    "ambiguous",

                  payoutReady:
                    false,

                  paymongoAccountId:
                    null,

                  invitationId:
                    null,
                },

                after: {
                  setupStatus:
                    patch.setupStatus,

                  inviteCreationState:
                    patch.inviteCreationState,

                  payoutReady:
                    patch.payoutReady,
                },

                metadata: {
                  expectedUpdatedAtMillis:
                    input.expectedUpdatedAtMillis,
                },
              },
            );

            return {
              providerId:
                input.providerId,

              setupStatus:
                patch.setupStatus,

              inviteCreationState:
                patch.inviteCreationState,

              payoutReady:
                patch.payoutReady,
            };
          },
        );

      logInfo(
        "Repaired an ambiguous provider payout account for one new setup attempt.",
        {
          providerId:
            repaired.providerId,

          action:
            "provider_payout_account.ambiguous_setup_repaired",
        },
      );

      return repaired;
    },
  );

function requireRepairInput(
  value: unknown,
): RepairInput {
  const input =
    requireObject(
      value,
      "data",
    );

  const unexpected =
    Object.keys(input)
      .filter((key) =>
        !REPAIR_INPUT_FIELDS.includes(
          key as typeof REPAIR_INPUT_FIELDS[number],
        ),
      );

  if (unexpected.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      "Unexpected payout repair fields.",
    );
  }

  const providerId =
    requireString(
      input.providerId,
      "providerId",
      {
        minLength: 1,
        maxLength: 220,
      },
    );

  if (
    !/^[A-Za-z0-9:_-]+$/u
      .test(providerId)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "providerId is invalid.",
    );
  }

  const expectedUpdatedAtMillis =
    input.expectedUpdatedAtMillis;

  if (
    typeof expectedUpdatedAtMillis !==
      "number" ||
    !Number.isSafeInteger(
      expectedUpdatedAtMillis,
    ) ||
    expectedUpdatedAtMillis <= 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "expectedUpdatedAtMillis must be the inspected update time.",
    );
  }

  if (
    input.reason !==
      AMBIGUOUS_PROVIDER_PAYOUT_ACCOUNT_REPAIR_REASON
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The operator confirmation reason is required.",
    );
  }

  return {
    providerId,
    expectedUpdatedAtMillis,
    reason:
      AMBIGUOUS_PROVIDER_PAYOUT_ACCOUNT_REPAIR_REASON,
  };
}
