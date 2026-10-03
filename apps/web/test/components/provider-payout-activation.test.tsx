import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import type {ProviderFinanceOverview} from "@/lib/provider/payments/provider-finance-types";

vi.mock("@/app/provider/payments/actions", () => ({
  loadProviderFinanceOverviewAction: vi.fn(),
}));

vi.mock("@/lib/provider/payments/provider-payout-client", () => ({
  startProviderPayoutSetup: vi.fn(),
  refreshProviderPayoutSetup: vi.fn(),
  saveProviderPayoutActivationProfile: vi.fn(),
}));

import {loadProviderFinanceOverviewAction} from "@/app/provider/payments/actions";
import {payoutSetupGuidance} from "@/lib/provider/payments/provider-payout-status";
import {ProviderFinancePanel} from "@/app/provider/payments/provider-finance-panel";
import {
  refreshProviderPayoutSetup,
  startProviderPayoutSetup,
} from "@/lib/provider/payments/provider-payout-client";

const finance: ProviderFinanceOverview = {
  payoutAccount: {
    setupStatus: "onboarding",
    linkedAccountType: "merchant",
    invitationStatus: "rejected",
    activationStatus: "pending",
    payoutReady: false,
    relationshipStatus: null,
    settlementTransportMode: "disabled",
    settlementTransportReady: false,
    paymongoAccountId: null,
    childAccountPresent: true,
    activationProfileComplete: false,
    identityVerificationStatus: "pending",
    gatewayLastStatusCode: null,
    updatedAt: null,
  },
  earnings: [],
  earningSummary: {
    pendingAmountInCentavos: 0,
    availableAmountInCentavos: 0,
    paidAmountInCentavos: 0,
    reversedAmountInCentavos: 0,
  },
  settlements: [],
  settlementSummary: {
    awaitingAvailabilityAmountInCentavos: 0,
    readyAmountInCentavos: 0,
    reservedAmountInCentavos: 0,
    paidOutAmountInCentavos: 0,
    reconciliationRequiredCount: 0,
  },
};

describe("provider payout activation form", () => {
  it("requires a choice and does not preselect legal or KYC values", () => {
    render(<ProviderFinancePanel initialFinance={finance} />);

    expect(screen.getByRole("heading", {name: "Activation details"})).toBeVisible();
    expect(screen.getByLabelText("Legal business type")).toHaveValue("");
    expect(screen.getByLabelText("Nature of work")).toHaveValue("");
    expect(screen.getByLabelText("Source of funds")).toHaveValue("");
    expect(screen.getByLabelText("Merchant category")).toHaveValue("");
    expect(screen.queryByText("org_")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Refresh status"})).toBeEnabled();
  });

  it("shows a failed payout setup call without pretending it succeeded", async () => {
    const user = userEvent.setup();
    vi.mocked(startProviderPayoutSetup).mockRejectedValueOnce(
      new Error(
        "PayMongo could not start payout setup. Please try again. If the problem continues, the payout integration configuration needs to be checked.",
      ),
    );

    render(
      <ProviderFinancePanel
        initialFinance={{
          ...finance,
          payoutAccount: {
            ...finance.payoutAccount,
            setupStatus: "unavailable",
            childAccountPresent: false,
            gatewayLastStatusCode: 404,
            payoutReady: false,
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "PayMongo could not start payout setup",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("PAYMONGO_SECRET_KEY");
    expect(screen.getByRole("status")).not.toHaveTextContent("cannot call");
    expect(screen.getByText("Payout setup required")).toBeVisible();

    await user.click(screen.getByRole("button", {name: "Set up payouts"}));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PayMongo could not start payout setup",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("PAYMONGO_SECRET_KEY");
    expect(screen.getByText("Payout setup required")).toBeVisible();
    expect(screen.queryByText("Settlement transport verified")).not.toBeInTheDocument();
  });

  it("adds the HTTP 404 detail only in development", () => {
    const account = {
      payoutReady: false,
      childAccountPresent: false,
      gatewayLastStatusCode: 404,
    };

    vi.stubEnv("NODE_ENV", "development");
    expect(payoutSetupGuidance(account)).toContain(
      "PayMongo setup request returned HTTP 404.",
    );
    expect(payoutSetupGuidance(account)).not.toContain("PAYMONGO_SECRET_KEY");

    vi.stubEnv("NODE_ENV", "production");
    expect(payoutSetupGuidance(account)).not.toContain("HTTP 404");
    vi.unstubAllEnvs();
  });

  it("updates payout status after a successful server refresh", async () => {
    const user = userEvent.setup();
    vi.mocked(refreshProviderPayoutSetup).mockResolvedValueOnce({
      setupStatus: "ready",
      payoutReady: true,
      linkedAccountType: "merchant",
      invitationStatus: null,
      activationStatus: "activated",
    });
    vi.mocked(loadProviderFinanceOverviewAction).mockResolvedValueOnce({
      ...finance,
      payoutAccount: {
        ...finance.payoutAccount,
        setupStatus: "ready",
        payoutReady: true,
        childAccountPresent: true,
        activationProfileComplete: true,
        gatewayLastStatusCode: null,
        settlementTransportReady: false,
      },
    });

    render(<ProviderFinancePanel initialFinance={finance} />);

    await user.click(screen.getByRole("button", {name: "Refresh status"}));

    expect(await screen.findByText(
      "Account linked - settlement transport unavailable",
    )).toBeVisible();
    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.queryByText("Payout setup required")).not.toBeInTheDocument();
  });
});
