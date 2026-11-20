export type CustomerPaymentChargeBreakdown =
  | {
      status: "available";
      serviceAmountInCentavos: number;
      platformChargeInCentavos: number;
      notice: string;
    }
  | {
      status: "partial";
      serviceAmountInCentavos: number;
    }
  | {
      status: "unavailable";
    };

type RecordData = Readonly<Record<string, unknown>>;

function centavos(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

/**
 * Customer-safe payment charge projection only.
 * Service charge uses trusted ledger commission for this payment and is
 * never treated as an extra customer surcharge.
 */
export function customerPaymentChargeBreakdown(
  payment: RecordData,
  paymentId: string,
  amountPaidInCentavos: number,
): CustomerPaymentChargeBreakdown {
  if (
    !Number.isSafeInteger(amountPaidInCentavos) ||
    amountPaidInCentavos <= 0
  ) {
    return {status: "unavailable"};
  }

  const partial = {
    status: "partial" as const,
    serviceAmountInCentavos: amountPaidInCentavos,
  };

  if (
    payment.financialLedgerSchemaVersion !== 1 ||
    payment.financialLedgerEntryId !== paymentId ||
    payment.currency !== "PHP"
  ) {
    return partial;
  }

  const platformCharge = centavos(payment.commissionAccruedInCentavos);
  if (
    platformCharge === null ||
    platformCharge > amountPaidInCentavos
  ) {
    return partial;
  }

  return {
    status: "available",
    serviceAmountInCentavos: amountPaidInCentavos,
    platformChargeInCentavos: platformCharge,
    notice:
      "Service charge is deducted from provider proceeds. It is not an additional customer charge.",
  };
}
