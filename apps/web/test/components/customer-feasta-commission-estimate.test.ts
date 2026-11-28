import {describe, expect, it} from "vitest";

import {customerFeastaCommissionEstimatePesos} from "@/lib/customer/bookings/customer-feasta-commission-estimate";

describe("customerFeastaCommissionEstimatePesos", () => {
  it("returns the dynamic customer-paid flat FEASTA service fee in pesos with no cap", () => {
    // Default rate: 20 bps (0.2%)
    expect(customerFeastaCommissionEstimatePesos(1_000)).toBe(2);
    expect(customerFeastaCommissionEstimatePesos(5_000)).toBe(10);
    expect(customerFeastaCommissionEstimatePesos(100_000)).toBe(200);
    expect(customerFeastaCommissionEstimatePesos(1_000_000)).toBe(2_000);

    // Dynamic Admin rate change: 10 bps (0.1%)
    expect(customerFeastaCommissionEstimatePesos(1_000, 10)).toBe(1);
    expect(customerFeastaCommissionEstimatePesos(50_000, 10)).toBe(50);
  });

  it("does not invent a charge when price is unavailable", () => {
    expect(customerFeastaCommissionEstimatePesos(null)).toBeNull();
    expect(customerFeastaCommissionEstimatePesos(-1)).toBeNull();
  });
});
