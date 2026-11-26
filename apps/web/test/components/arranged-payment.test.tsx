import {fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const respondToArrangedPayment = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/arranged-payment-client", () => ({
  respondToArrangedPayment,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: vi.fn()}),
}));

import {ProviderArrangedPayment} from "@/app/provider/requests/provider-arranged-payment";
import {ProviderRequestDetailDrawer} from "@/app/provider/requests/provider-request-detail-drawer";
import {CustomerArrangedPayment} from "@/components/customer/bookings/customer-arranged-payment";
import {CustomerBookingPaymentAction} from "@/components/customer/bookings/customer-booking-payment-action";
import {customerInitialPaymentEligibility} from "@/lib/customer/bookings/customer-booking-initial-payment-eligibility";
import {arrangedPaymentView} from "@/lib/payments/arranged-payment-view";
import {bookingPolicyV3Presentation} from "@/lib/payments/booking-policy-v3-presentation";
import {
  cateringPaymentPresentation,
  providerInitialPaymentPresentation,
} from "@/lib/provider/requests/provider-request-payment-presentation";
import type {CustomerBookingDetails} from "@/lib/customer/bookings/customer-booking-types";
import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";

const FUTURE_INITIAL_ISO = "2027-05-10T09:00:00.000Z"; // 2027-05-10 17:00 Manila
const FUTURE_BALANCE_ISO = "2027-05-14T10:00:00.000Z"; // 2027-05-14 18:00 Manila
const FUTURE_CUTOFF_ISO = "2027-05-15T10:00:00.000Z"; // 2027-05-15 18:00 Manila (T-48h)
const FUTURE_PREP_ISO = "2027-05-16T10:00:00.000Z"; // T-24h
const FUTURE_EVENT_ISO = "2027-05-17T10:00:00.000Z"; // T-0
const SUBMITTED_ISO = "2027-05-05T02:00:00.000Z";

function makeProviderRequest(overrides: Partial<ProviderRequestListItem> = {}): ProviderRequestListItem {
  return {
    id: "req_sophia_1",
    mainEventId: "evt_sophia_1",
    providerId: "prov_gabriel",
    type: "catering",
    status: "pending",
    customer: {
      id: "cust_sophia",
      name: "Sophia Santos",
      email: "sophia@example.com",
      phoneNumber: "09171234567",
    },
    package: {id: "pkg_fiesta", name: "Fiesta Buffet"},
    services: [],
    event: {
      eventType: "birthday",
      eventDate: "2027-05-17T00:00:00.000Z",
      eventTime: "18:00",
      guestCount: 100,
      venueAddress: "123 Rizal St",
      city: "Ormoc",
      notes: null,
    },
    amount: 30000,
    downPaymentAmount: 15000,
    paymentPolicy: "deposit_then_balance",
    downPaymentPercentage: 50,
    commissionAmount: 1500,
    providerNetAmount: 28500,
    rejectionReason: null,
    createdAt: SUBMITTED_ISO,
    updatedAt: SUBMITTED_ISO,
    respondedAt: null,
    canOfferArrangedPayment: true,
    arrangedBalanceCutoffAt: FUTURE_CUTOFF_ISO,
    arrangedPayment: null,
    ...overrides,
  };
}

function makeAcceptedFirestoreRecord(paymentPolicy: "deposit_then_balance" | "full_payment") {
  const depositEligible = paymentPolicy === "deposit_then_balance";
  const reason = depositEligible ? "deposit_eligible" : "package_full_payment";
  const agreement = {
    schemaVersion: 1,
    timingSchemaVersion: 3,
    channel: "booking_submission",
    initialPaymentEligibilitySchemaVersion: 2,
    customerId: "cust_sophia",
    providerId: "prov_gabriel",
    depositEligible,
    eligibilityReason: reason,
    grossAmountInCentavos: 3_000_000,
    requiredUpfrontAmountInCentavos: depositEligible ? 1_500_000 : 3_000_000,
    remainingBalanceInCentavos: depositEligible ? 1_500_000 : 0,
    agreedAt: SUBMITTED_ISO,
    eventStartAt: FUTURE_EVENT_ISO,
    depositEligibilityCutoffAt: "2027-05-14T10:00:00.000Z",
    remainingBalanceDueAt: FUTURE_CUTOFF_ISO,
    hardPaymentDeadlineAt: FUTURE_PREP_ISO,
    preparationStartsAt: FUTURE_PREP_ISO,
  };
  const eligibility = {
    authorityTimeSource: "booking_submission",
    submittedAt: SUBMITTED_ISO,
    evaluatedAt: SUBMITTED_ISO,
    eventStartAt: FUTURE_EVENT_ISO,
    depositAllowed: true,
    depositMinimumNoticeHours: 72,
    depositEligible,
    mode: depositEligible ? "minimum_or_full" : "full_only",
    reason,
  };
  const arrangedPaymentOffer = {
    schemaVersion: 1,
    id: "11111111-1111-4111-8111-111111111111",
    status: "accepted" as const,
    grossInCentavos: 3_000_000,
    upfrontInCentavos: 500_000,
    initialDueAt: FUTURE_INITIAL_ISO,
    balanceDueAt: FUTURE_BALANCE_ISO,
  };
  const arrangedHard = new Date(Date.parse(FUTURE_BALANCE_ISO) + 24 * 3_600_000).toISOString();
  const data: Record<string, unknown> = {
    providerRequestId: "req_sophia_1",
    mainEventId: "evt_sophia_1",
    bookingId: "evt_sophia_1",
    customerId: "cust_sophia",
    providerId: "prov_gabriel",
    type: "catering",
    status: "waiting_for_down_payment",
    amount: 30000,
    downPaymentAmount: depositEligible ? 15000 : 30000,
    remainingBalance: depositEligible ? 15000 : 0,
    initialPaymentEligibilitySchemaVersion: 2,
    initialPaymentEligibility: eligibility,
    remainingBalanceTimingSchemaVersion: 3,
    balanceDueHoursBeforeEvent: 48,
    eventStartAt: FUTURE_EVENT_ISO,
    depositEligibilityCutoffAt: "2027-05-14T10:00:00.000Z",
    remainingBalanceDueAt: FUTURE_BALANCE_ISO,
    hardPaymentDeadlineAt: arrangedHard,
    preparationStartsAt: FUTURE_PREP_ISO,
    bookingLifecyclePolicySnapshot: {
      schemaVersion: 3,
      providerStartsManually: false,
      requiresFullPayment: true,
      autoStartAtScheduledTime: true,
      providerConfirmsCompletion: true,
    },
    bookingPaymentAgreement: agreement,
    financialSnapshot: {
      schemaVersion: 1,
      currency: "PHP",
      grossAmountInCentavos: 3_000_000,
      requiredUpfrontAmountInCentavos: 500_000,
      remainingBalanceInCentavos: 2_500_000,
    },
    arrangedPaymentOffer,
  };
  const parent: Record<string, unknown> = {
    mainEventId: "evt_sophia_1",
    bookingId: "evt_sophia_1",
    customerId: "cust_sophia",
    providerId: "prov_gabriel",
    providerRequestIds: ["req_sophia_1"],
    initialPaymentEligibilitySchemaVersion: 2,
    initialPaymentEligibility: eligibility,
    bookingPaymentAgreement: agreement,
    eventStartAt: FUTURE_EVENT_ISO,
    depositEligibilityCutoffAt: "2027-05-14T10:00:00.000Z",
    remainingBalanceDueAt: FUTURE_CUTOFF_ISO,
    hardPaymentDeadlineAt: FUTURE_PREP_ISO,
    preparationStartsAt: FUTURE_PREP_ISO,
  };
  return {data, parent};
}

beforeEach(() => {
  respondToArrangedPayment.mockReset();
});

describe("arranged payment view & domain projections", () => {
  it("parses valid offers and rejects malformed ones", () => {
    expect(arrangedPaymentView({
      schemaVersion: 1,
      id: "offer_1",
      status: "offered",
      grossInCentavos: 3_000_000,
      upfrontInCentavos: 500_000,
      initialDueAt: FUTURE_INITIAL_ISO,
      balanceDueAt: FUTURE_BALANCE_ISO,
    })).toEqual({
      id: "offer_1",
      status: "offered",
      grossInCentavos: 3_000_000,
      upfrontInCentavos: 500_000,
      initialDueAt: FUTURE_INITIAL_ISO,
      balanceDueAt: FUTURE_BALANCE_ISO,
    });
    expect(arrangedPaymentView({
      schemaVersion: 1,
      id: "offer_bad",
      status: "offered",
      grossInCentavos: 3_000_000,
      upfrontInCentavos: 50,
      initialDueAt: FUTURE_INITIAL_ISO,
      balanceDueAt: FUTURE_BALANCE_ISO,
    })).toBeNull();
  });

  it.each(["deposit_then_balance", "full_payment"] as const)(
    "projects provider payment summary and customer eligibility cleanly after acceptance (%s)",
    (paymentPolicy) => {
      const {data, parent} = makeAcceptedFirestoreRecord(paymentPolicy);
      const eligibility = customerInitialPaymentEligibility(data);
      expect(eligibility).toEqual({
        kind: "canonical",
        mode: "minimum_or_full",
        reason: "arranged_payment",
        depositMinimumNoticeHours: 72,
      });
      const providerSummary = cateringPaymentPresentation(data, "req_sophia_1", "evt_sophia_1", parent);
      expect(providerSummary.kind).toBe("minimum");
      expect(providerSummary.amount).toBe(5000);
      expect(providerSummary.explanation).toContain("Arranged payment accepted");
      expect(providerInitialPaymentPresentation(data).amount).toBe(5000);

      const v3 = bookingPolicyV3Presentation(data, new Date("2027-05-11T00:00:00.000Z"));
      expect(v3).not.toBeNull();
      expect(v3?.dueAt).toBe(FUTURE_BALANCE_ISO);
    },
  );
});

describe("ProviderArrangedPayment and ProviderRequestDetailDrawer", () => {
  it("previews remaining balance, validates cutoff, and sends an arranged offer", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    respondToArrangedPayment.mockResolvedValueOnce(undefined);
    render(<ProviderArrangedPayment request={makeProviderRequest()} onSaved={onSaved} disabled={false} />);

    await user.click(screen.getByRole("button", {name: "Offer arranged payment"}));
    await user.type(screen.getByLabelText("First payment (PHP)"), "5000");
    expect(screen.getByText(/Remaining balance:/)).toHaveTextContent("₱25,000.00");

    fireEvent.change(screen.getByLabelText("First payment deadline (Manila time)"), {
      target: {value: "2027-05-10T17:00"},
    });
    fireEvent.change(screen.getByLabelText("Remaining balance due (Manila time)"), {
      target: {value: "2027-05-15T18:00"},
    });

    await user.click(screen.getByRole("button", {name: "Send payment offer"}));
    expect(respondToArrangedPayment).toHaveBeenCalledWith("req_sophia_1", {
      action: "offerArrangement",
      upfrontInCentavos: 500_000,
      initialDueAt: "2027-05-10T17:00",
      balanceDueAt: "2027-05-15T18:00",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("shows active offer controls, pre-fills Replace offer, withdraws, and explains disabled Accept Request", async () => {
    const user = userEvent.setup();
    respondToArrangedPayment.mockResolvedValueOnce(undefined);
    const req = makeProviderRequest({
      arrangedPayment: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "offered",
        grossInCentavos: 3_000_000,
        upfrontInCentavos: 500_000,
        initialDueAt: FUTURE_INITIAL_ISO,
        balanceDueAt: FUTURE_BALANCE_ISO,
      },
    });
    render(
      <ProviderRequestDetailDrawer
        request={req}
        open
        onOpenChange={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("Awaiting customer response")).toBeVisible();
    expect(screen.getByRole("button", {name: "Accept Request"})).toBeDisabled();
    expect(screen.getByText(/Withdraw the arranged payment offer above to accept with standard package terms/)).toBeVisible();

    await user.click(screen.getByRole("button", {name: "Replace offer"}));
    expect(screen.getByLabelText("First payment (PHP)")).toHaveValue("5000");
    await user.click(screen.getByRole("button", {name: "Cancel"}));

    await user.click(screen.getByRole("button", {name: "Withdraw offer"}));
    expect(respondToArrangedPayment).toHaveBeenCalledWith("req_sophia_1", {
      action: "withdrawArrangement",
      offerId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("shows an expired offer notice when a pending offer deadline has passed", () => {
    const req = makeProviderRequest({
      arrangedPayment: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "offered",
        grossInCentavos: 3_000_000,
        upfrontInCentavos: 500_000,
        initialDueAt: "2020-01-01T00:00:00.000Z",
        balanceDueAt: "2020-01-05T00:00:00.000Z",
      },
    });
    render(<ProviderArrangedPayment request={req} disabled={false} />);
    expect(screen.getByText(/Your previous arranged payment offer expired without a response/)).toBeVisible();
  });
});

describe("CustomerArrangedPayment and CustomerBookingPaymentAction", () => {
  it("lets Sophia accept Gabriel's arranged payment offer and refreshes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    respondToArrangedPayment.mockResolvedValueOnce(undefined);
    render(
      <CustomerArrangedPayment
        offer={{
          id: "11111111-1111-4111-8111-111111111111",
          status: "offered",
          grossInCentavos: 3_000_000,
          upfrontInCentavos: 500_000,
          initialDueAt: FUTURE_INITIAL_ISO,
          balanceDueAt: FUTURE_BALANCE_ISO,
        }}
        requestId="req_sophia_1"
        pendingRequest
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Arranged payment offer")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Accept payment terms"}));
    expect(respondToArrangedPayment).toHaveBeenCalledWith("req_sophia_1", {
      action: "acceptArrangement",
      offerId: "11111111-1111-4111-8111-111111111111",
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Arranged payment accepted")).toBeVisible();
  });

  it("renders arranged first payment and full payment choices after acceptance", async () => {
    const user = userEvent.setup();
    const onPay = vi.fn();
    const request = {
      id: "req_sophia_1",
      providerRequestId: "req_sophia_1",
      mainEventId: "evt_sophia_1",
      providerId: "prov_gabriel",
      providerName: "Gabriel Catering",
      type: "catering",
      packageId: "pkg_fiesta",
      packageName: "Fiesta Buffet",
      services: [],
      amount: 30000,
      downPaymentAmount: 5000,
      downPaymentPercentage: 16.67,
      remainingBalance: 25000,
      status: "waiting_for_down_payment",
      paymentStatus: "unpaid",
      paymentId: null,
      settlementStatus: null,
      grossSettledAmountInCentavos: null,
      outstandingAmountInCentavos: null,
      remainingBalanceStatus: "not_due",
      remainingBalanceDueAt: FUTURE_BALANCE_ISO,
      remainingBalanceGraceEndsAt: null,
      checkoutOptions: [
        {choice: "minimum", amount: 5000},
        {choice: "full", amount: 30000},
      ],
      initialPaymentExplanation: null,
      arrangedPayment: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "accepted",
        grossInCentavos: 3_000_000,
        upfrontInCentavos: 500_000,
        initialDueAt: FUTURE_INITIAL_ISO,
        balanceDueAt: FUTURE_BALANCE_ISO,
      },
      rejectionReason: null,
      cancellationReason: null,
      requestedAt: SUBMITTED_ISO,
      confirmedAt: null,
      completedAt: null,
      cancelledAt: null,
      expiresAt: FUTURE_INITIAL_ISO,
      initialPaymentDeadlineAt: FUTURE_INITIAL_ISO,
      reviewStatus: "unavailable",
    } as unknown as CustomerBookingDetails["providerRequests"][number];

    render(
      <CustomerBookingPaymentAction
        request={request}
        bookingId="evt_sophia_1"
        paymentRequestId={null}
        paymentRequestChoice={null}
        onPay={onPay}
      />,
    );

    expect(screen.getByText("Pay arranged first payment")).toBeVisible();
    expect(screen.getByText("Agreed first payment under your arranged payment terms.")).toBeVisible();
    await user.click(screen.getByRole("button", {name: /Pay first payment/}));
    expect(onPay).toHaveBeenCalledWith("req_sophia_1", "minimum");
  });
});
