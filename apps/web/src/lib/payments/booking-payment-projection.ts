export type BookingPaymentProjection = "unpaid" | "partially_paid" | "paid";

/** Read the canonical settlement snapshot; refunds do not reopen obligations. */
export function projectBookingPayment(data: Readonly<Record<string, unknown>>): BookingPaymentProjection | null {
  const financial = data.financialSnapshot as Record<string, unknown> | null | undefined;
  if ((data.settlementSchemaVersion != null && data.settlementSchemaVersion !== 1) ||
    (financial?.schemaVersion != null && financial.schemaVersion !== 1)) return null;
  const gross = financial?.grossAmountInCentavos;
  const settled = data.grossSettledAmountInCentavos;
  const outstanding = data.outstandingAmountInCentavos;
  if (![gross, settled, outstanding].every((value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
    typeof gross !== "number" || typeof settled !== "number" || typeof outstanding !== "number" ||
    gross <= 0 || settled + outstanding !== gross) return null;
  const status = settled === 0 ? "unpaid" : outstanding === 0 ? "paid" : "partially_paid";
  const allowed = status === "unpaid" ? ["unpaid", "initial_payment_processing"] :
    status === "paid" ? ["fully_settled"] : ["deposit_settled", "balance_payment_processing"];
  return allowed.includes(String(data.settlementStatus)) ? status : null;
}

/** A canonical snapshot must never fall back to a stale transaction status. */
export function hasBookingSettlement(data: Readonly<Record<string, unknown>>): boolean {
  return data.settlementSchemaVersion != null || data.settlementStatus != null ||
    data.grossSettledAmountInCentavos != null || data.outstandingAmountInCentavos != null;
}
