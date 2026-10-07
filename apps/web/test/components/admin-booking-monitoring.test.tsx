import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {AdminBooking, AdminBookingFilters, AdminBookingPage} from "@/lib/admin/bookings/admin-booking-types";
import {adminBookingStatusLabels, adminBookingPaymentLabels} from "@/lib/admin/bookings/admin-booking-labels";
import {BookingMonitoringClient} from "@/components/admin/bookings/booking-monitoring-client";

const mocks = vi.hoisted(() => ({load: vi.fn()}));
vi.mock("@/app/admin/bookings/actions", () => ({loadAdminBookingsAction: mocks.load}));
const page: AdminBookingPage = {
  bookings: [], hasMore: false, nextCursor: null,
  statistics: {totalBookings: 0, pendingApproval: 0, waitingForPayment: 0, confirmed: 0,
    inProgress: 0, completed: 0, needsProviderReplacement: 0, cancelledOrExpired: 0,
    totalProviderRequests: 0, pendingProviderRequests: 0, confirmedProviderRequests: 0,
    totalPaidAmount: 26000, totalRefundedAmount: 0},
};
beforeEach(() => {mocks.load.mockReset().mockResolvedValue(page);});
afterEach(() => vi.useRealTimers());
const show = () => render(<BookingMonitoringClient initialPage={page} />);
const booking: AdminBooking = {
  id: "event-one", reference: "BK-001", status: "confirmed", paymentStatus: "paid", customerId: "customer-one",
  customer: {id: "customer-one", fullName: "Ana Reyes", email: "ana@example.test", phoneNumber: ""},
  eventType: "Wedding", eventDate: "2026-10-07T00:00:00Z", eventTime: "12:00", guestCount: 50,
  venueName: null, venueAddress: "Event Street", city: "Ormoc City", notes: null,
  providerRequestCount: 0, pendingProviderRequestCount: 0, acceptedProviderRequestCount: 0,
  waitingPaymentProviderRequestCount: 0, paymentProcessingProviderRequestCount: 0, confirmedProviderRequestCount: 0,
  inProgressProviderRequestCount: 0, completedProviderRequestCount: 0, rejectedProviderRequestCount: 0,
  cancelledProviderRequestCount: 0, expiredProviderRequestCount: 0,
  totalAmount: 26000, totalPaidAmount: 26000, totalRefundedAmount: 0, outstandingAmount: 0,
  providerRequests: [], payments: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: null, confirmedAt: null, completedAt: null, cancelledAt: null,
};
async function select(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), {target: {value}});
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({cursor: null})));
  await waitFor(() => expect(screen.getByLabelText(label)).toBeEnabled());
}

describe("booking status filters", () => {
  it.each(Object.entries(adminBookingStatusLabels))("passes %s unchanged and consistently displays %s", async (value, label) => {
    show();
    expect(within(screen.getByLabelText("Booking status")).getByRole("option", {name: label})).toHaveValue(value);
    await select("Booking status", value);
    expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({status: value, cursor: null}));
    expect(screen.getByText(new RegExp(`Status: ${label}`))).toBeInTheDocument();
    expect(screen.getByText("No bookings match the current search and filters.")).toBeInTheDocument();
    expect(screen.queryByText("Status: Waiting For Down Payment")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Clear filters"}));
    await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({status: "all", paymentStatus: "all", date: "all", cursor: null})));
  });
});

it.each(Object.entries(adminBookingPaymentLabels).filter(([value]) => value !== "partially_refunded"))(
  "passes payment %s unchanged and displays %s", async (value, label) => {
    show();
    expect(within(screen.getByLabelText("Payment status")).getByRole("option", {name: label})).toHaveValue(value);
    await select("Payment status", value);
    expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({paymentStatus: value}));
    expect(screen.getByText(new RegExp(`Payment: ${label}`))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Clear filters"}));
    await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({paymentStatus: "all"})));
  },
);

it.each([["all", "All event dates"], ["today", "Today"], ["upcoming", "Upcoming"], ["past", "Past"]])(
  "uses event date %s (%s)", async (value, label) => {
    show();
    expect(within(screen.getByLabelText("Event date")).getByRole("option", {name: label})).toHaveValue(value);
    await select("Event date", value);
    expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({date: value}));
    if (value !== "all") expect(screen.getByText(new RegExp(`Date: ${label}`))).toBeInTheDocument();
  },
);

it("keeps combined filters, unsent search text and current data through refresh and failure", async () => {
  vi.useFakeTimers();
  show();
  for (const [label, value] of [["Booking status", "waiting_for_down_payment"], ["Payment status", "processing"], ["Event date", "upcoming"]]) {
    await act(async () => {fireEvent.change(screen.getByLabelText(label), {target: {value}});});
  }
  fireEvent.change(screen.getByLabelText("Search by booking code prefix"), {target: {value: "BK-unsent"}});
  const expected = {...mocks.load.mock.lastCall![0], search: "BK-unsent", cursor: null} as AdminBookingFilters;
  expect(expected).toMatchObject({status: "waiting_for_down_payment", paymentStatus: "processing", date: "upcoming"});
  await act(async () => {await vi.advanceTimersByTimeAsync(275);});
  const readsBefore = mocks.load.mock.calls.length;
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(mocks.load).toHaveBeenCalledTimes(readsBefore + 1);
  expect(mocks.load).toHaveBeenLastCalledWith(expected);
  expect(screen.getByLabelText("Search by booking code prefix")).toHaveValue("BK-unsent");
  expect(screen.getByText(/Status: Waiting for payment/)).toBeInTheDocument();
  expect(screen.getByText(/Payment: Awaiting payment confirmation/)).toBeInTheDocument();
  mocks.load.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("Paid booking amount")).toBeInTheDocument();
});

it("preserves pagination and the open drawer while polling and clears the cursor on filter changes", async () => {
  vi.useFakeTimers();
  const populated = {...page, bookings: [booking], nextCursor: "cursor-next", hasMore: true};
  mocks.load.mockResolvedValue(populated);
  render(<BookingMonitoringClient initialPage={populated} />);
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Next"}));});
  expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({cursor: "cursor-next"}));
  fireEvent.click(screen.getByRole("button", {name: "View booking BK-001"}));
  mocks.load.mockResolvedValue({...populated, bookings: [{...booking, status: "completed"}]});
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({cursor: "cursor-next"}));
  const drawer = screen.getByRole("dialog", {name: "Booking BK-001"});
  expect(within(drawer).getByText("Completed")).toBeInTheDocument();
  fireEvent.click(within(drawer).getByRole("button", {name: "Close"}));
  expect(screen.getByText("Page 2")).toBeInTheDocument();
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Previous"}));});
  expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({cursor: null}));
  await act(async () => {fireEvent.change(screen.getByLabelText("Booking status"), {target: {value: "waiting_for_down_payment"}});});
  expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({status: "waiting_for_down_payment", cursor: null}));
  expect(screen.getByText("Page 1")).toBeInTheDocument();
});


it("searches actual booking rows while preserving filters and auto-refresh", async () => {
  vi.useFakeTimers(); mocks.load.mockResolvedValue({...page, bookings: [booking]}); show();
  await act(async () => { fireEvent.change(screen.getByLabelText("Booking status"), {target: {value: "confirmed"}}); });
  const input = screen.getByRole("searchbox", {name: "Search by booking code prefix"});
  fireEvent.change(input, {target: {value: "BK-0"}});
  await act(async () => {await vi.advanceTimersByTimeAsync(275);});
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({search: "BK-0", status: "confirmed", cursor: null, pageSize: 10}));
  expect(screen.getAllByRole("button", {name: "View booking BK-001"}).length).toBeGreaterThan(0);
  await act(async () => {await vi.advanceTimersByTimeAsync(5000);});
  expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({search: "BK-0", status: "confirmed"})); expect(input).toHaveValue("BK-0");
});

it("formats the booking drawer event clock using AM/PM", () => {
  render(<BookingMonitoringClient initialPage={{...page, bookings: [{...booking, eventDate: "2026-10-07T00:00:00+08:00", eventTime: "06:38"}]}} />);
  fireEvent.click(screen.getAllByRole("button", {name: "View booking BK-001"})[0]);
  expect(within(screen.getByRole("dialog", {name: "Booking BK-001"})).getByText("October 7, 2026 · 6:38 AM")).toBeInTheDocument();
});
it("keeps an open booking drawer through live searches", async () => {
  vi.useFakeTimers(); render(<BookingMonitoringClient initialPage={{...page, bookings: [booking]}} />);
  fireEvent.click(screen.getAllByRole("button", {name: "View booking BK-001"})[0]);
  fireEvent.change(screen.getByRole("searchbox", {hidden: true}), {target: {value: "b"}});
  await act(async () => {await vi.advanceTimersByTimeAsync(275);});
  expect(screen.getByRole("dialog", {name: "Booking BK-001"})).toBeInTheDocument();
});
