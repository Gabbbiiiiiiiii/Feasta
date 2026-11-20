/**
 * FEASTA provider-friendly tiered capped commission.
 *
 * Keep boundary math aligned with
 * packages/shared-types/src/payment.ts.
 */

export const PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1 =
  "tiered_capped_2pct_v1" as const;

export type PlatformCommissionModel =
  typeof PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1;

export const DEFAULT_PLATFORM_COMMISSION_MODEL:
  PlatformCommissionModel =
  PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1;

export const DEFAULT_PLATFORM_COMMISSION_RATE_BPS =
  200;

const BASIS_POINTS_SCALE = 10_000;

/** ₱25,000 inclusive. */
export const TIERED_COMMISSION_PURE_RATE_MAX_CENTAVOS =
  2_500_000;

/** ₱75,000 inclusive. */
export const TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS =
  7_500_000;

/** ₱100,000 inclusive absolute-cap floor. */
export const TIERED_COMMISSION_ABSOLUTE_CAP_MIN_CENTAVOS =
  10_000_000;

/** ₱500. */
export const TIERED_COMMISSION_STANDARD_CAP_CENTAVOS =
  50_000;

/** ₱1,000. */
export const TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS =
  100_000;

export function parsePlatformCommissionModel(
  value: unknown,
): PlatformCommissionModel | null {
  return value ===
    PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1
    ? PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1
    : null;
}

export function computeTieredCappedCommissionInCentavos(
  grossAmountInCentavos: number,
  rateBps:
    number =
      DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
): number {
  if (
    !Number.isSafeInteger(
      grossAmountInCentavos,
    ) ||
    grossAmountInCentavos < 0
  ) {
    throw new Error(
      "Gross amount for tiered commission is invalid.",
    );
  }

  if (
    !Number.isSafeInteger(rateBps) ||
    rateBps <= 0 ||
    rateBps > BASIS_POINTS_SCALE
  ) {
    throw new Error(
      "Commission rate for tiered commission is invalid.",
    );
  }

  if (
    grossAmountInCentavos <=
      TIERED_COMMISSION_PURE_RATE_MAX_CENTAVOS
  ) {
    return applyBasisPoints(
      grossAmountInCentavos,
      rateBps,
    );
  }

  if (
    grossAmountInCentavos <=
      TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS
  ) {
    return TIERED_COMMISSION_STANDARD_CAP_CENTAVOS;
  }

  if (
    grossAmountInCentavos <
      TIERED_COMMISSION_ABSOLUTE_CAP_MIN_CENTAVOS
  ) {
    const excess =
      grossAmountInCentavos -
      TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS;
    const progressive =
      applyBasisPoints(
        excess,
        rateBps,
      );
    const total =
      TIERED_COMMISSION_STANDARD_CAP_CENTAVOS +
      progressive;

    if (
      !Number.isSafeInteger(total) ||
      total >
        TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS
    ) {
      return TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS;
    }

    return total;
  }

  return TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS;
}

/**
 * Cumulative allocation of a frozen booking
 * commission total against settled gross.
 */
export function allocateCumulativeFixedTotal(
  input: {
    totalInCentavos: number;
    grossAmountInCentavos: number;
    cumulativeBaseAfterInCentavos: number;
  },
): number {
  const {
    totalInCentavos,
    grossAmountInCentavos,
    cumulativeBaseAfterInCentavos,
  } = input;

  if (
    !Number.isSafeInteger(
      totalInCentavos,
    ) ||
    totalInCentavos < 0 ||
    !Number.isSafeInteger(
      grossAmountInCentavos,
    ) ||
    grossAmountInCentavos <= 0 ||
    !Number.isSafeInteger(
      cumulativeBaseAfterInCentavos,
    ) ||
    cumulativeBaseAfterInCentavos < 0 ||
    cumulativeBaseAfterInCentavos >
      grossAmountInCentavos
  ) {
    throw new Error(
      "Capped commission allocation inputs are invalid.",
    );
  }

  if (
    cumulativeBaseAfterInCentavos ===
      grossAmountInCentavos
  ) {
    return totalInCentavos;
  }

  const product =
    totalInCentavos *
    cumulativeBaseAfterInCentavos;

  if (!Number.isSafeInteger(product)) {
    throw new Error(
      "Capped commission allocation exceeds the safe integer range.",
    );
  }

  return Math.floor(
    (
      product +
      Math.floor(
        grossAmountInCentavos / 2,
      )
    ) /
      grossAmountInCentavos,
  );
}

function applyBasisPoints(
  amountInCentavos: number,
  rateBps: number,
): number {
  const product =
    amountInCentavos * rateBps;

  if (!Number.isSafeInteger(product)) {
    throw new Error(
      "Basis-point calculation exceeds the safe integer range.",
    );
  }

  return Math.floor(
    (
      product +
      BASIS_POINTS_SCALE / 2
    ) /
      BASIS_POINTS_SCALE,
  );
}
