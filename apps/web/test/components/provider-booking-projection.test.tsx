import {expect, it} from "vitest";
import {bookingPaymentAttention, bookingMatchesView, bookingView, manilaDay} from "@/lib/provider/bookings/provider-booking-projection";
import type {ProviderBooking} from "@/lib/provider/bookings/provider-booking-types";
const now = new Date("2026-10-10T04:00:00Z");
const event = {customerId: "customer", status: "waiting_for_down_payment"};
const request = {customerId: "customer", status: "waiting_for_down_payment", eventDate: new Date("2026-10-10T00:00:00+08:00"), eventTime: "18:00", expiresAt: new Date("2026-10-10T09:00:00Z"), downPaymentAmount: 100, paymentStatus: "pending"};
it("classifies actual deposit eligibility and excludes an incomplete provider lineup", () => {
  expect(bookingPaymentAttention(request, event, now)).toBe("Down Payment Due");
  expect(bookingPaymentAttention({...request, status: "accepted"}, {...event, status: "pending_provider_approval"}, now)).toBeNull();
  expect(bookingPaymentAttention({...request, activeCancellationRequestId: "cancel"}, event, now)).toBeNull();
  expect(bookingPaymentAttention({...request, expiresAt: new Date("2020-01-01")}, event, now)).toBeNull();
});
it("keeps processing informational and malformed canonical settlement fails closed", () => {
  expect(bookingPaymentAttention({...request, status: "payment_processing", paymentStatus: "processing"}, event, now)).toBe("Payment Being Checked");
  expect(bookingPaymentAttention({...request, settlementSchemaVersion: 99, paymentStatus: "processing"}, event, now)).toBeNull();
});
it("reads the canonical balance obligation independently of the paid deposit transaction", () => {
  const balance = {...request, status: "confirmed", paymentStatus: "paid", settlementSchemaVersion: 1, settlementStatus: "deposit_settled", financialSnapshot: {schemaVersion: 1, grossAmountInCentavos: 10000}, grossSettledAmountInCentavos: 5000, outstandingAmountInCentavos: 5000, hardPaymentDeadlineAt: new Date("2026-10-10T10:00:00Z")};
  expect(bookingPaymentAttention(balance, {...event, status: "confirmed"}, now)).toBe("Remaining Balance Due");
  expect(bookingPaymentAttention({...balance, settlementStatus: "balance_payment_processing"}, {...event, status: "confirmed"}, now)).toBe("Payment Being Checked");
});
it.each(["18:00", "08:00", null, "bad"])("retains confirmed events without deriving completion from time %s", eventTime => {
  expect(bookingMatchesView("upcoming", {providerRequestStatus: "confirmed", mainEventStatus: "confirmed", eventTime, eventDate: "2020-01-01"} as ProviderBooking)).toBe(true);
  expect(bookingMatchesView("upcoming", {providerRequestStatus: "in_progress", mainEventStatus: "in_progress"} as ProviderBooking)).toBe(true);
});
it("keeps refund attributes independent of event lifecycle", () => {
  const booking = {providerRequestStatus: "confirmed", mainEventStatus: "confirmed", paymentStatus: "refunded"} as ProviderBooking;
  expect(bookingMatchesView("past", booking)).toBe(true); expect(booking.providerRequestStatus).toBe("confirmed");
});
it("preserves old links and Manila end-of-day boundaries", () => {
  expect(bookingView("accepted")).toBe("waiting_payment"); expect(bookingView("completed")).toBe("past");
  expect(manilaDay("2026-10-10T15:59:59Z")).toBe("2026-10-10"); expect(manilaDay("2026-10-10T16:00:00Z")).toBe("2026-10-11");
});
