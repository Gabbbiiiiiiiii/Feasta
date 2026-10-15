export type BookingPolicyPresentation = {
  label: string; state: "upcoming" | "due" | "grace_period" | "hold" | "review" | "preparation" | "in_progress" | "completed" | "cancelled";
  dueAt: string; deadlineAt: string; preparationAt: string; eventAt: string;
  remainingAmountInCentavos: number | null; readyToComplete: boolean;
  allocation: null | {deposit: number; customerRefund: number; providerCompensation: number; fee: number; refundStatus: string};
};
/** Server read-model projection only. Never authorizes a mutation or checkout. */
export function bookingPolicyV3Presentation(data: Readonly<Record<string, unknown>>, now = new Date()): BookingPolicyPresentation | null {
  if (data.remainingBalanceTimingSchemaVersion !== 3) return null;
  const date = (value: unknown): Date | null => {
    try {
      const parsed = typeof value === "string" ? new Date(value) : (value as {toDate?: () => Date})?.toDate?.();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    } catch { return null; }
  };
  const event = date(data.eventStartAt), due = date(data.remainingBalanceDueAt), hard = date(data.hardPaymentDeadlineAt), prep = date(data.preparationStartsAt);
  const policy = data.bookingLifecyclePolicySnapshot as Record<string, unknown> | null;
  if (!event || !due || !hard || !prep || data.balanceDueHoursBeforeEvent !== 48 ||
    due.getTime() !== event.getTime() - 48 * 3_600_000 || hard.getTime() !== event.getTime() - 24 * 3_600_000 ||
    prep.getTime() !== hard.getTime() || policy?.schemaVersion !== 3 || policy.providerStartsManually !== false ||
    policy.requiresFullPayment !== true || policy.autoStartAtScheduledTime !== true || policy.providerConfirmsCompletion !== true) return null;
  const enforcement = data.remainingBalanceEnforcement as {status?: unknown} | null;
  const eligibility = data.refundEligibilityState as {activeCancellationRequestId?: unknown} | null;
  const locked = data.activeCancellationRequestId != null || data.approvedCancellationRequestId != null ||
    eligibility?.activeCancellationRequestId != null || data.refundExecutionLock != null;
  const clear = data.settlementStatus === "fully_settled" && data.outstandingAmountInCentavos === 0 && !locked &&
    data.reconciliationRequired !== true && data.lifecycleReconciliationRequired !== true &&
    (enforcement == null || enforcement.status === "clear");
  let state: BookingPolicyPresentation["state"] = "upcoming", label = "Confirmed / Upcoming";
  if (data.status === "cancelled") { state = "cancelled"; label = "Booking cancelled"; }
  else if (data.status === "completed") { state = "completed"; label = "Completed"; }
  else if (enforcement?.status === "on_hold") { state = "hold"; label = "Payment confirmation pending"; }
  else if (locked || enforcement?.status === "reconciliation_required" || data.lifecycleReconciliationRequired === true || data.reconciliationRequired === true) { state = "review"; label = "Booking review required"; }
  else if (clear && ["confirmed", "in_progress"].includes(String(data.status)) && now >= event) { state = "in_progress"; label = "In Progress"; }
  else if (clear && data.status === "confirmed" && now >= prep) { state = "preparation"; label = "Preparation Period"; }
  else if (Number(data.outstandingAmountInCentavos) > 0 && now >= hard) { state = "review"; label = "Payment review required"; }
  else if (data.status === "confirmed" && Number(data.outstandingAmountInCentavos) > 0 && now >= due) {
    state = now.getTime() === due.getTime() ? "due" : "grace_period";
    label = state === "due" ? "Remaining balance due" : "Payment grace period";
  }
  let allocation: BookingPolicyPresentation["allocation"] = null;
  const frozen = data.paymentDefaultAllocation as Record<string, unknown> | null;
  if (state === "cancelled" && data.cancellationReason === "remaining_balance_unpaid_at_deadline" && frozen?.schemaVersion === 1 &&
    frozen.customerRefundRateBps === 7000 && frozen.providerReservationCompRateBps === 2000 && frozen.feastaCancellationFeeRateBps === 1000) {
    const deposit = frozen.paidDepositInCentavos as number, customerRefund = frozen.customerDefaultRefundAmountInCentavos as number;
    const providerCompensation = frozen.providerReservationCompAmountInCentavos as number, fee = frozen.feastaCancellationFeeAmountInCentavos as number;
    if ([deposit, customerRefund, providerCompensation, fee].every(value => Number.isSafeInteger(value) && value >= 0) && deposit > 0 &&
      customerRefund === Number(BigInt(deposit) * BigInt(7000) / BigInt(10000)) && providerCompensation === Number(BigInt(deposit) * BigInt(2000) / BigInt(10000)) &&
      customerRefund + providerCompensation + fee === deposit) allocation = {deposit, customerRefund, providerCompensation, fee,
        refundStatus: enforcement?.status === "refunded" ? "Refunded" : enforcement?.status === "reconciliation_required" ? "Review required" : "Processing"};
  }
  const eventDate = date(data.eventDate);
  let end: Date | null = null;
  if (eventDate && typeof data.eventEndTime === "string" && /^\d{2}:\d{2}$/u.test(data.eventEndTime)) {
    const localDay = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(eventDate);
    end = new Date(`${localDay}T${data.eventEndTime}:00+08:00`);
    if (end <= event) end = new Date(end.getTime() + 86_400_000);
  }
  return {label, state, dueAt: due.toISOString(), deadlineAt: hard.toISOString(), preparationAt: prep.toISOString(), eventAt: event.toISOString(),
    remainingAmountInCentavos: Number.isSafeInteger(data.outstandingAmountInCentavos) ? data.outstandingAmountInCentavos as number : null,
    readyToComplete: state === "in_progress" && clear && end != null && Number.isFinite(end.getTime()) && now >= end, allocation};
}
