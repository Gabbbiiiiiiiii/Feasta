export type CustomerServiceVat = {
  status: "available";
  taxType: "non_vat" | "vat_registered";
  includedInPaymentInCentavos: number;
  reversedInCentavos: number;
  netIncludedInCentavos: number;
} | {
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

function centavos(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

/**
 * Customer-safe display projection only.
 * This never decides the charge, refund, tax liability or payout.
 */
export function customerServiceVat(
  payment: RecordData,
  providerRequest: RecordData,
  paymentId: string,
  amountPaidInCentavos: number,
  refundedAmountInCentavos: number,
): CustomerServiceVat {
  const unavailable: CustomerServiceVat = {
    status: "unavailable",
  };

  const snapshot = record(providerRequest.financialSnapshot);

  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    snapshot.currency !== "PHP" ||
    snapshot.providerTaxVerificationStatus !== "verified" ||
    (snapshot.providerTaxType !== "vat_registered" &&
      snapshot.providerTaxType !== "non_vat") ||
    payment.financialLedgerSchemaVersion !== 1 ||
    payment.financialLedgerEntryId !== paymentId ||
    payment.currency !== "PHP" ||
    !Number.isSafeInteger(amountPaidInCentavos) ||
    amountPaidInCentavos <= 0 ||
    !Number.isSafeInteger(refundedAmountInCentavos) ||
    refundedAmountInCentavos < 0 ||
    refundedAmountInCentavos > amountPaidInCentavos
  ) {
    return unavailable;
  }

  const included = centavos(
    payment.providerVatComponentInCentavos,
  );

  const reversed = refundedAmountInCentavos === 0 &&
    payment.providerVatReversedInCentavos == null
    ? 0
    : centavos(payment.providerVatReversedInCentavos);

  // Mirror the ledger's cumulative proportional half-up reversal.
  // BigInt prevents overflow in the intermediate multiplication.
  const expectedReversed = included !== null &&
    Number.isSafeInteger(amountPaidInCentavos) &&
    amountPaidInCentavos > 0 &&
    Number.isSafeInteger(refundedAmountInCentavos) &&
    refundedAmountInCentavos >= 0
    ? Number((
        BigInt(included) * BigInt(refundedAmountInCentavos) +
        BigInt(Math.floor(amountPaidInCentavos / 2))
      ) / BigInt(amountPaidInCentavos))
    : null;

  if (
    included === null ||
    reversed === null ||
    expectedReversed === null ||
    reversed !== expectedReversed ||
    included > amountPaidInCentavos ||
    reversed > included ||
    reversed > refundedAmountInCentavos ||
    included - reversed >
      amountPaidInCentavos - refundedAmountInCentavos ||
    (snapshot.providerTaxType === "non_vat" &&
      (included !== 0 || reversed !== 0))
  ) {
    return unavailable;
  }

  return {
    status: "available",
    taxType: snapshot.providerTaxType,
    includedInPaymentInCentavos: included,
    reversedInCentavos: reversed,
    netIncludedInCentavos: included - reversed,
  };
}