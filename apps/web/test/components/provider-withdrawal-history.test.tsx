import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {ProviderFinancePanel} from "@/app/provider/payments/provider-finance-panel";
import type {ProviderFinanceOverview} from "@/lib/provider/payments/provider-finance-types";

vi.mock("@/app/provider/payments/actions", () => ({
  loadProviderFinanceOverviewAction: vi.fn(),
}));

vi.mock("@/lib/provider/payments/provider-payout-client", () => ({
  startProviderPayoutSetup: vi.fn(),
  refreshProviderPayoutSetup: vi.fn(),
  saveProviderPayoutActivationProfile: vi.fn(),
  requestMockProviderWithdrawal: vi.fn(),
}));

function finance(
  overrides: Partial<ProviderFinanceOverview> = {},
): ProviderFinanceOverview {
  return {
    payoutAccount: {
      setupStatus: "ready",
      linkedAccountType: "merchant",
      invitationStatus: "accepted",
      activationStatus: "activated",
      payoutReady: true,
      relationshipStatus: null,
      settlementTransportMode: "disabled",
      settlementTransportReady: false,
      paymongoAccountId: null,
      childAccountPresent: true,
      activationProfileComplete: true,
      identityVerificationStatus: "verified",
      gatewayLastStatusCode: null,
      updatedAt: null,
    },
    earnings: [],
    earningSummary: {
      pendingAmountInCentavos: 0,
      availableAmountInCentavos: 2160000,
      paidAmountInCentavos: 10000,
      reversedAmountInCentavos: 0,
    },
    settlements: [],
    settlementSummary: {
      awaitingAvailabilityAmountInCentavos: 0,
      readyAmountInCentavos: 2160000,
      reservedAmountInCentavos: 0,
      paidOutAmountInCentavos: 10000,
      reconciliationRequiredCount: 0,
    },
    mockWithdrawals: [],
    ...overrides,
  };
}

describe("provider withdrawal history", () => {
  it("shows an empty state between earnings and payout account", () => {
    render(<ProviderFinancePanel initialFinance={finance()} />);

    expect(screen.getByRole("heading", {name: "Withdrawal history"})).toBeVisible();
    expect(
      screen.getByText(/No withdrawals yet/u),
    ).toBeVisible();
    expect(
      screen.getByText(/self-service mock withdrawals only/u),
    ).toBeVisible();
    expect(screen.getByRole("heading", {name: "Payout account"})).toBeVisible();
  });

  it("lists recorded mock withdrawals with masked destination details", () => {
    render(
      <ProviderFinancePanel
        initialFinance={finance({
          mockWithdrawals: [
            {
              withdrawalId: "mock_wd_history_001",
              amountInCentavos: 10000,
              status: "succeeded",
              mode: "mock",
              destinationType: "gcash",
              accountName: "Bagong Provider",
              mobileMasked: "••••3450",
              bankName: null,
              accountNumberMasked: null,
              allocationCount: 1,
              createdAt: "2026-11-19T10:00:00.000Z",
              completedAt: "2026-11-19T10:00:00.000Z",
            },
          ],
        })}
      />,
    );

    const history = screen.getByRole("heading", {
      name: "Withdrawal history",
    }).closest("section");

    expect(history).not.toBeNull();
    expect(history).toHaveTextContent("₱100.00");
    expect(history).toHaveTextContent("GCash · ••••3450");
    expect(history).toHaveTextContent("Bagong Provider");
    expect(history).toHaveTextContent("Reference: mock_wd_history_001");
    expect(history).toHaveTextContent("Recorded");
  });
});
