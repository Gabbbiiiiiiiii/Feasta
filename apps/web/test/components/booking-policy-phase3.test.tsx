import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
vi.mock("@/lib/firebase/client", () => ({auth: {}, functions: {}, initializeBrowserAppCheck: vi.fn()}));
import {bookingPolicyV3Presentation} from "@/lib/payments/booking-policy-v3-presentation";
import {BookingPolicySummary} from "@/components/shared/booking-policy-summary";
import {BookingPaymentAgreementReview} from "@/components/customer/bookings/booking-payment-agreement-review";
import {parseBookingPaymentAgreements} from "@/lib/customer/bookings/customer-booking-agreement";
import {summarizeAdminFinancialLedger} from "@/lib/admin/reports/admin-financial-report-domain";
import type {AdminFinancialLedgerRow} from "@/lib/admin/reports/admin-financial-report-types";
import {bookingAgreementFixture} from "./booking-agreement-fixture";
const event = new Date("2026-10-16T18:00:00+08:00");
const time = (hours: number) => ({toDate: () => new Date(event.getTime() - hours * 3_600_000)});
const raw = () => ({remainingBalanceTimingSchemaVersion: 3, balanceDueHoursBeforeEvent: 48,
  eventStartAt: time(0), remainingBalanceDueAt: time(48), hardPaymentDeadlineAt: time(24), preparationStartsAt: time(24),
  eventDate: time(0), eventEndTime: "20:00", bookingLifecyclePolicySnapshot: {schemaVersion: 3, preparationLeadTimeHours: 24,
    providerStartsManually: false, requiresFullPayment: true, autoStartAtScheduledTime: true, providerConfirmsCompletion: true},
  status: "confirmed", settlementStatus: "deposit_settled", outstandingAmountInCentavos: 500000});
describe("v3 booking presentation", () => {
  it.each([[48 * 3_600_000 + 1, "upcoming"], [48 * 3_600_000, "due"], [48 * 3_600_000 - 1, "grace_period"], [24 * 3_600_000, "review"]])(
    "uses server read time at offset %s", (offset, state) => expect(bookingPolicyV3Presentation(raw(), new Date(event.getTime() - offset))?.state).toBe(state));
  it("holds and cancellation override time, and trusted payment clears preparation", () => {
    expect(bookingPolicyV3Presentation({...raw(), remainingBalanceEnforcement: {status: "on_hold"}}, event)?.state).toBe("hold");
    expect(bookingPolicyV3Presentation({...raw(), status: "cancelled"}, event)?.state).toBe("cancelled");
    const paid = {...raw(), settlementStatus: "fully_settled", outstandingAmountInCentavos: 0};
    expect(bookingPolicyV3Presentation(paid, time(24).toDate())?.state).toBe("preparation");
    expect(bookingPolicyV3Presentation(paid, event)?.state).toBe("in_progress");
    expect(bookingPolicyV3Presentation(paid, new Date(event.getTime() + 2 * 3_600_000))?.readyToComplete).toBe(true);
    expect(bookingPolicyV3Presentation({...paid, activeCancellationRequestId: "private_id"}, event)?.state).toBe("review");
    expect(bookingPolicyV3Presentation({...paid, status: "completed"}, event)?.state).toBe("completed");
    expect(bookingPolicyV3Presentation({...raw(), remainingBalanceTimingSchemaVersion: 2}, event)).toBeNull();
  });
  it.each([["cancellation_pending", "Processing"], ["refunded", "Refunded"], ["reconciliation_required", "Review required"]])(
    "shows trusted refund status %s and the actual default breakdown", (status, label) => {
      const policy = bookingPolicyV3Presentation({...raw(), status: "cancelled", cancellationReason: "remaining_balance_unpaid_at_deadline",
        remainingBalanceEnforcement: {status}, paymentDefaultAllocation: {schemaVersion: 1, paidDepositInCentavos: 500000,
          customerRefundRateBps: 7000, providerReservationCompRateBps: 2000, feastaCancellationFeeRateBps: 1000,
          customerDefaultRefundAmountInCentavos: 350000, providerReservationCompAmountInCentavos: 100000, feastaCancellationFeeAmountInCentavos: 50000}}, event);
      render(<BookingPolicySummary policy={policy} />);
      expect(screen.getByText(`Refund status: ${label}`)).toBeVisible();
      expect(screen.getByText(/Refund to you.*3,500/u)).toBeVisible();
      expect(screen.getByText(/Reservation compensation.*1,000/u)).toBeVisible();
      expect(screen.getByText(/FEASTA cancellation.*500/u)).toBeVisible();
      expect(document.body.textContent).not.toMatch(/checkout_|pay_|reconciliation_required/u);
    });
});
describe("Booking & Payment Agreement review", () => {
  it("displays server amounts and keeps payment default separate from normal cancellation", () => {
    const agreement = bookingAgreementFixture("provider_private");
    const onChange = vi.fn();
    const view = render(<BookingPaymentAgreementReview agreements={[agreement]} acknowledged={{}} onChange={onChange} error={null} onReload={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox");
    expect(
  screen.getByText(
    "Birthday Buffet Package",
  ),
).toBeVisible();

expect(
  screen.getByText(
    "Buffet Setup",
  ),
).toBeVisible();

expect(
  screen.getByText(
    "Deposit eligibility cutoff",
  ),
).toBeVisible();

expect(
  screen.getAllByText(
    /October 13, 2026 at 6:00 PM/u,
  ).length,
).toBeGreaterThanOrEqual(1);

expect(
  screen.getByText(
    /eligibility is finalized when the booking request is submitted/u,
  ),
).toBeVisible();
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("Failure to Pay Remaining Balance")).toBeVisible();
    expect(screen.getByText(/separate from the Cancellation Refund Policy/u)).toBeVisible();
    expect(
      screen.getByText(
        /The deposit option is currently available/u,
      ),
    ).toBeVisible();

    expect(
      screen.getByText(
        /Submit this booking on or before/u,
      ),
    ).toBeVisible();
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(agreement.providerId, agreement.agreementKey);
    view.rerender(<BookingPaymentAgreementReview agreements={[agreement]} acknowledged={{[agreement.providerId]: agreement.agreementKey}} onChange={onChange} error={null} onReload={vi.fn()} />);
    expect(checkbox).toBeChecked();
    view.rerender(<BookingPaymentAgreementReview agreements={[{...agreement, agreementKey: "b".repeat(64)}]} acknowledged={{[agreement.providerId]: agreement.agreementKey}} onChange={onChange} error={null} onReload={vi.fn()} />);
    expect(checkbox).not.toBeChecked();
    expect(document.body.textContent).not.toContain("provider_private");
  });
  it("strictly rejects conflicting disclosure amounts and schedules", () => {
    const agreement = {...bookingAgreementFixture("provider_test"), timingSchemaVersion: 3};
    expect(() =>
  parseBookingPaymentAgreements([
    {
      ...agreement,
      depositEligibilityCutoffAt:
        agreement.eventStartAt,
    },
  ]),
).toThrow();

expect(() =>
  parseBookingPaymentAgreements([
    {
      ...agreement,
      selection: {
        shouldNotReachBrowser:
          true,
      },
    },
  ]),
).toThrow();
    expect(parseBookingPaymentAgreements([agreement])).toHaveLength(1);
    expect(() => parseBookingPaymentAgreements([{...agreement, remainingBalanceInCentavos: 1}])).toThrow();
    expect(() => parseBookingPaymentAgreements([{...agreement, hardPaymentDeadlineAt: agreement.eventStartAt}])).toThrow();
    expect(() => parseBookingPaymentAgreements([{...agreement, paymentDefaultAllocation: {...agreement.paymentDefaultAllocation, feastaCancellationFeeAmountInCentavos: 1}}])).toThrow();
  });
});
it("reports ledger fee exactly once, reverses ordinary commission, and does not count the adjustment as another refund", () => {
  const empty = {ledgerEntryId: "entry", paymentId: "payment", providerRequestId: "request", mainEventId: "event", providerId: "provider", currency: "PHP",
    grossAmountInCentavos: 0, refundAmountInCentavos: 0, commissionAccruedInCentavos: 0, commissionReversedInCentavos: 0,
    providerVatAccruedInCentavos: 0, providerVatReversedInCentavos: 0, platformVatAccruedInCentavos: 0, platformVatReversedInCentavos: 0,
    withholdingAccruedInCentavos: 0, withholdingReversedInCentavos: 0, createdAt: "2026-10-15T00:00:00Z"};
  const rows = [{...empty, entryType: "payment_settled", grossAmountInCentavos: 500000, commissionAccruedInCentavos: 50000},
    {...empty, entryType: "refund_completed", refundAmountInCentavos: 350000, commissionReversedInCentavos: 35000},
    {...empty, entryType: "payment_default_allocation_completed", commissionReversedInCentavos: 15000, feastaCancellationFeeEarnedInCentavos: 50000, providerReservationCompInCentavos: 100000}] as AdminFinancialLedgerRow[];
  const summary = summarizeAdminFinancialLedger(rows, 0);
  expect(summary.feastaRevenueInCentavos).toBe(50000);
  expect(summary.commissionNetMovementInCentavos).toBe(0);
  expect(summary.customerCashMovementInCentavos).toBe(150000);
  expect(summary.providerReservationCompInCentavos).toBe(100000);
  expect(summary.completedRefundCount).toBe(1);
});
