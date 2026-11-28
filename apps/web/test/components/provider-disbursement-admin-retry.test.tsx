import {beforeEach, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {PaymentMonitoringClient} from "@/components/admin/payments/payment-monitoring-client";
import {PaymentFinanceAttention} from "@/components/admin/payments/payment-finance-attention";
import type {AdminFinanceAttentionItem, AdminPaymentPage} from "@/lib/admin/payments/admin-payment-types";
const mocks = vi.hoisted(() => ({retry: vi.fn(), repair: vi.fn(), refresh: vi.fn()}));
vi.mock("@/lib/admin/payments/admin-payment-client", () => ({
  retryFailedProviderDisbursement: mocks.retry,
  repairAmbiguousProviderPayoutSetup: mocks.repair,
  releaseMockProviderDisbursement: vi.fn(),
}));
vi.mock("@/app/admin/payments/actions", () => ({
  loadAdminPaymentsAction: vi.fn(),
  loadAdminPaymentDetailsAction: vi.fn(),
  loadAdminFinanceAttentionQueueAction: mocks.refresh,
  loadAdminProviderPayoutBoardAction: vi.fn(async () => ({
    companyFloat: {availableBalanceInCentavos: 0, outstandingAdvanceInCentavos: 0, formattedAvailableBalance: "₱0.00", formattedOutstandingAdvance: "₱0.00", currency: "PHP", mode: "mock"},
    companyCommission: {availableBalanceInCentavos: 0, transferredToFloatInCentavos: 0, withdrawnInCentavos: 0, formattedAvailableBalance: "₱0.00", formattedTransferredToFloat: "₱0.00", formattedWithdrawn: "₱0.00", currency: "PHP", mode: "mock"},
    commissionWithdrawals: [],
    advanceRequests: [],
    rejectedAdvanceRequests: [],
    advanceHistory: [],
    readyToPay: [],
    history: [],
  })),
}));
const emptyPayoutBoard = {
  companyFloat: {availableBalanceInCentavos: 0, outstandingAdvanceInCentavos: 0, formattedAvailableBalance: "₱0.00", formattedOutstandingAdvance: "₱0.00", currency: "PHP" as const, mode: "mock" as const},
  companyCommission: {availableBalanceInCentavos: 0, transferredToFloatInCentavos: 0, withdrawnInCentavos: 0, formattedAvailableBalance: "₱0.00", formattedTransferredToFloat: "₱0.00", formattedWithdrawn: "₱0.00", currency: "PHP" as const, mode: "mock" as const},
  commissionWithdrawals: [],
  advanceRequests: [],
  rejectedAdvanceRequests: [],
  advanceHistory: [],
  readyToPay: [],
  history: [],
};
const failed: AdminFinanceAttentionItem = {
  id: "disbursement:payout",
  kind: "failed_payout",
  recordState: "valid",
  providerDisbursementId: "payout",
  canonicalDisbursementStatus: "failed",
  failedDisbursementRetryEligible: true,
  paymentId: "deposit",
  providerId: "provider",
  settlementId: null,
  payoutAttemptId: null,
  status: "failed",
  amountInCentavos: 900000,
  formattedAmount: "PHP 9,000",
  reason: null,
  updatedAt: null,
  expectedUpdatedAtMillis: null,
  payment: null,
};
const page = {
  payments: [],
  hasMore: false,
  nextCursor: null,
  statistics: {
    confirmedVolumeFormatted: "PHP 0",
    pendingProcessingCount: 0,
    confirmedVolumeInCentavos: 0,
    failedExpiredCount: 0,
    refundedAmountInCentavos: 0,
    failedPaymentCount: 0,
    failedPayoutCount: 1,
    reconciliationRequiredCount: 0,
    refundedAmountFormatted: "PHP 0",
  },
} as AdminPaymentPage;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retry.mockResolvedValue({prepared: true});
  mocks.refresh.mockResolvedValue({items: []});
});

it.each(["reconciliation_required", "processing", "ready", "held", "ambiguous"])("never offers retry for canonical %s", (status) => {
  render(
    <PaymentFinanceAttention
      queue={{items: [{...failed, canonicalDisbursementStatus: status}]}}
      loading={false}
      repairingItemId={null}
      onRefresh={vi.fn()}
      onViewPayment={vi.fn()}
      onRepairPayoutSetup={vi.fn()}
      onRetryFailedDisbursement={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", {name: "Retry failed payout"})).not.toBeInTheDocument();
});

it.each([
  {recordState: "invalid"},
  {providerDisbursementId: undefined},
  {failedDisbursementRetryEligible: false},
  {kind: "ambiguous_payout_setup"},
  {providerDisbursementId: "unsafe/path"},
  {canonicalDisbursementStatus: undefined},
])("excludes malformed, legacy and setup cases %j", (change) => {
  render(
    <PaymentFinanceAttention
      queue={{items: [{...failed, ...change} as AdminFinanceAttentionItem]}}
      loading={false}
      repairingItemId={null}
      onRefresh={vi.fn()}
      onViewPayment={vi.fn()}
      onRepairPayoutSetup={vi.fn()}
      onRetryFailedDisbursement={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", {name: "Retry failed payout"})).not.toBeInTheDocument();
});

it("hides legacy payout retry actions on PaymentMonitoringClient under Direct Split", () => {
  render(
    <PaymentMonitoringClient
      initialPage={page}
      initialAttention={{items: [failed]}}
      initialPayoutBoard={emptyPayoutBoard}
    />,
  );
  expect(screen.queryByRole("heading", {name: "Provider payout issues"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Retry failed payout"})).not.toBeInTheDocument();
  expect(mocks.retry).not.toHaveBeenCalled();
  expect(mocks.repair).not.toHaveBeenCalled();
});
