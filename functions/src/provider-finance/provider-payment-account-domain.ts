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

  throw new Error(
    "Provider payment account registration type is invalid.",
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