import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  ProviderBooking,
  ProviderBookingFilter,
  ProviderBookingPage,
  ProviderBookingTimeline,
} from "@/lib/provider/bookings/provider-booking-types";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  loadPage: vi.fn(),
  loadBooking: vi.fn(),
  loadTimeline: vi.fn(),
  start: vi.fn(),
  complete: vi.fn(),
  prepare: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/provider/bookings",
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/app/provider/bookings/actions", () => ({
  loadProviderBookingsAction: mocks.loadPage,
  loadProviderBookingAction: mocks.loadBooking,
  loadProviderBookingTimelineAction: mocks.loadTimeline,
}));

vi.mock("@/lib/provider/bookings/provider-booking-client", () => ({
  markProviderBookingInProgress: mocks.start,
  completeProviderBooking: mocks.complete,
  markProviderPreparationStarted: mocks.prepare,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {
    success: mocks.success,
    error: mocks.error,
  },
}));

import {ProviderBookingsClient} from "@/app/provider/bookings/provider-bookings-client";

const timeline: ProviderBookingTimeline = {
  providerRequestId: "request-confirmed",
  mainEventId: "event-1",
  entries: [
    {
      id: "timeline-2",
      type: "confirmed",
      status: "confirmed",
      title: "Booking Confirmed",
      description: "Payment was confirmed.",
      createdByRole: "system",
      relatedProviderRequestId: "request-confirmed",
      createdAt: "2026-08-20T02:00:00.000Z",
    },
    {
      id: "timeline-1",
      type: "provider_request_accepted",
      status: "waiting_for_down_payment",
      title: "Request Accepted",
      description: "The provider accepted the request.",
      createdByRole: "provider",
      relatedProviderRequestId: "request-confirmed",
      createdAt: "2026-08-19T02:00:00.000Z",
    },
  ],
};

function booking(
  status: ProviderBooking["providerRequestStatus"] = "confirmed",
  id = `request-${status}`,
): ProviderBooking {
  return {
    providerRequestId: id,
    mainEventId: "event-1",
    providerId: "provider-1",
    customerId: "customer-1",
    providerRequestStatus: status,
    mainEventStatus: status === "completed"
      ? "completed"
      : status === "in_progress"
        ? "in_progress"
        : "confirmed",
    paymentStatus: status === "confirmed" || status === "in_progress" || status === "completed"
      ? "paid"
      : null,
    requestType: "catering",
    eventType: "birthday",
    eventDate: "2026-09-15T04:00:00.000Z",
    eventTime: "12:00 PM",
    eventEndTime: "4:00 PM",
    guestCount: 80,
    venueAddress: "Quezon City",
    locationSummary: "Quezon City · Metro Manila",
    customerDisplayName: "Ana Reyes",
    packageId: "package-1",
    packageName: "Celebration Package",
    services: [
      {
        id: "service-1",
        name: "Buffet Service",
        category: "Catering",
        quantity: 1,
        unitPrice: 25000,
        totalPrice: 25000,
      },
    ],
    serviceSummary: "Celebration Package",
    serviceCategory: "Catering",
    requestedAmount: 25000,
    acceptedAmount: 25000,
    downPaymentAmount: 5000,
    paymentAmount: 5000,
    remainingBalance: 20000,
    currency: "PHP",
    payment: null,
    createdAt: "2026-08-18T02:00:00.000Z",
    updatedAt: "2026-08-20T02:00:00.000Z",
    acceptedAt: "2026-08-19T02:00:00.000Z",
    confirmedAt: "2026-08-20T02:00:00.000Z",
    startedAt: status === "in_progress" || status === "completed"
      ? "2026-09-15T04:00:00.000Z"
      : null,
    completedAt: status === "completed" ? "2026-09-15T08:00:00.000Z" : null,
    cancelledAt: null,
    rejectionReason: null,
    cancellationReason: null,
    cancellationActor: null,
    refundEligibility: {
      evidenceStatus: "policy_backed",
      currentStage: "preparation_not_started",
      activeCancellationLocked: false,
      canMarkPreparationStarted: true,
    },
    timelineCount: 2,
  };
}

function page(
  bookings: ProviderBooking[],
  nextCursor: string | null = null,
): ProviderBookingPage {
  return {
    bookings,
    summary: {
      pending: 2,
      awaitingPayment: 3,
      confirmed: 4,
      upcoming: 3,
      inProgress: 1,
      completed: 12,
    },
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount: 0,
  };
}

function renderWorkspace(
  bookings = [booking()],
  status: ProviderBookingFilter = "all",
  nextCursor: string | null = null,
) {
  return render(
    <ProviderBookingsClient
      initialPage={page(bookings, nextCursor)}
      initialFilters={{status, pageSize: 10, cursor: null}}
    />,
  );
}

beforeEach(() => {
  mocks.loadPage.mockResolvedValue(page([booking()]));
  mocks.loadBooking.mockImplementation(async (id: string) =>
    booking(id.replace("request-", "") as ProviderBooking["providerRequestStatus"], id));
  mocks.loadTimeline.mockResolvedValue(timeline);
  mocks.start.mockResolvedValue({
    providerRequestId: "request-confirmed",
    mainEventId: "event-1",
    status: "in_progress",
    mainEventStatus: "in_progress",
    changed: true,
  });
  mocks.complete.mockResolvedValue({
    providerRequestId: "request-in_progress",
    mainEventId: "event-1",
    status: "completed",
    mainEventStatus: "completed",
    changed: true,
  });
  mocks.prepare.mockResolvedValue({
    providerRequestId: "request-confirmed",
    mainEventId: "event-1",
    currentStage: "preparation_started",
    stageSequence: 1,
    changed: true,
  });
});

describe("provider bookings workspace", () => {
  it("renders the server-backed summary, filters, table, and responsive card", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", {level: 1, name: "Bookings"})).toBeVisible();
    expect(screen.getByRole("region", {name: "Awaiting Payment"})).toHaveTextContent("3");
    expect(screen.getByRole("region", {name: "Confirmed / Upcoming"})).toHaveTextContent("4");
    expect(screen.getByRole("group", {name: "Booking status filters"})).toBeVisible();
    expect(screen.getAllByText("Ana Reyes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Birthday").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Celebration Package").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₱25,000/u).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Provider booking results, mobile view")).toBeInTheDocument();
  });

  it("shows honest empty copy without fabricating records", () => {
    renderWorkspace([], "in_progress");

    expect(screen.getByText("No in progress bookings")).toBeVisible();
    expect(screen.getByText("No bookings currently match this status.")).toBeVisible();
  });

  it("maps filters to the server contract and resets the cursor", async () => {
    const user = userEvent.setup();
    renderWorkspace([booking()], "all", "next-page");

    await user.click(screen.getByRole("button", {name: "Next"}));
    await waitFor(() => {
      expect(mocks.loadPage).toHaveBeenCalledWith(
        expect.objectContaining({status: "all", cursor: "next-page"}),
      );
    });

    await user.click(screen.getByRole("button", {name: "Awaiting Payment"}));
    await waitFor(() => {
      expect(mocks.loadPage).toHaveBeenLastCalledWith(
        expect.objectContaining({status: "accepted", cursor: null}),
      );
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      "/provider/bookings?status=accepted",
      {scroll: false},
    );
  });

  it.each([
    ["Confirmed", "confirmed"],
    ["Upcoming", "upcoming"],
    ["In Progress", "in_progress"],
    ["Completed", "completed"],
    ["Cancelled", "cancelled"],
  ] as const)("maps the %s filter to %s", async (label, status) => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", {name: label}));

    await waitFor(() => {
      expect(mocks.loadPage).toHaveBeenCalledWith(
        expect.objectContaining({status, cursor: null}),
      );
    });
  });

  it("loads the provider-owned record and canonical event timeline in the drawer", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole("button", {name: "View booking for Ana Reyes"})[0]);

    await waitFor(() => {
      expect(mocks.loadBooking).toHaveBeenCalledWith("request-confirmed");
      expect(mocks.loadTimeline).toHaveBeenCalledWith("request-confirmed");
    });
    expect(screen.getByRole("dialog", {name: "Booking details"})).toBeVisible();
    expect(screen.getByText("Booking Confirmed")).toBeVisible();
    const timelineHeadings = screen.getAllByText(/Request Accepted|Booking Confirmed/u);
    expect(timelineHeadings).toHaveLength(2);
    expect(screen.getByText("Request Accepted").compareDocumentPosition(
      screen.getByText("Booking Confirmed"),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", {name: "Booking details"})).not.toBeInTheDocument();
  });

  it("requires confirmation and sends only the canonical request id when starting", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole("button", {name: "View booking for Ana Reyes"})[0]);
    await screen.findByRole("button", {name: "Start Event"});
    await user.click(screen.getByRole("button", {name: "Start Event"}));
    expect(screen.getByRole("heading", {name: "Start this event?"})).toBeVisible();
    expect(mocks.start).not.toHaveBeenCalled();

    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    await user.click(within(confirmation).getByRole("button", {name: "Start Event"}));

    await waitFor(() => {
      expect(mocks.start).toHaveBeenCalledWith("request-confirmed");
      expect(mocks.refresh).toHaveBeenCalled();
      expect(mocks.success).toHaveBeenCalled();
    });
  });

  it("offers only canonical lifecycle actions for eligible statuses", async () => {
    const user = userEvent.setup();
    const records = [
      booking("waiting_for_down_payment"),
      booking("in_progress"),
      booking("completed"),
    ];
    renderWorkspace(records);

    await user.click(screen.getAllByRole("button", {
      name: "View booking for Ana Reyes",
    })[0]);
    await screen.findByRole("dialog", {name: "Booking details"});
    expect(screen.queryByRole("button", {name: "Start Event"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Mark Completed"})).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getAllByRole("button", {
      name: "View booking for Ana Reyes",
    })[2]);
    await screen.findByRole("dialog", {name: "Booking details"});
    expect(screen.queryByRole("button", {name: "Start Event"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Mark Completed"})).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getAllByRole("button", {
      name: "View booking for Ana Reyes",
    })[1]);
    expect(await screen.findByRole("button", {name: "Mark Completed"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Mark Completed"}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    await user.click(within(confirmation).getByRole("button", {name: "Mark Completed"}));
    await waitFor(() => {
      expect(mocks.complete).toHaveBeenCalledWith("request-in_progress");
    });
  });

  it("shows safe feedback when a lifecycle callable fails", async () => {
    mocks.start.mockRejectedValueOnce(new Error("This booking is not eligible for that action."));
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole("button", {name: "View booking for Ana Reyes"})[0]);
    await user.click(await screen.findByRole("button", {name: "Start Event"}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    await user.click(within(confirmation).getByRole("button", {name: "Start Event"}));

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith(
        "This booking is not eligible for that action.",
      );
    });
  });

  it("records factual preparation through the forward-only trusted operation", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole("button", {name: "View booking for Ana Reyes"})[0]);
    await user.click(await screen.findByRole("button", {name: "Mark preparation started"}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    await user.type(
      within(confirmation).getByRole("textbox"),
      "Ingredient purchasing began",
    );
    await user.click(within(confirmation).getByRole("button", {name: "Record preparation"}));

    await waitFor(() => {
      expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
        providerRequestId: "request-confirmed",
        evidence: "Ingredient purchasing began",
        idempotencyKey: expect.stringContaining("provider-preparation:request-confirmed:"),
      }));
    });
    expect(screen.queryByText(/refund amount control|refund percentage control/iu)).not.toBeInTheDocument();
  });

  it("shows the active-cancellation lock and withholds stage advancement", async () => {
    const locked = booking();
    locked.refundEligibility = {
      ...locked.refundEligibility,
      activeCancellationLocked: true,
      canMarkPreparationStarted: false,
    };
    mocks.loadBooking.mockResolvedValueOnce(locked);
    const user = userEvent.setup();
    renderWorkspace([locked]);

    await user.click(screen.getAllByRole("button", {name: "View booking for Ana Reyes"})[0]);
    expect(await screen.findByText("Stage advancement is locked by an active cancellation request.")).toBeVisible();
    expect(screen.queryByRole("button", {name: "Mark preparation started"})).not.toBeInTheDocument();
  });
});
