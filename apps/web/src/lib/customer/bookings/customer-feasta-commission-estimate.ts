import {
  CENTAVOS_PER_PESO,
  DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
  computeCustomerPaidPlatformFeeInCentavos,
} from "@feasta/shared-types";

/**
 * Customer-facing estimate of the FEASTA customer-paid service fee.
 *
 * Uses the active dynamic Admin commission rate (in basis points)
 * and is added on top of the provider's service subtotal.
 * Authoritative totals are always computed and frozen server-side.
 */
export function customerFeastaCommissionEstimatePesos(
  servicePricePesos: number | null,
  rateBps: number = DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
): number | null {
  if (
    servicePricePesos === null ||
    !Number.isFinite(servicePricePesos) ||
    servicePricePesos < 0
  ) {
    return null;
  }

  const serviceSubtotalCentavos = Math.round(
    servicePricePesos * CENTAVOS_PER_PESO,
  );

  const feeCentavos =
    computeCustomerPaidPlatformFeeInCentavos(
      serviceSubtotalCentavos,
      rateBps,
    );

  if (feeCentavos === null) {
    return null;
  }

  return (
    feeCentavos /
    CENTAVOS_PER_PESO
  );
}

export function formatPlatformCommissionRatePercent(
  rateBps: number = DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
): string {
  const percent = rateBps / 100;
  return `${Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "")}%`;
}
