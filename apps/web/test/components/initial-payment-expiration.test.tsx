import {cleanup, fireEvent, render, renderHook, screen} from "@testing-library/react";
import {createHash} from "node:crypto";
import {afterEach, describe, expect, it, vi} from "vitest";
vi.mock("server-only", () => ({}));
import {CustomerBookingProviderRequestCard} from "@/components/customer/bookings/customer-booking-provider-request-card";
import {providerPaymentPresentation} from "@/components/customer/bookings/customer-booking-confirmation";
import {CustomerBookingPaymentAction} from "@/components/customer/bookings/customer-booking-payment-action";
import {customerBookingCheckoutOptions} from "@/lib/customer/bookings/customer-booking-checkout-options";
import {canStartCustomerBookingPayment} from "@/lib/customer/bookings/customer-booking-payment";
import {lifecycleEvidence, lifecycleLabel} from "@/lib/presentation/booking-lifecycle";
import {ProviderBookingStatus, useProviderBookingPresentation} from "@/components/provider/provider-booking-status";
import type {CustomerBookingProviderRequest} from "@/lib/customer/bookings/customer-booking-types";
import type {ProviderBooking} from "@/lib/provider/bookings/provider-booking-types";
import {projectInitialPaymentDeadline} from "@/lib/customer/bookings/customer-booking-initial-payment-deadline";
import {formatInitialPaymentDeadline} from "@/components/customer/bookings/booking-formatters";

afterEach(cleanup);
const frozenEvidence = {
  version: 4, accepted: "2026-10-25T00:00:00.000Z", eventStart: "2026-11-25T02:00:00.000Z",
  deadline: "2026-10-25T06:00:00.000Z", expires: "2026-10-25T06:00:00.000Z", hasExpires: true,
};

describe("frozen customer initial payment deadlines", () => {
  it.each([false, true])("shows independent standard/rush deadlines in shared full/drawer cards (%s)", compact => {
    const standard = projectInitialPaymentDeadline(frozenEvidence);
    const rush = projectInitialPaymentDeadline({...frozenEvidence, eventStart: "2026-10-26T02:00:00.000Z",
      deadline: "2026-10-25T02:00:00.000Z", expires: "2026-10-25T02:00:00.000Z"});
    for (const deadline of [standard, rush]) {
      render(<CustomerBookingProviderRequestCard compact={compact} request={request({
        status: "waiting_for_down_payment", lifecycle: undefined, initialPaymentDeadlineAt: deadline,
      })} />);
    }
    expect(screen.getByText("Oct 25, 2026 · 2:00 PM PHT")).toBeVisible();
    expect(screen.getByText("Oct 25, 2026 · 10:00 AM PHT")).toBeVisible();
    expect(screen.getAllByText("Initial payment deadline")).toHaveLength(2);
  });
  it("formats in Manila and never renews the frozen timestamp on reload", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
        process.env.TZ = zone;
        expect(formatInitialPaymentDeadline(frozenEvidence.deadline)).toBe("Oct 25, 2026 · 2:00 PM PHT");
      }
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
      expect(projectInitialPaymentDeadline({...frozenEvidence})).toBe(frozenEvidence.deadline);
    } finally {
      process.env.TZ = original;
      vi.restoreAllMocks();
    }
  });
  it.each([
    {version: undefined}, {version: 5}, {deadline: null}, {deadline: "invalid"},
    {accepted: null}, {eventStart: null}, {expires: null}, {expires: "2026-10-25T07:00:00Z"},
    {accepted: "2026-10-25T07:00:00Z"}, {eventStart: "2026-10-25T01:00:00Z"},
  ])("suppresses historical, missing and conflicting evidence: %j", patch => {
    expect(projectInitialPaymentDeadline({...frozenEvidence, ...patch})).toBeNull();
  });
  it.each(["confirmed", "cancelled", "expired", "payment_processing"] as const)("hides reminders for %s", status => {
    render(<CustomerBookingProviderRequestCard request={request({status, initialPaymentDeadlineAt: frozenEvidence.deadline})} />);
    expect(screen.queryByText("Initial payment deadline")).not.toBeInTheDocument();
  });
  it("keeps historical compatibility and separate balance dates", () => {
    render(<CustomerBookingProviderRequestCard request={request({status: "waiting_for_down_payment", lifecycle: undefined,
      expiresAt: frozenEvidence.deadline, remainingBalanceDueAt: "2026-11-24T02:00:00Z"})} />);
    expect(screen.queryByText("Initial payment deadline")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Original payment terms"));
    expect(screen.getByText("Balance deadline")).toBeVisible();
  });
});
const raw = (extra = {}) => ({status: "waiting_for_down_payment", paymentStatus: "unpaid",
  financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
    requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000}, ...extra});
const request = (extra: Partial<CustomerBookingProviderRequest> = {}): CustomerBookingProviderRequest => ({
  id: "request_expired", providerRequestId: "request_expired", mainEventId: "event_expiration",
  providerId: "provider_expiration", providerName: "Photography", type: "catering", packageId: null, packageName: null,
  services: [], amount: 1000, downPaymentAmount: 300, downPaymentPercentage: 30, remainingBalance: 700,
  status: "expired", paymentStatus: "unpaid", paymentId: null, settlementStatus: null,
  grossSettledAmountInCentavos: null, outstandingAmountInCentavos: null, remainingBalanceStatus: null,
  remainingBalanceDueAt: null, remainingBalanceGraceEndsAt: null, rejectionReason: null, cancellationReason: null,
  requestedAt: null, respondedAt: null, acceptedAt: null, rejectedAt: null, replacementStatus: null,
  confirmedAt: null, paidAt: null, refundedAt: null, completedAt: null, cancelledAt: null, expiresAt: null,
  checkoutOptions: [], reviewStatus: "unavailable",
  lifecycle: lifecycleEvidence({status: "expired", initialPaymentExpirationReason: "no_attempt_original_deadline_elapsed"}), ...extra,
});

describe("initial payment expiration presentation", () => {
  it.each([false, true])("shared drawer/details card renders verified expiration and safe new-request route (compact=%s)", compact => {
    const data = request();
    render(<CustomerBookingProviderRequestCard request={data} compact={compact}
      paymentAction={<button>Stale Pay Now</button>} cancellationAction={<button>Cancel payment</button>} />);
    expect(screen.getByText("Payment expired — Submit a new booking request")).toBeVisible();
    expect(screen.getByRole("link", {name: "Submit a new booking request"})).toHaveAttribute("href", "/customer/providers");
    expect(screen.getByText(/previous reservation is no longer valid/u)).toBeVisible();
    expect(screen.queryByRole("button", {name: "Stale Pay Now"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Cancel payment"})).not.toBeInTheDocument();
    expect(providerPaymentPresentation(data).label).toBe("Payment expired — Submit a new booking request");
  });
  it("review preserves uncertain truth, suppresses stale actions and never says expired", () => {
    const data = request({status: "accepted", lifecycle: lifecycleEvidence({status: "accepted", initialPaymentReview: {schemaVersion: 1}})});
    render(<CustomerBookingProviderRequestCard request={data} paymentAction={<button>Stale Pay Now</button>} />);
    expect(screen.getAllByText("Payment verification required — Contact support").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Payment expired/u)).not.toBeInTheDocument();
    expect(screen.queryByText("Payment not yet required")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Stale Pay Now"})).not.toBeInTheDocument();
    expect(providerPaymentPresentation(data).label).toBe("Payment verification required — Contact support");
  });
  it("accepted historical requests explain verification instead of payment not yet required", () => {
    const data = request({status: "accepted", lifecycle: undefined});
    expect(providerPaymentPresentation(data).label).toBe("Acceptance verification pending");
  });
  it("processing and expired gateway session never imply a booking expiration", () => {
    const data = request({status: "payment_processing", paymentStatus: "processing", lifecycle: undefined});
    expect(providerPaymentPresentation(data).label).toBe("Payment processing");
    render(<CustomerBookingPaymentAction request={data} bookingId={data.mainEventId}
      paymentRequestId={null} paymentRequestChoice={null} onPay={vi.fn()} />);
    expect(screen.getByText("Payment processing")).toBeVisible();
    expect(screen.queryByText(/Payment expired/u)).not.toBeInTheDocument();
    expect(lifecycleEvidence({status: "waiting_for_down_payment", paymentStatus: "expired"}).initialPaymentExpired).toBeUndefined();
  });
  it("expired and review DTOs block checkout even when stale options are present", () => {
    expect(canStartCustomerBookingPayment(request({checkoutOptions: [{choice: "full", amount: 1000}]}), "event_expiration")).toBe(false);
    for (const status of ["expired", "accepted", "rejected", "cancelled"]) {
      expect(customerBookingCheckoutOptions("request_test", raw({status}), "needs_provider_replacement")).toEqual([]);
    }
    expect(customerBookingCheckoutOptions("request_test", raw({initialPaymentReview: {schemaVersion: 1}}), "needs_provider_replacement")).toEqual([]);
    expect(customerBookingCheckoutOptions("request_sibling", raw(), "needs_provider_replacement")).toHaveLength(2);
  });
  it("paid and rejected siblings retain independent labels and provider Web displays expiration/review", () => {
    const paid = request({status: "confirmed", paymentStatus: "paid", lifecycle: undefined});
    const rejected = request({status: "rejected", lifecycle: undefined});
    expect(providerPaymentPresentation(paid).label).toMatch(/confirmed/u);
    expect(providerPaymentPresentation(rejected).status).toBe("rejected");
    expect(lifecycleLabel("confirmed", paid.lifecycle)).toBeNull();
    render(<ProviderBookingStatus detailed booking={{providerRequestStatus: "expired", mainEventStatus: "needs_provider_replacement",
      lifecycle: request().lifecycle} as ProviderBooking} />);
    expect(screen.getByLabelText("Status: Payment expired")).toBeVisible();
    expect(screen.getByText("The temporary reservation has been released.")).toBeVisible();
    const booking = {providerRequestStatus: "expired", mainEventStatus: "needs_provider_replacement",
      lifecycle: request().lifecycle, bookingPolicy: {state: "cancelled", label: "Expired"}} as ProviderBooking;
    expect(renderHook(() => useProviderBookingPresentation(booking)).result.current).toBe(booking);
    cleanup();
    render(<ProviderBookingStatus booking={{providerRequestStatus: "accepted", mainEventStatus: "needs_provider_replacement",
      lifecycle: lifecycleEvidence({status: "accepted", initialPaymentReview: {schemaVersion: 1}})} as ProviderBooking} />);
    expect(screen.getByLabelText("Status: Payment verification required — Contact support")).toBeVisible();
  });
  it("authoritatively confirmed deposits supersede an old initial review without losing balance options", () => {
    const paymentId = `payment_${createHash("sha256").update(
      "provider-request:request_test:payment-choice:minimum:v1").digest("hex").slice(0, 32)}`;
    const data = raw({status: "confirmed", paymentStatus: "paid", initialPaymentReview: {schemaVersion: 1},
      initialPaymentChoice: "minimum", initialPaymentId: paymentId, paymentId, settlementSchemaVersion: 1,
      settlementStatus: "deposit_settled", grossSettledAmountInCentavos: 30000, outstandingAmountInCentavos: 70000});
    expect(lifecycleEvidence(data).initialPaymentReview).toBeUndefined();
    expect(customerBookingCheckoutOptions("request_test", data, "needs_provider_replacement"))
      .toEqual([{choice: "remaining_balance", amount: 700}]);
    expect(providerPaymentPresentation(request({status: "confirmed", paymentStatus: "paid", lifecycle: lifecycleEvidence(data)})).status).toBe("paid");
  });
});

it('V4 checkout projection uses frozen server deadline before worker updates status', () => {
  const deadline = new Date('2026-11-01T15:00:00+08:00');
  vi.spyOn(Date, 'now').mockReturnValue(+deadline - 1);
  const data = raw({initialPaymentDeadlinePolicyVersion: 4, initialPaymentDeadlineAt: deadline, expiresAt: deadline});
  expect(customerBookingCheckoutOptions('request_test', data, 'needs_provider_replacement')).toHaveLength(2);
  vi.spyOn(Date, 'now').mockReturnValue(+deadline);
  expect(customerBookingCheckoutOptions('request_test', data, 'needs_provider_replacement')).toEqual([]);
  for (const patch of [{initialPaymentDeadlinePolicyVersion: 5}, {initialPaymentDeadlineAt: null},
    {expiresAt: new Date(+deadline + 1)}]) {
    expect(customerBookingCheckoutOptions('request_test', {...data, ...patch}, 'needs_provider_replacement')).toEqual([]);
  }
  vi.restoreAllMocks();
});
