import {describe, expect, it} from "vitest";

import {customerFeastaCommissionEstimatePesos} from "@/lib/customer/bookings/customer-feasta-commission-estimate";

describe("customerFeastaCommissionEstimatePesos", () => {
  it("returns the tiered capped FEASTA commission in pesos", () => {
    expect(customerFeastaCommissionEstimatePesos(1_850)).toBe(37);
    expect(customerFeastaCommissionEstimatePesos(5_000)).toBe(100);
    expect(customerFeastaCommissionEstimatePesos(25_000)).toBe(500);
    expect(customerFeastaCommissionEstimatePesos(40_000)).toBe(500);
    expect(customerFeastaCommissionEstimatePesos(100_000)).toBe(1_000);
  });

  it("does not invent a charge when price is unavailable", () => {
    expect(customerFeastaCommissionEstimatePesos(null)).toBeNull();
    expect(customerFeastaCommissionEstimatePesos(-1)).toBeNull();
  });
});
