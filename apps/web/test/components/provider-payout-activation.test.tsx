import {render, screen} from "@testing-library/react";
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

import {ProviderFinancePanel} from "@/app/provider/payments/provider-finance-panel";

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
});
