import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ProviderPayoutBoard} from "@/components/admin/payments/provider-payout-board";
import {releaseMockProviderDisbursement} from "@/lib/admin/payments/admin-payment-client";
import type {AdminProviderPayoutBoard} from "@/lib/admin/payments/admin-payment-types";

vi.mock("@/lib/admin/payments/admin-payment-client", () => ({
  releaseMockProviderDisbursement: vi.fn(),
  fundCompanyFloat: vi.fn(),
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
  advanceRequests: [],
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

  it("shows ready-to-pay and history sections", () => {
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

    expect(screen.getByRole("heading", {name: "Provider payouts"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Ready to pay"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Admin payout history"})).toBeVisible();
    expect(screen.getByText("₱900.00")).toBeVisible();
    expect(screen.getByText("₱500.00")).toBeVisible();
    expect(screen.getByText(/Reference: mock_wd_admin_1/u)).toBeVisible();
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
});
