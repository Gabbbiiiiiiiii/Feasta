import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ProviderPayoutBoard} from "@/components/admin/payments/provider-payout-board";
import {
  approveCompanyAdvanceRequest,
  releaseMockProviderDisbursement,
} from "@/lib/admin/payments/admin-payment-client";
import type {AdminProviderPayoutBoard} from "@/lib/admin/payments/admin-payment-types";

vi.mock("@/lib/admin/payments/admin-payment-client", () => ({
  releaseMockProviderDisbursement: vi.fn(),
  fundCompanyFloat: vi.fn(),
  transferCompanyCommissionToFloat: vi.fn(),
  requestMockCompanyCommissionWithdrawal: vi.fn(),
  approveCompanyAdvanceRequest: vi.fn(),
  rejectCompanyAdvanceRequest: vi.fn(),
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
    transferredToFloatInCentavos: 0,
    withdrawnInCentavos: 0,
    formattedAvailableBalance: "₱1,500.00",
    formattedTransferredToFloat: "₱0.00",
    formattedWithdrawn: "₱0.00",
    currency: "PHP",
    mode: "mock",
  },
  commissionWithdrawals: [],
  advanceRequests: [],
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
  beforeEach(() => {
    vi.mocked(releaseMockProviderDisbursement).mockReset();
  });

  it("hides legacy escrow controls when there are no historical escrow records", () => {
    render(
      <ProviderPayoutBoard
        board={{
          ...board,
          companyFloat: {
            ...board.companyFloat,
            availableBalanceInCentavos: 0,
            outstandingAdvanceInCentavos: 0,
            formattedAvailableBalance: "₱0.00",
          },
          readyToPay: [],
          history: [],
          advanceRequests: [],
          rejectedAdvanceRequests: [],
          advanceHistory: [],
        }}
        loading={false}
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
        onReleaseStart={vi.fn()}
        onReleaseEnd={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {name: "FEASTA service fees & direct splits"}),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {name: "FEASTA service fee wallet"}),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {name: "Withdraw service fee"}),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", {name: "Add to company float"}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Legacy escrow payouts & company float/i),
    ).not.toBeInTheDocument();
  });

  it("shows service fee wallet and collapsed legacy escrow records when historical items exist", async () => {
    const user = userEvent.setup();
    render(
      <ProviderPayoutBoard
        board={board}
        loading={false}
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
        onReleaseStart={vi.fn()}
        onReleaseEnd={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", {name: "FEASTA service fees & direct splits"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "FEASTA service fee wallet"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Withdraw service fee"})).toBeEnabled();
    expect(screen.getByRole("button", {name: "Add to company float"})).toBeEnabled();

    const legacySummary = screen.getByText(/Legacy escrow payouts & company float/i);
    expect(legacySummary.closest("details")).not.toHaveAttribute("open");
    await user.click(legacySummary);

    expect(screen.getByRole("heading", {name: "Ready to pay"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Admin payout history"})).toBeVisible();
    expect(screen.getByText("₱900.00")).toBeVisible();
    expect(screen.getByText("₱500.00")).toBeVisible();
    expect(screen.getByText(/Reference: mock_wd_admin_1/u)).toBeVisible();
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
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
        onReleaseStart={vi.fn()}
        onReleaseEnd={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {name: "Service fee withdrawal history"}),
    ).toBeVisible();
    expect(screen.getByText("₱250.00")).toBeVisible();
    expect(screen.getByText("company_commission_wd_test_1")).toBeVisible();
    expect(screen.getByText("FEASTA Admin")).toBeVisible();
  });

  it("shows rejected advance requests in company advance history", async () => {
    const user = userEvent.setup();
    render(
      <ProviderPayoutBoard
        board={{
          ...board,
          rejectedAdvanceRequests: [
            {
              advanceRequestId: "adv_req_rejected_1",
              providerRequestId: "provider_request_rejected_1",
              providerId: "provider_1",
              providerName: "Bagong Provider",
              providerNetAmountInCentavos: 88000,
              formattedProviderNetAmount: "₱880.00",
              rejectedAt: "2026-11-19T03:00:00.000Z",
              status: "rejected",
            },
          ],
        }}
        loading={false}
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
        onReleaseStart={vi.fn()}
        onReleaseEnd={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Legacy escrow payouts & company float/i));
    expect(screen.getByRole("heading", {name: "Company advance history"})).toBeVisible();
    expect(screen.getByText("₱880.00")).toBeVisible();
    expect(screen.getByText("rejected")).toBeVisible();
    expect(screen.getByText("provider_request_rejected_1")).toBeVisible();
  });

  it("blocks confirm until password and RELEASE are provided", async () => {
    const user = userEvent.setup();

    render(
      <ProviderPayoutBoard
        board={board}
        loading={false}
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
        onReleaseStart={vi.fn()}
        onReleaseEnd={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Legacy escrow payouts & company float/i));
    await user.click(screen.getByRole("button", {name: "Release mock payout"}));
    const dialog = screen.getByRole("dialog", {
      name: "Release mock provider payout?",
    });
    const confirm = within(dialog).getByRole("button", {
      name: "Release mock payout",
    });

    expect(confirm).toBeDisabled();
    expect(releaseMockProviderDisbursement).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Admin password"), "secret");
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText("Type RELEASE to confirm"),
      "RELEASE",
    );
    expect(confirm).toBeEnabled();
  });

  it("releases a ready obligation through the mock callable", async () => {
    const user = userEvent.setup();
    const onReleased = vi.fn();
    const onReleaseStart = vi.fn();
    const onReleaseEnd = vi.fn();

    vi.mocked(releaseMockProviderDisbursement).mockResolvedValue({
      providerDisbursementId: "disbursement_ready_1",
      withdrawalId: "mock_wd_new",
      amountInCentavos: 90000,
      currency: "PHP",
      status: "succeeded",
      mode: "mock",
      providerId: "provider_1",
    });

    render(
      <ProviderPayoutBoard
        board={board}
        loading={false}
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={onReleased}
        onReleaseStart={onReleaseStart}
        onReleaseEnd={onReleaseEnd}
      />,
    );

    await user.click(screen.getByText(/Legacy escrow payouts & company float/i));
    await user.click(screen.getByRole("button", {name: "Release mock payout"}));
    const dialog = screen.getByRole("dialog", {
      name: "Release mock provider payout?",
    });
    await user.type(within(dialog).getByLabelText("Admin password"), "secret");
    await user.type(
      within(dialog).getByLabelText("Type RELEASE to confirm"),
      "RELEASE",
    );
    await user.click(within(dialog).getByRole("button", {name: "Release mock payout"}));

    await waitFor(() => {
      expect(releaseMockProviderDisbursement).toHaveBeenCalledWith({
        providerDisbursementId: "disbursement_ready_1",
        password: "secret",
        confirmationPhrase: "RELEASE",
      });
    });

    expect(onReleaseStart).toHaveBeenCalledWith("disbursement_ready_1");
    expect(onReleased).toHaveBeenCalled();
    expect(onReleaseEnd).toHaveBeenCalled();
  });

  it("shows advance approval errors inside the modal", async () => {
    const user = userEvent.setup();
    vi.mocked(approveCompanyAdvanceRequest).mockRejectedValue(
      new Error("Provide the advance request, amount, and ADVANCE confirmation."),
    );

    render(
      <ProviderPayoutBoard
        board={{
          ...board,
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
        }}
        loading={false}
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
        onReleaseStart={vi.fn()}
        onReleaseEnd={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Legacy escrow payouts & company float/i));
    await user.click(screen.getByRole("button", {name: "Approve advance"}));
    const dialog = screen.getByRole("dialog", {
      name: "Approve company advance?",
    });
    await user.type(within(dialog).getByLabelText("Admin password"), "secret");
    await user.type(
      within(dialog).getByLabelText("Type ADVANCE to confirm"),
      "ADVANCE",
    );
    await user.click(within(dialog).getByRole("button", {name: "Approve advance"}));

    await waitFor(() => {
      expect(
        within(dialog).getByText(
          "Provide the advance request, amount, and ADVANCE confirmation.",
        ),
      ).toBeVisible();
    });
    expect(
      screen.queryByText("Provider payout board could not complete an action"),
    ).not.toBeInTheDocument();
    expect(dialog).toBeVisible();
  });
});
