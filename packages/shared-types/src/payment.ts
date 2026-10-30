/**
 * Canonical FEASTA payment/business primitives.
 *
 * Money crossing a trust boundary uses integer centavos.
 * Percentage rates use basis points:
 *
 * 10_000 bps = 100%
 * 1_000 bps  = 10%
 * 1_200 bps  = 12%
 */
export const PACKAGE_PAYMENT_POLICIES = [
  "full_payment",
  "deposit_then_balance",
] as const;

export type PackagePaymentPolicy =
  (typeof PACKAGE_PAYMENT_POLICIES)[number];

export const CUSTOMER_PAYMENT_CHOICES = [
  "minimum",
  "full",
  "remaining_balance",
] as const;

export type CustomerPaymentChoice =
  (typeof CUSTOMER_PAYMENT_CHOICES)[number];

export const TAX_REGISTRATION_STATUSES = [
  "non_vat",
  "vat_registered",
] as const;

export type TaxRegistrationStatus =
  (typeof TAX_REGISTRATION_STATUSES)[number];

export const CENTAVOS_PER_PESO = 100;

export const BASIS_POINTS_SCALE =
  10_000;

export const FULL_PAYMENT_RATE_BPS =
  BASIS_POINTS_SCALE;

export const MIN_DEPOSIT_RATE_BPS =
  2_000;

export const MAX_DEPOSIT_RATE_BPS =
  8_000;

export const MIN_BALANCE_DUE_DAYS_BEFORE_EVENT =
  1;

export const MAX_BALANCE_DUE_DAYS_BEFORE_EVENT =
  30;

/**
 * Initial FEASTA business-policy defaults.
 *
 * These are defaults only. Later phases will load
 * versioned Admin/platform configuration instead
 * of permanently relying on these constants.
 */
export const DEFAULT_PLATFORM_COMMISSION_RATE_BPS =
  1_000;

export const DEFAULT_PLATFORM_VAT_RATE_BPS =
  1_200;

export function parsePackagePaymentPolicy(
  value: unknown,
): PackagePaymentPolicy | null {
  return (
    PACKAGE_PAYMENT_POLICIES as
      readonly unknown[]
  ).includes(value)
    ? value as PackagePaymentPolicy
    : null;
}

export function parseCustomerPaymentChoice(
  value: unknown,
): CustomerPaymentChoice | null {
  return (
    CUSTOMER_PAYMENT_CHOICES as
      readonly unknown[]
  ).includes(value)
    ? value as CustomerPaymentChoice
    : null;
}

export function parseTaxRegistrationStatus(
  value: unknown,
): TaxRegistrationStatus | null {
  return (
    TAX_REGISTRATION_STATUSES as
      readonly unknown[]
  ).includes(value)
    ? value as TaxRegistrationStatus
    : null;
}

export function pesosToCentavos(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  const centavos =
    Math.round(
      value * CENTAVOS_PER_PESO,
    );

  if (
    !Number.isSafeInteger(
      centavos,
    )
  ) {
    return null;
  }

  return centavos;
}

export function centavosToPesos(
  value: unknown,
): number | null {
  if (
    !isNonNegativeSafeInteger(
      value,
    )
  ) {
    return null;
  }

  return (
    value /
    CENTAVOS_PER_PESO
  );
}

export function percentageToBasisPoints(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return null;
  }

  const basisPoints =
    Math.round(
      value * 100,
    );

  if (
    !Number.isSafeInteger(
      basisPoints,
    )
  ) {
    return null;
  }

  return basisPoints;
}

export function basisPointsToPercentage(
  value: unknown,
): number | null {
  if (!isBasisPointRate(value)) {
    return null;
  }

  return value / 100;
}

export function isAllowedDepositRateBps(
  value: unknown,
): value is number {
  return (
    isBasisPointRate(value) &&
    value >=
      MIN_DEPOSIT_RATE_BPS &&
    value <=
      MAX_DEPOSIT_RATE_BPS
  );
}

export function isAllowedBalanceDueDays(
  value: unknown,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >=
      MIN_BALANCE_DUE_DAYS_BEFORE_EVENT &&
    (value as number) <=
      MAX_BALANCE_DUE_DAYS_BEFORE_EVENT
  );
}

/**
 * Applies a rate to integer centavos using
 * deterministic half-up centavo rounding.
 */
export function applyBasisPoints(
  amountInCentavos: unknown,
  rateBps: unknown,
): number | null {
  if (
    !isNonNegativeSafeInteger(
      amountInCentavos,
    ) ||
    !isBasisPointRate(
      rateBps,
    )
  ) {
    return null;
  }

  const product =
    amountInCentavos *
    rateBps;

  if (
    !Number.isSafeInteger(
      product,
    )
  ) {
    return null;
  }

  return Math.floor(
    (
      product +
      BASIS_POINTS_SCALE / 2
    ) /
      BASIS_POINTS_SCALE,
  );
}

/**
 * Allocates a percentage against cumulative
 * collected value.
 *
 * This avoids rounding drift where:
 *
 * deposit commission
 * +
 * balance commission
 *
 * would otherwise differ from the commission
 * calculated on one full payment.
 */
export function allocateCumulativeBasisPoints(
  input: {
    currentBaseInCentavos: number;
    cumulativeBaseBeforeInCentavos: number;
    alreadyAllocatedInCentavos: number;
    rateBps: number;
  },
): number | null {
  const {
    currentBaseInCentavos,
    cumulativeBaseBeforeInCentavos,
    alreadyAllocatedInCentavos,
    rateBps,
  } = input;

  if (
    !isNonNegativeSafeInteger(
      currentBaseInCentavos,
    ) ||
    !isNonNegativeSafeInteger(
      cumulativeBaseBeforeInCentavos,
    ) ||
    !isNonNegativeSafeInteger(
      alreadyAllocatedInCentavos,
    ) ||
    !isBasisPointRate(
      rateBps,
    )
  ) {
    return null;
  }

  const cumulativeBaseAfter =
    cumulativeBaseBeforeInCentavos +
    currentBaseInCentavos;

  if (
    !Number.isSafeInteger(
      cumulativeBaseAfter,
    )
  ) {
    return null;
  }

  const targetAfter =
    applyBasisPoints(
      cumulativeBaseAfter,
      rateBps,
    );

  if (
    targetAfter === null ||
    targetAfter <
      alreadyAllocatedInCentavos
  ) {
    return null;
  }

  return (
    targetAfter -
    alreadyAllocatedInCentavos
  );
}

function isBasisPointRate(
  value: unknown,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <=
      BASIS_POINTS_SCALE
  );
}

function isNonNegativeSafeInteger(
  value: unknown,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  );
}
