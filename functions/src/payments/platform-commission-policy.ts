/**
 * FEASTA platform commission & service-fee policies.
 *
 * Keep boundary math aligned with
 * packages/shared-types/src/payment.ts.
 */

export const PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1 =
  "customer_paid_flat_v1" as const;

export const PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1 =
  "tiered_capped_2pct_v1" as const;

export type PlatformCommissionModel =
  | typeof PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1
  | typeof PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1;

export const DEFAULT_PLATFORM_COMMISSION_MODEL:
  PlatformCommissionModel =
  PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1;

export const PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1 =
  "direct_provider_split_v1" as const;

export const PAYMENT_SETTLEMENT_ROUTING_PLATFORM_ESCROW_V1 =
  "platform_escrow_v1" as const;

export type PaymentSettlementRoutingMode =
  | typeof PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1
  | typeof PAYMENT_SETTLEMENT_ROUTING_PLATFORM_ESCROW_V1;

export const DEFAULT_PAYMENT_SETTLEMENT_ROUTING:
  PaymentSettlementRoutingMode =
  PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1;

export function parsePaymentSettlementRoutingMode(
  value: unknown,
): PaymentSettlementRoutingMode | null {
  if (
    value === PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1 ||
    value === PAYMENT_SETTLEMENT_ROUTING_PLATFORM_ESCROW_V1
  ) {
    return value;
  }

  return null;
}

export function isDirectProviderSplitRouting(
  value: unknown,
): value is typeof PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1 {
  return value === PAYMENT_SETTLEMENT_ROUTING_DIRECT_SPLIT_V1;
}

export const DEFAULT_PLATFORM_COMMISSION_RATE_BPS =
  20;

const BASIS_POINTS_SCALE = 10_000;

/** ₱25,000 inclusive (legacy tiered model). */
export const TIERED_COMMISSION_PURE_RATE_MAX_CENTAVOS =
  2_500_000;

/** ₱75,000 inclusive (legacy tiered model). */
export const TIERED_COMMISSION_STANDARD_CAP_MAX_CENTAVOS =
  7_500_000;

/** ₱100,000 inclusive absolute-cap floor (legacy tiered model). */
export const TIERED_COMMISSION_ABSOLUTE_CAP_MIN_CENTAVOS =
  10_000_000;

/** ₱500 (legacy tiered model). */
export const TIERED_COMMISSION_STANDARD_CAP_CENTAVOS =
  50_000;

/** ₱1,000 (legacy tiered model). */
export const TIERED_COMMISSION_ABSOLUTE_CAP_CENTAVOS =
  100_000;

export function isCustomerPaidCommissionModel(
  value: unknown,
): value is typeof PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1 {
  return value === PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1;
}

export function parsePlatformCommissionModel(
  value: unknown,
): PlatformCommissionModel | null {
  if (
    value === PLATFORM_COMMISSION_MODEL_CUSTOMER_PAID_FLAT_V1 ||
    value === PLATFORM_COMMISSION_MODEL_TIERED_CAPPED_2PCT_V1
  ) {
    return value;
  }

  return null;
}

export function resolvePlatformCommissionRateBps(
  platformSettings: Readonly<Record<string, unknown>> | null | undefined,
): number {
  const configured = platformSettings?.platformCommissionRateBps;
  if (
    typeof configured === "number" &&
    Number.isSafeInteger(configured) &&
    configured > 0 &&
    configured <= BASIS_POINTS_SCALE
  ) {
    return configured;
  }
  return DEFAULT_PLATFORM_COMMISSION_RATE_BPS;
}

/**
 * Dynamic uncapped customer-paid FEASTA service fee on the provider's
 * service subtotal (in integer centavos), using half-up rounding.
 */
export function computeCustomerPaidPlatformFeeInCentavos(
  serviceSubtotalInCentavos: number,
  rateBps: number = DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
): number {
  if (
    !Number.isSafeInteger(serviceSubtotalInCentavos) ||
    serviceSubtotalInCentavos < 0
  ) {
    throw new Error(
      "Service subtotal for platform service fee is invalid.",
    );
  }

  if (
    !Number.isSafeInteger(rateBps) ||
    rateBps <= 0 ||
    rateBps > BASIS_POINTS_SCALE
  ) {
    throw new Error(
      "Commission rate for platform service fee is invalid.",
    );
  }

  return applyBasisPoints(serviceSubtotalInCentavos, rateBps);
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
