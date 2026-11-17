export type CustomerBookingServiceVat =
  | {
      status: "available";
      taxType: "vat_registered" | "non_vat";
      includedInPriceInCentavos: number;
    }
  | {
      status: "unavailable";
    };

type RecordData = Readonly<Record<string, unknown>>;

function record(value: unknown): RecordData | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as RecordData
    : null;
}

/**
 * Read-only customer presentation of frozen booking tax evidence.
 * Does not change financial allocations or payment amounts.
 */
export function customerBookingServiceVat(
  providerRequest: RecordData,
): CustomerBookingServiceVat {
  const unavailable: CustomerBookingServiceVat = {
    status: "unavailable",
  };

  const snapshot = record(providerRequest.financialSnapshot);
  const amount = providerRequest.amount;

  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    snapshot.currency !== "PHP" ||
    snapshot.providerTaxVerificationStatus !== "verified" ||
    (snapshot.providerTaxType !== "vat_registered" &&
      snapshot.providerTaxType !== "non_vat") ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return unavailable;
  }

  const scaled = amount * 100;
  const gross = Math.round(scaled);

  if (
    !Number.isSafeInteger(gross) ||
    Math.abs(scaled - gross) > 0.000001 ||
    snapshot.grossAmountInCentavos !== gross
  ) {
    return unavailable;
  }

  if (snapshot.providerTaxType === "non_vat") {
    return {
      status: "available",
      taxType: "non_vat",
      includedInPriceInCentavos: 0,
    };
  }

  // Mirrors the frozen 12% VAT-inclusive component policy.
  // BigInt avoids intermediate floating-point overflow.
  const calculated = (
    BigInt(gross) * BigInt(1200) + BigInt(5600)
  ) / BigInt(11200);

  if (calculated > BigInt(Number.MAX_SAFE_INTEGER)) {
    return unavailable;
  }

  return {
    status: "available",
    taxType: "vat_registered",
    includedInPriceInCentavos: Number(calculated),
  };
}