import {getFirestore} from "firebase-admin/firestore";

export type PackagePaymentPolicyBounds = {
  minimumDepositRateBps: number;
  maximumDepositRateBps: number;

  minimumBalanceDueDaysBeforeEvent:
    number;

  maximumBalanceDueDaysBeforeEvent:
    number;
};

/*
 * Functions cannot safely depend on the web
 * Admin settings implementation at runtime.
 *
 * These fallback values mirror FEASTA's
 * canonical initial platform policy:
 *
 * deposit: 20%–80%
 * balance deadline: 1–30 days
 *
 * A valid stored appSettings/platform policy
 * overrides these values.
 */
export const DEFAULT_PACKAGE_PAYMENT_POLICY_BOUNDS:
  PackagePaymentPolicyBounds = {
    minimumDepositRateBps:
      2_000,

    maximumDepositRateBps:
      8_000,

    minimumBalanceDueDaysBeforeEvent:
      1,

    maximumBalanceDueDaysBeforeEvent:
      30,
  };

export function packagePaymentPolicySettingsReference() {
  return getFirestore()
    .collection("appSettings")
    .doc("platform");
}

export function packagePaymentPolicyBoundsFromData(
  value: unknown,
): PackagePaymentPolicyBounds {
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
    minimumDepositRateBps >
      maximumDepositRateBps
  ) {
    return defaultBounds();
  }

  return {
    minimumDepositRateBps,
    maximumDepositRateBps,
    minimumBalanceDueDaysBeforeEvent: minimumBalanceDueDaysBeforeEvent ?? 1,
    maximumBalanceDueDaysBeforeEvent: maximumBalanceDueDaysBeforeEvent ?? 30,
  };
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
  PackagePaymentPolicyBounds {
  return {
    ...DEFAULT_PACKAGE_PAYMENT_POLICY_BOUNDS,
  };
}