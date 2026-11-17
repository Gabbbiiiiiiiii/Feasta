import {describe, expect, it} from "vitest";
import {
  customerBookingServiceVat,
} from "@/lib/customer/bookings/customer-booking-service-vat";

const request = {
  amount: 20000,
  financialSnapshot: {
    schemaVersion: 1,
    currency: "PHP",
    grossAmountInCentavos: 2000000,
    providerTaxType: "vat_registered",
    providerTaxVerificationStatus: "verified",
  },
};

describe("Customer booking VAT presentation", () => {
  it("shows VAT already included in the frozen booking gross", () => {
    expect(customerBookingServiceVat(request)).toEqual({
      status: "available",
      taxType: "vat_registered",
      includedInPriceInCentavos: 214286,
    });
  });

  it("preserves the verified Non-VAT classification", () => {
    expect(customerBookingServiceVat({
      ...request,
      financialSnapshot: {
        ...request.financialSnapshot,
        providerTaxType: "non_vat",
      },
    })).toEqual({
      status: "available",
      taxType: "non_vat",
      includedInPriceInCentavos: 0,
    });
  });

  it("rejects unverified VAT declarations", () => {
    expect(customerBookingServiceVat({
      ...request,
      financialSnapshot: {
        ...request.financialSnapshot,
        providerTaxVerificationStatus: "pending",
      },
    })).toEqual({status: "unavailable"});
  });

  it("rejects a snapshot that disagrees with booking gross", () => {
    expect(customerBookingServiceVat({
      ...request,
      amount: 19000,
    })).toEqual({status: "unavailable"});
  });

  it("does not invent VAT for historical or missing snapshots", () => {
    expect(customerBookingServiceVat({
      amount: 20000,
    })).toEqual({status: "unavailable"});
  });

  it("rejects invalid money without changing the payment amount", () => {
    expect(customerBookingServiceVat({
      ...request,
      amount: 20000.001,
    })).toEqual({status: "unavailable"});
  });
});