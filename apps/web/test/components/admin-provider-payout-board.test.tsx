import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import {ProviderPayoutBoard} from "@/components/admin/payments/provider-payout-board";
import type {AdminProviderPayoutBoard} from "@/lib/admin/payments/admin-payment-types";

vi.mock("@/lib/admin/payments/admin-payment-client", () => ({
  requestMockCompanyCommissionWithdrawal: vi.fn(),
}));

const board: AdminProviderPayoutBoard = {
  companyFloat: {
    availableBalanceInCentavos: 250000,
    outstandingAdvanceInCentavos: 0,
    formattedAvailableBalance: "₱2,500.00",
    formattedOutstandingAdvance: "₱0.00",
    currency: "PHP",
    mode: "mock",
  },
  companyCommission: {
    availableBalanceInCentavos: 150000,
    transferredToFloatInCentavos: 50000,
    withdrawnInCentavos: 25000,
    formattedAvailableBalance: "₱1,500.00",
    formattedTransferredToFloat: "₱500.00",
    formattedWithdrawn: "₱250.00",
    currency: "PHP",
    mode: "mock",
  },
  commissionWithdrawals: [],
  advanceRequests: [
    {
      advanceRequestId: "adv_req_1",
      providerRequestId: "provider_request_1",
      providerId: "provider_1",
      providerName: "Bagong Provider",
      mainEventId: "main_event_1",
      requestedAt: "2026-11-19T02:00:00.000Z",
      providerNote: null,
      grossAmountInCentavos: 100000,
      formattedGrossAmount: "₱1,000.00",
      commissionAmountInCentavos: 2000,
      formattedCommissionAmount: "₱20.00",
      providerNetAmountInCentavos: 98000,
      formattedProviderNetAmount: "₱980.00",
    },
  ],
  rejectedAdvanceRequests: [],
  advanceHistory: [],
  readyToPay: [
    {
      providerDisbursementId: "disbursement_ready_1",
      providerId: "provider_1",
      providerName: "Bagong Provider",
      providerRequestId: "provider_request_1",
      mainEventId: "main_event_1",
      amountInCentavos: 90000,
      formattedAmount: "₱900.00",
      transportReady: false,
      dispatchBlockReason: "platform_disbursements_disabled",
      eligibleAt: "2026-11-19T02:00:00.000Z",
      readyAt: "2026-11-19T02:00:00.000Z",
      trigger: "completed_booking",
    },
  ],
  history: [
    {
      providerDisbursementId: "disbursement_paid_1",
      withdrawalId: "mock_wd_admin_1",
      providerId: "provider_1",
      providerName: "Bagong Provider",
      amountInCentavos: 50000,
      formattedAmount: "₱500.00",
      completedAt: "2026-11-18T02:00:00.000Z",
      mode: "mock",
    },
  ],
};

describe("admin provider payout board", () => {
  it("shows only FEASTA service fee wallet with eye toggles and hides legacy escrow controls and duplicate banners", async () => {
    const user = userEvent.setup();
    render(
      <ProviderPayoutBoard
        board={board}
        loading={false}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {name: "FEASTA service fees"}),
    ).toBeVisible();
    expect(
      screen.queryByText(/Direct-to-provider split active/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {name: "FEASTA service fee wallet"}),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {name: "Withdraw service fee"}),
    ).toBeEnabled();
    expect(screen.getByText("₱1,500.00")).toBeVisible();
    expect(screen.getByText("₱250.00")).toBeVisible();

    await user.click(
      screen.getByRole("button", {name: "Hide wallet available balance"}),
    );
    expect(screen.queryByText("₱1,500.00")).not.toBeInTheDocument();
    expect(screen.getByText("₱••••••")).toBeVisible();
    expect(screen.getByText("₱250.00")).toBeVisible();

    expect(
      screen.queryByRole("button", {name: "Add to company float"}),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Moved to float/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Legacy escrow payouts & company float/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {name: "Company float"}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {name: "Ready to pay"}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {name: "Release mock payout"}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {name: "Approve advance"}),
    ).not.toBeInTheDocument();
  });

  it("shows service fee withdrawal history", () => {
    render(
      <ProviderPayoutBoard
        board={{
          ...board,
          commissionWithdrawals: [
            {
              withdrawalId: "company_commission_wd_test_1",
              amountInCentavos: 25000,
              formattedAmount: "₱250.00",
              destinationType: "gcash",
              accountName: "FEASTA Admin",
              destinationSummary: "09******21",
              completedAt: "2026-11-20T02:00:00.000Z",
              status: "succeeded",
              mode: "mock",
            },
          ],
        }}
        loading={false}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {name: "Service fee withdrawal history"}),
    ).toBeVisible();
    expect(screen.getByText("company_commission_wd_test_1")).toBeVisible();
    expect(screen.getByText("FEASTA Admin")).toBeVisible();
  });

  it("disables Withdraw service fee when available balance is zero", () => {
    render(
      <ProviderPayoutBoard
        board={{
          ...board,
          companyCommission: {
            ...board.companyCommission,
            availableBalanceInCentavos: 0,
            formattedAvailableBalance: "₱0.00",
          },
        }}
        loading={false}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {name: "Withdraw service fee"}),
    ).toBeDisabled();
  });
});
