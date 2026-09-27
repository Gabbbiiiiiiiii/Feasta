import {
  defineSecret,
} from "firebase-functions/params";

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  requireAuth,
} from "../shared/auth.js";

import {
  requireRole,
} from "../shared/authorization.js";

import {
  isApprovedProviderForOperations,
  USER_ROLES,
} from "../shared/constants.js";

import {
  appCheckCallableOptions,
} from "../shared/function-options.js";

import {
  db,
} from "../shared/firestore.js";

import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";

import {
  serverTimestamp,
} from "../shared/timestamps.js";

import {
  linkedAccountTypeForBusinessRegistration,
  PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION,
} from "./provider-payment-account-domain.js";

import {
  buildPayMongoLinkedAccountSignupUrl,
  createPayMongoLinkedAccountInvite,
  PayMongoLinkedAccountRequestError,
  retrievePayMongoLinkedAccount,
  retrievePayMongoLinkedAccountInvitation,
  type PayMongoAccountActivationStatus,
  type PayMongoInvitationStatus,
  type PayMongoLinkedAccountType,
} from "./paymongo-linked-account-client.js";

const payMongoSecretKey =
  defineSecret(
    "PAYMONGO_SECRET_KEY",
  );

const callableOptions = {
  ...appCheckCallableOptions,

  secrets: [
    payMongoSecretKey,
  ],

  timeoutSeconds: 30,
};

type UnknownRecord =
  Record<string, unknown>;

type ProviderFinanceContext = {
  providerId: string;
  ownerId: string;
  ownerEmail: string;

  linkedAccountType:
    PayMongoLinkedAccountType;
};

type ProviderPaymentAccountResult = {
  setupStatus:
    "not_started" |
    "onboarding" |
    "action_required" |
    "ready" |
    "unavailable";

  payoutReady:
    boolean;

  linkedAccountType:
    PayMongoLinkedAccountType;

  invitationStatus:
    PayMongoInvitationStatus |
    null;

  activationStatus:
    PayMongoAccountActivationStatus |
    null;

  onboardingUrl:
    string | null;
};

export const startProviderPayoutOnboarding =
  onCall(
    callableOptions,

    async (request) => {
      const actor =
        requireAuth(
          request,
        );

      await requireRole(
        actor.uid,
        [
          USER_ROLES.provider,
        ],
      );

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "providerFinance.startPayoutOnboarding",

          limit: 4,

          windowSeconds:
            10 * 60,
        },
      );

      const context =
        await requireProviderFinanceContext(
          actor.uid,
        );

      const accountReference =
        db
          .collection(
            "providerPaymentAccounts",
          )
          .doc(
            context.providerId,
          );

      const reservation =
        await db.runTransaction(
          async (transaction) => {
            const snapshot =
              await transaction.get(
                accountReference,
              );

            if (snapshot.exists) {
              const existing =
                snapshot.data() ??
                {};

              assertStoredAccountOwnership(
                existing,
                context,
              );

              const status =
                storedSetupStatus(
                  existing.setupStatus,
                );

              const invitationStatus =
                storedInvitationStatus(
                  existing.invitationStatus,
                );

              if (
                status === "ready" ||
                status === "onboarding" ||
                status ===
                  "action_required"
              ) {
                return {
                  createInvite:
                    false,

                  existing,
                };
              }

              if (
                status === "unavailable" &&
                invitationStatus !==
                  "declined" &&
                invitationStatus !==
                  "cancelled"
              ) {
                return {
                  createInvite:
                    false,

                  existing,
                };
              }

              transaction.update(
                accountReference,
                {
                  schemaVersion:
                    PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION,

                  providerId:
                    context.providerId,

                  ownerId:
                    context.ownerId,

                  linkedAccountType:
                    context
                      .linkedAccountType,

                  setupStatus:
                    "onboarding",

                  payoutReady:
                    false,

                  invitationId:
                    null,

                  invitationStatus:
                    null,

                  paymongoAccountId:
                    null,

                  activationStatus:
                    null,

                  inviteCreationState:
                    "creating",

                  updatedAt:
                    serverTimestamp(),
                },
              );

              return {
                createInvite:
                  true,

                existing:
                  null,
              };
            }

            transaction.create(
              accountReference,
              {
                schemaVersion:
                  PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION,

                providerId:
                  context.providerId,

                ownerId:
                  context.ownerId,

                linkedAccountType:
                  context
                    .linkedAccountType,

                setupStatus:
                  "onboarding",

                payoutReady:
                  false,

                invitationId:
                  null,

                invitationStatus:
                  null,

                paymongoAccountId:
                  null,

                activationStatus:
                  null,

                inviteCreationState:
                  "creating",

                createdAt:
                  serverTimestamp(),

                updatedAt:
                  serverTimestamp(),
              },
            );

            return {
              createInvite:
                true,

              existing:
                null,
            };
          },
        );

      if (
        !reservation.createInvite &&
        reservation.existing
      ) {
        return resultFromStoredAccount(
          reservation.existing,
          context.ownerEmail,
        );
      }

      try {
        const invitation =
          await createPayMongoLinkedAccountInvite({
            secretKey:
              payMongoSecretKey.value(),

            email:
              context.ownerEmail,

            accountType:
              context.linkedAccountType,
          });

        await accountReference.update({
          setupStatus:
            "onboarding",

          payoutReady:
            false,

          invitationId:
            invitation.invitationId,

          invitationStatus:
            invitation.status,

          paymongoAccountId:
            invitation.childAccountId,

          activationStatus:
            null,

          inviteCreationState:
            "created",

          gatewayLastCheckedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        });

        return {
          setupStatus:
            "onboarding" as const,

          payoutReady:
            false,

          linkedAccountType:
            context.linkedAccountType,

          invitationStatus:
            invitation.status,

          activationStatus:
            null,

          onboardingUrl:
            buildPayMongoLinkedAccountSignupUrl({
              email:
                context.ownerEmail,

              invitationId:
                invitation.invitationId,
            }),
        };
      }
      catch (error) {
        const gatewayError =
          error instanceof
            PayMongoLinkedAccountRequestError
            ? error
            : null;

        const setupStatus =
          gatewayError?.certainty ===
            "gateway_rejected"
            ? "unavailable"
            : "action_required";

        await accountReference.update({
          setupStatus,

          payoutReady:
            false,

          inviteCreationState:
            gatewayError?.certainty ===
              "gateway_rejected"
              ? "rejected"
              : "ambiguous",

          gatewayLastStatusCode:
            gatewayError
              ?.statusCode ??
            null,

          gatewayLastCheckedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        });

        if (
          setupStatus ===
            "unavailable"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "PayMongo Linked Accounts onboarding is not available for this provider right now.",
          );
        }

        throw new HttpsError(
          "unavailable",
          "The PayMongo onboarding request could not be confirmed. " +
          "FEASTA will not create another invitation automatically.",
        );
      }
    },
  );

export const refreshProviderPayoutAccount =
  onCall(
    callableOptions,

    async (request) => {
      const actor =
        requireAuth(
          request,
        );

      await requireRole(
        actor.uid,
        [
          USER_ROLES.provider,
        ],
      );

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "providerFinance.refreshPayoutAccount",

          limit: 12,

          windowSeconds:
            10 * 60,
        },
      );

      const context =
        await requireProviderFinanceContext(
          actor.uid,
        );

      const accountReference =
        db
          .collection(
            "providerPaymentAccounts",
          )
          .doc(
            context.providerId,
          );

      const snapshot =
        await accountReference.get();

      if (!snapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Start payout onboarding before checking its status.",
        );
      }

      const stored =
        snapshot.data() ??
        {};

      assertStoredAccountOwnership(
        stored,
        context,
      );

      const invitationId =
        storedInvitationId(
          stored.invitationId,
        );

      if (!invitationId) {
        throw new HttpsError(
          "failed-precondition",
          "The payout onboarding invitation needs manual review before it can be refreshed.",
        );
      }

      let invitation;

      try {
        invitation =
          await retrievePayMongoLinkedAccountInvitation({
            secretKey:
              payMongoSecretKey.value(),

            invitationId,
          });
      }
      catch {
        throw new HttpsError(
          "unavailable",
          "The latest PayMongo onboarding status could not be retrieved.",
        );
      }

      if (
        invitation.email !==
          context.ownerEmail ||
        invitation.accountType !==
          context.linkedAccountType
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The PayMongo linked-account invitation no longer matches this provider.",
        );
      }

      if (
        invitation.status ===
          "pending"
      ) {
        const update = {
          setupStatus:
            "onboarding",

          payoutReady:
            false,

          invitationStatus:
            "pending",

          paymongoAccountId:
            invitation
              .childAccountId,

          activationStatus:
            null,

          gatewayLastCheckedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        } as const;

        await accountReference.update(
          update,
        );

        return {
          setupStatus:
            "onboarding" as const,

          payoutReady:
            false,

          linkedAccountType:
            context.linkedAccountType,

          invitationStatus:
            "pending" as const,

          activationStatus:
            null,

          onboardingUrl:
            buildPayMongoLinkedAccountSignupUrl({
              email:
                context.ownerEmail,

              invitationId,
            }),
        };
      }

      if (
        invitation.status ===
          "declined" ||
        invitation.status ===
          "cancelled"
      ) {
        await accountReference.update({
          setupStatus:
            "unavailable",

          payoutReady:
            false,

          invitationStatus:
            invitation.status,

          paymongoAccountId:
            invitation
              .childAccountId,

          activationStatus:
            null,

          gatewayLastCheckedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        });

        return {
          setupStatus:
            "unavailable" as const,

          payoutReady:
            false,

          linkedAccountType:
            context.linkedAccountType,

          invitationStatus:
            invitation.status,

          activationStatus:
            null,

          onboardingUrl:
            null,
        };
      }

      const accountId =
        invitation.childAccountId;

      if (
        !accountId ||
        !/^org_[A-Za-z0-9_-]{3,200}$/u
          .test(accountId)
      ) {
        await accountReference.update({
          setupStatus:
            "action_required",

          payoutReady:
            false,

          invitationStatus:
            invitation.status,

          paymongoAccountId:
            accountId,

          activationStatus:
            null,

          gatewayLastCheckedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        });

        return {
          setupStatus:
            "action_required" as const,

          payoutReady:
            false,

          linkedAccountType:
            context.linkedAccountType,

          invitationStatus:
            invitation.status,

          activationStatus:
            null,

          onboardingUrl:
            null,
        };
      }

      let account;

      try {
        account =
          await retrievePayMongoLinkedAccount({
            secretKey:
              payMongoSecretKey.value(),

            accountId,
          });
      }
      catch {
        throw new HttpsError(
          "unavailable",
          "The linked PayMongo account status could not be retrieved.",
        );
      }

      if (
        account.accountType !==
          context.linkedAccountType
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The linked PayMongo account type does not match this provider.",
        );
      }

      const setup =
        setupForActivation(
          account.activationStatus,
        );

      await accountReference.update({
        setupStatus:
          setup.setupStatus,

        payoutReady:
          setup.payoutReady,

        invitationStatus:
          invitation.status,

        paymongoAccountId:
          account.accountId,

        activationStatus:
          account
            .activationStatus,

        gatewayLastCheckedAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      });

      return {
        setupStatus:
          setup.setupStatus,

        payoutReady:
          setup.payoutReady,

        linkedAccountType:
          context.linkedAccountType,

        invitationStatus:
          invitation.status,

        activationStatus:
          account.activationStatus,

        onboardingUrl:
          null,
      };
    },
  );

async function requireProviderFinanceContext(
  actorUid: string,
): Promise<ProviderFinanceContext> {
  const userReference =
    db
      .collection("users")
      .doc(actorUid);

  const userSnapshot =
    await userReference.get();

  if (!userSnapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "Provider account is unavailable.",
    );
  }

  const user =
    userSnapshot.data() ??
    {};

  const providerId =
    safeId(
      user.providerId,
    );

  if (!providerId) {
    throw new HttpsError(
      "failed-precondition",
      "Complete Provider registration before configuring payouts.",
    );
  }

  const providerSnapshot =
    await db
      .collection("providers")
      .doc(providerId)
      .get();

  if (!providerSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Provider profile is unavailable.",
    );
  }

  const provider =
    providerSnapshot.data() ??
    {};

  if (
    provider.ownerId !==
      actorUid ||
    !isApprovedProviderForOperations(
      provider,
    )
  ) {
    throw new HttpsError(
      "permission-denied",
      "Only an approved active Provider may configure payouts.",
    );
  }

  const ownerEmail =
    normalizeEmail(
      provider.ownerEmail,
    );

  const linkedAccountType =
    linkedAccountTypeForBusinessRegistration(
      provider.businessRegistrationType,
    );

  return {
    providerId,

    ownerId:
      actorUid,

    ownerEmail,

    linkedAccountType,
  };
}

function assertStoredAccountOwnership(
  account: UnknownRecord,
  context:
    ProviderFinanceContext,
): void {
  if (
    account.schemaVersion !==
      PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION ||
    account.providerId !==
      context.providerId ||
    account.ownerId !==
      context.ownerId ||
    account.linkedAccountType !==
      context.linkedAccountType
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Stored payout-account linkage is invalid.",
    );
  }
}

function resultFromStoredAccount(
  account: UnknownRecord,
  ownerEmail: string,
): ProviderPaymentAccountResult {
  const setupStatus =
    storedSetupStatus(
      account.setupStatus,
    );

  if (!setupStatus) {
    throw new HttpsError(
      "failed-precondition",
      "Stored payout-account status is invalid.",
    );
  }

  const invitationStatus =
    storedInvitationStatus(
      account.invitationStatus,
    );

  const activationStatus =
    storedActivationStatus(
      account.activationStatus,
    );

  const invitationId =
    storedInvitationId(
      account.invitationId,
    );

  return {
    setupStatus,

    payoutReady:
      setupStatus === "ready" &&
      account.payoutReady ===
        true,

    linkedAccountType:
      account.linkedAccountType as
        PayMongoLinkedAccountType,

    invitationStatus,

    activationStatus,

    onboardingUrl:
      invitationId &&
      invitationStatus ===
        "pending"
        ? buildPayMongoLinkedAccountSignupUrl({
            email:
              ownerEmail,

            invitationId,
          })
        : null,
  };
}

function setupForActivation(
  status:
    PayMongoAccountActivationStatus,
): {
  setupStatus:
    "onboarding" |
    "ready" |
    "unavailable";

  payoutReady:
    boolean;
} {
  if (
    status === "activated"
  ) {
    return {
      setupStatus:
        "ready",

      payoutReady:
        true,
    };
  }

  if (
    status === "declined"
  ) {
    return {
      setupStatus:
        "unavailable",

      payoutReady:
        false,
    };
  }

  return {
    setupStatus:
      "onboarding",

    payoutReady:
      false,
  };
}

function storedSetupStatus(
  value: unknown,
):
  | "not_started"
  | "onboarding"
  | "action_required"
  | "ready"
  | "unavailable"
  | null {
  if (
    value === "not_started" ||
    value === "onboarding" ||
    value === "action_required" ||
    value === "ready" ||
    value === "unavailable"
  ) {
    return value;
  }

  return null;
}

function storedInvitationStatus(
  value: unknown,
): PayMongoInvitationStatus | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new HttpsError(
    "failed-precondition",
    "Stored PayMongo invitation status is invalid.",
  );
}

function storedActivationStatus(
  value: unknown,
): PayMongoAccountActivationStatus | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    value === "pending" ||
    value === "under_review" ||
    value === "activated" ||
    value === "declined"
  ) {
    return value;
  }

  throw new HttpsError(
    "failed-precondition",
    "Stored PayMongo activation status is invalid.",
  );
}

function storedInvitationId(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    /^lr_[A-Za-z0-9_-]{3,200}$/u
      .test(value)
  ) {
    return value;
  }

  throw new HttpsError(
    "failed-precondition",
    "Stored PayMongo invitation identity is invalid.",
  );
}

function safeId(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return /^[A-Za-z0-9:_-]{1,220}$/u
    .test(normalized)
    ? normalized
    : null;
}

function normalizeEmail(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider owner email is unavailable.",
    );
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
      .test(normalized)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider owner email is invalid.",
    );
  }

  return normalized;
}