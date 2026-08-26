import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  CustomerBooking,
  CustomerBookingDetailsResult,
  CustomerBookingPage,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";
import type {CreateCustomerPaymentSessionResult} from "@/lib/customer/payments/customer-payment-types";

const mocks = vi.hoisted(() => ({
  getPage: vi.fn(),
  loadBookings: vi.fn(),
  loadDetails: vi.fn(),
  createCheckout: vi.fn(),
  redirectCheckout: vi.fn(),
  routerReplace: vi.fn(),
  searchParamGet: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.routerReplace}),
  useSearchParams: () => ({get: mocks.searchParamGet}),
}));

vi.mock("@/lib/customer/bookings/customer-booking-service", () => ({
  getCustomerBookingPage: mocks.getPage,
}));

vi.mock("@/app/customer/bookings/actions", () => ({
  loadCustomerBookingsAction: mocks.loadBookings,
  loadCustomerBookingDetailsAction: mocks.loadDetails,
}));

vi.mock("@/lib/customer/payments/customer-payment-client", () => ({
  createCustomerPaymentCheckout: mocks.createCheckout,
  redirectToCustomerPaymentCheckout: mocks.redirectCheckout,
}));

import CustomerBookingsError from "@/app/customer/bookings/error";
import CustomerBookingsPage from "@/app/customer/bookings/page";
import {CustomerBookingExperience} from "@/components/customer/bookings/customer-booking-experience";

describe("customer booking history and details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPage.mockResolvedValue(pageFixture());
    mocks.loadBookings.mockResolvedValue(pageFixture());
    mocks.loadDetails.mockResolvedValue(detailsFixture());
    mocks.createCheckout.mockResolvedValue(checkoutFixture());
    mocks.searchParamGet.mockReturnValue(null);
  });

  it("server-loads the first owned page and renders real booking information", async () => {
    render(await CustomerBookingsPage());

    expect(mocks.getPage).toHaveBeenCalledWith({
      search: "",
      status: "all",
      pageSize: 10,
      cursor: null,
    });
    expect(screen.getByRole("heading", {name: "Bookings"})).toBeVisible();
    expect(screen.getAllByText("FEA-2026-0001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Wedding reception").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", {name: "Provider responses"})).toBeVisible();
    expect(screen.queryByText("Maria's Catering")).not.toBeInTheDocument();
    expect(screen.queryByText("Premium Wedding Package")).not.toBeInTheDocument();
    expect(screen.getAllByText("Aug 15, 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/125,000\.00/u).length).toBeGreaterThan(0);
  });

  it("sends exact owned-booking search and customer status groups through the action", async () => {
    const user = userEvent.setup();
    render(<CustomerBookingExperience initialPage={pageFixture()} />);

    await user.type(
      screen.getByRole("searchbox", {name: "Search by exact booking code or booking ID"}),
      "FEA-2026-0001",
    );
    await user.click(screen.getByRole("button", {name: "Search"}));

    await waitFor(() => {
      expect(mocks.loadBookings).toHaveBeenLastCalledWith({
        search: "FEA-2026-0001",
        status: "all",
        pageSize: 10,
        cursor: null,
      });
    });

    const statusSelect = screen.getByLabelText("Booking status");
    await waitFor(() => expect(statusSelect).toBeEnabled());
    await user.selectOptions(statusSelect, "in_progress");

    await waitFor(() => {
      expect(mocks.loadBookings).toHaveBeenLastCalledWith({
        search: "FEA-2026-0001",
        status: "in_progress",
        pageSize: 10,
        cursor: null,
      });
    });

    const statusOptions = statusSelect.querySelectorAll("option");
    expect(Array.from(statusOptions, (option) => option.value)).toEqual([
      "all",
      "draft",
      "awaiting_provider",
      "awaiting_payment",
      "confirmed",
      "in_progress",
      "completed",
      "cancelled_or_expired",
    ]);
  });

  it("uses opaque cursors in both pagination directions", async () => {
    const user = userEvent.setup();
    mocks.loadBookings.mockResolvedValueOnce(pageFixture([bookingFixture({
      id: "owned-booking-002",
      bookingId: "owned-booking-002",
      bookingCode: "FEA-2026-0002",
    })], null));
    render(<CustomerBookingExperience initialPage={pageFixture(undefined, "opaque-next-page")} />);

    await user.click(screen.getByRole("button", {name: /Next/u}));
    await waitFor(() => {
      expect(mocks.loadBookings).toHaveBeenCalledWith({
        search: "",
        status: "all",
        pageSize: 10,
        cursor: "opaque-next-page",
      });
    });
    expect(await screen.findByText("Page 2")).toBeVisible();

    const previousButton = screen.getByRole("button", {name: /Previous/u});
    await waitFor(() => expect(previousButton).toBeEnabled());
    await user.click(previousButton);
    await waitFor(() => {
      expect(mocks.loadBookings).toHaveBeenLastCalledWith({
        search: "",
        status: "all",
        pageSize: 10,
        cursor: null,
      });
    });
  });

  it("loads owned details and shows bounded event, location, service, and provider-request data", async () => {
    const user = userEvent.setup();
    render(<CustomerBookingExperience initialPage={pageFixture()} />);

    await user.click(screen.getAllByRole("button", {name: "View booking FEA-2026-0001"})[0]);

    await waitFor(() => {
      expect(mocks.loadDetails).toHaveBeenCalledWith("owned-booking-001");
    });
    const eventHeading = await screen.findByRole("heading", {name: "Event information"});
    const eventSection = eventHeading.closest("section");
    expect(eventSection).not.toBeNull();
    expect(within(eventSection as HTMLElement).getByLabelText("Status: Awaiting payment")).toBeVisible();
    expect(within(eventSection as HTMLElement).queryByLabelText("Status: Unpaid")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", {name: "Booking FEA-2026-0001"})).toHaveAccessibleDescription(
      "Wedding reception",
    );
    expect(screen.getByText("Grand Ballroom")).toBeVisible();
    expect(screen.getAllByText("Catering buffet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Catering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lights & sounds").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Accepted — down payment required")).toBeVisible();
    expect(screen.getByText("Accepted — confirmed")).toBeVisible();
    expect(screen.getByText("Declined by Alternative Caterer")).toBeVisible();
    expect(screen.getAllByText(/Response received Aug 1, 2026/u).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Provider could not accommodate the event date.")).toBeVisible();
    expect(screen.getByText("Replacement required")).toBeVisible();
    expect(screen.getAllByText(/100,000\.00/u).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Status: Unpaid").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", {name: "Open full booking details"})).toHaveAttribute(
      "href",
      "/customer/bookings/owned-booking-001",
    );
    expect(screen.queryByText("customer@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("provider-request-waiting-001")).not.toBeInTheDocument();
    expect(screen.queryByText("Primary provider")).not.toBeInTheDocument();
  });

  it("offers payment only for waiting requests and exposes no refund or lifecycle controls", async () => {
    const user = userEvent.setup();
    render(<CustomerBookingExperience initialPage={pageFixture()} />);
    await user.click(screen.getAllByRole("button", {name: "View booking FEA-2026-0001"})[0]);

    expect(await screen.findByRole("button", {name: "Pay securely"})).toBeEnabled();
    expect(screen.getAllByRole("button", {name: "Pay securely"})).toHaveLength(1);
    expect(screen.queryByRole("button", {name: /refund/iu})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /cancel booking|edit booking|reschedule|mark (?:confirmed|completed)/iu})).not.toBeInTheDocument();
  });

  it("prevents duplicate checkout creation while redirect preparation is pending", async () => {
    let resolveCheckout!: (value: CreateCustomerPaymentSessionResult) => void;
    mocks.createCheckout.mockReturnValueOnce(new Promise((resolve) => {
      resolveCheckout = resolve;
    }));
    render(<CustomerBookingExperience initialPage={pageFixture()} />);
    fireEvent.click(screen.getAllByRole("button", {name: "View booking FEA-2026-0001"})[0]);
    const paymentButton = await screen.findByRole("button", {name: "Pay securely"});

    fireEvent.click(paymentButton);
    fireEvent.click(paymentButton);

    expect(mocks.createCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.createCheckout).toHaveBeenCalledWith("provider-request-waiting-001");
    expect(screen.getByRole("button", {name: "Creating secure checkout"})).toBeDisabled();

    await act(async () => resolveCheckout(checkoutFixture()));
    await waitFor(() => expect(mocks.redirectCheckout).toHaveBeenCalledWith(checkoutFixture()));
  });

  it("keeps checkout failures accessible inside the drawer", async () => {
    const user = userEvent.setup();
    mocks.createCheckout.mockRejectedValueOnce(
      new Error("The secure checkout could not be created. Please try again."),
    );
    render(<CustomerBookingExperience initialPage={pageFixture()} />);

    await user.click(screen.getAllByRole("button", {name: "View booking FEA-2026-0001"})[0]);
    await user.click(await screen.findByRole("button", {name: "Pay securely"}));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The secure checkout could not be created. Please try again.",
    );
    expect(screen.getByRole("link", {name: "Open full booking details"})).toBeVisible();
  });

  it("provides accessible desktop and mobile structures with customer-facing next steps", () => {
    render(<CustomerBookingExperience initialPage={pageFixture()} />);

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("region", {name: "Filter bookings"})).toBeInTheDocument();
    expect(screen.getByRole("table", {name: "Customer booking history"})).toBeInTheDocument();
    expect(screen.getByLabelText("Customer booking history, mobile view")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", {name: "Search by exact booking code or booking ID"})).toHaveAccessibleDescription(
      "Searches only your bookings using an exact booking code or booking ID.",
    );
    expect(screen.getAllByLabelText("Status: Awaiting payment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accepted provider requests require a down payment. Review each request's payment status.").length).toBeGreaterThan(0);
    expect(screen.getByText(/Searches only your bookings/u)).toBeVisible();
  });

  it("summarizes canonical provider responses for parent and mixed outcomes", () => {
    const scenarios: Array<{booking: CustomerBooking; summary: string; nextStep: string}> = [
      {
        booking: bookingFixture({
          id: "pending-only",
          bookingId: "pending-only",
          bookingCode: "PENDING-ONLY",
          status: "pending_provider_approval",
          providerRequestCount: 2,
          pendingProviderRequestCount: 2,
          waitingPaymentProviderRequestCount: 0,
          confirmedProviderRequestCount: 0,
          rejectedProviderRequestCount: 0,
        }),
        summary: "2 awaiting response",
        nextStep: "Wait for providers to review your requests.",
      },
      {
        booking: bookingFixture({
          id: "awaiting-payment",
          bookingId: "awaiting-payment",
          bookingCode: "AWAITING-PAYMENT",
          providerRequestCount: 1,
          waitingPaymentProviderRequestCount: 1,
          confirmedProviderRequestCount: 0,
          rejectedProviderRequestCount: 0,
        }),
        summary: "1 awaiting payment",
        nextStep: "Accepted provider requests require a down payment. Review each request's payment status.",
      },
      {
        booking: bookingFixture({
          id: "confirmed",
          bookingId: "confirmed",
          bookingCode: "CONFIRMED",
          status: "confirmed",
          providerRequestCount: 2,
          waitingPaymentProviderRequestCount: 0,
          confirmedProviderRequestCount: 2,
          rejectedProviderRequestCount: 0,
        }),
        summary: "2 confirmed",
        nextStep: "Your event booking is confirmed. Review the schedule and provider requests.",
      },
      {
        booking: bookingFixture({
          id: "replacement",
          bookingId: "replacement",
          bookingCode: "REPLACEMENT",
          status: "needs_provider_replacement",
          providerRequestCount: 1,
          waitingPaymentProviderRequestCount: 0,
          confirmedProviderRequestCount: 0,
          rejectedProviderRequestCount: 1,
        }),
        summary: "1 declined",
        nextStep: "At least one provider declined. Review the affected provider request.",
      },
      {
        booking: bookingFixture({
          id: "mixed-payment",
          bookingId: "mixed-payment",
          bookingCode: "MIXED-PAYMENT",
          status: "pending_provider_approval",
          providerRequestCount: 2,
          pendingProviderRequestCount: 1,
          waitingPaymentProviderRequestCount: 1,
          confirmedProviderRequestCount: 0,
          rejectedProviderRequestCount: 0,
        }),
        summary: "1 awaiting payment · 1 awaiting response",
        nextStep: "Some providers have responded. Review accepted requests while you wait for the remaining responses.",
      },
      {
        booking: bookingFixture({
          id: "mixed-rejected",
          bookingId: "mixed-rejected",
          bookingCode: "MIXED-REJECTED",
          status: "needs_provider_replacement",
          providerRequestCount: 2,
          pendingProviderRequestCount: 1,
          waitingPaymentProviderRequestCount: 0,
          confirmedProviderRequestCount: 0,
          rejectedProviderRequestCount: 1,
        }),
        summary: "1 declined · 1 awaiting response",
        nextStep: "At least one provider declined. Review the affected request while other providers respond.",
      },
      {
        booking: bookingFixture({
          id: "mixed-confirmed",
          bookingId: "mixed-confirmed",
          bookingCode: "MIXED-CONFIRMED",
          status: "pending_provider_approval",
          providerRequestCount: 2,
          pendingProviderRequestCount: 1,
          waitingPaymentProviderRequestCount: 0,
          confirmedProviderRequestCount: 1,
          rejectedProviderRequestCount: 0,
        }),
        summary: "1 awaiting response · 1 confirmed",
        nextStep: "Some providers have responded. Wait for the remaining provider responses.",
      },
    ];

    render(<CustomerBookingExperience initialPage={pageFixture(scenarios.map(({booking}) => booking))} />);

    expect(screen.queryByText("Provider & package")).not.toBeInTheDocument();
    expect(screen.queryByText("Maria's Catering")).not.toBeInTheDocument();
    expect(screen.queryByText("Premium Wedding Package")).not.toBeInTheDocument();
    for (const scenario of scenarios) {
      expect(screen.getAllByText(scenario.summary).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(scenario.nextStep).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("trims searches and clears only the active search", async () => {
    const user = userEvent.setup();
    render(<CustomerBookingExperience initialPage={pageFixture()} />);

    await user.selectOptions(screen.getByLabelText("Booking status"), "awaiting_provider");
    await waitFor(() => expect(screen.getByLabelText("Booking status")).toBeEnabled());
    await user.type(
      screen.getByRole("searchbox", {name: "Search by exact booking code or booking ID"}),
      "  FEA-2026-0001  ",
    );
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mocks.loadBookings).toHaveBeenLastCalledWith({
        search: "FEA-2026-0001",
        status: "awaiting_provider",
        pageSize: 10,
        cursor: null,
      });
    });

    const clearSearchInput = screen.getByRole("button", {name: "Clear booking search input"});
    await waitFor(() => expect(clearSearchInput).toBeEnabled());
    await user.click(clearSearchInput);
    await waitFor(() => {
      expect(mocks.loadBookings).toHaveBeenLastCalledWith({
        search: "",
        status: "awaiting_provider",
        pageSize: 10,
        cursor: null,
      });
    });
    expect(screen.getByLabelText("Booking status")).toHaveValue("awaiting_provider");
  });

  it("recovers from a detail-load failure without leaking the server error", async () => {
    const user = userEvent.setup();
    mocks.loadDetails
      .mockRejectedValueOnce(new Error("private Firestore path"))
      .mockResolvedValueOnce(detailsFixture());
    render(<CustomerBookingExperience initialPage={pageFixture()} />);

    await user.click(screen.getAllByRole("button", {name: "View booking FEA-2026-0001"})[0]);
    expect(await screen.findByText(/Booking details could not be loaded/u)).toBeVisible();
    expect(screen.queryByText("private Firestore path")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", {name: "Try again"}));
    expect(await screen.findByRole("heading", {name: "Event information"})).toBeVisible();
    expect(mocks.loadDetails).toHaveBeenCalledTimes(2);
  });

  it("hides payment when the trusted request payment state is no longer payable", async () => {
    const user = userEvent.setup();
    const paidDetails = detailsFixture();
    paidDetails.details.providerRequests[0].paymentStatus = "paid";
    mocks.loadDetails.mockResolvedValueOnce(paidDetails);
    render(<CustomerBookingExperience initialPage={pageFixture()} />);

    await user.click(screen.getAllByRole("button", {name: "View booking FEA-2026-0001"})[0]);
    expect(await screen.findByRole("heading", {name: "Provider requests"})).toBeVisible();
    expect(screen.queryByRole("button", {name: "Pay securely"})).not.toBeInTheDocument();
  });

  it("distinguishes initial empty, filtered empty, action error, and route error states", async () => {
    const user = userEvent.setup();
    const {rerender} = render(<CustomerBookingExperience initialPage={pageFixture([], null)} />);
    expect(screen.getByRole("heading", {name: "No bookings yet"})).toBeVisible();
    expect(screen.getByRole("link", {name: "Browse event services"})).toHaveAttribute(
      "href",
      "/customer/providers",
    );

    mocks.loadBookings.mockResolvedValueOnce(pageFixture([], null));
    await user.type(
      screen.getByRole("searchbox", {name: "Search by exact booking code or booking ID"}),
      "MISSING-BOOKING",
    );
    await user.click(screen.getByRole("button", {name: "Search"}));
    expect(await screen.findByRole("heading", {name: "No booking found in your account"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Clear search"})).toBeVisible();
    expect(screen.queryByRole("link", {name: "Browse event services"})).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", {name: "Clear filters"}));
    await waitFor(() => expect(screen.getByLabelText("Booking status")).toBeEnabled());
    mocks.loadBookings.mockResolvedValueOnce(pageFixture([], null));
    await user.selectOptions(screen.getByLabelText("Booking status"), "completed");
    expect(await screen.findByRole("heading", {name: "No bookings match this status"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Show all bookings"})).toBeVisible();
    expect(screen.queryByRole("link", {name: "Browse event services"})).not.toBeInTheDocument();

    mocks.loadBookings.mockRejectedValueOnce(new Error("raw backend details"));
    await user.selectOptions(screen.getByLabelText("Booking status"), "confirmed");
    expect(await screen.findByText("Your booking history could not be updated. Please try again.")).toBeVisible();
    expect(screen.queryByText("raw backend details")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: "Browse event services"})).not.toBeInTheDocument();

    const reset = vi.fn();
    rerender(<CustomerBookingsError reset={reset} />);
    await user.click(screen.getByRole("button", {name: "Try again"}));
    expect(reset).toHaveBeenCalledOnce();
  });
});

function pageFixture(
  bookings: CustomerBooking[] = [bookingFixture()],
  nextCursor: string | null = null,
): CustomerBookingPage {
  return {
    bookings,
    statistics: {
      total: bookings.length,
      upcoming: bookings.length,
      awaitingProvider: 1,
      awaitingPayment: 1,
      confirmed: 0,
      completed: 0,
      cancelledOrExpired: 0,
    },
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

function bookingFixture(overrides: Partial<CustomerBooking> = {}): CustomerBooking {
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
    providerId: "provider-private-001",
    providerName: "Maria's Catering",
    packageId: "package-private-001",
    packageName: "Premium Wedding Package",
    status: "waiting_for_down_payment",
    paymentStatus: "unpaid",
    estimatedEventTotal: 125_000,
    downPaymentAmount: 31_250,
    remainingBalance: 93_750,
    providerRequestCount: 3,
    pendingProviderRequestCount: 0,
    acceptedProviderRequestCount: 0,
    waitingPaymentProviderRequestCount: 1,
    paymentProcessingProviderRequestCount: 0,
    confirmedProviderRequestCount: 1,
    rejectedProviderRequestCount: 1,
    completedProviderRequestCount: 0,
    submittedAt: "2026-08-01T01:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function detailsFixture(): CustomerBookingDetailsResult {
  return {
    details: {
      booking: bookingFixture(),
      providerRequests: [
        providerRequestFixture(),
        providerRequestFixture({
          id: "request-confirmed",
          providerRequestId: "provider-request-confirmed-002",
          providerName: "Lights & Sounds Co.",
          type: "addon",
          packageName: null,
          status: "confirmed",
          paymentStatus: "paid",
          acceptedAt: "2026-08-01T02:00:00.000Z",
          services: [{
            id: "lights-service",
            name: "Stage lighting and audio",
            category: "Lights & sounds",
            price: 20_000,
            downPaymentPercentage: 20,
            downPaymentAmount: 4_000,
          }],
        }),
        providerRequestFixture({
          id: "request-rejected",
          providerRequestId: "provider-request-rejected-003",
          providerName: "Alternative Caterer",
          status: "rejected",
          rejectionReason: "Provider could not accommodate the event date.",
          rejectedAt: "2026-08-01T03:00:00.000Z",
          replacementStatus: "required",
        }),
      ],
    },
  };
}

function providerRequestFixture(
  overrides: Partial<CustomerBookingProviderRequest> = {},
): CustomerBookingProviderRequest {
  return {
    id: "request-waiting",
    providerRequestId: "provider-request-waiting-001",
    mainEventId: "owned-booking-001",
    providerId: "provider-private-001",
    providerName: "Maria's Catering",
    type: "catering",
    packageId: "package-private-001",
    packageName: "Premium Wedding Package",
    services: [{
      id: "service-private-001",
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
    expiresAt: "2026-08-10T01:00:00.000Z",
    ...overrides,
  };
}

function checkoutFixture(): CreateCustomerPaymentSessionResult {
  return {
    paymentId: "payment-secure-001",
    providerRequestId: "provider-request-waiting-001",
    bookingId: "owned-booking-001",
    checkoutUrl: "https://checkout.paymongo.com/secure-test",
    created: true,
  };
}
