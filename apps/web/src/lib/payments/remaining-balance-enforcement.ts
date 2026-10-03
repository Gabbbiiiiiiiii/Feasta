type StoredRecord = Readonly<Record<string, unknown>>;
export function balanceEnforcementPresentation(request: StoredRecord, role: "customer" | "provider") {
  if (request.remainingBalanceTimingSchemaVersion !== 2 || request.remainingBalanceEnforcementSchemaVersion !== 1) return null;
  const state = request.remainingBalanceEnforcement as {status?: string} | undefined;
  const labels: Record<string, [string, string]> = {
    on_hold: ["Payment pending · Booking on hold", "Booking on hold · Payment pending"],
    reconciliation_required: ["Payment confirmation requires review", "Booking on hold · Payment reconciliation required"],
    cancellation_pending: ["Booking Cancelled · Deposit Refund Pending", "Cancelled · Payment Incomplete"],
    refund_processing: ["Booking Cancelled · Deposit Refund in Progress", "Cancelled · Payment Incomplete"],
    refunded: ["Booking Cancelled · Deposit Refunded", "Cancelled · Payment Incomplete"],
  };
  const label = state?.status ? labels[state.status]?.[role === "customer" ? 0 : 1] : null;
  if (!label) return null;
  const explanation = state?.status === "on_hold"
    ? "FEASTA is confirming the already-started remaining-balance payment. The booking is temporarily on hold."
    : state?.status === "reconciliation_required"
      ? "FEASTA needs to reconcile the payment confirmation. The booking remains on hold."
      : null;
  return {label, explanation};
}

export function balanceEnforcementBlocksActions(request: StoredRecord, now = Date.now()): boolean {
  if (request.remainingBalanceTimingSchemaVersion !== 2) return false;
  const state = request.remainingBalanceEnforcement as {status?: string} | undefined;
  if (request.remainingBalanceEnforcementSchemaVersion != null &&
    (request.remainingBalanceEnforcementSchemaVersion !== 1 || state?.status !== "clear")) return true;
  if (request.initialPaymentChoice !== "minimum") return false;
  const stored = request.remainingBalanceDueAt as {toDate?: () => Date} | string | undefined;
  try {
    const dueAt = typeof stored === "string" ? new Date(stored) : stored?.toDate?.();
    return !dueAt || !Number.isFinite(dueAt.getTime()) || now >= dueAt.getTime();
  } catch { return true; }
}
