export type CustomerPaymentChargeBreakdown =
  | {
      status: "available";
      chargeModel?: "customer_paid" | "provider_deducted";
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
 * Branches on customer_paid_flat_v1 (customer-paid FEASTA service fee) vs
 * legacy provider-deducted bookings so historical receipts stay accurate.
 */
export function customerPaymentChargeBreakdown(
  payment: RecordData,
  paymentId: string,
  amountPaidInCentavos: number,
  platformCommissionModel?: unknown,
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

  const isCustomerPaid =
    platformCommissionModel === "customer_paid_flat_v1" ||
    payment.platformCommissionModel === "customer_paid_flat_v1";

  if (isCustomerPaid) {
    return {
      status: "available",
      chargeModel: "customer_paid",
      serviceAmountInCentavos: amountPaidInCentavos - platformCharge,
      platformChargeInCentavos: platformCharge,
      notice:
        "Includes FEASTA service fee paid by the customer. Your provider receives 100% of the service subtotal directly, and FEASTA retains only the service fee.",
    };
  }

  return {
    status: "available",
    chargeModel: "provider_deducted",
    serviceAmountInCentavos: amountPaidInCentavos,
    platformChargeInCentavos: platformCharge,
    notice:
      "Service charge is deducted from provider proceeds. It is not an additional customer charge.",
  };
}
