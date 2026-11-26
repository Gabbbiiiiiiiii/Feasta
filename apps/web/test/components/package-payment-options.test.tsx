import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import {ProviderPackageReview} from "@/app/provider/packages/provider-package-review";
import {createProviderPackageOfferDraft} from "@/app/provider/packages/provider-package-offer-builder";
import {PackagePaymentTerms, PackagePaymentTermsBadge, PackagePaymentTermsCardHint} from "@/components/shared/package-payment-terms";
import {CustomerBookingPaymentAction} from "@/components/customer/bookings/customer-booking-payment-action";
import {customerInitialPaymentEligibility} from "@/lib/customer/bookings/customer-booking-initial-payment-eligibility";
import {customerBookingCheckoutOptions} from "@/lib/customer/bookings/customer-booking-checkout-options";
import {providerInitialPaymentPresentation} from "@/lib/provider/requests/provider-request-payment-presentation";
import type {CustomerBookingDetails} from "@/lib/customer/bookings/customer-booking-types";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/provider/provider-package-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider/provider-package-client")>();
  return {
    ...actual,
    createProviderPackage: mocks.create,
    updateProviderPackage: mocks.update,
  };
});

vi.mock("@/lib/provider/provider-package-v2-client", () => ({
  packageV2Enabled: false,
  packageV2PublicationEnabled: false,
  createV2PackageDraft: vi.fn(),
  updateV2PackageDraft: vi.fn(),
  completeV2PackageProgress: vi.fn(),
  hasPendingV2Draft: vi.fn(() => false),
  retryPendingV2Draft: vi.fn(),
}));

const basePackage: ProviderPackage = {
  id: "pkg_terms_1",
  providerId: "prov_1",
  name: "Fiesta Package",
  description: "Complete fiesta catering package for celebrations.",
  eventType: "birthday",
  serviceCategoryCode: "food_catering",
  price: 10000,
  serviceOptions: {drop_off: {price: 10000, includedServices: ["Delivery"]}},
  themeOptions: [],
  paymentPolicy: "deposit_then_balance",
  fullPaymentAllowed: false,
  depositPercentage: 30,
  balanceDueDaysBeforeEvent: null,
  downPaymentPercentage: 30,
  minimumGuests: 20,
  maximumGuests: 100,
  imageUrl: "",
  imageUrls: [],
  foodInclusions: ["Main: Roasted Chicken"],
  decorInclusions: [],
  furnitureInclusions: [],
  serviceInclusions: [],
  status: "draft",
  isActive: false,
  isPublished: false,
  providerPubliclyVisible: false,
  pricingModel: "per_bundle",
};

const formProps = {
  packageCategoryOptions: [{code: "food_catering", name: "Catering"}],
  eventTypesSupported: ["birthday"],
  minGuestsPerEvent: 10,
  maxGuestsPerEvent: 200,
};

function advanceSteps(count: number) {
  for (let i = 0; i < count; i += 1) {
    fireEvent.click(screen.getByRole("button", {name: "Next"}));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(undefined);
});

describe("ProviderPackageForm multi-select payment options", () => {
  it("loads Down Payment only with only Down Payment checked and saves fullPaymentAllowed: false", async () => {
    render(<ProviderPackageForm {...formProps} initialPackage={basePackage} onSaved={vi.fn()} onCancel={vi.fn()} />);
    advanceSteps(1);

    const fullBox = screen.getByRole("checkbox", {name: "Full Payment"});
    const downBox = screen.getByRole("checkbox", {name: "Down Payment"});
    expect(fullBox).not.toBeChecked();
    expect(downBox).toBeChecked();
    expect(screen.getByLabelText(/Deposit required/)).toHaveValue(30);
    expect(screen.getByText(/Customers pay the required deposit first and must pay the remaining balance 24 hours before the scheduled event start\. Short-notice bookings under 72 hours still require full payment under FEASTA policy\./)).toBeVisible();

    advanceSteps(3);
    expect(screen.getByText("Down Payment (30% + Remaining Balance)")).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Save as Draft"}));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(basePackage.id, expect.objectContaining({
      paymentPolicy: "deposit_then_balance",
      fullPaymentAllowed: false,
      depositPercentage: 30,
    })));
  });

  it("allows selecting both Full Payment and Down Payment simultaneously", async () => {
    render(<ProviderPackageForm {...formProps} initialPackage={basePackage} onSaved={vi.fn()} onCancel={vi.fn()} />);
    advanceSteps(1);

    const fullBox = screen.getByRole("checkbox", {name: "Full Payment"});
    const downBox = screen.getByRole("checkbox", {name: "Down Payment"});
    fireEvent.click(fullBox);
    expect(fullBox).toBeChecked();
    expect(downBox).toBeChecked();
    expect(screen.getByText(/or pay the full amount upfront/)).toBeVisible();

    advanceSteps(3);
    expect(screen.getByText("Full Payment or Down Payment (30% + Remaining Balance)")).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Save as Draft"}));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(basePackage.id, expect.objectContaining({
      paymentPolicy: "deposit_then_balance",
      fullPaymentAllowed: true,
      depositPercentage: 30,
    })));
  });

  it("blocks advancing when neither payment option is selected and re-enables once one is chosen", () => {
    render(<ProviderPackageForm {...formProps} initialPackage={basePackage} onSaved={vi.fn()} onCancel={vi.fn()} />);
    advanceSteps(1);

    const downBox = screen.getByRole("checkbox", {name: "Down Payment"});
    fireEvent.click(downBox);
    expect(screen.getByRole("checkbox", {name: "Full Payment"})).not.toBeChecked();
    expect(downBox).not.toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select at least one payment option: Full Payment, Down Payment, or both.",
    );

    fireEvent.click(screen.getByRole("button", {name: "Next"}));
    expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();

    fireEvent.click(screen.getByRole("checkbox", {name: "Full Payment"}));
    expect(screen.queryByText("Select at least one payment option: Full Payment, Down Payment, or both.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Next"}));
    expect(screen.getByRole("heading", {name: "Step 3: Food menu"})).toBeVisible();
  });
});

describe("PackagePaymentTerms & ProviderPackageReview payment-option badges", () => {
  it("distinguishes Full payment, Down Payment only, and Down Payment & Full Payment", () => {
    const {rerender} = render(
      <PackagePaymentTerms source={{paymentPolicy: "full_payment", depositPercentage: 100}} />,
    );
    expect(screen.getByText("Full payment")).toBeVisible();

    rerender(
      <PackagePaymentTerms source={{paymentPolicy: "deposit_then_balance", fullPaymentAllowed: false, depositPercentage: 30}} />,
    );
    expect(screen.getByText("Down Payment")).toBeVisible();
    expect(screen.queryByText("Customers may also pay 100% upfront")).not.toBeInTheDocument();

    rerender(
      <PackagePaymentTerms source={{paymentPolicy: "deposit_then_balance", fullPaymentAllowed: true, depositPercentage: 30}} />,
    );
    expect(screen.getByText("Down Payment & Full Payment")).toBeVisible();
    expect(screen.getByText("Customers may also pay 100% upfront")).toBeVisible();

    rerender(
      <PackagePaymentTermsCardHint source={{paymentPolicy: "deposit_then_balance", fullPaymentAllowed: true, depositPercentage: 30}} />,
    );
    expect(screen.getByText("Down Payment & Full Payment")).toBeVisible();

    rerender(
      <PackagePaymentTermsBadge source={{paymentPolicy: "full_payment", depositPercentage: 100}} />,
    );
    expect(screen.getByText("Full Payment")).toBeVisible();
    expect(screen.queryByText("Deposit")).not.toBeInTheDocument();

    rerender(
      <PackagePaymentTermsBadge source={{paymentPolicy: "deposit_then_balance", fullPaymentAllowed: false, depositPercentage: 50}} />,
    );
    expect(screen.getByText("50% Down Payment")).toBeVisible();
    expect(screen.queryByText("Balance due")).not.toBeInTheDocument();
    expect(screen.queryByText("Short notice")).not.toBeInTheDocument();

    rerender(
      <PackagePaymentTermsBadge source={{paymentPolicy: "deposit_then_balance", fullPaymentAllowed: true, depositPercentage: 50}} />,
    );
    expect(screen.getByText("50% Down Payment & Full Payment")).toBeVisible();
    expect(screen.queryByText("Deposit")).not.toBeInTheDocument();
    expect(screen.queryByText("Full payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance due")).not.toBeInTheDocument();
    expect(screen.queryByText("Short notice")).not.toBeInTheDocument();
  });

  it("renders accurate payment summary in ProviderPackageReview for all three modes", () => {
    const common = {
      name: "Fiesta",
      description: "Catering",
      eventType: "birthday",
      serviceCategory: "Catering",
      pricingModel: "per_bundle" as const,
      minimumGuests: "20",
      maximumGuests: "100",
      serviceOptions: {},
      food: [],
      foodChoiceGroups: [],
      decor: "",
      furniture: "",
      services: "",
      offerDraft: createProviderPackageOfferDraft(),
      images: [],
      depositPercentage: "30",
    };

    const {rerender} = render(<ProviderPackageReview {...common} paymentPolicy="full_payment" fullPaymentAllowed={true} />);
    expect(screen.getByText("Full Payment (100%)")).toBeVisible();

    rerender(<ProviderPackageReview {...common} paymentPolicy="deposit_then_balance" fullPaymentAllowed={false} />);
    expect(screen.getByText("Down Payment (30% + Remaining Balance)")).toBeVisible();

    rerender(<ProviderPackageReview {...common} paymentPolicy="deposit_then_balance" fullPaymentAllowed={true} />);
    expect(screen.getByText("Full Payment or Down Payment (30% + Remaining Balance)")).toBeVisible();
  });
});

describe("minimum_only eligibility, checkout options, and UI", () => {
  const submittedAt = "2027-06-10T02:00:00.000Z";
  const eventStartAt = "2027-06-20T10:00:00.000Z";
  const deadlineAt = "2027-06-12T02:00:00.000Z";

  function makeMinimumOnlyDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      status: "waiting_for_down_payment",
      paymentStatus: "unpaid",
      initialPaymentDeadlinePolicyVersion: 4,
      initialPaymentDeadlineAt: new Date(deadlineAt),
      expiresAt: new Date(deadlineAt),
      initialPaymentEligibilitySchemaVersion: 2,
      initialPaymentEligibility: {
        authorityTimeSource: "booking_submission",
        submittedAt,
        evaluatedAt: submittedAt,
        eventStartAt,
        depositAllowed: true,
        depositMinimumNoticeHours: 72,
        depositEligible: true,
        mode: "minimum_only",
        reason: "deposit_eligible",
      },
      bookingPaymentAgreement: {
        schemaVersion: 1,
        timingSchemaVersion: 3,
        channel: "booking_submission",
        initialPaymentEligibilitySchemaVersion: 2,
        depositEligible: true,
        eligibilityReason: "deposit_eligible",
        agreedAt: submittedAt,
        eventStartAt,
        grossAmountInCentavos: 3_000_000,
        requiredUpfrontAmountInCentavos: 900_000,
        remainingBalanceInCentavos: 2_100_000,
      },
      financialSnapshot: {
        schemaVersion: 1,
        currency: "PHP",
        grossAmountInCentavos: 3_000_000,
        requiredUpfrontAmountInCentavos: 900_000,
        remainingBalanceInCentavos: 2_100_000,
      },
      ...overrides,
    };
  }

  it("exposes only the deposit checkout option and explains Down payment only to provider", () => {
    const doc = makeMinimumOnlyDoc();
    expect(customerInitialPaymentEligibility(doc)).toEqual({
      kind: "canonical",
      mode: "minimum_only",
      reason: "deposit_eligible",
      depositMinimumNoticeHours: 72,
    });

    const options = customerBookingCheckoutOptions("req_down_only", doc, "waiting_for_down_payment");
    expect(options).toEqual([{choice: "minimum", amount: 9000}]);

    const providerView = providerInitialPaymentPresentation(doc);
    expect(providerView.kind).toBe("minimum");
    expect(providerView.amount).toBe(9000);
    expect(providerView.explanation).toContain("Down payment only");
  });

  it("renders a single Pay deposit action without a Pay in full button", () => {
    const request: CustomerBookingDetails["providerRequests"][number] = {
      id: "req_down_only",
      providerRequestId: "req_down_only",
      mainEventId: "evt_1",
      providerId: "prov_1",
      providerName: "Gabriel Catering",
      type: "catering",
      packageId: "pkg_1",
      packageName: "Fiesta Package",
      services: [],
      amount: 30000,
      downPaymentAmount: 9000,
      remainingBalance: 21000,
      downPaymentPercentage: 30,
      status: "waiting_for_down_payment",
      paymentStatus: "unpaid",
      paymentId: null,
      settlementStatus: null,
      grossSettledAmountInCentavos: null,
      outstandingAmountInCentavos: null,
      remainingBalanceStatus: null,
      remainingBalanceDueAt: "2027-06-18T10:00:00.000Z",
      remainingBalanceGraceEndsAt: null,
      rejectionReason: null,
      cancellationReason: null,
      requestedAt: null,
      respondedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      replacementStatus: null,
      confirmedAt: null,
      paidAt: null,
      refundedAt: null,
      completedAt: null,
      cancelledAt: null,
      expiresAt: null,
      reviewStatus: "not_submitted",
      checkoutOptions: [{choice: "minimum", amount: 9000}],
      initialPaymentExplanation: null,
      arrangedPayment: null,
    };

    render(
      <CustomerBookingPaymentAction
        request={request}
        bookingId="evt_1"
        paymentRequestId={null}
        paymentRequestChoice={null}
        onPay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", {name: /Pay deposit ₱9,000\.00/})).toBeVisible();
    expect(screen.queryByRole("button", {name: /Pay full/})).not.toBeInTheDocument();
    expect(screen.queryByText("Full payment required")).not.toBeInTheDocument();
  });
});
