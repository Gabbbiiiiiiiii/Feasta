import {
  CENTAVOS_PER_PESO,
  computeTieredCappedCommissionInCentavos,
} from "@feasta/shared-types";

/**
 * Customer-facing estimate only.
 *
 * Shows the expected FEASTA commission for transparency.
 * It is not added to the customer total; authoritative
 * commission remains snapshotted server-side on acceptance.
 */
export function customerFeastaCommissionEstimatePesos(
  servicePricePesos: number | null,
): number | null {
  if (
    servicePricePesos === null ||
    !Number.isFinite(servicePricePesos) ||
    servicePricePesos < 0
  ) {
    return null;
  }

  const grossCentavos = Math.round(
    servicePricePesos * CENTAVOS_PER_PESO,
  );

  const commissionCentavos =
    computeTieredCappedCommissionInCentavos(
      grossCentavos,
    );

  if (commissionCentavos === null) {
    return null;
  }

  return (
    commissionCentavos /
    CENTAVOS_PER_PESO
  );
}
