import {
  HttpsError,
} from "firebase-functions/v2/https";

export const PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION =
  1 as const;

export const PROVIDER_PAYMENT_ACCOUNT_SETUP_STATUSES = [
  "not_started",
  "onboarding",
  "action_required",
  "ready",
  "unavailable",
] as const;

export type ProviderPaymentAccountSetupStatus =
  typeof PROVIDER_PAYMENT_ACCOUNT_SETUP_STATUSES[number];

export type ProviderLinkedAccountType =
  | "consumer"
  | "merchant";

export type ProviderPayoutReadinessReason =
  | "payout_setup_missing"
  | "payout_setup_invalid"
  | "payout_setup_not_ready";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

/*
 * FEASTA business-registration state remains independent
 * from provider tax status.
 *
 * PayMongo account kind:
 * - individual/freelance -> consumer
 * - registered business -> merchant
 */
export function linkedAccountTypeForBusinessRegistration(
  businessRegistrationType:
    unknown,
): ProviderLinkedAccountType {
  if (
    businessRegistrationType ===
      "individual"
  ) {
    return "consumer";
  }

  if (
    businessRegistrationType ===
      "registered_business"
  ) {
    return "merchant";
  }

  throw new HttpsError(
    "failed-precondition",
    "Complete your business registration type before setting up payouts.",
  );
}

export function providerPayoutReadinessReason(
  input: {
    payoutSetupRequired:
      boolean;

    providerId:
      string;

    account:
      UnknownRecord | null;
  },
): ProviderPayoutReadinessReason | null {
  if (
    input.payoutSetupRequired !==
      true
  ) {
    return null;
  }

  if (!input.account) {
    return "payout_setup_missing";
  }

  const providerId =
    safeId(
      input.providerId,
    );

  if (
    !providerId ||
    input.account.schemaVersion !==
      PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION ||
    input.account.providerId !==
      providerId
  ) {
    return "payout_setup_invalid";
  }

  const setupStatus =
    paymentAccountSetupStatus(
      input.account.setupStatus,
    );

  const parsedLinkedAccountType =
    linkedAccountType(
      input.account.linkedAccountType,
    );

  if (
    !setupStatus ||
    !parsedLinkedAccountType
  ) {
    return "payout_setup_invalid";
  }

  if (
    setupStatus !== "ready" ||
    input.account.payoutReady !==
      true
  ) {
    return "payout_setup_not_ready";
  }

  /*
   * Ready accounts must have a safe external account
   * reference. P9-B will create and refresh this value
   * through trusted PayMongo server calls.
   */
  if (
    !safeExternalReference(
      input.account.paymongoAccountId,
    )
  ) {
    return "payout_setup_invalid";
  }

  return null;
}

export function isSafeProviderPaymentAccountReference(
  value: unknown,
): boolean {
  return Boolean(
    safeExternalReference(value),
  );
}

const CHILD_ACCOUNT_ID =
  /^org_[A-Za-z0-9_-]{3,200}$/u;

export const PAYOUT_GATEWAY_NOT_CONFIGURED_MESSAGE =
  "PAYMONGO_SECRET_KEY is not configured. " +
  "Set that Firebase secret before payout setup can create a child account.";

export const PAYOUT_GATEWAY_AUTHENTICATION_FAILED_MESSAGE =
  "PayMongo authentication failed. Verify the configured server secret key.";

export const PAYOUT_GATEWAY_FORBIDDEN_MESSAGE =
  "The PayMongo parent account is not permitted to create this child account.";

export const PAYOUT_GATEWAY_NOT_FOUND_MESSAGE =
  "PayMongo could not start payout setup. Please try again. " +
  "If the problem continues, the payout integration configuration " +
  "needs to be checked.";

export const PAYOUT_GATEWAY_NOT_FOUND_DIAGNOSTIC =
  "PayMongo returned HTTP 404 while creating the payout account.";

export const PAYOUT_GATEWAY_UPSTREAM_MESSAGE =
  "PayMongo did not confirm the payout account request. " +
  "FEASTA will not create another account automatically.";

export type ProviderPayoutCreationFailure = {
  setupStatus:
    "action_required" |
    "unavailable";

  inviteCreationState:
    "rejected" |
    "ambiguous";

  callableStatus:
    "failed-precondition" |
    "internal" |
    "resource-exhausted" |
    "unavailable";

  reason:
    | "payout_gateway_not_configured"
    | "payout_gateway_authentication_failed"
    | "payout_gateway_forbidden"
    | "paymongo_account_endpoint_not_found"
    | "paymongo_account_response_invalid"
    | "payout_gateway_rate_limited"
    | "payout_gateway_upstream"
    | "payout_setup_not_ready"
    | "payout_setup_unconfirmed";

  message: string;

  diagnostic:
    string | null;
};

/*
 * A missing child-account id is not payout readiness.
 * Retry creation only when PayMongo has not been left in an
 * unknown state. A rejected attempt may be tried again when
 * no external account was stored. An ambiguous attempt may not.
 */
export function shouldCreateProviderPayoutAccount(
  account: UnknownRecord | null,
): boolean {
  if (!account) {
    return true;
  }

  if (
    storedChildAccountId(
      account.paymongoAccountId,
    )
  ) {
    return false;
  }

  if (
    account.inviteCreationState ===
      "ambiguous" ||
    account.inviteCreationState ===
      "creating"
  ) {
    return false;
  }

  if (
    account.inviteCreationState ===
      "rejected"
  ) {
    return true;
  }

  const setupStatus =
    paymentAccountSetupStatus(
      account.setupStatus,
    );

  return (
    setupStatus !== "ready" &&
    setupStatus !== "onboarding" &&
    setupStatus !== "action_required"
  );
}

export function storedChildAccountId(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    !CHILD_ACCOUNT_ID.test(value)
  ) {
    return null;
  }

  return value;
}

export const AMBIGUOUS_PROVIDER_PAYOUT_ACCOUNT_REPAIR_REASON =
  "Operator confirmed no PayMongo test child account exists " +
  "after ambiguous Create Account attempt.";

/*
 * Same stored shape as a definitive rejected Create Account
 * attempt. shouldCreateProviderPayoutAccount allows rejected
 * attempts that stored no child account, and blocks ambiguous
 * attempts until this explicit repair runs.
 */
export type AmbiguousProviderPayoutAccountRepairPatch = {
  setupStatus:
    "action_required";

  payoutReady:
    false;

  inviteCreationState:
    "rejected";
};

export function planAmbiguousProviderPayoutAccountRepair(
  input: {
    providerId:
      string;

    account:
      UnknownRecord | null;

    expectedUpdatedAtMillis:
      number;
  },
): AmbiguousProviderPayoutAccountRepairPatch {
  if (!input.account) {
    throw new HttpsError(
      "not-found",
      "Provider payout account was not found.",
    );
  }

  const account =
    input.account;

  if (
    account.providerId !==
      input.providerId ||
    account.schemaVersion !==
      PROVIDER_PAYMENT_ACCOUNT_SCHEMA_VERSION
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account is not eligible for ambiguous setup repair.",
    );
  }

  const updatedAtMillis =
    inspectedUpdatedAtMillis(
      account.updatedAt,
    );

  if (
    updatedAtMillis === null ||
    updatedAtMillis !==
      input.expectedUpdatedAtMillis
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account changed since it was inspected.",
    );
  }

  if (
    account.setupStatus !==
      "action_required" ||
    account.inviteCreationState !==
      "ambiguous"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account is not an ambiguous setup awaiting repair.",
    );
  }

  if (account.payoutReady === true) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account is already payout ready.",
    );
  }

  if (account.payoutReady !== false) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account is not eligible for ambiguous setup repair.",
    );
  }

  if (
    hasStoredPayoutIdentity(
      account.paymongoAccountId,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account already stores a PayMongo account id.",
    );
  }

  if (
    hasStoredPayoutIdentity(
      account.invitationId,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account already stores an invitation id.",
    );
  }

  if (hasSettlementIdentity(account)) {
    throw new HttpsError(
      "failed-precondition",
      "Provider payout account already stores settlement identity.",
    );
  }

  return {
    setupStatus:
      "action_required",

    payoutReady:
      false,

    inviteCreationState:
      "rejected",
  };
}

function inspectedUpdatedAtMillis(
  value: unknown,
): number | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const timestampLike =
    value as {
      toMillis?: () => unknown;
    };

  if (
    typeof timestampLike.toMillis !==
    "function"
  ) {
    return null;
  }

  const millis =
    timestampLike.toMillis();

  if (
    typeof millis !== "number" ||
    !Number.isSafeInteger(millis) ||
    millis <= 0
  ) {
    return null;
  }

  return millis;
}

function hasStoredPayoutIdentity(
  value: unknown,
): boolean {
  return (
    value !== undefined &&
    value !== null
  );
}

function hasSettlementIdentity(
  account: UnknownRecord,
): boolean {
  if (
    hasStoredPayoutIdentity(
      account.relationshipId,
    )
  ) {
    return true;
  }

  if (
    account.relationshipStatus ===
      "enabled" ||
    account.relationshipStatus ===
      "disabled"
  ) {
    return true;
  }

  if (
    account.settlementTransportReady ===
      true
  ) {
    return true;
  }

  return (
    account.settlementTransportMode ===
      "wallet_transfer" ||
    account.settlementTransportMode ===
      "workflow"
  );
}

export function providerPayoutCreationFailure(
  input: {
    certainty:
      "gateway_rejected" |
      "ambiguous" |
      null;

    statusCode:
      number | null;

    gatewayMessage:
      string | null;

    gatewayCode?:
      string | null;

    missingPointers?:
      readonly string[];
  },
): ProviderPayoutCreationFailure {
  const gatewayMessage =
    input.gatewayMessage ?? "";

  const gatewayCode =
    safeGatewayCode(
      input.gatewayCode,
    );

  if (
    input.certainty ===
      "gateway_rejected" &&
    (
      input.statusCode === null &&
      gatewayMessage ===
        "PayMongo secret key is not configured."
    )
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "failed-precondition",

      reason:
        "payout_gateway_not_configured",

      message:
        PAYOUT_GATEWAY_NOT_CONFIGURED_MESSAGE,

      diagnostic:
        null,
    };
  }

  if (
    input.certainty ===
      "gateway_rejected" &&
    input.statusCode === 401
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "failed-precondition",

      reason:
        "payout_gateway_authentication_failed",

      message:
        PAYOUT_GATEWAY_AUTHENTICATION_FAILED_MESSAGE,

      diagnostic:
        null,
    };
  }

  if (
    input.certainty ===
      "gateway_rejected" &&
    input.statusCode === 403
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "failed-precondition",

      reason:
        "payout_gateway_forbidden",

      message:
        PAYOUT_GATEWAY_FORBIDDEN_MESSAGE,

      diagnostic:
        null,
    };
  }

  if (
    input.certainty ===
      "gateway_rejected" &&
    input.statusCode === 404
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "failed-precondition",

      reason:
        "paymongo_account_endpoint_not_found",

      message:
        PAYOUT_GATEWAY_NOT_FOUND_MESSAGE,

      diagnostic:
        PAYOUT_GATEWAY_NOT_FOUND_DIAGNOSTIC,
    };
  }

  if (
    input.statusCode === 400 &&
    input.certainty ===
      "gateway_rejected"
  ) {
    const pointers =
      input.missingPointers ?? [];

    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "failed-precondition",

      reason:
        "payout_setup_not_ready",

      message:
        payoutPayloadMessage(
          pointers,
          gatewayCode,
        ),

      diagnostic:
        gatewayCode,
    };
  }

  if (
    input.statusCode === 429
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "resource-exhausted",

      reason:
        "payout_gateway_rate_limited",

      message:
        "PayMongo rate limited payout setup. Wait a moment and try again.",

      diagnostic:
        gatewayCode,
    };
  }

  if (
    input.statusCode === 409
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "ambiguous",

      callableStatus:
        "failed-precondition",

      reason:
        "payout_setup_unconfirmed",

      message:
        "PayMongo reported a conflict while creating the payout account. " +
        "FEASTA will not create another account automatically.",

      diagnostic:
        gatewayCode,
    };
  }

  if (
    isDefinitiveLocalPayoutRejection(
      gatewayMessage,
    )
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "failed-precondition",

      reason:
        "payout_setup_not_ready",

      message:
        gatewayMessage,

      diagnostic:
        null,
    };
  }

  if (
    input.certainty ===
      "ambiguous" &&
    isPayMongoAccountContractFailure(
      gatewayMessage,
    )
  ) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "ambiguous",

      callableStatus:
        "failed-precondition",

      reason:
        "paymongo_account_response_invalid",

      message:
        gatewayMessage,

      diagnostic:
        gatewayMessage,
    };
  }

  if (
    input.certainty ===
      "gateway_rejected"
  ) {
    const pointers =
      input.missingPointers ?? [];

    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "rejected",

      callableStatus:
        "failed-precondition",

      reason:
        "payout_setup_not_ready",

      message:
        payoutPayloadMessage(
          pointers,
          gatewayCode,
        ),

      diagnostic:
        gatewayCode,
    };
  }

  const upstream =
    (
      input.statusCode !== null &&
      (
        input.statusCode >= 500 ||
        input.statusCode === 408
      )
    ) ||
    gatewayMessage ===
      "PayMongo linked-account request outcome is unknown.";

  if (upstream) {
    return {
      setupStatus:
        "action_required",

      inviteCreationState:
        "ambiguous",

      callableStatus:
        "unavailable",

      reason:
        "payout_gateway_upstream",

      message:
        PAYOUT_GATEWAY_UPSTREAM_MESSAGE,

      diagnostic:
        null,
    };
  }

  return {
    setupStatus:
      "action_required",

    inviteCreationState:
      "ambiguous",

    callableStatus:
      "internal",

    reason:
      "payout_setup_unconfirmed",

    message:
      "The PayMongo account request could not be confirmed. " +
      "FEASTA will not create another account automatically.",

    diagnostic:
      null,
  };
}

function safeGatewayCode(
  value: string | null | undefined,
): string | null {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9_]{1,64}$/u.test(value)
  ) {
    return null;
  }

  return value;
}

function payoutPayloadMessage(
  pointers: readonly string[],
  gatewayCode: string | null,
): string {
  if (pointers.length > 0) {
    return "PayMongo could not create the payout account. Check: " +
      pointers.join(", ") +
      ".";
  }

  if (gatewayCode) {
    return "PayMongo could not create the payout account (" +
      gatewayCode +
      ").";
  }

  return "PayMongo could not create the payout account.";
}

function isDefinitiveLocalPayoutRejection(
  message: string,
): boolean {
  return (
    message ===
      "PayMongo invitation email is invalid." ||
    message ===
      "PayMongo mobile number is invalid."
  );
}

function isPayMongoAccountContractFailure(
  message: string,
): boolean {
  return (
    message.startsWith("PayMongo ") &&
    message !==
      "PayMongo linked-account request failed." &&
    message !==
      "PayMongo linked-account request outcome is unknown." &&
    message !==
      "PayMongo secret key is not configured." &&
    !isDefinitiveLocalPayoutRejection(
      message,
    )
  );
}

function paymentAccountSetupStatus(
  value: unknown,
): ProviderPaymentAccountSetupStatus | null {
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

function linkedAccountType(
  value: unknown,
): ProviderLinkedAccountType | null {
  if (
    value === "consumer" ||
    value === "merchant"
  ) {
    return value;
  }

  return null;
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

function safeExternalReference(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  /*
   * Store gateway identifiers only.
   * Never store credentials, passwords,
   * bank passwords, card numbers or CVV.
   */
  if (
    normalized.length < 3 ||
    normalized.length > 220 ||
    !/^[A-Za-z0-9:_-]+$/u
      .test(normalized)
  ) {
    return null;
  }

  return normalized;
}