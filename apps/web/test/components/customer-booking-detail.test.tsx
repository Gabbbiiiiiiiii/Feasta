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

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {error: mocks.toastError},
}));

import CustomerBookingDetailRoute from "@/app/customer/bookings/[bookingId]/page";
import {CustomerBookingDetailPage} from "@/components/customer/bookings/customer-booking-detail-page";
import {
  normalizeCustomerBookingAggregateCounts,
  normalizeCustomerBookingProviderResponseFields,
} from "@/lib/customer/bookings/customer-booking-data-normalizers";

describe("customer booking dedicated detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openChat.mockResolvedValue({
      chatRoomId: "request-1",
      providerRequestId: "request-1",
      created: false,
      canSendMessages: true,
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
    const currentState = screen.getByRole("heading", {name: "Current booking state"}).closest("section");
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
    expect(screen.getByText("Accepted provider requests require a down payment. Review each request's payment status.")).toBeVisible();
    expect(screen.getByRole("heading", {name: "Provider requests"})).toBeVisible();
    expect(screen.queryByText("Primary provider")).not.toBeInTheDocument();

    const timeline = screen.getByRole("heading", {name: "Booking timeline"}).closest("section");
    expect(timeline).not.toBeNull();
    expect(within(timeline as HTMLElement).getByRole("list", {name: "Booking activity"})).toBeInTheDocument();

    expect(screen.getByRole("button", {name: /pay .*25,000\.00 down payment/iu})).toBeVisible();
    expect(screen.queryByRole("button", {name: /cancel|refund|review|chat/iu})).not.toBeInTheDocument();
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

    expect(screen.getByText("Payment processing")).toBeVisible();
    expect(screen.queryByRole("button", {name: /pay .* down payment/iu})).not.toBeInTheDocument();
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
    completedAt: null,
    cancelledAt: null,
    expiresAt: null,
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
