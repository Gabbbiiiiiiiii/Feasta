import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {PaymentIssueBadges} from "@/components/admin/payments/payment-issue-badges";
import {PaymentMobileCard} from "@/components/admin/payments/payment-mobile-card";
import {PaymentMonitoringClient} from "@/components/admin/payments/payment-monitoring-client";
import {ProviderPayoutBoard} from "@/components/admin/payments/provider-payout-board";
import type {
  AdminFinanceAttentionItem,
  AdminFinanceAttentionQueue,
  AdminPayment,
  AdminPaymentPage,
  AdminProviderPayoutBoard,
} from "@/lib/admin/payments/admin-payment-types";

const mocks = vi.hoisted(() => ({
  loadPayments: vi.fn(),
  loadDetails: vi.fn(),
  loadAttention: vi.fn(),
  loadBoard: vi.fn(),
  repairSetup: vi.fn(),
  retryDisbursement: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock("@/app/admin/payments/actions", () => ({
  loadAdminPaymentsAction: mocks.loadPayments,
  loadAdminPaymentDetailsAction: mocks.loadDetails,
  loadAdminFinanceAttentionQueueAction: mocks.loadAttention,
  loadAdminProviderPayoutBoardAction: mocks.loadBoard,
}));

vi.mock("@/lib/admin/payments/admin-payment-client", () => ({
  repairAmbiguousProviderPayoutSetup: mocks.repairSetup,
  retryFailedProviderDisbursement: mocks.retryDisbursement,
  releaseMockProviderDisbursement: mocks.releaseMock,
}));

const samplePayment: AdminPayment = {
  id: "payment_b38b84603355ec4e87de373fbe7ef0a4",
  paymentId: "payment_b38b84603355ec4e87de373fbe7ef0a4",
  bookingId: "main-event-1",
  mainEventId: "main-event-1",
  bookingCode: "BK-20261119",
  providerRequestId: "provider-request-1",
  customerId: "customer-1",
  customerName: "Sophia Cruz",
  customerEmail: "sophia@example.test",
  providerId: "provider-1",
  providerName: "Emerald Catering",
  amountInCentavos: 2000000,
  formattedAmount: "₱20,000.00",
  commissionAmountInCentavos: 200000,
  formattedCommissionAmount: "₱2,000.00",
  currency: "PHP",
  paymentType: "provider_down_payment",
  paymentChoice: "minimum",
  gateway: "paymongo",
  status: "partially_refunded",
  gatewayResourceId: "pay_123",
  gatewayCheckoutId: "cs_123",
  createdAt: "2026-10-01T04:11:00Z",
  updatedAt: "2026-10-01T04:13:00Z",
  paidAt: "2026-10-01T04:13:00Z",
  failedAt: null,
  expiredAt: null,
  refundedAt: "2026-10-02T04:13:00Z",
  refundedAmountFormatted: "₱5,000.00",
  lastWebhookEventId: "evt_123",
  issues: [],
  refundEligibility: {eligible: false, reason: "already_refunded"},
};

const basePage: AdminPaymentPage = {
  payments: [samplePayment],
  hasMore: false,
  nextCursor: null,
  statistics: {
    confirmedVolumeInCentavos: 1500000,
    pendingProcessingCount: 2,
    failedPaymentCount: 1,
    failedExpiredCount: 1,
    failedPayoutCount: 0,
    reconciliationRequiredCount: 0,
    refundedAmountInCentavos: 500000,
    confirmedVolumeFormatted: "₱15,000.00",
    refundedAmountFormatted: "₱5,000.00",
  },
};

const emptyQueue: AdminFinanceAttentionQueue = {items: []};

const populatedBoard: AdminProviderPayoutBoard = {
  companyFloat: {
    availableBalanceInCentavos: 0,
    outstandingAdvanceInCentavos: 0,
    formattedAvailableBalance: "₱0.00",
    formattedOutstandingAdvance: "₱0.00",
    currency: "PHP",
    mode: "mock",
  },
  companyCommission: {
    availableBalanceInCentavos: 0,
    transferredToFloatInCentavos: 0,
    withdrawnInCentavos: 0,
    formattedAvailableBalance: "₱0.00",
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
      providerDisbursementId: "disb_ready_1",
      providerId: "provider_1",
      providerName: "Emerald Catering",
      providerRequestId: "req_1",
      mainEventId: "evt_1",
      amountInCentavos: 90000,
      formattedAmount: "₱900.00",
      transportReady: false,
      dispatchBlockReason: "platform_disbursements_disabled",
      eligibleAt: "2026-11-19T02:00:00.000Z",
      readyAt: "2026-11-19T02:00:00.000Z",
      trigger: "completed_booking",
    },
  ],
  history: [],
};

describe("/admin/payments redesign contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPayments.mockResolvedValue(basePage);
    mocks.loadAttention.mockResolvedValue(emptyQueue);
    mocks.repairSetup.mockResolvedValue({
      providerId: "provider_12345678",
      setupStatus: "action_required",
      inviteCreationState: "rejected",
      payoutReady: false,
    });
  });

  it("provides direct wayfinding to /admin/reports and exposes KPI explanations via accessible tooltips", async () => {
    const user = userEvent.setup();

    render(
      <PaymentMonitoringClient
        initialPage={basePage}
        initialAttention={emptyQueue}
        initialPayoutBoard={populatedBoard}
      />,
    );

    const reportsLink = screen.getByRole("link", {
      name: /View revenue reports/i,
    });
    expect(reportsLink).toHaveAttribute("href", "/admin/reports");

    const infoButton = screen.getByRole("button", {
      name: "More information about Net customer payments",
    });
    const tooltip = screen.getByRole("tooltip", {
      name: /includes provider share and FEASTA fee/i,
    });
    expect(infoButton).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip.className).toContain("opacity-0");

    await user.click(infoButton);
    expect(infoButton).toHaveAttribute("aria-expanded", "true");
    expect(tooltip.className).toContain("opacity-100");
  });

  it("collapses the payment-flow explainer by default and supports keyboard-accessible workspace tabs", async () => {
    const user = userEvent.setup();

    render(
      <PaymentMonitoringClient
        initialPage={basePage}
        initialAttention={emptyQueue}
        initialPayoutBoard={populatedBoard}
      />,
    );

    const explainerSummary = screen.getByText(
      "How direct payments, service fees, and refunds work",
    );
    expect(explainerSummary.closest("details")).not.toHaveAttribute("open");

    const tablist = screen.getByRole("tablist", {
      name: "Payments workspace views",
    });
    const paymentsTab = within(tablist).getByRole("tab", {
      name: /Customer payments/i,
    });
    const payoutsTab = within(tablist).getByRole("tab", {
      name: /FEASTA service fees/i,
    });

    expect(paymentsTab).toHaveAttribute("aria-selected", "true");
    expect(payoutsTab).toHaveAttribute("aria-selected", "false");
    expect(within(payoutsTab).getByText("1 ready")).toBeVisible();

    paymentsTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(payoutsTab).toHaveFocus();
    expect(payoutsTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", {name: "FEASTA service fees & direct splits"}),
    ).toBeVisible();

    await user.keyboard("{ArrowLeft}");
    expect(paymentsTab).toHaveFocus();
    expect(paymentsTab).toHaveAttribute("aria-selected", "true");
  });

  it("formats active filter labels without exposing raw snake_case enum values", async () => {
    const user = userEvent.setup();

    render(
      <PaymentMonitoringClient
        initialPage={basePage}
        initialAttention={emptyQueue}
        initialPayoutBoard={populatedBoard}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", {name: "Payment status"}),
      "partially_refunded",
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Active filters: Status: Partially refunded/i),
      ).toBeVisible();
    });
    expect(screen.queryByText(/partially_refunded/)).not.toBeInTheDocument();
  });

  it("uses an accessible ConfirmationDialog instead of window.confirm for payout setup repair", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const ambiguousItem: AdminFinanceAttentionItem = {
      id: "ambiguous_payout_setup:provider_12345678",
      kind: "ambiguous_payout_setup",
      recordState: "valid",
      paymentId: null,
      providerId: "provider_12345678",
      settlementId: null,
      payoutAttemptId: null,
      status: "ambiguous",
      amountInCentavos: null,
      formattedAmount: null,
      reason: "Provider payout setup has an ambiguous external account-creation result.",
      updatedAt: "2026-11-19T02:00:00.000Z",
      expectedUpdatedAtMillis: 1795053600000,
      payment: null,
    };

    render(
      <PaymentMonitoringClient
        initialPage={basePage}
        initialAttention={{items: [ambiguousItem]}}
        initialPayoutBoard={populatedBoard}
      />,
    );

    await user.click(
      screen.getByRole("button", {name: "Repair payout setup"}),
    );
    expect(confirmSpy).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", {
      name: "Repair this Provider payout setup?",
    });
    expect(dialog).toBeVisible();

    await user.click(within(dialog).getByRole("button", {name: "Cancel"}));
    expect(mocks.repairSetup).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {name: "Repair payout setup"}),
    );
    const reopenedDialog = screen.getByRole("dialog", {
      name: "Repair this Provider payout setup?",
    });
    await user.click(
      within(reopenedDialog).getByRole("button", {
        name: "Repair payout setup",
      }),
    );

    await waitFor(() => {
      expect(mocks.repairSetup).toHaveBeenCalledWith({
        providerId: "provider_12345678",
        expectedUpdatedAtMillis: 1795053600000,
      });
    });
    confirmSpy.mockRestore();
  });

  it("renders human-readable transport block messages and ready total in ProviderPayoutBoard", async () => {
    const user = userEvent.setup();
    render(
      <ProviderPayoutBoard
        board={populatedBoard}
        loading={false}
        releasingId={null}
        onRefresh={vi.fn()}
        onReleased={vi.fn()}
        onReleaseStart={vi.fn()}
        onReleaseEnd={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Legacy escrow payouts & company float/i));
    expect(screen.getByText("Total ready: ₱900.00")).toBeVisible();
    expect(
      screen.getByText(/Application payout transfers are disabled/i),
    ).toBeVisible();
    expect(
      screen.queryByText(/platform_disbursements_disabled/),
    ).not.toBeInTheDocument();
  });

  it("surfaces refunded amounts on mobile payment cards without redundant gateway rows", () => {
    render(
      <PaymentMobileCard
        payment={samplePayment}
        onViewDetails={vi.fn()}
      />,
    );

    expect(screen.getByText("Refunded ₱5,000.00")).toBeVisible();
    expect(screen.queryByText("Processed by")).not.toBeInTheDocument();
  });

  it("renders compact single-line rounded issue badges instead of tall wrapping pills", () => {
    render(
      <PaymentIssueBadges
        issues={["stale_processing", "missing_booking"]}
        compact
      />,
    );

    const badgeText = screen.getByText("Processing delayed");
    const badge = badgeText.closest("span")?.parentElement;
    expect(badge?.className).toContain("rounded-md");
    expect(badge?.className).toContain("whitespace-nowrap");
    expect(badge?.className).not.toContain("rounded-pill");
    expect(screen.getByText("+1 more")).toBeVisible();
  });
});
