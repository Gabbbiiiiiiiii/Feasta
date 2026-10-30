import {hasBookingSettlement, projectBookingPayment} from "@/lib/payments/booking-payment-projection";
import type {ProviderDashboardView} from "./provider-dashboard-types";
type RecordData = Readonly<Record<string, unknown>>;

export function storedDate(value: unknown): Date | null {
  try {
    const date = value instanceof Date ? value : (value as {toDate?: () => Date})?.toDate?.();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch { return null; }
}
export function dashboardEventStart(data: RecordData): Date | null {
  const date = storedDate(data.eventDate);
  if (!date || typeof data.eventTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(data.eventTime)) return null;
  const day = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(date);
  return new Date(`${day}T${data.eventTime}:00+08:00`);
}
function blocked(data: RecordData): boolean {
  const eligibility = data.refundEligibilityState as RecordData | undefined;
  const enforcement = data.remainingBalanceEnforcement as RecordData | undefined;
  return data.activeCancellationRequestId != null || data.approvedCancellationRequestId != null ||
    eligibility?.activeCancellationRequestId != null || data.refundExecutionLock != null ||
    data.reconciliationRequired === true || data.lifecycleReconciliationRequired === true ||
    (enforcement != null && enforcement.status !== "clear");
}
/** Read-only categories; never authorizes acceptance, checkout, or lifecycle changes. */
export function dashboardMatches(view: ProviderDashboardView, request: RecordData, event: RecordData | null, now: Date): boolean {
  if (!event || event.customerId !== request.customerId) return false;
  const start = dashboardEventStart(request);
  const expiry = storedDate(request.expiresAt);
  const eventExpiry = storedDate(event.expiresAt);
  const expired = (expiry !== null && expiry <= now) || (eventExpiry !== null && eventExpiry <= now);
  const terminalEvent = ["cancelled", "expired"].includes(String(event.status));
  if (view === "completed") return request.status === "completed" &&
    ["confirmed", "in_progress", "completed"].includes(String(event.status));
  if (terminalEvent || blocked(request) || blocked(event) || !start || start <= now) return false;
  if (view === "new") return request.status === "pending" && !expired &&
    (request.expiresAt == null || expiry !== null) && (event.expiresAt == null || eventExpiry !== null) &&
    ["pending_provider_approval", "needs_provider_replacement"].includes(String(event.status));
  if (view === "upcoming") return request.status === "confirmed" &&
    ["waiting_for_down_payment", "confirmed", "in_progress"].includes(String(event.status));
  // Accepted alone means the lineup is incomplete, not that the customer can pay.
  if (request.status === "waiting_for_down_payment") {
    if (expired || event.status !== "waiting_for_down_payment" || !expiry ||
      !(typeof request.downPaymentAmount === "number" && request.downPaymentAmount > 0)) return false;
    if (["processing", "paid", "refunded"].includes(String(request.paymentStatus))) return false;
    return hasBookingSettlement(request) ? projectBookingPayment(request) === "unpaid" && request.settlementStatus === "unpaid" : true;
  }
  if (request.status !== "confirmed" || event.status !== "confirmed" ||
    request.paymentStatus === "processing" || request.paymentStatus === "refunded") return false;
  const deadline = storedDate(request.hardPaymentDeadlineAt) ?? storedDate(request.remainingBalanceGraceEndsAt);
  if (!deadline || deadline <= now) return false;
  return projectBookingPayment(request) === "partially_paid" && request.settlementStatus === "deposit_settled";
}
export function dashboardView(value: unknown): ProviderDashboardView | undefined {
  return ["new", "upcoming", "payment", "completed"].includes(String(value)) ? value as ProviderDashboardView : undefined;
}
