import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateAdminFinancialPolicyUpdate,
} from "@/lib/admin/settings/admin-settings-validation";

function validInput(
  overrides:
    Record<string, unknown> = {},
) {
  return {
    platformCommissionRateBps:
      1000,
    platformTaxStatus:
      "non_vat",
    platformVatRateBps:
      1200,

    minimumDepositRateBps:
      2000,

    maximumDepositRateBps:
      8000,

    minimumBalanceDueDaysBeforeEvent:
      1,

    maximumBalanceDueDaysBeforeEvent:
      30,

    internalReason:
      "Configure the initial capstone financial policy.",

    ...overrides,
  };
}

describe(
  "Admin financial policy validation",
  () => {
    it(
      "accepts canonical commission, tax and payment-term configuration",
      () => {
        expect(
          validateAdminFinancialPolicyUpdate(
            validInput(),
          ),
        ).toEqual(
          validInput(),
        );
      },
    );

    it(
      "accepts VAT Registered simulation with a positive VAT rate",
      () => {
        expect(
          validateAdminFinancialPolicyUpdate(
            validInput({
              platformTaxStatus:
                "vat_registered",
            }),
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
            validInput({
              platformTaxStatus,
            }),
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
            validInput({
              platformTaxStatus:
                "vat_registered",
              platformVatRateBps:
                0,
            }),
          ),
        ).toThrow(
          "VAT rate must be greater than 0",
        );
      },
    );

    it(
      "rejects malformed FEASTA basis-point rates",
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
              validInput({
                platformCommissionRateBps,
              }),
            ),
          ).toThrow();
        }
      },
    );

    it(
      "rejects zero or full-payment deposit bounds",
      () => {
        expect(() =>
          validateAdminFinancialPolicyUpdate(
            validInput({
              minimumDepositRateBps:
                0,
            }),
          ),
        ).toThrow(
          "Minimum deposit rate must be greater than 0% and below 100%.",
        );

        expect(() =>
          validateAdminFinancialPolicyUpdate(
            validInput({
              maximumDepositRateBps:
                10000,
            }),
          ),
        ).toThrow(
          "Maximum deposit rate must be greater than 0% and below 100%.",
        );
      },
    );

    it(
      "rejects an inverted deposit range",
      () => {
        expect(() =>
          validateAdminFinancialPolicyUpdate(
            validInput({
              minimumDepositRateBps:
                9000,

              maximumDepositRateBps:
                8000,
            }),
          ),
        ).toThrow(
          "Minimum deposit rate cannot exceed the maximum deposit rate.",
        );
      },
    );

    it(
      "rejects invalid balance-deadline limits",
      () => {
        for (
          const [
            field,
            value,
          ] of [
            [
              "minimumBalanceDueDaysBeforeEvent",
              0,
            ],
            [
              "minimumBalanceDueDaysBeforeEvent",
              1.5,
            ],
            [
              "maximumBalanceDueDaysBeforeEvent",
              366,
            ],
          ] as const
        ) {
          expect(() =>
            validateAdminFinancialPolicyUpdate(
              validInput({
                [field]: value,
              }),
            ),
          ).toThrow(
            /between 1 and 365 days/iu,
          );
        }
      },
    );

    it(
      "rejects an inverted balance-deadline range",
      () => {
        expect(() =>
          validateAdminFinancialPolicyUpdate(
            validInput({
              minimumBalanceDueDaysBeforeEvent:
                31,

              maximumBalanceDueDaysBeforeEvent:
                30,
            }),
          ),
        ).toThrow(
          "Minimum balance deadline cannot exceed the maximum balance deadline.",
        );
      },
    );

    it(
      "rejects unknown financial fields",
      () => {
        expect(() =>
          validateAdminFinancialPolicyUpdate(
            validInput({
              customTax:
                true,
            }),
          ),
        ).toThrow(
          'The platform setting "customTax" cannot be modified.',
        );
      },
    );
  },
);