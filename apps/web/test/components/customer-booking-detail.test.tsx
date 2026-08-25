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
    expect(screen.getAllByText("Premium Wedding Package").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/125,000\.00/u).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Status: Awaiting payment").length).toBeGreaterThan(0);
    expect(screen.getByText("Open details to pay the required down payment.")).toBeVisible();
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
      providerName: "Maria's Catering",
    }));
    expect(provider).not.toHaveProperty("providerRequestId");
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
    confirmedProviderRequestCount: 1,
    rejectedProviderRequestCount: 0,
    completedProviderRequestCount: 0,
    submittedAt: "2026-08-01T01:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
}

function providerRequestFixture(): CustomerBookingProviderRequest {
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
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
    expiresAt: null,
  };
}
