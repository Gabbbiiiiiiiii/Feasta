import {
  MAX_BALANCE_DUE_DAYS_BEFORE_EVENT,
  MAX_DEPOSIT_RATE_BPS,
  MIN_BALANCE_DUE_DAYS_BEFORE_EVENT,
  MIN_DEPOSIT_RATE_BPS,
} from "@feasta/shared-types";

export type ProviderPackagePaymentPolicyBounds = {
  minimumDepositRateBps: number;
  maximumDepositRateBps: number;

  minimumBalanceDueDaysBeforeEvent:
    number;

  maximumBalanceDueDaysBeforeEvent:
    number;
};

export const DEFAULT_PROVIDER_PACKAGE_PAYMENT_POLICY_BOUNDS:
  ProviderPackagePaymentPolicyBounds = {
    minimumDepositRateBps:
      MIN_DEPOSIT_RATE_BPS,

    maximumDepositRateBps:
      MAX_DEPOSIT_RATE_BPS,

    minimumBalanceDueDaysBeforeEvent:
      MIN_BALANCE_DUE_DAYS_BEFORE_EVENT,

    maximumBalanceDueDaysBeforeEvent:
      MAX_BALANCE_DUE_DAYS_BEFORE_EVENT,
  };

export function providerPackagePaymentPolicyBoundsFromData(
  value: unknown,
): ProviderPackagePaymentPolicyBounds {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return defaultBounds();
  }

  const data =
    value as Record<string, unknown>;

  const minimumDepositRateBps =
    depositRateOrNull(
      data.minimumDepositRateBps,
    );

  const maximumDepositRateBps =
    depositRateOrNull(
      data.maximumDepositRateBps,
    );

  const minimumBalanceDueDaysBeforeEvent =
    balanceDaysOrNull(
      data
        .minimumBalanceDueDaysBeforeEvent,
    );

  const maximumBalanceDueDaysBeforeEvent =
    balanceDaysOrNull(
      data
        .maximumBalanceDueDaysBeforeEvent,
    );

  if (
    minimumDepositRateBps === null ||
    maximumDepositRateBps === null ||
    minimumBalanceDueDaysBeforeEvent ===
      null ||
    maximumBalanceDueDaysBeforeEvent ===
      null ||
    minimumDepositRateBps >
      maximumDepositRateBps ||
    minimumBalanceDueDaysBeforeEvent >
      maximumBalanceDueDaysBeforeEvent
  ) {
    return defaultBounds();
  }

  return {
    minimumDepositRateBps,
    maximumDepositRateBps,
    minimumBalanceDueDaysBeforeEvent,
    maximumBalanceDueDaysBeforeEvent,
  };
}

export function depositRateBpsToPercentage(
  basisPoints: number,
): number {
  return basisPoints / 100;
}

function depositRateOrNull(
  value: unknown,
): number | null {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) < 10_000
  )
    ? value as number
    : null;
}

function balanceDaysOrNull(
  value: unknown,
): number | null {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= 365
  )
    ? value as number
    : null;
}

function defaultBounds():
  ProviderPackagePaymentPolicyBounds {
  return {
    ...DEFAULT_PROVIDER_PACKAGE_PAYMENT_POLICY_BOUNDS,
  };
}