import {hasBookingSettlement, projectBookingPayment} from "@/lib/payments/booking-payment-projection";
import {dashboardMatches} from "../dashboard/provider-dashboard-projection";
import type {ProviderBooking, ProviderBookingFilter} from "./provider-booking-types";
export function bookingView(value: ProviderBookingFilter): "upcoming" | "waiting_payment" | "past" | "all" {
  if (["accepted", "waiting_payment"].includes(value)) return "waiting_payment";
  if (["completed", "cancelled", "past"].includes(value)) return "past";
  if (["confirmed", "in_progress", "upcoming"].includes(value)) return "upcoming";
  return "all";
}
export function manilaDay(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date(value));
}
export function bookingPaymentAttention(request: Record<string, unknown>, event: Record<string, unknown>, now: Date): ProviderBooking["paymentAttention"] {
  const projection = projectBookingPayment(request);
  const active = ["waiting_for_down_payment", "payment_processing", "confirmed", "in_progress"].includes(String(request.status)) && !["cancelled", "expired", "completed"].includes(String(event.status));
  if (!active) return null;
  if (hasBookingSettlement(request) && projection === null) return null;
  if (["initial_payment_processing", "balance_payment_processing"].includes(String(request.settlementStatus)) || (!hasBookingSettlement(request) && (request.paymentStatus === "processing" || request.status === "payment_processing"))) return "Payment Being Checked";
  if (dashboardMatches("payment", request, event, now)) return projection === "partially_paid" ? "Remaining Balance Due" : "Down Payment Due";
  return null;
}
export function bookingMatchesView(view: ReturnType<typeof bookingView>, booking: ProviderBooking): boolean {
  if (view === "all") return true;
  if (view === "upcoming") return ["confirmed", "in_progress"].includes(booking.providerRequestStatus) && !["cancelled", "expired", "completed"].includes(booking.mainEventStatus);
  if (view === "waiting_payment") return Boolean(booking.paymentAttention);
  return ["completed", "cancelled", "rejected", "expired"].includes(booking.providerRequestStatus) || ["completed", "cancelled", "expired"].includes(booking.mainEventStatus) || ["refunded", "partially_refunded"].includes(booking.paymentStatus ?? "");
}
export function bookingMatchesSecondary(filter: string, booking: ProviderBooking): boolean {
  if (filter === "all") return true;
  if (filter === "refunded") return ["refunded", "partially_refunded"].includes(booking.paymentStatus ?? "");
  if (filter === "disputed") return false;
  return booking.providerRequestStatus === filter || booking.mainEventStatus === filter;
}

/** Calendar date and scheduled clock time are separate; invalid clocks sort at the day's start. */
export function bookingScheduledStart(booking: Pick<ProviderBooking, "eventDate" | "eventTime">): number {
  const time = booking.eventTime && /^([01]\d|2[0-3]):[0-5]\d$/u.test(booking.eventTime) ? booking.eventTime : "00:00";
  return Date.parse(manilaDay(booking.eventDate) + "T" + time + ":00+08:00");
}
