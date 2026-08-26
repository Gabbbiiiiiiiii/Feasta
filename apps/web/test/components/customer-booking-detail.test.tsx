import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

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
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/customer/bookings/customer-booking-service", () => ({
  getCustomerBookingDetailsWithTimeline: mocks.getDetails,
  isCustomerBookingUnavailableError: (error: unknown) =>
    error === mocks.unavailable,
}));

import CustomerBookingDetailRoute from "@/app/customer/bookings/[bookingId]/page";
import {CustomerBookingDetailPage} from "@/components/customer/bookings/customer-booking-detail-page";
import {
  normalizeCustomerBookingAggregateCounts,
  normalizeCustomerBookingProviderResponseFields,
} from "@/lib/customer/bookings/customer-booking-data-normalizers";

describe("customer booking dedicated detail page", () => {
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

    const timeline = screen.getByRole("heading", {name: "Booking timeline"}).closest("section");
    expect(timeline).not.toBeNull();
    expect(within(timeline as HTMLElement).getByRole("list")).toBeInTheDocument();

    expect(screen.queryByRole("button", {name: /pay|cancel|refund|review|chat/iu})).not.toBeInTheDocument();
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

    expect(screen.getByText("Photography")).toBeVisible();
    expect(screen.getByText("Event styling")).toBeVisible();
    expect(screen.getByText("Accepted — confirmed")).toBeVisible();
    expect(screen.getByText("Declined by Style House")).toBeVisible();
    expect(screen.getByText("Replacement required")).toBeVisible();
    const boundedReason = screen.getByText((content) => content.startsWith("r".repeat(100)));
    expect(boundedReason.textContent).toHaveLength(500);
    expect(screen.getAllByText(/Response received Aug 1, 2026/u)).toHaveLength(3);
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
