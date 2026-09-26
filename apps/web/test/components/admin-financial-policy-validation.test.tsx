import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateAdminFinancialPolicyUpdate,
} from "@/lib/admin/settings/admin-settings-validation";

describe(
  "Admin financial policy validation",
  () => {
    it(
      "accepts canonical commission and non-VAT configuration",
      () => {
        expect(
          validateAdminFinancialPolicyUpdate(
            {
              platformCommissionRateBps:
                1000,
              platformTaxStatus:
                "non_vat",
              platformVatRateBps:
                1200,
              internalReason:
                "Configure the initial capstone financial policy.",
            },
          ),
        ).toEqual({
          platformCommissionRateBps:
            1000,
          platformTaxStatus:
            "non_vat",
          platformVatRateBps:
            1200,
          internalReason:
            "Configure the initial capstone financial policy.",
        });
      },
    );

    it(
      "accepts VAT Registered simulation with a positive VAT rate",
      () => {
        expect(
          validateAdminFinancialPolicyUpdate(
            {
              platformCommissionRateBps:
                1000,
              platformTaxStatus:
                "vat_registered",
              platformVatRateBps:
                1200,
              internalReason:
                "Enable VAT simulation for capstone demonstration.",
            },
          ).platformTaxStatus,
        ).toBe(
          "vat_registered",
        );
      },
    );

    it.each([
      "has_tin",
      "registered_business",
      "business",
      "vat",
      "",
    ])(
      "rejects non-canonical tax status %s",
      (platformTaxStatus) => {
        expect(() =>
          validateAdminFinancialPolicyUpdate(
            {
              platformCommissionRateBps:
                1000,
              platformTaxStatus,
              platformVatRateBps:
                1200,
              internalReason:
                "Validate the financial policy input.",
            },
          ),
        ).toThrow(
          "Choose a valid FEASTA tax status.",
        );
      },
    );

    it(
      "rejects zero VAT rate when VAT simulation is enabled",
      () => {
        expect(() =>
          validateAdminFinancialPolicyUpdate(
            {
              platformCommissionRateBps:
                1000,
              platformTaxStatus:
                "vat_registered",
              platformVatRateBps:
                0,
              internalReason:
                "Validate VAT simulation requirements.",
            },
          ),
        ).toThrow(
          "VAT rate must be greater than 0",
        );
      },
    );

    it(
      "rejects arbitrary or malformed basis-point rates",
      () => {
        for (
          const platformCommissionRateBps
          of [
            -1,
            10001,
            10.5,
            Number.NaN,
          ]
        ) {
          expect(() =>
            validateAdminFinancialPolicyUpdate(
              {
                platformCommissionRateBps,
                platformTaxStatus:
                  "non_vat",
                platformVatRateBps:
                  1200,
                internalReason:
                  "Validate commission rate bounds.",
              },
            ),
          ).toThrow();
        }
      },
    );

    it(
      "rejects unknown financial fields",
      () => {
        expect(() =>
          validateAdminFinancialPolicyUpdate(
            {
              platformCommissionRateBps:
                1000,
              platformTaxStatus:
                "non_vat",
              platformVatRateBps:
                1200,
              customTax:
                true,
              internalReason:
                "Validate unknown field protection.",
            },
          ),
        ).toThrow(
          'The platform setting "customTax" cannot be modified.',
        );
      },
    );
  },
);
