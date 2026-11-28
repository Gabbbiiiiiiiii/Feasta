import {describe, expect, it} from "vitest";
import {customerServiceVat} from "@/lib/customer/payments/customer-service-vat";

const request = {
  financialSnapshot: {
    schemaVersion: 1,
    currency: "PHP",
    providerTaxType: "vat_registered",
    providerTaxVerificationStatus: "verified",
  },
};

const payment = {
  currency: "PHP",
  financialLedgerSchemaVersion: 1,
  financialLedgerEntryId: "payment_test",
  providerVatComponentInCentavos: 53571,
};

describe("customer-safe provider VAT", () => {
  it("shows only the individual payment VAT component", () => {
    expect(
      customerServiceVat(payment, request, "payment_test", 500000, 0),
    ).toEqual({
      status: "available",
      taxType: "vat_registered",
      includedInPaymentInCentavos: 53571,
      reversedInCentavos: 0,
      netIncludedInCentavos: 53571,
    });
  });

  it("uses the stored cumulative refund reversal", () => {
    expect(
      customerServiceVat(
        {...payment, providerVatReversedInCentavos: 16071},
        request,
        "payment_test",
        500000,
        150000,
      ),
    ).toMatchObject({
      status: "available",
      reversedInCentavos: 16071,
      netIncludedInCentavos: 37500,
    });
  });

  it("does not infer VAT from an unverified tax profile", () => {
    expect(
      customerServiceVat(payment, {
        financialSnapshot: {
          ...request.financialSnapshot,
          providerTaxVerificationStatus: "pending",
        },
      }, "payment_test", 500000, 0),
    ).toEqual({status: "unavailable"});
  });

  it("supports verified Non-VAT without inventing tax", () => {
    expect(
      customerServiceVat({
        ...payment,
        providerVatComponentInCentavos: 0,
      }, {
        financialSnapshot: {
          ...request.financialSnapshot,
          providerTaxType: "non_vat",
        },
      }, "payment_test", 500000, 0),
    ).toMatchObject({
      status: "available",
      taxType: "non_vat",
      netIncludedInCentavos: 0,
    });
  });

  it("fails closed on mismatched ledger identity or bad reversals", () => {
    expect(
      customerServiceVat(payment, request, "other_payment", 500000, 0),
    ).toEqual({status: "unavailable"});

    expect(
      customerServiceVat({
        ...payment,
        providerVatReversedInCentavos: 60000,
      }, request, "payment_test", 500000, 100000),
    ).toEqual({status: "unavailable"});
  });

  it("does not invent missing legacy tax records", () => {
    expect(
      customerServiceVat({}, request, "payment_test", 500000, 0),
    ).toEqual({status: "unavailable"});
  });

  it("rejects an inconsistent proportional VAT reversal", () => {
    expect(
      customerServiceVat({
        ...payment,
        providerVatReversedInCentavos: 16070,
      }, request, "payment_test", 500000, 150000),
    ).toEqual({status: "unavailable"});
  });

  it("accepts a fully refunded payment with fully reversed VAT", () => {
    expect(
      customerServiceVat({
        ...payment,
        providerVatReversedInCentavos: 53571,
      }, request, "payment_test", 500000, 500000),
    ).toMatchObject({
      status: "available",
      reversedInCentavos: 53571,
      netIncludedInCentavos: 0,
    });
  });

  it("rejects missing reversal evidence for a partial refund", () => {
    expect(
      customerServiceVat(
        payment,
        request,
        "payment_test",
        500000,
        150000,
      ),
    ).toEqual({status: "unavailable"});
  });
});
