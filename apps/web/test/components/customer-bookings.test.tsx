import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
    expect(screen.getAllByText("Maria's Catering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Aug 15, 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/125,000\.00/u).length).toBeGreaterThan(0);
  });

  it("sends exact booking search and every selected canonical status through the action", async () => {
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
      "pending_provider_approval",
      "needs_provider_replacement",
      "waiting_for_down_payment",
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
      "expired",
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
    expect(await screen.findByRole("heading", {name: "Event information"})).toBeVisible();
    expect(screen.getByText("Grand Ballroom")).toBeVisible();
    expect(screen.getAllByText("Catering buffet").length).toBeGreaterThan(0);
    expect(screen.getByText("Provider could not accommodate the event date.")).toBeVisible();
    expect(screen.queryByText("customer@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("provider-request-waiting-001")).not.toBeInTheDocument();
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

  it("distinguishes initial empty, filtered empty, action error, and route error states", async () => {
    const user = userEvent.setup();
    const {rerender} = render(<CustomerBookingExperience initialPage={pageFixture([], null)} />);
    expect(screen.getByRole("heading", {name: "No bookings yet"})).toBeVisible();

    mocks.loadBookings.mockResolvedValueOnce(pageFixture([], null));
    await user.type(
      screen.getByRole("searchbox", {name: "Search by exact booking code or booking ID"}),
      "MISSING-BOOKING",
    );
    await user.click(screen.getByRole("button", {name: "Search"}));
    expect(await screen.findByRole("heading", {name: "No matching results"})).toBeVisible();

    mocks.loadBookings.mockRejectedValueOnce(new Error("raw backend details"));
    await user.selectOptions(screen.getByLabelText("Booking status"), "completed");
    expect(await screen.findByText("Your booking history could not be updated. Please try again.")).toBeVisible();
    expect(screen.queryByText("raw backend details")).not.toBeInTheDocument();

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
        }),
        providerRequestFixture({
          id: "request-rejected",
          providerRequestId: "provider-request-rejected-003",
          providerName: "Alternative Caterer",
          status: "rejected",
          rejectionReason: "Provider could not accommodate the event date.",
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
