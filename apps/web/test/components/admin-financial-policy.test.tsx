import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  updateAdminFinancialPolicyAction,
} from "@/app/admin/settings/actions";
import {
  AdminFinancialPolicyClient,
} from "@/components/admin/settings/admin-financial-policy-client";
import type {
  AdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-types";

vi.mock(
  "@/app/admin/settings/actions",
  () => ({
    updateAdminFinancialPolicyAction:
      vi.fn(),
  }),
);

const initialSettings:
  AdminPlatformSettings = {
    platformName: "FEASTA",
    operatingCity: "Ormoc City",
    supportEmail:
      "support@feasta.ph",
    serviceAreaDescription:
      "FEASTA serves customers and verified event service providers in Ormoc City.",

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

    financialPolicyVersion:
      1,

    financialPolicyEffectiveAt:
      null,

    timezone:
      "Asia/Manila",

    currencyCode: "PHP",
    schemaVersion: 1,
    isPublic: true,

    updatedAt: null,
    updatedBy: null,
  };

describe(
  "Admin financial policy UI",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "renders commission, tax and payment-term policy values",
      () => {
        render(
          <AdminFinancialPolicyClient
            initialSettings={
              initialSettings
            }
          />,
        );

        expect(
          screen.getByRole(
            "heading",
            {
              name:
                "Financial Policy",
            },
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByLabelText(
            "Platform commission rate (%)",
          ),
        ).toHaveValue(10);

        expect(
          screen.getByLabelText(
            "FEASTA tax status",
          ),
        ).toHaveValue(
          "non_vat",
        );

        expect(
          screen.getByLabelText(
            "FEASTA VAT rate (%)",
          ),
        ).toHaveValue(12);

        expect(
          screen.getByLabelText(
            "Minimum deposit (%)",
          ),
        ).toHaveValue(20);

        expect(
          screen.getByLabelText(
            "Maximum deposit (%)",
          ),
        ).toHaveValue(80);

        expect(screen.queryByLabelText(/balance deadline \(days before event\)/i)).not.toBeInTheDocument();

        expect(screen.queryByLabelText(/balance deadline \(days before event\)/i)).not.toBeInTheDocument();

        expect(
          screen.getByText(
            /Policy version 1/iu,
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            /existing booking financial snapshots are not recalculated/iu,
          ),
        ).toBeInTheDocument();
      },
    );

    it(
      "keeps FEASTA tax status independent from provider tax status",
      () => {
        render(
          <AdminFinancialPolicyClient
            initialSettings={
              initialSettings
            }
          />,
        );

        expect(
          screen.getByText(
            /Provider tax status is managed separately/iu,
          ),
        ).toBeInTheDocument();

        fireEvent.change(
          screen.getByLabelText(
            "FEASTA tax status",
          ),
          {
            target: {
              value:
                "vat_registered",
            },
          },
        );

        expect(
          screen.getByText(
            "VAT Registered simulation",
          ),
        ).toBeInTheDocument();
      },
    );

    it(
      "requires a policy change and an administrative reason before saving",
      () => {
        render(
          <AdminFinancialPolicyClient
            initialSettings={
              initialSettings
            }
          />,
        );

        const save =
          screen.getByRole(
            "button",
            {
              name:
                "Save financial policy",
            },
          );

        expect(save).toBeDisabled();

        fireEvent.change(
          screen.getByLabelText(
            "Platform commission rate (%)",
          ),
          {
            target: {
              value: "12.5",
            },
          },
        );

        expect(save).toBeDisabled();

        fireEvent.change(
          screen.getByLabelText(
            "Reason for changes",
          ),
          {
            target: {
              value:
                "Adjust the capstone finance demonstration policy.",
            },
          },
        );

        expect(save).toBeEnabled();
      },
    );

    it(
      "accepts a valid payment-term policy change with an administrative reason",
      () => {
        render(
          <AdminFinancialPolicyClient
            initialSettings={
              initialSettings
            }
          />,
        );

        const save =
          screen.getByRole(
            "button",
            {
              name:
                "Save financial policy",
            },
          );

        fireEvent.change(
          screen.getByLabelText(
            "Minimum deposit (%)",
          ),
          {
            target: {
              value: "25",
            },
          },
        );

        expect(save).toBeDisabled();

        fireEvent.change(
          screen.getByLabelText(
            "Reason for changes",
          ),
          {
            target: {
              value:
                "Adjust future Provider package payment-term limits.",
            },
          },
        );

        expect(save).toBeEnabled();
      },
    );

    it(
      "blocks inverted payment-term ranges",
      () => {
        render(
          <AdminFinancialPolicyClient
            initialSettings={
              initialSettings
            }
          />,
        );

        fireEvent.change(
          screen.getByLabelText(
            "Minimum deposit (%)",
          ),
          {
            target: {
              value: "90",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "Reason for changes",
          ),
          {
            target: {
              value:
                "Validate payment-term range handling.",
            },
          },
        );

        expect(
          screen.getByRole(
            "button",
            {
              name:
                "Save financial policy",
            },
          ),
        ).toBeDisabled();

        expect(
          screen.getByText(
            "Invalid",
          ),
        ).toBeInTheDocument();
      },
    );

    it(
      "submits all canonical policy fields and refreshes the saved version",
      async () => {
        vi.mocked(
          updateAdminFinancialPolicyAction,
        ).mockResolvedValue({
          changed: true,
          settings: {
            ...initialSettings,

            platformCommissionRateBps:
              1250,

            platformTaxStatus:
              "vat_registered",

            minimumDepositRateBps:
              2500,

            maximumDepositRateBps:
              7500,

            minimumBalanceDueDaysBeforeEvent:
              1,

            maximumBalanceDueDaysBeforeEvent:
              30,

            financialPolicyVersion:
              2,

            financialPolicyEffectiveAt:
              "2026-09-25T10:00:00.000Z",

            updatedAt:
              "2026-09-25T10:00:00.000Z",

            updatedBy:
              "admin-1",
          },
        });

        render(
          <AdminFinancialPolicyClient
            initialSettings={
              initialSettings
            }
          />,
        );

        fireEvent.change(
          screen.getByLabelText(
            "Platform commission rate (%)",
          ),
          {
            target: {
              value: "12.5",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "FEASTA tax status",
          ),
          {
            target: {
              value:
                "vat_registered",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "Minimum deposit (%)",
          ),
          {
            target: {
              value: "25",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "Maximum deposit (%)",
          ),
          {
            target: {
              value: "75",
            },
          },
        );



        fireEvent.change(
          screen.getByLabelText(
            "Reason for changes",
          ),
          {
            target: {
              value:
                "Update the versioned financial and payment-term policy.",
            },
          },
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Save financial policy",
            },
          ),
        );

        await waitFor(() => {
          expect(
            updateAdminFinancialPolicyAction,
          ).toHaveBeenCalledWith({
            platformCommissionRateBps:
              1250,

            platformTaxStatus:
              "vat_registered",

            platformVatRateBps:
              1200,

            minimumDepositRateBps:
              2500,

            maximumDepositRateBps:
              7500,

            minimumBalanceDueDaysBeforeEvent:
              1,

            maximumBalanceDueDaysBeforeEvent:
              30,

            internalReason:
              "Update the versioned financial and payment-term policy.",
          });
        });

        expect(
          await screen.findByText(
            "Financial policy was updated successfully.",
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            /Policy version 2/iu,
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByLabelText(
            "Minimum deposit (%)",
          ),
        ).toHaveValue(25);

        expect(screen.queryByLabelText(/balance deadline \(days before event\)/i)).not.toBeInTheDocument();

        expect(
          screen.getByLabelText(
            "Reason for changes",
          ),
        ).toHaveValue("");
      },
    );

    it(
      "restores the last saved policy",
      () => {
        render(
          <AdminFinancialPolicyClient
            initialSettings={
              initialSettings
            }
          />,
        );

        fireEvent.change(
          screen.getByLabelText(
            "Platform commission rate (%)",
          ),
          {
            target: {
              value: "25",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "Maximum deposit (%)",
          ),
          {
            target: {
              value: "70",
            },
          },
        );


        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Discard financial changes",
            },
          ),
        );

        expect(
          screen.getByLabelText(
            "Platform commission rate (%)",
          ),
        ).toHaveValue(10);

        expect(
          screen.getByLabelText(
            "Maximum deposit (%)",
          ),
        ).toHaveValue(80);

        expect(screen.queryByLabelText(/balance deadline \(days before event\)/i)).not.toBeInTheDocument();
      },
    );
  },
);