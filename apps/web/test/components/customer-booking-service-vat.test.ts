import {describe, expect, it} from "vitest";
import {
  customerBookingServiceVat,
  specialOfferBreakdown,
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

describe("Special Request pricing", () => {
  const quote = {subtotalInCentavos: 2000000, totalInCentavos: 2000000, deliveryIncluded: true};
  it("shows the ordered quantity and matching frozen unit price", () => {
    const order = {...quote, quantity: 4, unitAmountInCentavos: 500000};
    expect(specialOfferBreakdown(order, 2000000, undefined)).toMatchObject({
      quantity: 4,
      unitAmountInCentavos: 500000,
    });
    expect(specialOfferBreakdown({...order, unitAmountInCentavos: 600000}, 2000000, undefined))
      .not.toHaveProperty("unitAmountInCentavos");
  });
  it("shows frozen provider commission separately from the agreed customer amount", () => {
    expect(specialOfferBreakdown(quote, 2000000, {
      ...request.financialSnapshot,
      platformCommissionTotalInCentavos: 40000,
    })).toEqual({
      subtotalInCentavos: 2000000,
      deliveryIncluded: true,
      providerFeeInCentavos: 40000,
    });
  });
  it("preserves legacy quote amounts without guessing a fee or delivery treatment", () => {
    const legacy = {...quote, totalInCentavos: 2050000, deliveryIncluded: undefined};
    expect(specialOfferBreakdown(legacy, 2050000, undefined)).toEqual({
      subtotalInCentavos: 2000000,
      deliveryIncluded: false,
      providerFeeInCentavos: null,
    });
    expect(specialOfferBreakdown(legacy, 2000000, request.financialSnapshot)).toBeUndefined();
  });

  it("extracts Provider VAT strictly from provider serviceSubtotal on customer_paid_flat_v1 bookings", () => {
    expect(
      customerBookingServiceVat({
        amount: 1002,
        financialSnapshot: {
          schemaVersion: 1,
          currency: "PHP",
          serviceSubtotalInCentavos: 100000,
          grossAmountInCentavos: 100200,
          platformCommissionModel: "customer_paid_flat_v1",
          platformCommissionRateBps: 20,
          platformCommissionTotalInCentavos: 200,
          providerTaxType: "vat_registered",
          providerTaxVerificationStatus: "verified",
        },
      }),
    ).toEqual({
      status: "available",
      taxType: "vat_registered",
      includedInPriceInCentavos: 10714,
    });
  });
});
