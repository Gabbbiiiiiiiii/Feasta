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
  logWarning,
} from "../shared/logger.js";

import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";

import {
  serverTimestamp,
} from "../shared/timestamps.js";

import {
  normalizePhilippineMobile,
} from "../shared/validation.js";

import {
  linkedAccountTypeForBusinessRegistration,
  providerPayoutCreationFailure,
  PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION,
  shouldCreateProviderPayoutAccount,
  storedChildAccountId,
} from "./provider-payment-account-domain.js";

import {
  payMongoActivationUpdateBody,
  readStoredPayoutActivationProfile,
  rejectBrowserPayoutAuthority,
  validateProviderPayoutActivationProfile,
} from "./provider-payout-activation-profile.js";

import {
  activatePayMongoChildAccount,
  buildPayMongoLinkedAccountSignupUrl,
  createPayMongoChildAccount,
  createPayMongoIdentityVerificationSession,
  findPayMongoLinkedAccountRelationship,
  PayMongoLinkedAccountRequestError,
  retrievePayMongoLinkedAccount,
  retrievePayMongoLinkedAccountInvitation,
  retrievePayMongoLinkedAccountRelationship,
  updatePayMongoChildAccount,
  type PayMongoAccountActivationStatus,
  type PayMongoIdentityVerificationStatus,
  type PayMongoInvitationStatus,
  type PayMongoLinkedAccount,
  type PayMongoLinkedAccountType,
} from "./paymongo-linked-account-client.js";

import {
  providerPaymentRelationshipSnapshot,
} from "./provider-payment-relationship-domain.js";

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
  ownerMobile: string | null;
  businessName: string;
  businessDescription: string;

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
      rejectBrowserPayoutAuthority(
        request.data,
      );

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

              const orgAccountId =
                storedOrgAccountId(
                  existing.paymongoAccountId,
                );

              const existingInvitationId =
                storedInvitationId(
                  existing.invitationId,
                );

              if (
                orgAccountId ||
                existingInvitationId ||
                !shouldCreateProviderPayoutAccount(
                  existing,
                )
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

                  paymongoAccountId:
                    null,

                  activationStatus:
                    null,

                  /*
                   * Historical invitation fields stay untouched.
                   * P10 settlement transport stays disabled until a
                   * verified PayMongo relationship selects a transport.
                   */
                  relationshipId:
                    null,

                  relationshipStatus:
                    "unknown",

                  relationshipLastCheckedAt:
                    null,

                  settlementTransportMode:
                    "disabled",

                  settlementTransportReady:
                    false,

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

                relationshipId:
                  null,

                relationshipStatus:
                  "unknown",

                relationshipLastCheckedAt:
                  null,

                settlementTransportMode:
                  "disabled",

                settlementTransportReady:
                  false,

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
        const existingOrgAccountId =
          storedOrgAccountId(
            reservation.existing
              .paymongoAccountId,
          );

        if (existingOrgAccountId) {
          return resumeChildAccountOnboarding({
            accountReference,
            context,
            accountId:
              existingOrgAccountId,
          });
        }

        return resultFromStoredAccount(
          reservation.existing,
          context.ownerEmail,
        );
      }

      let createdAccountId:
        string | null =
          null;

      try {
        const created =
          await createPayMongoChildAccount({
            secretKey:
              payMongoSecretKey.value(),

            accountType:
              context.linkedAccountType,

            emailAddress:
              context.ownerEmail,

            mobileNumber:
              requireOwnerMobile(
                context,
              ),
          });

        createdAccountId =
          created.accountId;

        await accountReference.update({
          setupStatus:
            "onboarding",

          payoutReady:
            false,

          paymongoAccountId:
            created.accountId,

          relationshipId:
            created.relationshipId,

          activationStatus:
            created.activationStatus,

          identityVerificationStatus:
            created
              .identityVerificationStatus,

          inviteCreationState:
            "created",

          gatewayLastStatusCode:
            null,

          gatewayLastCheckedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        });

        const session =
          await createPayMongoIdentityVerificationSession({
            secretKey:
              payMongoSecretKey.value(),

            accountId:
              created.accountId,
          });

        return {
          setupStatus:
            "onboarding" as const,

          payoutReady:
            false,

          linkedAccountType:
            context.linkedAccountType,

          invitationStatus:
            null,

          activationStatus:
            created.activationStatus,

          onboardingUrl:
            session.hostedUrl,
        };
      }
      catch (error) {
        if (
          error instanceof HttpsError &&
          !createdAccountId
        ) {
          await accountReference.update({
            setupStatus:
              "action_required",

            payoutReady:
              false,

            inviteCreationState:
              "rejected",

            updatedAt:
              serverTimestamp(),
          });

          throw error;
        }

        const gatewayError =
          error instanceof
            PayMongoLinkedAccountRequestError
            ? error
            : null;

        const failure =
          createdAccountId
            ? null
            : providerPayoutCreationFailure({
              certainty:
                gatewayError
                  ?.certainty ??
                null,

              statusCode:
                gatewayError
                  ?.statusCode ??
                null,

              gatewayMessage:
                gatewayError
                  ?.message ??
                null,

              gatewayCode:
                gatewayError
                  ?.gatewayCode ??
                null,

              missingPointers:
                gatewayError
                  ?.missingPointers ??
                [],
            });

        logWarning(
          "Provider payout account creation was not completed.",
          {
            certainty:
              gatewayError
                ?.certainty ??
              null,

            statusCode:
              gatewayError
                ?.statusCode ??
              null,

            gatewayCode:
              gatewayError
                ?.gatewayCode ??
              null,

            safeMessage:
              gatewayError
                ?.message ??
              null,

            reason:
              failure?.reason ??
              null,
          },
        );

        await accountReference.update({
          setupStatus:
            createdAccountId
              ? "action_required"
              : failure?.setupStatus ??
                "action_required",

          payoutReady:
            false,

          inviteCreationState:
            createdAccountId
              ? "created"
              : failure
                ?.inviteCreationState ??
                "ambiguous",

          gatewayLastStatusCode:
            gatewayError
              ?.statusCode ??
            null,

          gatewayLastCheckedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        });

        if (createdAccountId) {
          throw new HttpsError(
            "failed-precondition",
            "The payout account was created, but identity verification could not be started.",
          );
        }

        throw new HttpsError(
          failure?.callableStatus ??
            "internal",
          failure?.message ??
            "The PayMongo account request could not be confirmed. " +
            "FEASTA will not create another account automatically.",
          {
            reason:
              failure?.reason ??
              "payout_setup_unconfirmed",
          },
        );
      }
    },
  );

export const refreshProviderPayoutAccount =
  onCall(
    callableOptions,

    async (request) => {
      rejectBrowserPayoutAuthority(
        request.data,
      );

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

      const orgAccountId =
        storedOrgAccountId(
          stored.paymongoAccountId,
        );

      if (orgAccountId) {
        return refreshChildAccount({
          accountReference,
          context,
          stored,
          accountId:
            orgAccountId,
        });
      }

      const invitationId =
        storedInvitationId(
          stored.invitationId,
        );

      if (!invitationId) {
        throw new HttpsError(
          "failed-precondition",
          "No PayMongo payout account exists yet. Use Set up payouts to create one.",
          {
            reason:
              "payout_setup_missing",
          },
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

      let relationshipId:
        string | null =
          null;

      let relationshipStatus:
        "unknown" |
        "enabled" |
        "disabled" =
          "unknown";

      let relationshipVerificationStatus:
        "not_checked" |
        "verified" |
        "not_found" |
        "unavailable" =
          "not_checked";

      /*
       * Relationship verification is relevant only once the child
       * account itself is activated.
       *
       * Failure to read the relationship does NOT rewrite the
       * canonical account activation result. It only keeps Provider
       * settlement transport unavailable.
       */
      if (setup.payoutReady) {
        try {
          const relationship =
            await findPayMongoLinkedAccountRelationship({
              secretKey:
                payMongoSecretKey.value(),

              childAccountId:
                account.accountId,

              invitationId,
            });

          if (relationship) {
            const verified =
              providerPaymentRelationshipSnapshot({
                storedAccount: {
                  ...stored,

                  invitationId,

                  paymongoAccountId:
                    account.accountId,
                },

                relationship,
              });

            relationshipId =
              verified.relationshipId;

            relationshipStatus =
              verified.status;

            relationshipVerificationStatus =
              "verified";
          } else {
            relationshipVerificationStatus =
              "not_found";
          }
        }
        catch (error) {
          if (
            error instanceof
              PayMongoLinkedAccountRequestError
          ) {
            relationshipVerificationStatus =
              "unavailable";
          } else {
            /*
             * A relationship returned by PayMongo but inconsistent
             * with FEASTA's canonical Provider account is an
             * integrity conflict, not a transient gateway failure.
             */
            throw new HttpsError(
              "failed-precondition",
              "The PayMongo relationship does not match this Provider payout account.",
              {
                reason:
                  "provider_payment_relationship_conflict",
              },
            );
          }
        }
      }

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

        /*
         * Account activation proves onboarding readiness only.
         *
         * Relationship verification is read-only and persists only
         * the relationship identity/status required by FEASTA.
         * No policies, account profile data or bank data are stored.
         */
        relationshipId,

        relationshipStatus,

        relationshipVerificationStatus,

        relationshipLastCheckedAt:
          setup.payoutReady
            ? serverTimestamp()
            : null,

        /*
         * C2B still does NOT choose or enable a money-movement
         * transport. P10-C3 handles transport permissions separately.
         */
        settlementTransportReady:
          false,

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

    ownerMobile:
      normalizePhilippineMobile(
        provider.ownerPhone,
      ) ??
      normalizePhilippineMobile(
        provider.businessPhone,
      ),

    businessName:
      typeof provider.businessName ===
        "string"
        ? provider.businessName
        : "",

    businessDescription:
      typeof provider.description ===
        "string"
        ? provider.description
        : "",

    linkedAccountType,
  };
}

export const saveProviderPayoutActivationProfile =
  onCall(
    callableOptions,

    async (request) => {
      rejectBrowserPayoutAuthority(
        request.data,
      );

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
            "providerFinance.savePayoutActivationProfile",

          limit: 8,

          windowSeconds:
            10 * 60,
        },
      );

      const context =
        await requireProviderFinanceContext(
          actor.uid,
        );

      const profile =
        validateProviderPayoutActivationProfile(
          request.data,
          context.linkedAccountType,
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
          "Start payout setup before submitting activation details.",
        );
      }

      const stored =
        snapshot.data() ??
        {};

      assertStoredAccountOwnership(
        stored,
        context,
      );

      if (
        !storedOrgAccountId(
          stored.paymongoAccountId,
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Create the payout account before submitting activation details.",
        );
      }

      await accountReference.update({
        activationProfile:
          profile,

        updatedAt:
          serverTimestamp(),
      });

      return {
        saved:
          true,
      };
    },
  );

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

function storedOrgAccountId(
  value: unknown,
): string | null {
  return storedChildAccountId(
    value,
  );
}

function storedRelationshipId(
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
    /^mr_[A-Za-z0-9]+$/u
      .test(value)
  ) {
    return value;
  }

  return null;
}

function requireOwnerMobile(
  context: ProviderFinanceContext,
): string {
  if (!context.ownerMobile) {
    throw new HttpsError(
      "failed-precondition",
      "A valid provider mobile number is required before payout setup.",
    );
  }

  return context.ownerMobile;
}

function identityVerificationPassed(
  status:
    PayMongoIdentityVerificationStatus |
    null,
): boolean {
  return (
    status === "passed" ||
    status === "passed_attestation_form" ||
    status === "passed_kyc_reliance"
  );
}

async function resumeChildAccountOnboarding(input: {
  accountReference: {
    update: (data: object) => Promise<unknown>;
  };
  context: ProviderFinanceContext;
  accountId: string;
}): Promise<ProviderPaymentAccountResult> {
  const account =
    await retrieveTrustedChildAccount(
      input.accountId,
      input.context,
    );

  if (
    identityVerificationPassed(
      account.identityVerificationStatus,
    )
  ) {
    await input.accountReference.update({
      setupStatus:
        "action_required",

      payoutReady:
        false,

      identityVerificationStatus:
        account.identityVerificationStatus,

      activationStatus:
        account.activationStatus,

      relationshipId:
        account.relationshipId,

      updatedAt:
        serverTimestamp(),
    });

    return accountsResult(
      input.context,
      "action_required",
      false,
      account.activationStatus,
      null,
    );
  }

  const session =
    await createPayMongoIdentityVerificationSession({
      secretKey:
        payMongoSecretKey.value(),

      accountId:
        account.accountId,
    });

  await input.accountReference.update({
    setupStatus:
      "onboarding",

    payoutReady:
      false,

    identityVerificationStatus:
      account.identityVerificationStatus,

    activationStatus:
      account.activationStatus,

    updatedAt:
      serverTimestamp(),
  });

  return accountsResult(
    input.context,
    "onboarding",
    false,
    account.activationStatus,
    session.hostedUrl,
  );
}

async function refreshChildAccount(input: {
  accountReference: {
    update: (data: object) => Promise<unknown>;
  };
  context: ProviderFinanceContext;
  stored: UnknownRecord;
  accountId: string;
}): Promise<ProviderPaymentAccountResult> {
  let account =
    await retrieveTrustedChildAccount(
      input.accountId,
      input.context,
    );

  /*
   * Temporary payout activation diagnostic.
   * Never log names, DOB, TIN, addresses,
   * account identifiers, or profile contents.
   */

  if (
    account.activationStatus !==
      "activated" &&
    identityVerificationPassed(
      account.identityVerificationStatus,
    ) &&
    account.legalIdentityPresent
  ) {
    const profile =
      readStoredPayoutActivationProfile(
        input.stored.activationProfile,
        input.context.linkedAccountType,
      );

    if (!profile) {
      await input.accountReference.update(
        childAccountUpdate(
          account,
          "action_required",
          false,
        ),
      );

      return accountsResult(
        input.context,
        "action_required",
        false,
        account.activationStatus,
        null,
      );
    }

    try {
      await updatePayMongoChildAccount({
        secretKey:
          payMongoSecretKey.value(),

        accountId:
          account.accountId,

        body:
          payMongoActivationUpdateBody({
            profile,

            emailAddress:
              input.context.ownerEmail,

            mobileNumber:
              requireOwnerMobile(
                input.context,
              ),

            tradeName:
              input.context.businessName,

            description:
              input.context
                .businessDescription,
          }),
      });

      account =
        await activatePayMongoChildAccount({
        secretKey:
          payMongoSecretKey.value(),

        accountId:
          account.accountId,
      });



    }
    catch (error) {
      await input.accountReference.update(
        childAccountUpdate(
          account,
          "action_required",
          false,
          error,
        ),
      );

      throw new HttpsError(
        "failed-precondition",
        activationFailureMessage(
          error,
        ),
      );
    }
  }

  const setup =
    account.activationStatus ===
      "activated"
      ? setupForActivation(
        account.activationStatus,
      )
      : {
        setupStatus:
          identityVerificationPassed(
            account.identityVerificationStatus,
          )
            ? "action_required" as const
            : "onboarding" as const,

        payoutReady:
          false,
      };

  if (
    !identityVerificationPassed(
      account.identityVerificationStatus,
    ) &&
    account.activationStatus !==
      "activated" &&
    account.activationStatus !==
      "declined"
  ) {
    setup.setupStatus = "onboarding";
    setup.payoutReady = false;
  }

  if (
    account.activationStatus ===
      "declined"
  ) {
    setup.setupStatus = "unavailable";
    setup.payoutReady = false;
  }

  let relationshipId =
    account.relationshipId ??
    storedRelationshipId(
      input.stored.relationshipId,
    );

  let relationshipStatus:
    "unknown" | "enabled" | "disabled" =
      "unknown";

  let relationshipVerificationStatus:
    "not_checked" | "verified" | "not_found" | "unavailable" =
      "not_checked";

  if (setup.payoutReady && relationshipId) {
    try {
      const relationship =
        await retrievePayMongoLinkedAccountRelationship({
          secretKey:
            payMongoSecretKey.value(),

          relationshipId,
        });

      if (
        relationship.childAccountId !==
          account.accountId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The PayMongo relationship does not match this Provider payout account.",
        );
      }

      const verified =
        providerPaymentRelationshipSnapshot({
          storedAccount: {
            ...input.stored,
            paymongoAccountId:
              account.accountId,
          },
          relationship,
        });

      relationshipId =
        verified.relationshipId;
      relationshipStatus =
        verified.status;
      relationshipVerificationStatus =
        "verified";
    }
    catch (error) {
      if (
        error instanceof
          PayMongoLinkedAccountRequestError
      ) {
        relationshipVerificationStatus =
          "unavailable";
      } else if (
        error instanceof HttpsError
      ) {
        throw error;
      } else {
        throw new HttpsError(
          "failed-precondition",
          "The PayMongo relationship does not match this Provider payout account.",
        );
      }
    }
  }

  await input.accountReference.update({
    ...childAccountUpdate(
      account,
      setup.setupStatus,
      setup.payoutReady,
    ),

    relationshipId,

    relationshipStatus,

    relationshipVerificationStatus,

    relationshipLastCheckedAt:
      setup.payoutReady
        ? serverTimestamp()
        : null,

    settlementTransportReady:
      false,
  });

  return accountsResult(
    input.context,
    setup.setupStatus,
    setup.payoutReady,
    account.activationStatus,
    null,
  );
}

async function retrieveTrustedChildAccount(
  accountId: string,
  context: ProviderFinanceContext,
): Promise<PayMongoLinkedAccount> {
  let account: PayMongoLinkedAccount;

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
    account.accountId !== accountId ||
    account.accountType !==
      context.linkedAccountType
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The linked PayMongo account type does not match this provider.",
    );
  }

  return account;
}

function childAccountUpdate(
  account: PayMongoLinkedAccount,
  setupStatus:
    ProviderPaymentAccountResult["setupStatus"],
  payoutReady: boolean,
  error: unknown = null,
): Record<string, unknown> {
  const gatewayError =
    error instanceof
      PayMongoLinkedAccountRequestError
      ? error
      : null;

  return {
    setupStatus,

    payoutReady,

    paymongoAccountId:
      account.accountId,

    activationStatus:
      account.activationStatus,

    identityVerificationStatus:
      account.identityVerificationStatus,

    gatewayLastStatusCode:
      gatewayError?.statusCode ??
      null,

    gatewayLastCheckedAt:
      serverTimestamp(),

    updatedAt:
      serverTimestamp(),
  };
}

function accountsResult(
  context: ProviderFinanceContext,
  setupStatus:
    ProviderPaymentAccountResult["setupStatus"],
  payoutReady: boolean,
  activationStatus:
    PayMongoAccountActivationStatus |
    null,
  onboardingUrl: string | null,
): ProviderPaymentAccountResult {
  return {
    setupStatus,
    payoutReady,
    linkedAccountType:
      context.linkedAccountType,
    invitationStatus:
      null,
    activationStatus,
    onboardingUrl,
  };
}

function activationFailureMessage(
  error: unknown,
): string {
  if (
    error instanceof
      PayMongoLinkedAccountRequestError &&
    error.missingPointers.length > 0
  ) {
    return "PayMongo still needs activation details: " +
      error.missingPointers.join(", ");
  }

  return "PayMongo could not activate the payout account yet.";
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
