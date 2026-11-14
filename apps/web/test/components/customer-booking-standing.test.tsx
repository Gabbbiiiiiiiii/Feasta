import {act, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {CustomerBookingStanding} from "@/components/customer/bookings/customer-booking-standing";
import {loadCustomerBookingStanding, type CustomerBookingStanding as Standing} from "@/lib/customer/bookings/customer-booking-standing-client";

vi.mock("@/lib/customer/bookings/customer-booking-standing-client", () => ({loadCustomerBookingStanding: vi.fn()}));
const load = vi.mocked(loadCustomerBookingStanding);
const clear: Standing = {activeCount: 0, status: "clear", restrictionExpiresAt: null, serverTime: "2026-11-14T03:00:00Z"};
beforeEach(() => {load.mockReset(); load.mockResolvedValue(clear);});
afterEach(() => {vi.useRealTimers();});

it("shows loading without inventing standing, then hides clear standing", async () => {
  let resolve!: (value: Standing) => void;
  load.mockReturnValueOnce(new Promise(done => {resolve = done;}));
  const {container} = render(<CustomerBookingStanding />);
  expect(screen.getByRole("status")).toHaveTextContent("Checking booking standing");
  await act(async () => resolve(clear));
  expect(container).toBeEmptyDOMElement();
});

it.each([1, 2] as const)("shows the appropriate warning for %s active strikes", async count => {
  load.mockResolvedValue({...clear, activeCount: count, status: count === 1 ? "warning" : "final_warning"});
  render(<CustomerBookingStanding />);
  expect(await screen.findByRole("heading", {name: count === 1 ? "First booking warning" : "Final booking warning"})).toBeVisible();
  expect(screen.getByText(new RegExp(`${count} of 3 active strikes`))).toBeVisible();
  expect(screen.getByText(/Existing bookings, permitted payments, messages, and support remain available/)).toBeVisible();
  if (count === 2) expect(screen.getByText(/One more qualifying strike/)).toBeVisible();
});

it("shows a restriction independently of rolling active count and formats exact Manila expiry", async () => {
  load.mockResolvedValue({...clear, status: "restricted", restrictionExpiresAt: "2026-11-21T03:12:34Z"});
  render(<CustomerBookingStanding />);
  expect(await screen.findByRole("heading", {name: "New bookings temporarily restricted"})).toBeVisible();
  expect(screen.getByText(/Three qualifying unpaid booking strikes triggered a seven-day restriction/)).toBeVisible();
  expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-11-21T03:12:34Z");
  expect(document.querySelector("time")).toHaveTextContent(/11:12:34/);
  expect(screen.getByText(/Manila time/)).toBeVisible();
});

it("handles missing expiry without inventing an end date", async () => {
  load.mockResolvedValue({...clear, status: "restricted", restrictionExpiresAt: null});
  render(<CustomerBookingStanding />);
  expect(await screen.findByText(/restriction end time is unavailable/)).toBeVisible();
});

it("offers retry for unavailable data and never claims clear standing", async () => {
  load.mockRejectedValueOnce(new Error("offline"));
  render(<CustomerBookingStanding />);
  fireEvent.click(await screen.findByRole("button", {name: "Retry standing check"}));
  await act(async () => {});
  expect(load).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

it("refreshes expired restrictions using server time even with an incorrect device clock", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2035-01-01T00:00:00Z"));
  load.mockResolvedValueOnce({...clear, status: "restricted", restrictionExpiresAt: "2026-11-14T03:00:01Z"});
  const {unmount} = render(<CustomerBookingStanding />);
  await act(async () => {});
  expect(screen.getByRole("heading")).toHaveTextContent("temporarily restricted");
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(load).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  unmount();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(load).toHaveBeenCalledTimes(2);
});

it("does not display a restriction already expired at the server", async () => {
  load.mockResolvedValue({...clear, status: "restricted", restrictionExpiresAt: clear.serverTime});
  render(<CustomerBookingStanding />);
  expect(await screen.findByRole("button", {name: "Retry standing check"})).toBeVisible();
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
});

it("does not retain an expired restriction when its refresh fails", async () => {
  vi.useFakeTimers();
  load.mockResolvedValueOnce({...clear, status: "restricted", restrictionExpiresAt: "2026-11-14T03:00:01Z"})
    .mockRejectedValueOnce(new Error("offline"));
  render(<CustomerBookingStanding />);
  await act(async () => {});
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
});

it("polls for new strikes while the booking page stays open", async () => {
  vi.useFakeTimers();
  render(<CustomerBookingStanding />);
  await act(async () => {});
  load.mockResolvedValueOnce({...clear, activeCount: 1, status: "warning"});
  await act(async () => {await vi.advanceTimersByTimeAsync(60_000);});
  expect(screen.getByRole("heading")).toHaveTextContent("First booking warning");
});

it("refreshes reversals on focus and treats refresh failure as unavailable", async () => {
  load.mockResolvedValueOnce({...clear, activeCount: 2, status: "final_warning"});
  render(<CustomerBookingStanding />);
  await screen.findByRole("heading", {name: "Final booking warning"});
  await act(async () => {fireEvent.focus(window);});
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  load.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {fireEvent.focus(window);});
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
});
