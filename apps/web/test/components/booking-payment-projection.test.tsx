import {describe, expect, it} from "vitest";
import {projectBookingPayment} from "@/lib/payments/booking-payment-projection";

const deposit = {financialSnapshot: {grossAmountInCentavos: 500000}, grossSettledAmountInCentavos: 250000,
  outstandingAmountInCentavos: 250000, settlementStatus: "deposit_settled"};
describe("canonical booking payment projection", () => {
  it("projects a deposit independently from stale legacy fields", () => {
    expect(projectBookingPayment({...deposit, paymentStatus: "unpaid"})).toBe("partially_paid");
  });
  it("projects zero settlement as unpaid", () => {
    expect(projectBookingPayment({...deposit, grossSettledAmountInCentavos: 0, outstandingAmountInCentavos: 500000, settlementStatus: "unpaid"})).toBe("unpaid");
  });
  it("projects full settlement as paid", () => {
    expect(projectBookingPayment({...deposit, grossSettledAmountInCentavos: 500000, outstandingAmountInCentavos: 0, settlementStatus: "fully_settled"})).toBe("paid");
  });
  it.each([NaN, -1, 250000.5, 500000])("rejects malformed accounting %s", (settled) => {
    expect(projectBookingPayment({...deposit, grossSettledAmountInCentavos: settled})).toBeNull();
  });
  it("preserves historical settlement for completed refunds without reopening obligations", () => {
    expect(projectBookingPayment({...deposit, paymentStatus: "refunded", refundedAmountInCentavos: 250000})).toBe("partially_paid");
  });
});
