import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {bookingPaymentStatusMismatch, matchesPaymentReview} from "@/lib/admin/payments/payment-review";
import {formatPaymentType, paymentBookingLabel, paymentReferenceLabel} from "@/components/admin/payments/payment-formatters";
import {PaymentDetailsDrawer, refundMonitoringLabel} from "@/components/admin/payments/payment-details-drawer";
import {PaymentMonitoringClient} from "@/components/admin/payments/payment-monitoring-client";
import {PaymentFinanceAttention} from "@/components/admin/payments/payment-finance-attention";
import AdminPaymentsLoading from "@/app/admin/payments/loading";
import type {AdminPayment, AdminPaymentDetails, AdminPaymentPage, AdminFinanceAttentionQueue} from "@/lib/admin/payments/admin-payment-types";

vi.mock("@/app/admin/payments/actions", () => ({
  loadAdminPaymentsAction: vi.fn(),
  loadAdminPaymentDetailsAction: vi.fn(),
  loadAdminFinanceAttentionQueueAction: vi.fn(),
}));
vi.mock("@/lib/admin/payments/admin-payment-client", () => ({repairAmbiguousProviderPayoutSetup: vi.fn(), retryFailedProviderDisbursement: vi.fn()}));

const payment: AdminPayment = {
  id: "payment_b38b84603355ec4e87de373fbe7ef0a4", paymentId: "payment_b38b84603355ec4e87de373fbe7ef0a4",
  bookingId: "internal-event", mainEventId: "internal-event", bookingCode: null,
  providerRequestId: "internal-provider-request", customerId: "customer-uid", customerName: "Sophia",
  customerEmail: "sophia@example.test", providerId: "provider-uid", providerName: "Provider business",
  amountInCentavos: 2000000, formattedAmount: "₱20,000.00", currency: "PHP",
  paymentType: "provider_down_payment", gateway: "paymongo", status: "paid",
  gatewayResourceId: "gateway-reference", gatewayCheckoutId: "checkout-reference",
  createdAt: "2026-10-01T04:11:00Z", updatedAt: "2026-10-01T04:13:00Z", paidAt: "2026-10-01T04:13:00Z",
  failedAt: null, expiredAt: null, refundedAt: null, lastWebhookEventId: "webhook-reference",
  issues: ["missing_booking", "missing_provider_request"], refundEligibility: {eligible: true, reason: "eligible"},
};
const queue = {items: []} as unknown as AdminFinanceAttentionQueue;
const page = {payments: [payment], hasMore: false, nextCursor: null, statistics: {
  confirmedVolumeFormatted: "₱20,000.00", pendingProcessingCount: 0, failedPaymentCount: 0,
  failedPayoutCount: 2, reconciliationRequiredCount: 1, refundedAmountFormatted: "₱5,000.00",
}} as AdminPaymentPage;
const details = {
  payment,
  booking: {exists: false, id: payment.mainEventId, bookingCode: null, status: null, paymentStatus: null, eventType: null, eventDate: null},
  providerRequest: {exists: false, id: payment.providerRequestId, status: null, requestType: null},
  financialSummary: {recordState: "not_available"}, payoutAccount: {recordState: "not_available"},
  providerFinance: {earning: {recordState: "not_found"}, settlement: {recordState: "not_found"},
    payoutAttempts: {active: {recordState: "not_referenced", payoutAttemptId: null}, last: {recordState: "not_referenced", payoutAttemptId: null}}},
  webhooks: [], auditHistory: [{id: "audit", action: "payment.status_changed", actorRole: "system", actorId: "paymongo", createdAt: payment.paidAt}],
} as unknown as AdminPaymentDetails;

describe("payment review prerequisites", () => {
  it("missing booking does not create a secondary mismatch", () => {
    expect(bookingPaymentStatusMismatch(false, "paid", null)).toBe(false);
    const service = readFileSync(resolve("src/lib/admin/payments/admin-payment-service.ts"), "utf8");
    expect(service).toContain("bookingPaymentStatusMismatch(relations.bookings.has(bookingId), status, bookingPaymentStatus)");
    expect(service).toContain('issues.push("missing_booking")');
    expect(service).toContain('issues.push("missing_provider_request")');
  });
  it("existing inconsistent booking still creates a mismatch", () => {
    expect(bookingPaymentStatusMismatch(true, "paid", "unpaid")).toBe(true);
    expect(bookingPaymentStatusMismatch(true, "paid", "paid")).toBe(false);
    expect(bookingPaymentStatusMismatch(true, "paid", "partially_paid")).toBe(false);
  });
  it.each([0, 2])("preserves internal review filters for %s issues", count => {
    expect(matchesPaymentReview(count, "all")).toBe(true);
    expect(matchesPaymentReview(count, "with_issues")).toBe(count > 0);
    expect(matchesPaymentReview(count, "without_issues")).toBe(count === 0);
  });
});

it.each([["provider_down_payment", "Down payment"], ["provider_balance", "Remaining balance"], ["refund", "Refund"], ["adjustment", "Payment adjustment"]] as const)("formats %s", (type, label) => {
  expect(formatPaymentType(type)).toBe(label);
});
it("uses existing references with a simple missing-booking fallback", () => {
  expect(paymentBookingLabel(payment)).toBe("Booking unavailable");
  expect(paymentBookingLabel({...payment, bookingCode: "BK-12345678"})).toBe("BK-12345678");
  expect(paymentReferenceLabel(payment)).not.toBe(payment.paymentId);
});
it("shows four cards and plain filters without normal internal references", () => {
  render(<PaymentMonitoringClient initialPage={page} initialAttention={queue} />);
  const statistics = screen.getByRole("region", {name: "Payment statistics"});
  for (const label of ["Paid amount", "Pending payments", "Failed payments", "Refunded amount"]) expect(within(statistics).getByText(label)).toBeInTheDocument();
  expect(within(statistics).queryByText("Failed provider payouts")).not.toBeInTheDocument();
  const select = screen.getByRole("combobox", {name: "Review status"});
  expect(within(select).getAllByRole("option").map(option => option.textContent?.trim())).toEqual(["All", "Needs review", "No issues"]);
  expect(screen.queryByText(payment.paymentId)).not.toBeInTheDocument();
  expect(screen.queryByText(payment.providerRequestId!)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Request refund"})).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", {name: "Date"})).toBeInTheDocument();
  expect(screen.getByRole("columnheader", {name: "Issue"})).toBeInTheDocument();
});
it("has one overview, a labelled dialog, and collapsed technical history", async () => {
  render(<PaymentDetailsDrawer payment={payment} details={details} open loading={false} onRetry={vi.fn()} onOpenChange={vi.fn()} />);
  expect(screen.getByRole("dialog", {name: "Payment details"})).toBeInTheDocument();
  expect(screen.getAllByRole("heading", {name: "Payment overview"})).toHaveLength(1);
  expect(screen.queryByRole("heading", {name: "Payment summary"})).not.toBeInTheDocument();
  expect(screen.getByText("View payment information.")).toBeInTheDocument();
  expect(screen.getByText("No refund recorded")).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Request refund"})).not.toBeInTheDocument();
  const summary = screen.getByText("Additional details");
  const advanced = summary.closest("details")!;
  expect(advanced).not.toHaveAttribute("open");
  expect(within(advanced).getByText(payment.paymentId)).toBeInTheDocument();
  expect(within(advanced).getByText(payment.providerRequestId!)).toBeInTheDocument();
  expect(within(advanced).getByText("payment.status_changed")).toBeInTheDocument();
  await userEvent.click(summary);
  expect(advanced).toHaveAttribute("open");
});
it("refund monitoring remains read-only for full, partial, and pending refunds", () => {
  expect(refundMonitoringLabel({...payment, status: "refunded", refundedAmountFormatted: "₱5,000.00"})).toBe("Refunded: ₱5,000.00");
  expect(refundMonitoringLabel({...payment, status: "partially_refunded", refundedAmountFormatted: "₱2,000.00"})).toBe("Partially refunded: ₱2,000.00");
  expect(refundMonitoringLabel({...payment, refundPending: true})).toBe("Refund pending");
});
it("keeps payout review and validated setup-repair actions", async () => {
  const repair = vi.fn();
  const item = {id: "setup", kind: "ambiguous_payout_setup", recordState: "valid", providerId: "provider", expectedUpdatedAtMillis: 10, reason: "payout_account_creation_ambiguous"};
  render(<PaymentFinanceAttention queue={{items: [item]} as unknown as AdminFinanceAttentionQueue} loading={false} repairingItemId={null} onRefresh={vi.fn()} onViewPayment={vi.fn()} onRepairPayoutSetup={repair} />);
  expect(screen.getByRole("heading", {name: "Provider payout issues"})).toBeInTheDocument();
  expect(screen.getByText("The provider payout account setup could not be confirmed.")).toBeInTheDocument();
  expect(screen.getByText(item.reason).closest("details")).not.toHaveAttribute("open");
  await userEvent.click(screen.getByRole("button", {name: "Repair payout setup"}));
  expect(repair).toHaveBeenCalledWith(item);
});
it("loading uses the same four primary cards", () => {
  render(<AdminPaymentsLoading />);
  const statistics = screen.getByRole("region", {name: "Loading payment statistics"});
  for (const label of ["Paid amount", "Pending payments", "Failed payments", "Refunded amount"]) expect(within(statistics).getByText(label)).toBeInTheDocument();
  expect(within(statistics).queryByText("Payments to review")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Failed provider payouts")).not.toBeInTheDocument();
});
