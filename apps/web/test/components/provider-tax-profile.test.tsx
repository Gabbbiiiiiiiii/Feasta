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

import type {
  ProviderTaxProfile,
} from "@/lib/provider/tax-profile/provider-tax-profile-types";

const mocks =
  vi.hoisted(() => ({
    refresh: vi.fn(),
    submit: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }));

vi.mock(
  "next/navigation",
  () => ({
    useRouter: () => ({
      refresh:
        mocks.refresh,
    }),
  }),
);

vi.mock(
  "@/lib/provider/tax-profile/provider-tax-profile-client",
  () => ({
    submitProviderTaxProfile:
      mocks.submit,
  }),
);

vi.mock(
  "@/components/feedback/toast",
  () => ({
    feastaToast: {
      success:
        mocks.success,
      error:
        mocks.error,
    },
  }),
);

import {
  ProviderTaxProfileClient,
} from "@/app/provider/tax-profile/provider-tax-profile-client";

function profile(
  overrides:
    Partial<
      ProviderTaxProfile
    > = {},
): ProviderTaxProfile {
  return {
    providerId:
      "provider-one",

    birRegisteredName:
      "Feasta Creative Studio",

    tin: "",

    taxType: null,

    verificationStatus:
      null,

    submittedAt: null,
    verifiedAt: null,
    rejectedAt: null,

    rejectionReason:
      null,

    updatedAt: null,

    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.submit
    .mockResolvedValue({
      providerId:
        "provider-one",

      verificationStatus:
        "pending",

      changed: true,
    });
});

describe(
  "Provider Tax Profile",
  () => {
    it(
      "renders independent tax-status guidance",
      () => {
        render(
          <ProviderTaxProfileClient
            initialProfile={
              profile()
            }
          />,
        );

        expect(
          screen.getByRole(
            "heading",
            {
              level: 1,
              name:
                "Tax Profile",
            },
          ),
        ).toBeVisible();

        expect(
          screen.getByText(
            /Having a TIN does not automatically mean/iu,
          ),
        ).toBeVisible();

        expect(
          screen.getByText(
            /separate from business registration/iu,
          ),
        ).toBeVisible();
      },
    );

    it(
      "validates and submits normalized provider tax information",
      async () => {
        render(
          <ProviderTaxProfileClient
            initialProfile={
              profile()
            }
          />,
        );

        fireEvent.change(
          screen.getByLabelText(
            "TIN",
          ),
          {
            target: {
              value:
                "123-456-789-000",
            },
          },
        );

        fireEvent.click(
          screen.getByRole(
            "radio",
            {
              name:
                /VAT Registered/iu,
            },
          ),
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Submit Tax Profile",
            },
          ),
        );

        await waitFor(
          () => {
            expect(
              mocks.submit,
            ).toHaveBeenCalledWith({
              birRegisteredName:
                "Feasta Creative Studio",

              tin:
                "123456789000",

              taxType:
                "vat_registered",
            });
          },
        );

        expect(
          await screen.findByText(
            "Tax profile submitted for administrator review.",
          ),
        ).toBeVisible();

        expect(
          screen.getByText(
            "Pending review",
          ),
        ).toBeVisible();
      },
    );

    it(
      "locks a pending profile",
      () => {
        render(
          <ProviderTaxProfileClient
            initialProfile={
              profile({
                tin:
                  "123456789000",

                taxType:
                  "non_vat",

                verificationStatus:
                  "pending",
              })
            }
          />,
        );

        expect(
          screen.getByLabelText(
            "TIN",
          ),
        ).toBeDisabled();

        expect(
          screen.queryByRole(
            "button",
            {
              name:
                "Submit Tax Profile",
            },
          ),
        ).not.toBeInTheDocument();
      },
    );

    it(
      "locks a verified profile",
      () => {
        render(
          <ProviderTaxProfileClient
            initialProfile={
              profile({
                tin:
                  "123456789000",

                taxType:
                  "vat_registered",

                verificationStatus:
                  "verified",
              })
            }
          />,
        );

        expect(
          screen.getByText(
            "Verified",
          ),
        ).toBeVisible();

        expect(
          screen.getByLabelText(
            "BIR registered name",
          ),
        ).toBeDisabled();
      },
    );

    it(
      "permits rejected information to be corrected and resubmitted",
      async () => {
        render(
          <ProviderTaxProfileClient
            initialProfile={
              profile({
                tin:
                  "123456789000",

                taxType:
                  "non_vat",

                verificationStatus:
                  "rejected",

                rejectionReason:
                  "The submitted TIN requires correction.",
              })
            }
          />,
        );

        expect(
          screen.getByText(
            "The submitted TIN requires correction.",
          ),
        ).toBeVisible();

        const tin =
          screen.getByLabelText(
            "TIN",
          );

        expect(
          tin,
        ).toBeEnabled();

        fireEvent.change(
          tin,
          {
            target: {
              value:
                "987-654-321-000",
            },
          },
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Resubmit Tax Profile",
            },
          ),
        );

        await waitFor(
          () =>
            expect(
              mocks.submit,
            ).toHaveBeenCalledWith({
              birRegisteredName:
                "Feasta Creative Studio",

              tin:
                "987654321000",

              taxType:
                "non_vat",
            }),
        );
      },
    );
  },
);
