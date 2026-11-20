import {expect, it} from "vitest";
import {bookingFinancialStatistics, bookingPaymentAccounting, bookingPaymentTotals, PARTIAL_REFUND_STATISTICS_LIMIT} from "@/lib/admin/bookings/booking-payment-accounting";
import {bookingOutstanding} from "@/lib/admin/bookings/booking-outstanding";
import type {AdminBookingPayment} from "@/lib/admin/bookings/admin-booking-types";
const payment = (status: AdminBookingPayment["status"], refund?: number, amount = 500000) => ({status, amountInCentavos: amount, refundedAmountInCentavos: refund, providerRequestId: "active"} as AdminBookingPayment);
it.each([["paid", 0, 500000], ["partially_refunded", 200000, 300000], ["refunded", 500000, 0]] as const)("%s uses completed canonical refunds", (status, refund, retained) => {
  expect(bookingPaymentAccounting(payment(status, refund))).toEqual({paid: retained, refunded: refund});
});
it("pending refund reservations do not reduce retained funds", () => {expect(bookingPaymentAccounting({...payment("paid", 0), refundReservedAmountInCentavos: 200000} as AdminBookingPayment)).toEqual({paid: 500000, refunded: 0});});
it("legacy full refund falls back to the original amount", () => {expect(bookingPaymentAccounting(payment("refunded"))).toEqual({paid: 0, refunded: 500000});});
it("missing partial refund amount stays unknown", () => {expect(bookingPaymentAccounting(payment("partially_refunded"))).toBeNull(); expect(bookingPaymentTotals([payment("partially_refunded")])).toEqual({paid: null, refunded: null});});
it.each([-1, 500001, 0.5, NaN])("invalid completed amount %s stays unknown", refund => {expect(bookingPaymentAccounting(payment("partially_refunded", refund))).toBeNull();});
it("combines multiple payments in centavos", () => {expect(bookingPaymentTotals([payment("paid", 0, 101), payment("partially_refunded", 51, 202)])).toEqual({paid: 2.52, refunded: 0.51});});
it("cancelled fully refunded booking has no outstanding obligation", () => {expect(bookingOutstanding("cancelled", 10000, [], [payment("refunded", 500000)])).toBe(0);});
it("active partial refund uses retained funds once", () => {expect(bookingOutstanding("confirmed", 10000, [], [payment("partially_refunded", 200000)])).toBe(7000);});
it("active unknown accounting cannot fabricate outstanding", () => {expect(bookingOutstanding("confirmed", 10000, [], [payment("partially_refunded")])).toBeNull();});
it.each(["pending", "processing", "failed", "expired"] as const)("%s contributes no successful funds", status => {expect(bookingPaymentAccounting(payment(status))).toEqual({paid: 0, refunded: 0});});
it("a non-settled status does not create retained or refunded funds", () => {
  expect(bookingPaymentAccounting({...payment("pending"), status: "cancelled" as AdminBookingPayment["status"]})).toEqual({paid: 0, refunded: 0});
});
it("includes trusted partial refunds in platform totals", () => {
  expect(bookingFinancialStatistics({
    paid: {grossPesos: 0},
    refunded: {grossPesos: 0},
    partialCount: 1,
    partials: [payment("partially_refunded", 200000)],
  })).toEqual({paid: 3000, refunded: 2000});
});
it("keeps platform totals unavailable when a partial refund amount is missing", () => {
  expect(bookingFinancialStatistics({
    paid: {grossPesos: 5000},
    refunded: {grossPesos: 0},
    partialCount: 1,
    partials: [payment("partially_refunded")],
  })).toEqual({paid: null, refunded: null});
});
it.each([-1, 500001])("keeps platform totals unavailable for partial refund %s", (refund) => {
  expect(bookingFinancialStatistics({
    paid: {grossPesos: 5000},
    refunded: {grossPesos: 0},
    partialCount: 1,
    partials: [payment("partially_refunded", refund)],
  })).toEqual({paid: null, refunded: null});
});
it("combines fully paid, partial, and fully refunded principal", () => {
  expect(bookingFinancialStatistics({
    paid: {grossPesos: 5000},
    refunded: {grossPesos: 5000},
    partialCount: 1,
    partials: [payment("partially_refunded", 200000)],
  })).toEqual({paid: 8000, refunded: 7000});
});
it("calculates exactly 100 trusted partial rows", () => {
  const partials = Array.from({length: PARTIAL_REFUND_STATISTICS_LIMIT}, () => payment("partially_refunded", 200000));
  expect(bookingFinancialStatistics({
    paid: {grossPesos: 0},
    refunded: {grossPesos: 0},
    partialCount: PARTIAL_REFUND_STATISTICS_LIMIT,
    partials,
  })).toEqual({paid: 300000, refunded: 200000});
});
it("keeps platform totals unavailable when partial refunds exceed the bounded read", () => {
  expect(bookingFinancialStatistics({
    paid: {grossPesos: 5000},
    refunded: {grossPesos: 5000},
    partialCount: PARTIAL_REFUND_STATISTICS_LIMIT + 1,
    partials: [],
  })).toEqual({paid: null, refunded: null});
});
it("treats a fully refunded group as returned principal and ignores pending reservations", () => {
  expect(bookingFinancialStatistics({
    paid: {grossPesos: 5000},
    refunded: {grossPesos: 5000},
    partialCount: 0,
    partials: [],
  })).toEqual({paid: 5000, refunded: 5000});
});
