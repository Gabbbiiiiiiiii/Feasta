export type CustomerProviderTaxStatus =
  "vat_registered" | "non_vat" | "unknown";

/**
 * Customer-facing estimate only.
 * The authoritative VAT ledger remains server-controlled.
 */
export function customerProviderVatBreakdown(
  servicePrice: number | null,
  taxStatus: CustomerProviderTaxStatus | null,
): {
  exclusiveCentavos: number;
  vatCentavos: number;
} | null {
  if (
    taxStatus !== "vat_registered" ||
    servicePrice === null ||
    !Number.isFinite(servicePrice) ||
    servicePrice < 0
  ) {
    return null;
  }

  const grossCentavos = Math.round(servicePrice * 100);

  if (
    !Number.isSafeInteger(grossCentavos) ||
    grossCentavos < 0 ||
    !Number.isSafeInteger(grossCentavos * 1200)
  ) {
    return null;
  }

  const vatCentavos = Math.round(
    grossCentavos * 1200 / 11200,
  );

  return {
    exclusiveCentavos: grossCentavos - vatCentavos,
    vatCentavos,
  };
}
