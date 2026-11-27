import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {bookingPaymentStatusMismatch, matchesAdminPaymentChoice, matchesPaymentReview} from "@/lib/admin/payments/payment-review";
import {formatAdminPaymentPurpose, formatPaymentTableDateParts, formatPaymentType, paymentBookingLabel, paymentReferenceLabel} from "@/components/admin/payments/payment-formatters";
import {PaymentDetailsDrawer, refundMonitoringLabel} from "@/components/admin/payments/payment-details-drawer";
import {PaymentMonitoringClient} from "@/components/admin/payments/payment-monitoring-client";
import {PaymentFinanceAttention} from "@/components/admin/payments/payment-finance-attention";
import AdminPaymentsLoading from "@/app/admin/payments/loading";
import type {AdminPayment, AdminPaymentDetails, AdminPaymentPage, AdminFinanceAttentionQueue} from "@/lib/admin/payments/admin-payment-types";

vi.mock("@/app/admin/payments/actions", () => ({
  loadAdminPaymentsAction: vi.fn(),
  loadAdminPaymentDetailsAction: vi.fn(),
  loadAdminFinanceAttentionQueueAction: vi.fn(),
  loadAdminProviderPayoutBoardAction: vi.fn(),
}));
vi.mock("@/lib/admin/payments/admin-payment-client", () => ({
  repairAmbiguousProviderPayoutSetup: vi.fn(),
  retryFailedProviderDisbursement: vi.fn(),
  releaseMockProviderDisbursement: vi.fn(),
}));

const emptyPayoutBoard = {
  companyFloat: {
    availableBalanceInCentavos: 0,
    outstandingAdvanceInCentavos: 0,
    formattedAvailableBalance: "₱0.00",
    formattedOutstandingAdvance: "₱0.00",
    currency: "PHP" as const,
    mode: "mock" as const,
  },
  companyCommission: {
    availableBalanceInCentavos: 0,
    transferredToFloatInCentavos: 0,
    withdrawnInCentavos: 0,
    formattedAvailableBalance: "₱0.00",
    formattedTransferredToFloat: "₱0.00",
    formattedWithdrawn: "₱0.00",
    currency: "PHP" as const,
    mode: "mock" as const,
  },
  commissionWithdrawals: [],
  advanceRequests: [],
  rejectedAdvanceRequests: [],
  advanceHistory: [],
  readyToPay: [],
  history: [],
};

const payment: AdminPayment = {
  id: "payment_b38b84603355ec4e87de373fbe7ef0a4", paymentId: "payment_b38b84603355ec4e87de373fbe7ef0a4",
  bookingId: "internal-event", mainEventId: "internal-event", bookingCode: null,
  providerRequestId: "internal-provider-request", customerId: "customer-uid", customerName: "Sophia",
  customerEmail: "sophia@example.test", providerId: "provider-uid", providerName: "Provider business",
  amountInCentavos: 2000000, formattedAmount: "₱20,000.00",
  commissionAmountInCentavos: 200000, formattedCommissionAmount: "₱2,000.00",
  currency: "PHP",
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
  it("separates blocked eligible payouts from failed payouts and financial reconciliation counts", () => {
    const blocked: AdminFinanceAttentionQueue = {items: [{id: "blocked", kind: "reconciliation_required",
      canonicalDisbursementStatus: "ready", dispatchBlockReason: "platform_disbursements_disabled",
      recordState: "valid", paymentId: null, providerId: "provider", settlementId: null, payoutAttemptId: null,
      status: "reconciliation_required", amountInCentavos: 90000, formattedAmount: "₱900.00",
      reason: "Recorded backend reason", updatedAt: null, expectedUpdatedAtMillis: null, payment: null}]};
    render(<PaymentFinanceAttention queue={blocked} statistics={{failedPayoutCount: 0, reconciliationRequiredCount: 0}}
      loading={false} repairingItemId={null} onRefresh={vi.fn()} onViewPayment={vi.fn()} onRepairPayoutSetup={vi.fn()} />);
    expect(screen.getByText("Eligible earnings — transfer blocked")).toBeVisible();
    expect(screen.getByText("Eligible payouts blocked (shown)").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Financial reconciliation cases").nextElementSibling).toHaveTextContent("0");
    expect(screen.getByText(/Application payout transfers are disabled/)).toBeVisible();
    expect(screen.queryByRole("button", {name: "Retry failed payout"})).toBeNull();
  });
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
it("shows only checkout payment types while retaining refund statuses", () => {
  render(
    <PaymentMonitoringClient
      initialPage={page}
      initialAttention={queue}
      initialPayoutBoard={emptyPayoutBoard}
    />,
  );

  const paymentType = screen.getByRole("combobox", {
    name: "Payment type",
  });

  expect(
    within(paymentType)
      .getAllByRole("option")
      .map((option) => option.textContent?.trim()),
  ).toEqual([
    "All payment types",
    "Down payment",
    "Full payment",
    "Remaining balance",
  ]);

  const paymentStatus = screen.getByRole("combobox", {
    name: "Payment status",
  });

  expect(
    within(paymentStatus).getByRole("option", {
      name: "Refunded",
    }),
  ).toBeInTheDocument();

  expect(
    within(paymentStatus).getByRole("option", {
      name: "Partially refunded",
    }),
  ).toBeInTheDocument();
});
it("distinguishes full upfront payments from deposits without changing Firestore types", () => {
  const full = {...payment, paymentChoice: "full" as const};
  const minimum = {...payment, paymentChoice: "minimum" as const};
  const legacy = {...payment, paymentChoice: null};
  expect(formatAdminPaymentPurpose(full)).toBe("Full payment");
  expect(formatAdminPaymentPurpose(minimum)).toBe("Down payment");
  expect(matchesAdminPaymentChoice(full, "full")).toBe(true);
  expect(matchesAdminPaymentChoice(full, "provider_down_payment")).toBe(false);
  expect(matchesAdminPaymentChoice(minimum, "provider_down_payment")).toBe(true);
  expect(matchesAdminPaymentChoice(legacy, "provider_down_payment")).toBe(true);
  expect(matchesAdminPaymentChoice(legacy, "full")).toBe(false);
  expect(matchesAdminPaymentChoice({...payment, paymentType: "provider_balance"}, "full")).toBe(false);
});

it("shows a distinct full-payment filter and label", () => {
  render(<PaymentMonitoringClient
    initialPage={{...page, payments: [{...payment, paymentChoice: "full"}]}}
    initialAttention={queue}
    initialPayoutBoard={emptyPayoutBoard}
  />);
  const types = screen.getByRole("combobox", {name: "Payment type"});
  expect(within(types).getAllByRole("option").map(item => item.textContent?.trim()))
    .toEqual(["All payment types", "Down payment", "Full payment", "Remaining balance"]);
  const table = screen.getByRole("table", {name: "Payment monitoring records"});
  expect(within(table).getByText("Full payment")).toBeInTheDocument();
});
it("uses existing references with a simple missing-booking fallback", () => {
  expect(paymentBookingLabel(payment)).toBe("Booking unavailable");
  expect(paymentBookingLabel({...payment, bookingCode: "BK-12345678"})).toBe("BK-12345678");
  expect(paymentReferenceLabel(payment)).not.toBe(payment.paymentId);
});
it("shows three direct-split cards and plain filters without normal internal references", () => {
  render(<PaymentMonitoringClient initialPage={page} initialAttention={queue} initialPayoutBoard={emptyPayoutBoard} />);
  const statistics = screen.getByRole("region", {name: "Payment statistics"});
  for (const label of ["FEASTA fees available", "FEASTA fees withdrawn", "Pending payments"]) expect(within(statistics).getByText(label)).toBeInTheDocument();
  expect(within(statistics).queryByText("Net customer payments")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Failed payments")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Needs review")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Refunded amount")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Failed provider payouts")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", {name: "Provider payout issues"})).not.toBeInTheDocument();
  const select = screen.getByRole("combobox", {name: "Review status"});
  expect(within(select).getAllByRole("option").map(option => option.textContent?.trim())).toEqual(["All", "Needs review", "No issues"]);
  expect(screen.queryByText(payment.paymentId)).not.toBeInTheDocument();
  expect(screen.queryByText(payment.providerRequestId!)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Request refund"})).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", {name: "Date"})).toBeInTheDocument();
  expect(screen.getByRole("columnheader", {name: "Issue"})).toBeInTheDocument();
});
it("distinguishes original payment amounts from completed refunds and labels FEASTA fee", () => {
  const refundedPayment: AdminPayment = {
    ...payment,
    status: "refunded",
    refundedAmountFormatted: "₱20,000.00",
    issues: [],
  };

  render(
    <PaymentMonitoringClient
      initialPage={{...page, payments: [refundedPayment]}}
      initialAttention={queue}
      initialPayoutBoard={emptyPayoutBoard}
    />,
  );

  const table = screen.getByRole("table", {
    name: "Payment monitoring records",
  });

  expect(
    within(table).getByRole("columnheader", {
      name: "Original amount",
    }),
  ).toBeInTheDocument();

  expect(
    within(table).getByText("FEASTA fee ₱2,000.00"),
  ).toBeInTheDocument();

  expect(
    within(table).queryByText(/Commission ₱/i),
  ).not.toBeInTheDocument();

  expect(
    within(table).getByText("Refunded ₱20,000.00"),
  ).toBeInTheDocument();
});
it("separates customer and provider into different table columns", () => {
  render(
    <PaymentMonitoringClient
      initialPage={page}
      initialAttention={queue}
      initialPayoutBoard={emptyPayoutBoard}
    />,
  );

  const table = screen.getByRole("table", {
    name: "Payment monitoring records",
  });

  expect(within(table).getByRole("columnheader", {
    name: "Customer",
  })).toBeInTheDocument();

  expect(within(table).getByRole("columnheader", {
    name: "Provider",
  })).toBeInTheDocument();

  expect(within(table).queryByRole("columnheader", {
    name: "Customer / Provider",
  })).not.toBeInTheDocument();

  const dataRow = within(table).getAllByRole("row")[1];
  const cells = within(dataRow).getAllByRole("cell");

  expect(cells[2]).toHaveTextContent("Sophia");
  expect(cells[2]).not.toHaveTextContent("Provider business");
  expect(cells[3]).toHaveTextContent("Provider business");

  expect(table.parentElement?.parentElement?.className)
    .toContain("[&_td:last-child]:sticky");
});

it("formats payment dates on two lines in Philippine time", () => {
  expect(formatPaymentTableDateParts(
    "2026-10-13T03:27:00Z",
  )).toEqual({
    date: "Oct 13, 2026",
    time: "11:27 AM",
  });

  expect(formatPaymentTableDateParts(null)).toBeNull();
  expect(formatPaymentTableDateParts("invalid")).toBeNull();

  render(
    <PaymentMonitoringClient
      initialPage={page}
      initialAttention={queue}
      initialPayoutBoard={emptyPayoutBoard}
    />,
  );

  const table = screen.getByRole("table", {
    name: "Payment monitoring records",
  });

  expect(within(table).getByText("Oct 1, 2026"))
    .toBeInTheDocument();

  expect(within(table).getByText("12:13 PM"))
    .toBeInTheDocument();
});
it("keeps platform revenue reports out of payment monitoring while showing available fees", () => {
  render(
    <PaymentMonitoringClient
      initialPage={page}
      initialAttention={queue}
      initialPayoutBoard={{
        ...emptyPayoutBoard,
        companyCommission: {
          ...emptyPayoutBoard.companyCommission,
          availableBalanceInCentavos: 125000,
          formattedAvailableBalance: "₱1,250.00",
        },
      }}
    />,
  );

  expect(screen.queryByRole("region", {
    name: "FEASTA earnings",
  })).not.toBeInTheDocument();

  expect(screen.queryByText("FEASTA Revenue"))
    .not.toBeInTheDocument();

  const statistics = screen.getByRole("region", {
    name: "Payment statistics",
  });

  expect(within(statistics).getByText("FEASTA fees available"))
    .toBeInTheDocument();

  expect(within(statistics).getByText("₱1,250.00"))
    .toBeInTheDocument();
});
it("has one overview, a labelled dialog, payment method, booking link, and collapsed technical history", async () => {
  const paymentWithMethod = {
    ...payment,
    bookingCode: "BK-1D8D952721",
    paymentMethodType: "gcash",
  };
  render(
    <PaymentDetailsDrawer
      payment={paymentWithMethod}
      details={{...details, payment: paymentWithMethod}}
      open
      loading={false}
      onRetry={vi.fn()}
      onOpenChange={vi.fn()}
    />,
  );
  expect(screen.getByRole("dialog", {name: "Payment details"})).toBeInTheDocument();
  expect(screen.getAllByRole("heading", {name: "Payment overview"})).toHaveLength(1);
  expect(screen.queryByRole("heading", {name: "Payment summary"})).not.toBeInTheDocument();
  expect(screen.getByText("View payment information for BK-1D8D952721.")).toBeInTheDocument();
  expect(screen.getByText("FEASTA fee ₱2,000.00")).toBeInTheDocument();
  expect(screen.getByText("GCash")).toBeInTheDocument();
  expect(screen.getByRole("link", {name: /Open booking/i})).toHaveAttribute(
    "href",
    "/admin/bookings?search=BK-1D8D952721",
  );
  expect(screen.getByText("No refund recorded")).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Request refund"})).not.toBeInTheDocument();
  const summary = screen.getByText("Additional details");
  const advanced = summary.closest("details")!;
  expect(advanced).not.toHaveAttribute("open");
  expect(within(advanced).getByText(payment.paymentId)).toBeInTheDocument();
  expect(within(advanced).getByText(payment.gatewayResourceId!)).toBeInTheDocument();
  expect(within(advanced).getByText(payment.gatewayCheckoutId!)).toBeInTheDocument();
  expect(within(advanced).getByText(payment.providerRequestId!)).toBeInTheDocument();
  expect(within(advanced).getByText("payment.status_changed")).toBeInTheDocument();
  await userEvent.click(summary);
  expect(advanced).toHaveAttribute("open");
});
it("keeps primary booking details concise and moves linked record statuses under Additional details", () => {
  const waitingDetails: AdminPaymentDetails = {
    ...details,
    booking: {
      ...details.booking,
      status: "waiting_for_down_payment",
      paymentStatus: "unpaid",
      eventType: "birthday",
    },
    providerRequest: {
      ...details.providerRequest,
      status: "payment_processing",
    },
  };
  render(
    <PaymentDetailsDrawer
      payment={payment}
      details={waitingDetails}
      open
      loading={false}
      onRetry={vi.fn()}
      onOpenChange={vi.fn()}
    />,
  );
  const bookingSection = screen.getByRole("heading", {name: "Booking"}).closest("section")!;
  expect(within(bookingSection).getByText("Awaiting payment")).toBeVisible();
  expect(within(bookingSection).getByText("Birthday")).toBeVisible();
  expect(within(bookingSection).queryByText("Waiting For Down Payment")).not.toBeInTheDocument();
  expect(within(bookingSection).queryByText("Booking payment status")).not.toBeInTheDocument();
  expect(within(bookingSection).queryByText("Provider response")).not.toBeInTheDocument();

  const advanced = screen.getByText("Additional details").closest("details")!;
  expect(within(advanced).getByText("Booking payment status")).toBeInTheDocument();
  expect(within(advanced).getByText("Unpaid")).toBeInTheDocument();
  expect(within(advanced).getByText("Provider service status")).toBeInTheDocument();
  expect(within(advanced).getByText("Awaiting payment confirmation")).toBeInTheDocument();
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
it("loading uses the same three primary cards", () => {
  render(<AdminPaymentsLoading />);
  const statistics = screen.getByRole("region", {name: "Loading payment statistics"});
  for (const label of ["FEASTA fees available", "FEASTA fees withdrawn", "Pending payments"]) expect(within(statistics).getByText(label)).toBeInTheDocument();
  expect(within(statistics).queryByText("Net customer payments")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Failed payments")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Needs review")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Refunded amount")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Payments to review")).not.toBeInTheDocument();
  expect(within(statistics).queryByText("Failed provider payouts")).not.toBeInTheDocument();
});
