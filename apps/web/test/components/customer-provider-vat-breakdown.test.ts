import {describe, expect, it} from "vitest";

import {
  customerProviderVatBreakdown,
} from "@/lib/customer/bookings/customer-provider-vat-breakdown";

describe("customer booking VAT preview", () => {
  it("extracts VAT from PHP 1850", () => {
    const result = customerProviderVatBreakdown(
      1850,
      "vat_registered",
    );

    expect(result).toEqual({
      exclusiveCentavos: 165179,
      vatCentavos: 19821,
    });

    expect(
      result!.exclusiveCentavos + result!.vatCentavos,
    ).toBe(185000);
  });

  it("does not invent VAT for Non-VAT providers", () => {
    expect(customerProviderVatBreakdown(
      1850,
      "non_vat",
    )).toBeNull();
  });

  it("does not invent VAT when verification is unknown", () => {
    expect(customerProviderVatBreakdown(
      1850,
      "unknown",
    )).toBeNull();
  });

  it("handles loading and invalid prices", () => {
    expect(customerProviderVatBreakdown(
      1850,
      null,
    )).toBeNull();

    for (const price of [null, -1, NaN, Infinity]) {
      expect(customerProviderVatBreakdown(
        price,
        "vat_registered",
      )).toBeNull();
    }
  });

  it("recalculates when package price changes", () => {
    expect(customerProviderVatBreakdown(
      2240,
      "vat_registered",
    )).toEqual({
      exclusiveCentavos: 200000,
      vatCentavos: 24000,
    });
  });

  it("uses integer centavo rounding", () => {
    expect(customerProviderVatBreakdown(
      1,
      "vat_registered",
    )).toEqual({
      exclusiveCentavos: 89,
      vatCentavos: 11,
    });
  });
});
