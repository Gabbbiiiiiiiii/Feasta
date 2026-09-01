import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  CustomerCancellationProjection,
} from "@/lib/customer/bookings/customer-cancellation-client";
import {
  cancellationStatusPresentation,
  refundStatusPresentation,
} from "@/lib/customer/bookings/customer-cancellation-presentation";

const mocks = vi.hoisted(() => ({
  loadStatus: vi.fn(),
}));

vi.mock("@/lib/customer/bookings/customer-cancellation-client", () => ({
  getCustomerProviderRequestCancellationStatus: mocks.loadStatus,
}));

import {
  CustomerBookingCancellationStatus,
} from "@/components/customer/bookings/customer-booking-cancellation-status";

describe("Customer Provider-service cancellation and refund status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["submitted", "none", "Cancellation request submitted", "Refund not decided"],
    ["awaiting_payment_resolution", "manual_review", "Awaiting payment resolution", "Manual review required"],
    ["under_review", "manual_review", "Cancellation under review", "Manual review required"],
    ["approved", "approved", "Cancellation approved", "Refund approved"],
    ["rejected", "none", "Cancellation request rejected", "Refund not decided"],
    ["cancelled_no_refund", "none", "Service cancelled without refund", "No refund due"],
    ["refund_processing", "processing", "Refund processing", "Refund processing"],
    ["refund_failed", "failed_retry_pending", "Refund needs attention", "Refund retry pending"],
    ["refund_failed", "failed_reconciliation_required", "Refund needs attention", "Refund requires reconciliation review"],
    ["refund_completed", "partial_completed", "Partial refund completed", "Partial refund completed"],
    ["refund_completed", "full_completed", "Refund completed", "Full refund completed"],
  ] as const)(
    "maps %s/%s without inventing another lifecycle",
    (status, refundStatus, cancellationTitle, refundTitle) => {
      const value = projection({status, refundStatus});
      expect(cancellationStatusPresentation(value).title).toBe(cancellationTitle);
      expect(refundStatusPresentation(value).title).toBe(refundTitle);
    },
  );

  it("shows legacy manual review without policy, percentage, or estimated refund", async () => {
    mocks.loadStatus.mockResolvedValue({
      providerRequestId: "request-legacy-001",
      cancellation: projection({
        status: "under_review",
        refundStatus: "manual_review",
        policyEvidenceStatus: "legacy",
        manualReviewRequired: true,
        amountInCentavos: null,
      }),
    });

    render(
      <CustomerBookingCancellationStatus
        providerRequestId="request-legacy-001"
        providerName="Legacy Catering"
      />,
    );

    const panel = await screen.findByRole("status", {
      name: "Cancellation and refund status for Legacy Catering",
    });
    expect(within(panel).getAllByText("Manual review required").length).toBeGreaterThanOrEqual(2);
    expect(within(panel).getByText(/no policy evidence or refund estimate/iu)).toBeVisible();
    expect(panel).not.toHaveTextContent(/%|estimated refund|PHP|PayMongo/iu);
  });

  it("shows only trusted projected refund amounts and never derives a value", async () => {
    mocks.loadStatus.mockResolvedValue({
      providerRequestId: "request-refund-001",
      cancellation: projection({
        status: "refund_completed",
        refundStatus: "partial_completed",
        amountInCentavos: 900_000,
        completedAmountInCentavos: 123_45,
      }),
    });

    render(
      <CustomerBookingCancellationStatus
        providerRequestId="request-refund-001"
        providerName="Photo Studio"
      />,
    );

    const panel = await screen.findByRole("status", {
      name: "Cancellation and refund status for Photo Studio",
    });
    expect(within(panel).getByText(/123\.45/u)).toBeVisible();
    expect(panel).not.toHaveTextContent(/9,000\.00/u);
    expect(panel).not.toHaveTextContent(/payment_|refund_|gateway|PayMongo/iu);
  });

  it("keeps two Provider statuses visually and operationally isolated", async () => {
    mocks.loadStatus.mockImplementation(async (providerRequestId: string) => ({
      providerRequestId,
      cancellation: providerRequestId === "request-provider-a"
        ? projection({status: "rejected", refundStatus: "none"})
        : projection({
          status: "refund_completed",
          refundStatus: "full_completed",
          completedAmountInCentavos: 250_000,
        }),
    }));

    render(
      <>
        <CustomerBookingCancellationStatus
          providerRequestId="request-provider-a"
          providerName="Provider A"
        />
        <CustomerBookingCancellationStatus
          providerRequestId="request-provider-b"
          providerName="Provider B"
        />
      </>,
    );

    const providerA = await screen.findByRole("status", {
      name: "Cancellation and refund status for Provider A",
    });
    const providerB = await screen.findByRole("status", {
      name: "Cancellation and refund status for Provider B",
    });
    expect(within(providerA).getAllByText("Cancellation request rejected").length).toBeGreaterThan(0);
    expect(within(providerA).queryByText("Full refund completed")).not.toBeInTheDocument();
    expect(within(providerB).getByText("Full refund completed")).toBeVisible();
    expect(within(providerB).queryByText("Cancellation request rejected")).not.toBeInTheDocument();
    expect(mocks.loadStatus.mock.calls.map(([id]) => id).sort()).toEqual([
      "request-provider-a",
      "request-provider-b",
    ]);
  });

  it("fails safely and refreshes only after an explicit Customer action", async () => {
    mocks.loadStatus
      .mockRejectedValueOnce(new Error("internal collection and gateway details"))
      .mockResolvedValueOnce({
        providerRequestId: "request-retry-001",
        cancellation: projection({status: "submitted", refundStatus: "none"}),
      });

    render(
      <CustomerBookingCancellationStatus
        providerRequestId="request-retry-001"
        providerName="Retry Provider"
      />,
    );

    const unavailable = await screen.findByRole("alert", {
      name: "Cancellation and refund status for Retry Provider",
    });
    expect(within(unavailable).getByText("Cancellation status unavailable")).toBeVisible();
    expect(unavailable).not.toHaveTextContent("internal collection and gateway details");
    expect(mocks.loadStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(within(unavailable).getByRole("button", {name: "Try again"}));
    await waitFor(() => expect(mocks.loadStatus).toHaveBeenCalledTimes(2));
    expect((await screen.findAllByText("Cancellation request submitted")).length)
      .toBeGreaterThan(0);
  });

  it.each([360, 1280])("stays bounded and readable at %i px", async (width) => {
    Object.defineProperty(window, "innerWidth", {configurable: true, value: width});
    window.dispatchEvent(new Event("resize"));
    mocks.loadStatus.mockResolvedValue({
      providerRequestId: "request-responsive-001",
      cancellation: null,
    });

    render(
      <CustomerBookingCancellationStatus
        providerRequestId="request-responsive-001"
        providerName="A Provider with a deliberately long responsive business name"
      />,
    );

    const panel = await screen.findByRole("status", {
      name: /Cancellation and refund status for A Provider/iu,
    });
    expect(panel).toHaveClass("min-w-0");
    expect(within(panel).getByText("No cancellation request")).toBeVisible();
  });
});

function projection({
  status = "submitted",
  refundStatus = "none",
  policyEvidenceStatus = "policy_backed",
  manualReviewRequired = false,
  amountInCentavos = 50_000,
  completedAmountInCentavos = null,
}: {
  status?: CustomerCancellationProjection["status"];
  refundStatus?: CustomerCancellationProjection["refund"]["status"];
  policyEvidenceStatus?: CustomerCancellationProjection["policyEvidenceStatus"];
  manualReviewRequired?: boolean;
  amountInCentavos?: number | null;
  completedAmountInCentavos?: number | null;
} = {}): CustomerCancellationProjection {
  return {
    status,
    policyEvidenceStatus,
    frozenStage: policyEvidenceStatus === "legacy" ? null : "preparation_not_started",
    manualReviewRequired,
    decisionStatus: status === "rejected"
      ? "rejected"
      : ["approved", "refund_processing", "refund_failed", "refund_completed", "cancelled_no_refund"].includes(status)
        ? "approved"
        : "pending",
    refund: {
      status: refundStatus,
      amountInCentavos,
      completedAmountInCentavos,
      currency: amountInCentavos === null && completedAmountInCentavos === null ? null : "PHP",
    },
    submittedAt: "2026-08-20T01:00:00.000Z",
    updatedAt: "2026-08-21T02:30:00.000Z",
  };
}
