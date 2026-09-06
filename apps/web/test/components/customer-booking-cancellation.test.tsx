import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  CustomerCancellationOptions,
  CustomerCancellationProjection,
} from "@/lib/customer/bookings/customer-cancellation-client";
import type {CustomerBookingProviderRequest} from "@/lib/customer/bookings/customer-booking-types";

const mocks = vi.hoisted(() => ({
  loadOptions: vi.fn(),
  loadStatus: vi.fn(),
  submit: vi.fn(),
  createKey: vi.fn(() => "customer-cancellation:request-0001:attempt-0001"),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/customer/bookings/customer-cancellation-client", () => ({
  getCustomerProviderRequestCancellationOptions: mocks.loadOptions,
  getCustomerProviderRequestCancellationStatus: mocks.loadStatus,
  submitCustomerProviderRequestCancellation: mocks.submit,
  createCustomerCancellationIdempotencyKey: mocks.createKey,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

import {CustomerBookingCancellationDialog} from "@/components/customer/bookings/customer-booking-cancellation-dialog";

const PROVIDER_REQUEST_ID = "request-0001";

describe("Customer Provider-service cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadOptions.mockResolvedValue(policyBackedOptions());
    mocks.loadStatus.mockResolvedValue({
      providerRequestId: PROVIDER_REQUEST_ID,
      cancellation: null,
    });
    mocks.submit.mockResolvedValue({
      providerRequestId: PROVIDER_REQUEST_ID,
      status: "submitted",
      policyEvidenceStatus: "policy_backed",
      manualReviewRequired: false,
      created: true,
    });
  });

  it("loads trusted policy-backed options for the selected Provider request", async () => {
    renderDialog();

    expect(await screen.findByRole("heading", {name: "Agreed refund policy"}))
      .toBeVisible();
    expect(mocks.loadOptions).toHaveBeenCalledWith(PROVIDER_REQUEST_ID);
    expect(mocks.loadStatus).toHaveBeenCalledWith(PROVIDER_REQUEST_ID);
    expect(screen.getByRole("heading", {name: "Cancel Maria's Catering's service?"}))
      .toBeVisible();
    expect(screen.getByText("Catering")).toBeVisible();
    expect(screen.getByText("Package-specific policy · Version 4")).toBeVisible();
    expect(screen.getByText("Preparation Not Started")).toBeVisible();
    expect(screen.getByText("Preparation Started")).toBeVisible();
    expect(screen.getByText("Service Started")).toBeVisible();
    expect(screen.getByText("100%")).toBeVisible();
    expect(screen.getByText("50%")).toBeVisible();
    expect(screen.getByText("Current recorded stage")).toBeVisible();
    expect(screen.getByText(/1,250\.00/u)).toBeVisible();
    expect(screen.getByText("Written notice is appreciated.")).toBeVisible();
    expect(screen.getByText(/Other Provider services in this event are not automatically cancelled/u))
      .toBeVisible();
    expect(document.body).not.toHaveTextContent(PROVIDER_REQUEST_ID);
    expect(document.body).not.toHaveTextContent("provider-private-001");
  });

  it("validates the exact reason bounds and submits only the trusted fields", async () => {
    const submitted = deferredSubmission();
    mocks.submit.mockReturnValue(submitted.promise);
    mocks.loadStatus
      .mockResolvedValueOnce({providerRequestId: PROVIDER_REQUEST_ID, cancellation: null})
      .mockResolvedValueOnce({
        providerRequestId: PROVIDER_REQUEST_ID,
        cancellation: projection({status: "submitted"}),
      });
    renderDialog();

    const reason = await screen.findByRole("textbox", {name: /Cancellation reason/iu});
    const confirm = screen.getByRole("button", {name: "Submit cancellation request"});
    expect(confirm).toBeDisabled();

    fireEvent.change(reason, {target: {value: "no"}});
    expect(screen.getByText("Enter at least 5 characters.")).toBeVisible();
    expect(confirm).toBeDisabled();

    fireEvent.change(reason, {target: {value: "x".repeat(1_001)}});
    expect(screen.getByText("Keep the cancellation reason to 1,000 characters or fewer."))
      .toBeVisible();
    expect(confirm).toBeDisabled();

    fireEvent.change(reason, {
      target: {value: "The event plan changed unexpectedly."},
    });
    expect(screen.getByText("Reason: The event plan changed unexpectedly."))
      .toBeVisible();
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.createKey).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledWith({
      providerRequestId: PROVIDER_REQUEST_ID,
      reason: "The event plan changed unexpectedly.",
      idempotencyKey: "customer-cancellation:request-0001:attempt-0001",
    });
    const payload = mocks.submit.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual([
      "idempotencyKey",
      "providerRequestId",
      "reason",
    ]);
    expect(JSON.stringify(payload)).not.toMatch(
      /customerId|providerId|mainEventId|paymentId|amount|percentage|stage|policy|snapshot/iu,
    );

    submitted.resolve({
      providerRequestId: PROVIDER_REQUEST_ID,
      status: "submitted",
      policyEvidenceStatus: "policy_backed",
      manualReviewRequired: false,
      created: true,
    });
    expect((await screen.findAllByText("Cancellation request submitted")).length)
      .toBeGreaterThan(0);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Cancellation request submitted.");
    expect(confirm).toBeDisabled();
  });

  it("shows a trusted zero-refund preview without claiming a guaranteed refund", async () => {
    mocks.loadOptions.mockResolvedValue(policyBackedOptions({
      refundPreview: {
        calculationStatus: "nothing_refundable",
        frozenStage: "service_started",
        refundAmountInCentavos: 0,
        currency: "PHP",
      },
    }));
    renderDialog();

    expect(await screen.findByText(/0\.00/u)).toBeVisible();
    expect(screen.getByText("Recorded stage: Service Started")).toBeVisible();
    expect(screen.getByText(/final result remains subject to FEASTA's cancellation workflow/iu))
      .toBeVisible();
    expect(screen.queryByText(/guaranteed refund/iu)).not.toBeInTheDocument();
  });

  it("allows a backend-permitted legacy request while fabricating no policy or refund", async () => {
    mocks.loadOptions.mockResolvedValue({
      providerRequestId: PROVIDER_REQUEST_ID,
      cancellationAllowed: true,
      reasonCode: "LEGACY_MANUAL_REVIEW",
      activeCancellation: null,
      policy: null,
      refundPreview: null,
    });
    mocks.submit.mockResolvedValue({
      providerRequestId: PROVIDER_REQUEST_ID,
      status: "under_review",
      policyEvidenceStatus: "legacy",
      manualReviewRequired: true,
      created: true,
    });
    renderDialog();

    expect(await screen.findByText("Manual review required")).toBeVisible();
    expect(screen.getByText(/No refund percentage or estimate is available/u)).toBeVisible();
    expect(screen.queryByRole("heading", {name: "Agreed refund policy"}))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/Estimated refund under the agreed policy/u))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", {name: /Cancellation reason/iu}), {
      target: {value: "The event was postponed indefinitely."},
    });
    fireEvent.click(screen.getByRole("button", {name: "Submit cancellation request"}));
    expect(await screen.findByText("Under review")).toBeVisible();
    expect(screen.getByText(/Manual review is required before any refund decision/u))
      .toBeVisible();
  });

  it("blocks a duplicate form when a trusted active cancellation exists", async () => {
    const active = projection({status: "submitted"});
    mocks.loadOptions.mockResolvedValue({
      providerRequestId: PROVIDER_REQUEST_ID,
      cancellationAllowed: false,
      reasonCode: "ACTIVE_CANCELLATION_EXISTS",
      activeCancellation: active,
      policy: null,
      refundPreview: null,
    });
    mocks.loadStatus.mockResolvedValue({
      providerRequestId: PROVIDER_REQUEST_ID,
      cancellation: active,
    });
    renderDialog();

    expect(await screen.findByLabelText("Current cancellation request")).toBeVisible();
    expect(screen.queryByRole("textbox", {name: /Cancellation reason/iu}))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Submit cancellation request"}))
      .toBeDisabled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("fails closed when trusted policy evidence is invalid", async () => {
    mocks.loadOptions.mockRejectedValue(
      new Error("This cancellation request cannot be processed automatically right now. Please contact FEASTA support."),
    );
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This cancellation request cannot be processed automatically right now. Please contact FEASTA support.",
    );
    expect(screen.queryByRole("textbox", {name: /Cancellation reason/iu}))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Submit cancellation request"}))
      .toBeDisabled();
  });

  it("follows trusted ineligibility instead of the browser booking status", async () => {
    mocks.loadOptions.mockResolvedValue({
      providerRequestId: PROVIDER_REQUEST_ID,
      cancellationAllowed: false,
      reasonCode: "PROVIDER_REQUEST_STATUS_INELIGIBLE",
      activeCancellation: null,
      policy: null,
      refundPreview: null,
    });
    renderDialog(providerRequest({status: "confirmed"}));

    expect(await screen.findByText("Cancellation unavailable")).toBeVisible();
    expect(screen.getByText(/trusted cancellation check says/u)).toBeVisible();
    expect(screen.queryByRole("textbox", {name: /Cancellation reason/iu}))
      .not.toBeInTheDocument();
  });

  it.each([
    ["awaiting_payment_resolution", "Waiting for payment resolution"],
    ["under_review", "Under review"],
  ] as const)(
    "maps the %s submission result without promising completion",
    async (status, label) => {
      mocks.submit.mockResolvedValue({
        providerRequestId: PROVIDER_REQUEST_ID,
        status,
        policyEvidenceStatus: status === "under_review" ? "legacy" : "policy_backed",
        manualReviewRequired: true,
        created: true,
      });
      renderDialog();
      fireEvent.change(await screen.findByRole("textbox", {name: /Cancellation reason/iu}), {
        target: {value: "The event schedule is no longer available."},
      });
      fireEvent.click(screen.getByRole("button", {name: "Submit cancellation request"}));

      expect(await screen.findByText(label)).toBeVisible();
      expect(screen.getByText(/This affects only the selected Provider service/u)).toBeVisible();
      expect(screen.queryByText(/refund completed/iu)).not.toBeInTheDocument();
    },
  );

  it.each([
    ["approved", "approved", "Cancellation approved", "Refund approved"],
    ["refund_processing", "processing", "Refund processing", "Refund processing"],
    ["refund_failed", "failed_retry_pending", "Refund needs attention", "Refund retry pending"],
    ["refund_failed", "failed_reconciliation_required", "Refund needs attention", "FEASTA support required"],
    ["refund_completed", "partial_completed", "Refund completed", "Partial refund completed"],
    ["refund_completed", "full_completed", "Refund completed", "Full refund completed"],
    ["cancelled_no_refund", "none", "Service cancelled without refund", "No refund progress yet"],
    ["rejected", "none", "Cancellation request rejected", "No refund progress yet"],
  ] as const)(
    "renders safe status projection %s / %s",
    async (status, refundStatus, cancellationLabel, refundLabel) => {
      const prior = projection({status, refundStatus});
      mocks.loadOptions.mockResolvedValue({
        providerRequestId: PROVIDER_REQUEST_ID,
        cancellationAllowed: false,
        reasonCode: "PROVIDER_REQUEST_STATUS_INELIGIBLE",
        activeCancellation: null,
        policy: null,
        refundPreview: null,
      });
      mocks.loadStatus.mockResolvedValue({
        providerRequestId: PROVIDER_REQUEST_ID,
        cancellation: prior,
      });
      renderDialog();

      const panel = await screen.findByLabelText("Previous cancellation request");
      expect(within(panel).getAllByText(cancellationLabel).length)
        .toBeGreaterThan(0);
      expect(within(panel).getAllByText(refundLabel).length)
        .toBeGreaterThan(0);
      if (refundStatus === "partial_completed" || refundStatus === "full_completed") {
        expect(within(panel).getByText(/500\.00/u)).toBeVisible();
      }
    },
  );
});

function renderDialog(request = providerRequest()) {
  return render(
    <CustomerBookingCancellationDialog
      request={request}
      onClose={vi.fn()}
    />,
  );
}

function providerRequest(
  overrides: Partial<CustomerBookingProviderRequest> = {},
): CustomerBookingProviderRequest {
  return {
    id: PROVIDER_REQUEST_ID,
    providerRequestId: PROVIDER_REQUEST_ID,
    mainEventId: "event-0001",
    providerId: "provider-private-001",
    providerName: "Maria's Catering",
    type: "catering",
    packageId: "package-0001",
    packageName: "Wedding Package",
    services: [],
    amount: 25_000,
    downPaymentAmount: 5_000,
    downPaymentPercentage: 20,
    remainingBalance: 20_000,
    status: "confirmed",
    paymentStatus: "paid",
    paymentId: null,
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
    reviewStatus: "unavailable",
    ...overrides,
  };
}

function policyBackedOptions(
  overrides: Partial<CustomerCancellationOptions> = {},
): CustomerCancellationOptions {
  return {
    providerRequestId: PROVIDER_REQUEST_ID,
    cancellationAllowed: true,
    reasonCode: "ALLOWED",
    activeCancellation: null,
    policy: {
      sourceKind: "package_override",
      policyVersion: 4,
      rules: [
        {stage: "preparation_not_started", refundBasisPoints: 10_000},
        {stage: "preparation_started", refundBasisPoints: 5_000},
        {stage: "service_started", refundBasisPoints: 0},
      ],
      terms: "Written notice is appreciated.",
    },
    refundPreview: {
      calculationStatus: "calculated",
      frozenStage: "preparation_started",
      refundAmountInCentavos: 125_000,
      currency: "PHP",
    },
    ...overrides,
  };
}

function projection({
  status = "submitted",
  refundStatus = "none",
}: {
  status?: CustomerCancellationProjection["status"];
  refundStatus?: CustomerCancellationProjection["refund"]["status"];
} = {}): CustomerCancellationProjection {
  const completed = refundStatus === "partial_completed" || refundStatus === "full_completed";
  return {
    status,
    policyEvidenceStatus: "policy_backed",
    frozenStage: "preparation_started",
    manualReviewRequired: status === "under_review" || status === "awaiting_payment_resolution",
    decisionStatus: status === "rejected" ? "rejected" : status === "submitted" ? "pending" : "approved",
    refund: {
      status: refundStatus,
      amountInCentavos: refundStatus === "none" ? null : 50_000,
      completedAmountInCentavos: completed ? 50_000 : null,
      currency: refundStatus === "none" ? null : "PHP",
    },
    submittedAt: "2026-09-01T01:00:00.000Z",
    updatedAt: "2026-09-01T02:00:00.000Z",
  };
}

function deferredSubmission() {
  let resolve!: (value: {
    providerRequestId: string;
    status: "submitted";
    policyEvidenceStatus: "policy_backed";
    manualReviewRequired: boolean;
    created: boolean;
  }) => void;
  const promise = new Promise<Parameters<typeof resolve>[0]>((complete) => {
    resolve = complete;
  });
  return {promise, resolve};
}
