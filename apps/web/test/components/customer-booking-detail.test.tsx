import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  CustomerBooking,
  CustomerBookingDetailPageResult,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";
import {
  compareCustomerBookingTimelineEntries,
  normalizeCustomerBookingTimelineData,
} from "@/lib/customer/bookings/customer-booking-timeline-normalizer";

const mocks = vi.hoisted(() => ({
  getDetails: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  unavailable: {kind: "customer-booking-unavailable"},
  createCheckout: vi.fn(),
  redirectCheckout: vi.fn(),
  openChat: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  submitReview: vi.fn(),
  getCancellationOptions: vi.fn(),
  getCancellationStatus: vi.fn(),
  submitCancellation: vi.fn(),
  cancellationKey: vi.fn(() => "customer-cancellation:request-1:secure-key"),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({push: mocks.push}),
}));

vi.mock("@/lib/customer/bookings/customer-booking-service", () => ({
  getCustomerBookingDetailsWithTimeline: mocks.getDetails,
  isCustomerBookingUnavailableError: (error: unknown) =>
    error === mocks.unavailable,
}));

vi.mock("@/lib/customer/payments/customer-payment-client", () => ({
  createCustomerPaymentCheckout: mocks.createCheckout,
  redirectToCustomerPaymentCheckout: mocks.redirectCheckout,
}));

vi.mock("@/lib/customer/messages/customer-chat-client", () => ({
  openCustomerProviderRequestChat: mocks.openChat,
}));

vi.mock("@/lib/customer/reviews/customer-review-client", () => ({
  submitCustomerReview: mocks.submitReview,
}));

vi.mock("@/lib/customer/bookings/customer-cancellation-client", () => ({
  getCustomerProviderRequestCancellationOptions: mocks.getCancellationOptions,
  getCustomerProviderRequestCancellationStatus: mocks.getCancellationStatus,
  submitCustomerProviderRequestCancellation: mocks.submitCancellation,
  createCustomerCancellationIdempotencyKey: mocks.cancellationKey,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

import CustomerBookingDetailRoute from "@/app/customer/bookings/[bookingId]/page";
import {CustomerBookingDetailPage} from "@/components/customer/bookings/customer-booking-detail-page";
import {
  normalizeCustomerBookingAggregateCounts,
  normalizeCustomerBookingProviderPaymentConfirmationFields,
  normalizeCustomerBookingProviderResponseFields,
} from "@/lib/customer/bookings/customer-booking-data-normalizers";
import {
  isCanonicalOwnedProviderRequest,
  normalizeCanonicalProviderRequestIds,
} from "@/lib/customer/bookings/customer-booking-membership";
import {
  canCustomerReviewProviderRequest,
  normalizeCustomerBookingReviewStatus,
} from "@/lib/customer/bookings/customer-booking-review";

describe("customer booking dedicated detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openChat.mockResolvedValue({
      chatRoomId: "request-1",
      providerRequestId: "request-1",
      created: false,
      canSendMessages: true,
    });
    mocks.submitReview.mockResolvedValue({created: true});
    mocks.getCancellationOptions.mockResolvedValue({
      providerRequestId: "request-1",
      cancellationAllowed: false,
      reasonCode: "PROVIDER_REQUEST_STATUS_INELIGIBLE",
      activeCancellation: null,
      policy: null,
      refundPreview: null,
    });
    mocks.getCancellationStatus.mockResolvedValue({
      providerRequestId: "request-1",
      cancellation: null,
    });
  });

  it("server-loads an owned direct URL and renders accessible read-only details", async () => {
    const result = detailResult();
    mocks.getDetails.mockResolvedValueOnce(result);

    render(await CustomerBookingDetailRoute({
      params: Promise.resolve({bookingId: "owned-booking-001"}),
    }));

    expect(mocks.getDetails).toHaveBeenCalledWith("owned-booking-001");
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {name: "Booking details"})).toBeVisible();
    expect(screen.getByRole("link", {name: "Back to bookings"})).toHaveAttribute("href", "/customer/bookings");
    const currentState = screen.getByRole("heading", {
      name: "A provider service requires a down payment",
    }).closest("section");
    expect(currentState).not.toBeNull();
    expect(within(currentState as HTMLElement).getByLabelText("Status: Awaiting payment")).toBeVisible();
    expect(within(currentState as HTMLElement).queryByLabelText("Status: Unpaid")).not.toBeInTheDocument();
    expect(screen.getByText("Wedding reception")).toBeVisible();
    expect(screen.getAllByText("Maria's Catering").length).toBeGreaterThan(0);
    expect(screen.getByText("Package: Premium Wedding Package")).toBeVisible();
    expect(screen.getByText("Catering")).toBeVisible();
    expect(screen.getByText("Accepted — down payment required")).toBeVisible();
    expect(screen.getByText(/Response received Aug 1, 2026/u)).toBeVisible();
    expect(screen.getAllByText(/125,000\.00/u).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Status: Awaiting payment").length).toBeGreaterThan(0);
    expect(screen.getByText("Review each provider request and complete only the eligible required down payments shown below.")).toBeVisible();
    expect(screen.getByRole("heading", {name: "Provider requests"})).toBeVisible();
    expect(screen.queryByText("Primary provider")).not.toBeInTheDocument();

    const timeline = screen.getByRole("heading", {name: "Booking timeline"}).closest("section");
    expect(timeline).not.toBeNull();
    expect(within(timeline as HTMLElement).getByRole("list", {name: "Booking activity"})).toBeInTheDocument();

    expect(screen.getByRole("button", {name: /pay .*25,000\.00 down payment/iu})).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Review cancellation options for Maria's Catering's service",
    })).toBeVisible();
    expect(screen.queryByRole("button", {name: /cancel (?:this )?booking|refund now/iu}))
      .not.toBeInTheDocument();
  });

  it("shows the request-scoped down-payment amount in the eligible action", () => {
    render(<CustomerBookingDetailPage result={detailResult()} />);

    const requestCard = screen.getByRole("heading", {name: "Maria's Catering"}).closest("article");
    expect(requestCard).not.toBeNull();
    expect(
      within(requestCard as HTMLElement).getByRole("button", {
        name: /pay .*25,000\.00 down payment/iu,
      }),
    ).toBeVisible();
  });

  it("targets only the selected Provider request and leaves other Provider cards unchanged", async () => {
    const result = detailResult();
    result.details.providerRequests.push(providerRequestFixture({
      id: "request-photo",
      providerRequestId: "request-photo",
      providerId: "provider-photo",
      providerName: "Photo Studio",
      type: "addon",
      packageId: null,
      packageName: null,
      status: "confirmed",
      paymentStatus: "paid",
      services: [{
        id: "photo-service",
        name: "Event photography",
        category: "Photography",
        price: 30_000,
        downPaymentPercentage: 20,
        downPaymentAmount: 6_000,
      }],
    }));
    mocks.getCancellationOptions.mockImplementation(
      async (providerRequestId: string) => ({
        providerRequestId,
        cancellationAllowed: false,
        reasonCode: "PROVIDER_REQUEST_STATUS_INELIGIBLE",
        activeCancellation: null,
        policy: null,
        refundPreview: null,
      }),
    );
    mocks.getCancellationStatus.mockImplementation(
      async (providerRequestId: string) => ({
        providerRequestId,
        cancellation: null,
      }),
    );

    render(<CustomerBookingDetailPage result={result} />);
    const selectedTrigger = screen.getByRole("button", {
      name: "Review cancellation options for Photo Studio's service",
    });
    const cateringCard = screen.getByRole("heading", {name: "Maria's Catering"})
      .closest("article");
    const photoCard = screen.getByRole("heading", {name: "Photo Studio"})
      .closest("article");
    expect(cateringCard).not.toBeNull();
    expect(photoCard).not.toBeNull();
    expect(within(cateringCard as HTMLElement).getByLabelText("Status: Awaiting payment"))
      .toBeVisible();
    expect(within(photoCard as HTMLElement).getByLabelText("Status: Confirmed"))
      .toBeVisible();
    fireEvent.click(selectedTrigger);

    expect(await screen.findByRole("heading", {
      name: "Cancel Photo Studio's service?",
    })).toBeVisible();
    expect(mocks.getCancellationOptions).toHaveBeenCalledTimes(1);
    expect(mocks.getCancellationOptions).toHaveBeenCalledWith("request-photo");
    expect(mocks.getCancellationStatus).toHaveBeenCalledWith("request-photo");
    expect(screen.getByText(/Other Provider services attached to this event remain independent/u))
      .toBeVisible();

    expect(cateringCard).toHaveTextContent("Maria's Catering");
    expect(cateringCard).toHaveTextContent("Awaiting payment");
    expect(photoCard).toHaveTextContent("Photo Studio");
    expect(photoCard).toHaveTextContent("Confirmed");
    expect(document.body).not.toHaveTextContent("request-photo");
    expect(document.body).not.toHaveTextContent("provider-photo");

    fireEvent.click(screen.getByRole("button", {name: "Close"}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(selectedTrigger).toHaveFocus();
  });

  it("opens messaging through the trusted callable and canonical provider-request room", async () => {
    render(<CustomerBookingDetailPage result={detailResult()} />);

    fireEvent.click(screen.getByRole("button", {name: "Message Provider"}));

    await waitFor(() => {
      expect(mocks.openChat).toHaveBeenCalledTimes(1);
      expect(mocks.openChat).toHaveBeenCalledWith("request-1");
      expect(mocks.push).toHaveBeenCalledWith(
        "/customer/messages?room=request-1",
      );
    });
  });

  it("does not expose messaging for terminal, malformed, or non-canonical provider requests", () => {
    const terminal = detailResult();
    terminal.details.providerRequests = [providerRequestFixture({status: "completed"})];
    const {rerender} = render(<CustomerBookingDetailPage result={terminal} />);
    expect(screen.queryByRole("button", {name: "Message Provider"}))
      .not.toBeInTheDocument();

    const mismatched = detailResult();
    mismatched.details.providerRequests = [providerRequestFixture({
      id: "different-request-id",
    })];
    rerender(<CustomerBookingDetailPage result={mismatched} />);
    expect(screen.queryByRole("button", {name: "Message Provider"}))
      .not.toBeInTheDocument();

    const malformedProvider = detailResult();
    malformedProvider.details.providerRequests = [providerRequestFixture({
      providerId: "providers/private-provider",
    })];
    rerender(<CustomerBookingDetailPage result={malformedProvider} />);
    expect(screen.queryByRole("button", {name: "Message Provider"}))
      .not.toBeInTheDocument();
  });

  it.each([
    ["pending", {status: "pending" as const, paymentStatus: "unpaid"}],
    ["rejected", {status: "rejected" as const, paymentStatus: "unpaid"}],
    ["paid", {status: "waiting_for_down_payment" as const, paymentStatus: "paid"}],
    ["confirmed", {status: "confirmed" as const, paymentStatus: "paid"}],
    ["cancelled", {status: "cancelled" as const, paymentStatus: "unpaid"}],
    ["expired", {status: "expired" as const, paymentStatus: "expired"}],
    ["completed", {status: "completed" as const, paymentStatus: "paid"}],
  ])("does not offer checkout for a %s request", (_label, overrides) => {
    const result = detailResult();
    result.details.providerRequests = [providerRequestFixture(overrides)];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.queryByRole("button", {name: /pay .* down payment/iu})).not.toBeInTheDocument();
  });

  it("shows a non-actionable processing state while trusted confirmation is pending", () => {
    const result = detailResult();
    result.details.providerRequests = [providerRequestFixture({
      status: "payment_processing",
      paymentStatus: "processing",
      paymentId: "payment-request-1",
    })];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("heading", {
      name: "A provider payment is still processing",
    })).toBeVisible();
    expect(screen.getAllByText("Payment processing").length).toBeGreaterThan(0);
    expect(screen.queryByText("All provider services are confirmed"))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /pay .* down payment/iu})).not.toBeInTheDocument();
  });

  it("renders a durable fully confirmed single-provider experience from request truth", () => {
    const result = detailResult();
    result.details.booking.status = "confirmed";
    result.details.booking.paymentStatus = "unpaid";
    result.details.providerRequests = [providerRequestFixture({
      status: "confirmed",
      paymentStatus: "paid",
      paidAt: "2026-08-03T02:30:00.000Z",
    })];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("heading", {
      name: "Your provider service is confirmed",
    })).toBeVisible();
    expect(screen.getByLabelText("Status: Down payment confirmed")).toBeVisible();
    expect(screen.getByText("Paid")).toBeVisible();
    expect(screen.getByText(/Aug 3, 2026/u)).toBeVisible();
    expect(screen.getByRole("button", {name: "Message Provider"})).toBeVisible();
    expect(screen.queryByLabelText("Status: Unpaid")).not.toBeInTheDocument();
  });

  it("calls the event fully confirmed only when every provider request is confirmed", () => {
    const result = detailResult();
    result.details.booking.status = "confirmed";
    result.details.providerRequests = [
      providerRequestFixture({
        status: "confirmed",
        paymentStatus: "paid",
        paidAt: "2026-08-03T02:30:00.000Z",
      }),
      providerRequestFixture({
        id: "request-2",
        providerRequestId: "request-2",
        providerId: "provider-002",
        providerName: "Bright Day Photography",
        type: "addon",
        status: "confirmed",
        paymentStatus: "paid",
        paidAt: "2026-08-04T02:30:00.000Z",
      }),
    ];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("heading", {
      name: "All provider services are confirmed",
    })).toBeVisible();
    expect(screen.getAllByLabelText("Status: Down payment confirmed"))
      .toHaveLength(2);
  });

  it("presents mixed confirmed and pending providers as partially confirmed", () => {
    const result = detailResult();
    result.details.booking.status = "pending_provider_approval";
    result.details.providerRequests = [
      providerRequestFixture({
        status: "confirmed",
        paymentStatus: "paid",
      }),
      providerRequestFixture({
        id: "request-2",
        providerRequestId: "request-2",
        providerId: "provider-002",
        providerName: "Bright Day Photography",
        type: "addon",
        status: "pending",
        paymentStatus: "unpaid",
      }),
    ];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("heading", {
      name: "Some provider services are confirmed",
    })).toBeVisible();
    expect(screen.getByText(/Provider services progress independently/u)).toBeVisible();
    expect(screen.queryByText("All provider services are confirmed"))
      .not.toBeInTheDocument();
  });

  it("does not call a confirmed-plus-waiting multi-provider event fully confirmed", () => {
    const result = detailResult();
    result.details.booking.status = "waiting_for_down_payment";
    result.details.providerRequests = [
      providerRequestFixture({
        status: "confirmed",
        paymentStatus: "paid",
      }),
      providerRequestFixture({
        id: "request-2",
        providerRequestId: "request-2",
        providerId: "provider-002",
        providerName: "Bright Day Photography",
      }),
    ];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("heading", {
      name: "Some provider services are confirmed",
    })).toBeVisible();
    expect(screen.getByLabelText("Status: Down payment required")).toBeVisible();
  });

  it("presents a zero-down confirmed request without an unpaid state", () => {
    const result = detailResult();
    result.details.booking.status = "confirmed";
    result.details.providerRequests = [providerRequestFixture({
      status: "confirmed",
      paymentStatus: "unpaid",
      downPaymentAmount: 0,
      downPaymentPercentage: 0,
      remainingBalance: 100_000,
    })];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByLabelText("Status: No down payment required")).toBeVisible();
    expect(screen.getByText(
      "This provider service was confirmed without an online down payment.",
    )).toBeVisible();
    expect(screen.queryByLabelText("Status: Unpaid")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /pay/iu})).not.toBeInTheDocument();
  });

  it("shows refundedAt safely without implying that the request was cancelled", () => {
    const result = detailResult();
    result.details.booking.status = "confirmed";
    result.details.providerRequests = [providerRequestFixture({
      status: "confirmed",
      paymentStatus: "refunded",
      refundedAt: "2026-08-05T04:15:00.000Z",
    })];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByLabelText("Status: Down payment refunded")).toBeVisible();
    expect(screen.getByText("Refunded")).toBeVisible();
    expect(screen.getByText(/Aug 5, 2026/u)).toBeVisible();
    expect(screen.getByText(/No cancellation is implied/u)).toBeVisible();
  });

  it("keeps remaining balance informational and exposes only supported next actions", () => {
    const result = detailResult();
    result.details.booking.status = "confirmed";
    result.details.providerRequests = [providerRequestFixture({
      status: "confirmed",
      paymentStatus: "paid",
      paymentId: "internal-payment-id-must-not-render",
      paidAt: "2026-08-03T02:30:00.000Z",
    })];

    const {container} = render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByText(/does not currently collect provider balances online/u)).toBeVisible();
    expect(screen.queryByRole("button", {name: /pay .*balance/iu})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "View Payments"})).toHaveAttribute(
      "href",
      "/customer/payments",
    );
    expect(screen.getByRole("link", {
      name: "View Maria's Catering provider profile",
    })).toHaveAttribute("href", "/customer/providers/provider-001");
    expect(container).not.toHaveTextContent("internal-payment-id-must-not-render");
    expect(container).not.toHaveTextContent(/paymongo/iu);
  });

  it("does not present a mixed completed and in-progress event as completed", () => {
    const result = detailResult();
    result.details.booking.status = "in_progress";
    result.details.providerRequests = [
      providerRequestFixture({
        status: "completed",
        paymentStatus: "paid",
      }),
      providerRequestFixture({
        id: "request-2",
        providerRequestId: "request-2",
        providerId: "provider-002",
        status: "in_progress",
        paymentStatus: "paid",
      }),
    ];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("heading", {
      name: "Provider services are in progress",
    })).toBeVisible();
    expect(screen.queryByText("All provider services are completed"))
      .not.toBeInTheDocument();
  });

  it("presents a completed single-provider booking with one eligible review action", () => {
    const result = completedDetailResult();

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("heading", {
      name: "All provider services are completed",
    })).toBeVisible();
    expect(screen.getByText(/Booking completed: Aug 16, 2026/iu)).toBeVisible();
    expect(screen.getByText(/Completed Aug 16, 2026/iu)).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Leave a review for Maria's Catering",
    })).toBeVisible();
    expect(screen.getByRole("link", {name: "View Payments"})).toBeVisible();
    expect(screen.getByRole("link", {
      name: "View Maria's Catering provider profile",
    })).toBeVisible();
  });

  it("keeps completed multi-provider review actions independent", () => {
    const result = completedDetailResult([
      providerRequestFixture({
        status: "completed",
        paymentStatus: "paid",
        completedAt: "2026-08-16T04:00:00.000Z",
        reviewStatus: "not_submitted",
      }),
      providerRequestFixture({
        id: "request-2",
        providerRequestId: "request-2",
        providerId: "provider-002",
        providerName: "Bright Day Photography",
        type: "addon",
        status: "completed",
        paymentStatus: "paid",
        completedAt: "2026-08-16T05:00:00.000Z",
        reviewStatus: "not_submitted",
      }),
    ]);

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("button", {
      name: "Leave a review for Maria's Catering",
    })).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Leave a review for Bright Day Photography",
    })).toBeVisible();
  });

  it("offers review only for the completed request in a mixed multi-provider record", () => {
    const result = completedDetailResult([
      providerRequestFixture({
        status: "completed",
        reviewStatus: "not_submitted",
      }),
      providerRequestFixture({
        id: "request-2",
        providerRequestId: "request-2",
        providerId: "provider-002",
        providerName: "Bright Day Photography",
        status: "in_progress",
        reviewStatus: "not_submitted",
      }),
    ]);

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByRole("button", {
      name: "Leave a review for Maria's Catering",
    })).toBeVisible();
    expect(screen.queryByRole("button", {
      name: "Leave a review for Bright Day Photography",
    })).not.toBeInTheDocument();
  });

  it("renders an existing review as submitted without a second action", () => {
    const result = completedDetailResult([
      providerRequestFixture({
        status: "completed",
        paymentStatus: "paid",
        reviewStatus: "submitted",
      }),
    ]);

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getByLabelText(
      "Review submitted for Maria's Catering",
    )).toBeVisible();
    expect(screen.queryByRole("button", {name: /leave a review/iu}))
      .not.toBeInTheDocument();
  });

  it("requires trusted completed event and request states for review eligibility", () => {
    const eventNotCompleted = completedDetailResult();
    eventNotCompleted.details.booking.status = "in_progress";
    const {rerender} = render(
      <CustomerBookingDetailPage result={eventNotCompleted} />,
    );
    expect(screen.queryByRole("button", {name: /leave a review/iu}))
      .not.toBeInTheDocument();

    for (const status of [
      "pending",
      "confirmed",
      "in_progress",
      "rejected",
      "cancelled",
      "expired",
    ] as const) {
      const requestNotCompleted = completedDetailResult([
        providerRequestFixture({
          status,
          reviewStatus: "not_submitted",
        }),
      ]);
      rerender(<CustomerBookingDetailPage result={requestNotCompleted} />);
      expect(screen.queryByRole("button", {name: /leave a review/iu}))
        .not.toBeInTheDocument();
    }
  });

  it("opens an accessible review form and validates the callable contract", async () => {
    render(<CustomerBookingDetailPage result={completedDetailResult()} />);

    fireEvent.click(screen.getByRole("button", {name: /leave a review/iu}));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("heading", {
      name: "Review Maria's Catering",
    })).toBeVisible();
    expect(screen.getByRole("radiogroup", {name: "Review rating"})).toBeVisible();
    expect(screen.getByRole("textbox", {name: /^Review/iu})).toBeVisible();

    fireEvent.click(screen.getByRole("button", {name: "Submit review"}));
    expect(await screen.findByText("Choose a rating from 1 to 5 stars.")).toBeVisible();
    expect(screen.getByText("Enter at least 2 characters.")).toBeVisible();
    expect(mocks.submitReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", {name: "5 stars"}));
    fireEvent.change(screen.getByRole("textbox", {name: /^Review/iu}), {
      target: {value: "x"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Submit review"}));
    expect(await screen.findByText("Enter at least 2 characters.")).toBeVisible();
    expect(mocks.submitReview).not.toHaveBeenCalled();
  });

  it("waits for authoritative review success and prevents duplicate submission", async () => {
    const pending = deferredReview();
    mocks.submitReview.mockReturnValueOnce(pending.promise);
    render(<CustomerBookingDetailPage result={completedDetailResult()} />);

    fireEvent.click(screen.getByRole("button", {name: /leave a review/iu}));
    fireEvent.click(screen.getByRole("radio", {name: "5 stars"}));
    fireEvent.change(screen.getByRole("textbox", {name: /^Review/iu}), {
      target: {value: "Excellent service and coordination."},
    });
    const submit = screen.getByRole("button", {name: "Submit review"});
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mocks.submitReview).toHaveBeenCalledTimes(1);
    expect(mocks.submitReview).toHaveBeenCalledWith({
      providerRequestId: "request-1",
      rating: 5,
      comment: "Excellent service and coordination.",
    });
    expect(screen.getByRole("button", {name: "Submitting review"})).toBeDisabled();
    const cancel = screen.getByRole("button", {name: "Cancel"});
    expect(cancel).toBeDisabled();
    expect(screen.queryByRole("button", {name: "Close dialog"}))
      .not.toBeInTheDocument();
    fireEvent.click(cancel);
    fireEvent.keyDown(screen.getByRole("dialog"), {key: "Escape"});
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByText("Review submitted")).not.toBeInTheDocument();

    await act(async () => pending.resolve({created: true}));

    expect(await screen.findByText("Review submitted")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /leave a review/iu}))
      .not.toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Your review was submitted.");
  });

  it("handles an authoritative duplicate as an idempotent reviewed state", async () => {
    mocks.submitReview.mockResolvedValueOnce({created: false});
    render(<CustomerBookingDetailPage result={completedDetailResult()} />);

    fireEvent.click(screen.getByRole("button", {name: /leave a review/iu}));
    fireEvent.click(screen.getByRole("radio", {name: "4 stars"}));
    fireEvent.change(screen.getByRole("textbox", {name: /^Review/iu}), {
      target: {value: "A very good provider experience."},
    });
    fireEvent.click(screen.getByRole("button", {name: "Submit review"}));

    expect(await screen.findByText("Review submitted")).toBeVisible();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Your review was already submitted.",
    );
  });

  it("keeps a failed review form open and usable for retry", async () => {
    mocks.submitReview.mockRejectedValueOnce(
      new Error("The review service is temporarily unavailable. Please try again."),
    );
    render(<CustomerBookingDetailPage result={completedDetailResult()} />);

    fireEvent.click(screen.getByRole("button", {name: /leave a review/iu}));
    fireEvent.click(screen.getByRole("radio", {name: "3 stars"}));
    fireEvent.change(screen.getByRole("textbox", {name: /^Review/iu}), {
      target: {value: "Service was generally satisfactory."},
    });
    fireEvent.click(screen.getByRole("button", {name: "Submit review"}));

    expect(await screen.findByText(/temporarily unavailable/iu)).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("radio", {name: "3 stars"})).toBeChecked();
    expect(screen.getByRole("textbox", {name: /^Review/iu}))
      .toHaveValue("Service was generally satisfactory.");
    expect(screen.getByRole("button", {name: "Submit review"})).toBeEnabled();
    expect(screen.queryByText("Review submitted")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "Submit review"}));

    expect(await screen.findByText("Review submitted")).toBeVisible();
    expect(mocks.submitReview).toHaveBeenCalledTimes(2);
  });

  it("does not publish a stale review result after unmount", async () => {
    const pending = deferredReview();
    mocks.submitReview.mockReturnValueOnce(pending.promise);
    const view = render(
      <CustomerBookingDetailPage result={completedDetailResult()} />,
    );

    fireEvent.click(screen.getByRole("button", {name: /leave a review/iu}));
    fireEvent.click(screen.getByRole("radio", {name: "5 stars"}));
    fireEvent.change(screen.getByRole("textbox", {name: /^Review/iu}), {
      target: {value: "Excellent service and coordination."},
    });
    fireEvent.click(screen.getByRole("button", {name: "Submit review"}));

    view.unmount();
    await act(async () => pending.resolve({created: true}));

    expect(mocks.submitReview).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("reviewing provider A does not mark provider B reviewed", async () => {
    const result = completedDetailResult([
      providerRequestFixture({
        status: "completed",
        reviewStatus: "not_submitted",
      }),
      providerRequestFixture({
        id: "request-2",
        providerRequestId: "request-2",
        providerId: "provider-002",
        providerName: "Bright Day Photography",
        status: "completed",
        reviewStatus: "not_submitted",
      }),
    ]);
    render(<CustomerBookingDetailPage result={result} />);

    fireEvent.click(screen.getByRole("button", {
      name: "Leave a review for Maria's Catering",
    }));
    fireEvent.click(screen.getByRole("radio", {name: "5 stars"}));
    fireEvent.change(screen.getByRole("textbox", {name: /^Review/iu}), {
      target: {value: "Wonderful service."},
    });
    fireEvent.click(screen.getByRole("button", {name: "Submit review"}));

    expect(await screen.findByLabelText(
      "Review submitted for Maria's Catering",
    )).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Leave a review for Bright Day Photography",
    })).toBeVisible();
  });

  it("starts one checkout, disables the action immediately, and redirects with the trusted result", async () => {
    const pending = deferredCheckout();
    const checkout = {
      paymentId: "payment_request_12345678",
      providerRequestId: "request-1",
      bookingId: "owned-booking-001",
      checkoutUrl: "https://checkout.paymongo.com/session-12345678",
      created: true,
    };
    mocks.createCheckout.mockReturnValueOnce(pending.promise);
    render(<CustomerBookingDetailPage result={detailResult()} />);

    const button = screen.getByRole("button", {name: /pay .*25,000\.00 down payment/iu});
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.createCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.createCheckout).toHaveBeenCalledWith("request-1");
    expect(screen.getByRole("button", {name: "Preparing secure checkout…"})).toBeDisabled();

    await act(async () => pending.resolve(checkout));

    expect(mocks.redirectCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.redirectCheckout).toHaveBeenCalledWith(checkout);
  });

  it("restores checkout and shows friendly feedback when session creation fails", async () => {
    mocks.createCheckout.mockRejectedValueOnce(
      new Error("This payment is no longer available. Refresh the booking to see its latest status."),
    );
    render(<CustomerBookingDetailPage result={detailResult()} />);

    fireEvent.click(screen.getByRole("button", {name: /pay .*25,000\.00 down payment/iu}));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      "This payment is no longer available. Refresh the booking to see its latest status.",
    ));
    expect(screen.getByRole("button", {name: /pay .*25,000\.00 down payment/iu})).toBeEnabled();
    expect(mocks.redirectCheckout).not.toHaveBeenCalled();
  });

  it("renders timeline entries chronologically and announces truncation", () => {
    render(<CustomerBookingDetailPage result={detailResult(true)} />);

    const submitted = screen.getByRole("heading", {name: "Booking request submitted"});
    const payment = screen.getByRole("heading", {name: "Payment confirmed"});
    expect(
      submitted.compareDocumentPosition(payment) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Showing the latest 100 timeline updates.")).toBeVisible();
  });

  it("renders Customer-safe provider timeline updates without internal identifiers", () => {
    const result = detailResult();
    result.timeline.entries = [
      {
        id: "private-timeline-accepted-id",
        type: "provider_accepted",
        status: "waiting_for_down_payment",
        title: "Provider accepted request",
        description: "The provider accepted your request.",
        actorRole: "provider",
        providerName: "Photo Studio",
        createdAt: "2026-08-01T03:00:00.000Z",
      },
      {
        id: "private-timeline-rejected-id",
        type: "provider_rejected",
        status: "needs_provider_replacement",
        title: "Provider declined request",
        description: "A selected provider declined the request. Provider explanation: Date unavailable.",
        actorRole: "provider",
        providerName: "Style House",
        createdAt: "2026-08-01T04:00:00.000Z",
      },
    ];

    render(<CustomerBookingDetailPage result={result} />);

    const accepted = screen.getByRole("heading", {name: "Provider accepted request"});
    const rejected = screen.getByRole("heading", {name: "Provider declined request"});
    expect(
      accepted.compareDocumentPosition(rejected) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Provider: Photo Studio")).toBeVisible();
    expect(screen.getByText("Provider: Style House")).toBeVisible();
    expect(screen.getByText(/Provider explanation: Date unavailable\./u)).toBeVisible();
    expect(screen.queryByText("private-timeline-accepted-id")).not.toBeInTheDocument();
    expect(screen.queryByText("private-timeline-rejected-id")).not.toBeInTheDocument();
  });

  it("renders mixed provider identities, outcomes, response fallbacks, and replacement state", () => {
    const result = detailResult();
    const longRejectionReason = "r".repeat(700);
    result.details.providerRequests = [
      providerRequestFixture(),
      providerRequestFixture({
        id: "request-photo",
        providerRequestId: "request-photo",
        providerId: "provider-photo",
        providerName: "Photo Studio",
        type: "addon",
        packageId: null,
        packageName: null,
        services: [{
          id: "photo-service",
          name: "Event photography",
          category: "Photography",
          price: 30_000,
          downPaymentPercentage: 20,
          downPaymentAmount: 6_000,
        }],
        status: "confirmed",
        paymentStatus: "paid",
        acceptedAt: null,
        respondedAt: "2026-08-01T04:00:00.000Z",
      }),
      providerRequestFixture({
        id: "request-declined",
        providerRequestId: "request-declined",
        providerId: "provider-styling",
        providerName: "Style House",
        type: "addon",
        packageId: null,
        packageName: null,
        services: [{
          id: "style-service",
          name: "Reception styling",
          category: "Event styling",
          price: 18_000,
          downPaymentPercentage: 0,
          downPaymentAmount: 0,
        }],
        status: "rejected",
        rejectionReason: longRejectionReason,
        acceptedAt: null,
        rejectedAt: "2026-08-01T05:00:00.000Z",
        replacementStatus: "required",
      }),
    ];

    render(<CustomerBookingDetailPage result={result} />);

    expect(screen.getAllByText("Photography")).toHaveLength(2);
    expect(screen.getAllByText("Event styling")).toHaveLength(2);
    expect(screen.getByText("Accepted — confirmed")).toBeVisible();
    expect(screen.getByText("Declined by Style House")).toBeVisible();
    expect(screen.getByText("Replacement required")).toBeVisible();
    const boundedReason = screen.getByText((content) => content.startsWith("r".repeat(100)));
    expect(boundedReason.textContent).toHaveLength(500);
    expect(screen.getAllByText(/Response received Aug 1, 2026/u)).toHaveLength(3);
    const cateringRequest = screen.getByRole("heading", {name: "Maria's Catering"}).closest("article");
    const photographyRequest = screen.getByRole("heading", {name: "Photo Studio"}).closest("article");
    expect(cateringRequest).not.toBeNull();
    expect(photographyRequest).not.toBeNull();
    expect(within(cateringRequest as HTMLElement).getByText("Package: Premium Wedding Package")).toBeVisible();
    expect(within(photographyRequest as HTMLElement).queryByText("Package: Premium Wedding Package")).not.toBeInTheDocument();
    expect(within(photographyRequest as HTMLElement).getByText("Event photography")).toBeVisible();
    expect(screen.queryByText("request-photo")).not.toBeInTheDocument();
    expect(screen.queryByText("provider-photo")).not.toBeInTheDocument();
  });

  it("uses the same not-found outcome for the typed unavailable condition", async () => {
    mocks.getDetails.mockRejectedValueOnce(mocks.unavailable);

    await expect(CustomerBookingDetailRoute({
      params: Promise.resolve({bookingId: "foreign-or-missing"}),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});

describe("customer timeline normalization", () => {
  it("keeps an initial submission that has a title but no type", () => {
    const entry = normalizeCustomerBookingTimelineData("timeline-1", {
      title: "Booking request submitted",
      description: "Your request was sent to providers.",
      createdByRole: "customer",
      createdAt: "2026-08-01T01:00:00.000Z",
    });

    expect(entry).toEqual(expect.objectContaining({
      type: null,
      title: "Booking request submitted",
      actorRole: "customer",
    }));
  });

  it("normalizes payment messages and known provider lifecycle types", () => {
    const payment = normalizeCustomerBookingTimelineData("timeline-2", {
      type: "payment_confirmed",
      message: "The down payment was confirmed.",
      paymentId: "private-payment-id",
      createdBy: "private-actor-id",
      source: "paymongo_webhook",
      createdAt: "2026-08-02T01:00:00.000Z",
    });
    const provider = normalizeCustomerBookingTimelineData("timeline-3", {
      type: "provider_accepted",
      description: "The provider accepted your request.",
      reason: "This rejection-only field must not be used.",
      providerRequestId: "request-1",
      createdAt: "2026-08-01T02:00:00.000Z",
    }, new Map([["request-1", "Maria's Catering"]]));

    expect(payment).toEqual(expect.objectContaining({
      title: "Payment confirmed",
      description: "The down payment was confirmed.",
      actorRole: "system",
    }));
    expect(payment).not.toHaveProperty("paymentId");
    expect(payment).not.toHaveProperty("createdBy");
    expect(payment).not.toHaveProperty("source");
    expect(provider).toEqual(expect.objectContaining({
      title: "Provider accepted request",
      description: "The provider accepted your request.",
      providerName: "Maria's Catering",
    }));
    expect(provider).not.toHaveProperty("providerRequestId");
  });

  it("includes only a bounded reason for provider rejection records", () => {
    const rejected = normalizeCustomerBookingTimelineData("timeline-rejected", {
      type: "provider_rejected",
      description: "A selected provider rejected the booking request.",
      reason: `  ${"x".repeat(700)}  `,
      providerRequestId: "request-rejected",
      providerId: "private-provider-id",
      createdBy: "private-actor-id",
      createdAt: "2026-08-01T03:00:00.000Z",
    }, new Map([["request-rejected", "Photo Studio"]]));
    const missingReason = normalizeCustomerBookingTimelineData("timeline-rejected-missing", {
      type: "provider_rejected",
      description: "A selected provider rejected the booking request.",
      reason: {private: true},
      createdAt: "2026-08-01T04:00:00.000Z",
    });

    expect(rejected).toEqual(expect.objectContaining({
      title: "Provider declined request",
      providerName: "Photo Studio",
    }));
    expect(rejected?.description).toContain("Provider explanation:");
    expect(rejected?.description?.split("Provider explanation: ")[1]).toHaveLength(500);
    expect(rejected).not.toHaveProperty("providerRequestId");
    expect(rejected).not.toHaveProperty("providerId");
    expect(rejected).not.toHaveProperty("createdBy");
    expect(missingReason?.description).toBe(
      "A selected provider rejected the booking request.",
    );
  });

  it("uses safe bounded fallback presentation for unknown or malformed entries", () => {
    const entry = normalizeCustomerBookingTimelineData("timeline-4", {
      type: "future_private_event",
      message: "x".repeat(1_200),
      arbitrary: {private: true},
      createdAt: "2026-08-03T01:00:00.000Z",
    });

    expect(entry).toEqual(expect.objectContaining({
      type: null,
      title: "Booking updated",
    }));
    expect(entry?.description).toHaveLength(1_000);
    expect(entry).not.toHaveProperty("arbitrary");
    expect(normalizeCustomerBookingTimelineData("invalid", {
      title: "Missing timestamp",
    })).toBeNull();
  });

  it("sorts equal timestamps deterministically by document ID", () => {
    const entries = [
      normalizeCustomerBookingTimelineData("b", {
        title: "Second",
        createdAt: "2026-08-01T01:00:00.000Z",
      }),
      normalizeCustomerBookingTimelineData("a", {
        title: "First",
        createdAt: "2026-08-01T01:00:00.000Z",
      }),
    ].filter((entry) => entry !== null);

    expect(entries.sort(compareCustomerBookingTimelineEntries).map((entry) => entry.id))
      .toEqual(["a", "b"]);
  });
});

describe("customer booking safe model normalization", () => {
  it("normalizes response timestamps and replacement status safely", () => {
    expect(normalizeCustomerBookingProviderResponseFields({
      respondedAt: "2026-08-01T01:00:00.000Z",
      acceptedAt: {toDate: () => new Date("2026-08-01T02:00:00.000Z")},
      rejectedAt: "not-a-date",
      replacementStatus: "  required  ",
    })).toEqual({
      respondedAt: "2026-08-01T01:00:00.000Z",
      acceptedAt: "2026-08-01T02:00:00.000Z",
      rejectedAt: null,
      replacementStatus: "required",
    });

    expect(normalizeCustomerBookingProviderResponseFields({
      respondedAt: {toDate: () => {
        throw new Error("malformed timestamp");
      }},
      acceptedAt: 123,
      rejectedAt: {},
      replacementStatus: {internal: true},
    })).toEqual({
      respondedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      replacementStatus: null,
    });
  });

  it("normalizes only safe provider payment confirmation timestamps", () => {
    expect(normalizeCustomerBookingProviderPaymentConfirmationFields({
      paidAt: "2026-08-03T02:30:00.000Z",
      refundedAt: {toDate: () => new Date("2026-08-05T04:15:00.000Z")},
      paymongoResourceId: "resource-must-not-pass-through",
    })).toEqual({
      paidAt: "2026-08-03T02:30:00.000Z",
      refundedAt: "2026-08-05T04:15:00.000Z",
    });

    expect(normalizeCustomerBookingProviderPaymentConfirmationFields({
      paidAt: "not-a-date",
      refundedAt: {toDate: () => {
        throw new Error("malformed timestamp");
      }},
    })).toEqual({paidAt: null, refundedAt: null});
  });

  it("accepts only canonical, owned provider-request membership", () => {
    const canonicalIds = normalizeCanonicalProviderRequestIds([
      "request-1",
      "request-2",
      "request-1",
      "providerRequests/unsafe",
      {internal: true},
    ]);
    const canonicalProviderRequestIds = new Set(canonicalIds);
    const expected = {
      mainEventId: "owned-booking-001",
      customerId: "customer-001",
      canonicalProviderRequestIds,
    };

    expect(canonicalIds).toEqual(["request-1", "request-2"]);
    expect(isCanonicalOwnedProviderRequest({
      documentId: "request-1",
      storedProviderRequestId: "request-1",
      mainEventId: "owned-booking-001",
      customerId: "customer-001",
    }, expected)).toBe(true);
    expect(isCanonicalOwnedProviderRequest({
      documentId: "unrelated-request",
      storedProviderRequestId: "unrelated-request",
      mainEventId: "owned-booking-001",
      customerId: "customer-001",
    }, expected)).toBe(false);
    expect(isCanonicalOwnedProviderRequest({
      documentId: "request-2",
      storedProviderRequestId: "request-2",
      mainEventId: "owned-booking-001",
      customerId: "foreign-customer",
    }, expected)).toBe(false);
  });

  it("normalizes review state only for the canonical owned relationship", () => {
    const request = providerRequestFixture({
      status: "completed",
      reviewStatus: "unavailable",
    });
    const canonicalReview = {
      schemaVersion: 2,
      relationshipVersion: "provider_request_v1",
      providerRequestId: request.providerRequestId,
      mainEventId: request.mainEventId,
      providerId: request.providerId,
      customerId: "customer-001",
      rating: 5,
      comment: "Private review content is not needed by this DTO.",
      internalAudit: "must-not-pass-through",
    };

    expect(normalizeCustomerBookingReviewStatus({
      reviewExists: false,
      reviewData: {},
      request,
      bookingId: request.mainEventId,
      customerId: "customer-001",
      mainEventStatus: "completed",
    })).toBe("not_submitted");
    expect(normalizeCustomerBookingReviewStatus({
      reviewExists: true,
      reviewData: canonicalReview,
      request,
      bookingId: request.mainEventId,
      customerId: "customer-001",
      mainEventStatus: "completed",
    })).toBe("submitted");
    expect(normalizeCustomerBookingReviewStatus({
      reviewExists: true,
      reviewData: {...canonicalReview, customerId: "foreign-customer"},
      request,
      bookingId: request.mainEventId,
      customerId: "customer-001",
      mainEventStatus: "completed",
    })).toBe("unavailable");
    expect(normalizeCustomerBookingReviewStatus({
      reviewExists: true,
      reviewData: {...canonicalReview, providerRequestId: "other-request"},
      request,
      bookingId: request.mainEventId,
      customerId: "customer-001",
      mainEventStatus: "completed",
    })).toBe("unavailable");
  });

  it("fails review eligibility closed for malformed or mismatched requests", () => {
    const result = completedDetailResult();
    const canonical = result.details.providerRequests[0];
    expect(canCustomerReviewProviderRequest(
      result.details.booking,
      canonical,
    )).toBe(true);
    expect(canCustomerReviewProviderRequest(
      result.details.booking,
      {...canonical, id: "different-request"},
    )).toBe(false);
    expect(canCustomerReviewProviderRequest(
      result.details.booking,
      {...canonical, mainEventId: "foreign-booking"},
    )).toBe(false);
    expect(canCustomerReviewProviderRequest(
      result.details.booking,
      {...canonical, providerRequestId: "providerRequests/unsafe"},
    )).toBe(false);
    expect(canCustomerReviewProviderRequest(
      result.details.booking,
      {...canonical, reviewStatus: "unavailable"},
    )).toBe(false);
  });

  it("normalizes only non-negative integer aggregate response counts", () => {
    expect(normalizeCustomerBookingAggregateCounts({
      providerRequestCount: 8,
      pendingProviderRequestCount: 1,
      acceptedProviderRequestCount: 2,
      waitingPaymentProviderRequestCount: 1,
      paymentProcessingProviderRequestCount: 1,
      confirmedProviderRequestCount: 1,
      rejectedProviderRequestCount: 1,
      completedProviderRequestCount: 1,
    })).toEqual({
      providerRequestCount: 8,
      pendingProviderRequestCount: 1,
      acceptedProviderRequestCount: 2,
      waitingPaymentProviderRequestCount: 1,
      paymentProcessingProviderRequestCount: 1,
      confirmedProviderRequestCount: 1,
      rejectedProviderRequestCount: 1,
      completedProviderRequestCount: 1,
    });

    expect(normalizeCustomerBookingAggregateCounts({
      providerRequestCount: -1,
      pendingProviderRequestCount: 1.5,
      acceptedProviderRequestCount: "2",
      waitingPaymentProviderRequestCount: null,
      paymentProcessingProviderRequestCount: Number.NaN,
      confirmedProviderRequestCount: {},
      rejectedProviderRequestCount: undefined,
      completedProviderRequestCount: Number.POSITIVE_INFINITY,
    })).toEqual({
      providerRequestCount: 0,
      pendingProviderRequestCount: 0,
      acceptedProviderRequestCount: 0,
      waitingPaymentProviderRequestCount: 0,
      paymentProcessingProviderRequestCount: 0,
      confirmedProviderRequestCount: 0,
      rejectedProviderRequestCount: 0,
      completedProviderRequestCount: 0,
    });
  });
});

function detailResult(truncated = false): CustomerBookingDetailPageResult {
  return {
    details: {
      booking: bookingFixture(),
      providerRequests: [providerRequestFixture()],
    },
    timeline: {
      truncated,
      entries: [
        {
          id: "timeline-1",
          type: null,
          status: "pending_provider_approval",
          title: "Booking request submitted",
          description: "Your request was sent to providers.",
          actorRole: "customer",
          providerName: null,
          createdAt: "2026-08-01T01:00:00.000Z",
        },
        {
          id: "timeline-2",
          type: "payment_confirmed",
          status: null,
          title: "Payment confirmed",
          description: "The down payment was confirmed.",
          actorRole: "system",
          providerName: "Maria's Catering",
          createdAt: "2026-08-02T01:00:00.000Z",
        },
      ],
    },
  };
}

function completedDetailResult(
  providerRequests: CustomerBookingProviderRequest[] = [
    providerRequestFixture({
      status: "completed",
      paymentStatus: "paid",
      completedAt: "2026-08-16T04:00:00.000Z",
      reviewStatus: "not_submitted",
    }),
  ],
): CustomerBookingDetailPageResult {
  const result = detailResult();
  result.details.booking = bookingFixture();
  result.details.booking.status = "completed";
  result.details.booking.completedAt = "2026-08-16T05:30:00.000Z";
  result.details.booking.providerRequestCount = providerRequests.length;
  result.details.booking.waitingPaymentProviderRequestCount = 0;
  result.details.booking.confirmedProviderRequestCount = 0;
  result.details.booking.completedProviderRequestCount = providerRequests.filter(
    (request) => request.status === "completed",
  ).length;
  result.details.providerRequests = providerRequests;
  return result;
}

function bookingFixture(): CustomerBooking {
  return {
    id: "owned-booking-001",
    bookingId: "owned-booking-001",
    bookingCode: "FEA-2026-0001",
    eventType: "Wedding reception",
    eventDate: "2026-08-15T00:00:00.000Z",
    eventTime: "18:00",
    eventEndTime: "22:00",
    guestCount: 120,
    eventLocation: "Grand Ballroom",
    eventAddress: "Bonifacio Global City, Taguig",
    providerId: "provider-001",
    providerName: "Maria's Catering",
    packageId: "package-001",
    packageName: "Premium Wedding Package",
    status: "waiting_for_down_payment",
    paymentStatus: "unpaid",
    estimatedEventTotal: 125_000,
    downPaymentAmount: 31_250,
    remainingBalance: 93_750,
    providerRequestCount: 1,
    pendingProviderRequestCount: 0,
    acceptedProviderRequestCount: 0,
    waitingPaymentProviderRequestCount: 1,
    paymentProcessingProviderRequestCount: 0,
    confirmedProviderRequestCount: 1,
    rejectedProviderRequestCount: 0,
    completedProviderRequestCount: 0,
    submittedAt: "2026-08-01T01:00:00.000Z",
    completedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
}

function providerRequestFixture(
  overrides: Partial<CustomerBookingProviderRequest> = {},
): CustomerBookingProviderRequest {
  return {
    id: "request-1",
    providerRequestId: "request-1",
    mainEventId: "owned-booking-001",
    providerId: "provider-001",
    providerName: "Maria's Catering",
    type: "catering",
    packageId: "package-001",
    packageName: "Premium Wedding Package",
    services: [{
      id: "service-1",
      name: "Catering buffet",
      category: "Food",
      price: 100_000,
      downPaymentPercentage: 25,
      downPaymentAmount: 25_000,
    }],
    amount: 100_000,
    downPaymentAmount: 25_000,
    downPaymentPercentage: 25,
    remainingBalance: 75_000,
    status: "waiting_for_down_payment",
    paymentStatus: "unpaid",
    paymentId: null,
    rejectionReason: null,
    cancellationReason: null,
    requestedAt: "2026-08-01T01:00:00.000Z",
    respondedAt: null,
    acceptedAt: "2026-08-01T02:00:00.000Z",
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

function deferredCheckout() {
  let resolve!: (result: {
    paymentId: string;
    providerRequestId: string;
    bookingId: string;
    checkoutUrl: string;
    created: boolean;
  }) => void;
  const promise = new Promise<Parameters<typeof resolve>[0]>((complete) => {
    resolve = complete;
  });

  return {promise, resolve};
}

function deferredReview() {
  let resolve!: (result: {created: boolean}) => void;
  const promise = new Promise<{created: boolean}>((complete) => {
    resolve = complete;
  });

  return {promise, resolve};
}
