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

export function specialOfferBreakdown(offer: unknown, gross: number, financialSnapshot: unknown) {
  const quote = record(offer);
  const snapshot = record(financialSnapshot);
  if (!quote || quote.totalInCentavos !== gross ||
      typeof quote.subtotalInCentavos !== "number" ||
      !Number.isSafeInteger(quote.subtotalInCentavos) ||
      quote.subtotalInCentavos <= 0 || quote.subtotalInCentavos > gross) return undefined;
  const fee = snapshot?.platformCommissionTotalInCentavos;
  const quantity = typeof quote.quantity === "number" &&
    Number.isSafeInteger(quote.quantity) && quote.quantity > 0 ? quote.quantity : null;
  const unit = quote.unitAmountInCentavos;
  const isCustomerPaid =
    snapshot?.platformCommissionModel === "customer_paid_flat_v1" ||
    quote.platformCommissionModel === "customer_paid_flat_v1";
  const rateBps =
    typeof snapshot?.platformCommissionRateBps === "number" &&
    Number.isSafeInteger(snapshot.platformCommissionRateBps) &&
    snapshot.platformCommissionRateBps > 0
      ? snapshot.platformCommissionRateBps
      : typeof quote.platformCommissionRateBps === "number" &&
          Number.isSafeInteger(quote.platformCommissionRateBps) &&
          quote.platformCommissionRateBps > 0
        ? quote.platformCommissionRateBps
        : null;
  const fallbackCustomerFee =
    isCustomerPaid &&
    typeof quote.platformFeeInCentavos === "number" &&
    Number.isSafeInteger(quote.platformFeeInCentavos) &&
    quote.platformFeeInCentavos >= 0 &&
    quote.subtotalInCentavos + quote.platformFeeInCentavos === gross
      ? quote.platformFeeInCentavos
      : null;
  const resolvedFee =
    snapshot?.schemaVersion === 1 &&
    snapshot.currency === "PHP" &&
    snapshot.grossAmountInCentavos === gross &&
    typeof fee === "number" &&
    Number.isSafeInteger(fee) &&
    fee >= 0 &&
    fee <= gross
      ? fee
      : fallbackCustomerFee;
  return {
    ...(quantity !== null ? {quantity} : {}),
    ...(quantity !== null && typeof unit === "number" && Number.isSafeInteger(unit) &&
      unit > 0 && unit * quantity === quote.subtotalInCentavos ? {unitAmountInCentavos: unit} : {}),
    subtotalInCentavos: quote.subtotalInCentavos,
    deliveryIncluded: quote.deliveryIncluded === true,
    providerFeeInCentavos: resolvedFee,
    ...(isCustomerPaid ? {isCustomerPaid: true as const} : {}),
    ...(rateBps !== null ? {platformCommissionRateBps: rateBps} : {}),
  };
}

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
  // For customer_paid_flat_v1, Provider VAT applies strictly to the provider's
  // service subtotal (excluding FEASTA's customer-paid service fee).
  // Legacy bookings keep the historical gross base.
  const isCustomerPaid =
    snapshot.platformCommissionModel === "customer_paid_flat_v1";
  const providerTaxBase = isCustomerPaid
    ? typeof snapshot.serviceSubtotalInCentavos === "number" &&
        Number.isSafeInteger(snapshot.serviceSubtotalInCentavos) &&
        snapshot.serviceSubtotalInCentavos > 0 &&
        snapshot.serviceSubtotalInCentavos <= gross
      ? snapshot.serviceSubtotalInCentavos
      : typeof snapshot.platformCommissionTotalInCentavos === "number" &&
          Number.isSafeInteger(snapshot.platformCommissionTotalInCentavos) &&
          snapshot.platformCommissionTotalInCentavos >= 0 &&
          snapshot.platformCommissionTotalInCentavos < gross
        ? gross - snapshot.platformCommissionTotalInCentavos
        : gross
    : gross;

  // BigInt avoids intermediate floating-point overflow.
  const calculated = (
    BigInt(providerTaxBase) * BigInt(1200) + BigInt(5600)
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
