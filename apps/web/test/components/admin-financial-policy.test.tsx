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
      "renders current commission, tax simulation and policy version",
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
          screen.getByText(
            /Policy version 1/iu,
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            /does not claim that FEASTA is currently registered/iu,
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

        expect(
          save,
        ).toBeDisabled();

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

        expect(
          save,
        ).toBeDisabled();

        fireEvent.change(
          screen.getByLabelText(
            "Internal reason",
          ),
          {
            target: {
              value:
                "Adjust the capstone finance demonstration policy.",
            },
          },
        );

        expect(
          save,
        ).toBeEnabled();
      },
    );

    it(
      "submits basis points and refreshes the saved policy version",
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

            platformVatRateBps:
              1200,

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
            "FEASTA VAT rate (%)",
          ),
          {
            target: {
              value: "12",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "Internal reason",
          ),
          {
            target: {
              value:
                "Enable the VAT simulation for the capstone demonstration.",
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

            internalReason:
              "Enable the VAT simulation for the capstone demonstration.",
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
            "Internal reason",
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
            "FEASTA tax status",
          ),
          {
            target: {
              value:
                "vat_registered",
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
            "FEASTA tax status",
          ),
        ).toHaveValue(
          "non_vat",
        );
      },
    );
  },
);
