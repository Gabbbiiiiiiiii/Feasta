import {expect, it} from "vitest";
import {bookingOutstanding} from "@/lib/admin/bookings/booking-outstanding";
import type {AdminBookingPayment, AdminBookingProviderRequest} from "@/lib/admin/bookings/admin-booking-types";
const payment = (amountInCentavos: number, status = "paid", providerRequestId = "request") => ({amountInCentavos, status, providerRequestId}) as AdminBookingPayment;
const request = (status = "confirmed", subtotal = 10000, id = "request") => ({id, status, subtotal}) as AdminBookingProviderRequest;
it.each([
  ["active unpaid", "confirmed", [], 10000],
  ["partially paid", "confirmed", [payment(500000)], 5000],
  ["fully paid", "confirmed", [payment(1000000)], 0],
  ["cancelled with refund", "cancelled", [payment(250000), payment(250000, "refunded")], 0],
  ["fully refunded cancelled", "cancelled", [payment(500000, "refunded")], 0],
  ["multiple payments", "confirmed", [payment(200000), payment(300000), payment(500000, "refunded")], 5000],
] as const)("calculates %s without recreating refunded obligations", (_, status, payments, expected) => {
  expect(bookingOutstanding(status, 10000, [request()], payments)).toBe(expected);
  expect(bookingOutstanding(status, 10000, [], payments)).toBe(expected);
});
it("excludes cancelled services while retaining obligations for active services", () => {
  expect(bookingOutstanding("confirmed", 20000, [request("cancelled"), request("confirmed", 10000, "active")], [payment(500000, "refunded"), payment(300000, "paid", "active")])).toBe(7000);
});
it("shows zero when every service was cancelled even if the booking status is stale", () => {
  expect(bookingOutstanding("confirmed", 10000, [request("cancelled")], [payment(500000, "refunded")])).toBe(0);
});
it("keeps integer centavos and clamps overpayments", () => {
  expect(bookingOutstanding("confirmed", 0.3, [], [payment(10)])).toBe(0.2);
  expect(bookingOutstanding("confirmed", 0.3, [request("confirmed", 0.3)], [payment(10)])).toBe(0.2);
  expect(bookingOutstanding("confirmed", 0.3, [], [payment(40)])).toBe(0);
});
