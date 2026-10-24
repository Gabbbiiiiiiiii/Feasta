import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import {ProviderDatePicker} from "@/components/customer/bookings/provider-date-picker";
const {load} = vi.hoisted(() => ({load: vi.fn()}));
vi.mock("@/lib/customer/bookings/customer-provider-availability-client", () => ({getCustomerProviderCalendarAvailability: load}));
const currentMonth = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date()).slice(0, 7);
const month = new Date(Date.UTC(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5)), 1)).toISOString().slice(0, 7);
const nextMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);
const props = {providerId: "provider_123", value: `${month}-20`, onChange: vi.fn(), planningOnly: false, revision: 0};
beforeEach(() => {load.mockReset(); props.onChange.mockReset();});
it("shows safe labels, prevents blocked selection and reports selected conflict", async () => {
  load.mockResolvedValue({month, dates: [{date: `${month}-20`, state: "booked"}, {date: `${month}-21`, state: "on_hold"}, {date: `${month}-22`, state: "unavailable"}]});
  const onAvailability = vi.fn();
  render(<ProviderDatePicker {...props} onAvailability={onAvailability} />);
  fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  await screen.findByRole("button", {name: /, Booked$/});
  const booked = screen.getByRole("button", {name: /, Booked$/});
  expect(booked).toHaveAttribute("aria-disabled", "true"); fireEvent.click(booked);
  expect(props.onChange).not.toHaveBeenCalled();
  await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(`${month}-20`, true));
  expect(screen.getByRole("alert")).toHaveTextContent("Choose another");
  fireEvent.click(screen.getAllByRole("button", {name: /, Available$/})[0]);
  expect(props.onChange).toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
});
it("loads months once, caches navigation and supports keyboard close", async () => {
  load.mockImplementation((_id, m) => Promise.resolve({month: m, dates: []}));
  render(<ProviderDatePicker {...props} />); fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  fireEvent.click(screen.getByRole("button", {name: "Next month"}));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", {name: "Previous month"}));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull()); expect(load).toHaveBeenCalledTimes(2);
  const days = screen.getAllByRole("button", {name: /, Available$/}); days[0].focus(); fireEvent.keyDown(days[0], {key: "ArrowRight"}); expect(days[1]).toHaveFocus();
  fireEvent.keyDown(days[1], {key: "Escape"}); expect(screen.queryByRole("dialog")).toBeNull();
});
it("fails closed while loading and retries errors", async () => {
  load.mockRejectedValueOnce(new Error("private data")).mockResolvedValue({month, dates: []});
  render(<ProviderDatePicker {...props} />); fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(screen.getAllByRole("button", {name: /Availability unknown/})[0]).toHaveAttribute("aria-disabled", "true");
  await screen.findByRole("alert"); expect(screen.queryByText("private data")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Retry calendar"}));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull()); expect(load).toHaveBeenCalledTimes(2);
});
it("ignores stale responses from a previous month", async () => {
  let resolve!: (value: unknown) => void;
  load.mockImplementationOnce(() => new Promise((r) => {resolve = r;})).mockResolvedValue({month: nextMonth, dates: []});
  render(<ProviderDatePicker {...props} />); fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  fireEvent.click(screen.getByRole("button", {name: "Next month"}));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  resolve({month, dates: [{date: `${month}-20`, state: "booked"}]});
  await waitFor(() => expect(screen.queryByRole("button", {name: /, Booked$/})).toBeNull());
});
it("does not fetch in planning mode", () => {
  render(<ProviderDatePicker {...props} planningOnly />); expect(load).not.toHaveBeenCalled();
});

it("reuses the booking-session cache across mounts and isolates providers", async () => {
  load.mockImplementation((_id, m) => Promise.resolve({month: m, dates: []}));
  const cache = new Map();
  const first = render(<ProviderDatePicker {...props} sessionCache={cache} />);
  fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  first.unmount();
  const second = render(<ProviderDatePicker {...props} sessionCache={cache} />);
  fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(load).toHaveBeenCalledTimes(1);
  second.rerender(<ProviderDatePicker {...props} providerId="provider_other" sessionCache={cache} />);
  fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(load).toHaveBeenLastCalledWith("provider_other", month);
});
it("invalidates cached availability when final checks change", async () => {
  load.mockResolvedValueOnce({month, dates: []}).mockResolvedValue({month, dates: [{date: `${month}-20`, state: "booked"}]});
  const view = render(<ProviderDatePicker {...props} />);
  fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  view.rerender(<ProviderDatePicker {...props} revision={1} />);
  await screen.findByRole("button", {name: /, Booked$/});
  expect(load).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("alert")).toHaveTextContent("Choose another available date");
});

it("renders a bounded portal that flips above the field on a narrow viewport", async () => {
  load.mockResolvedValue({month, dates: []});
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "dialog"
      ? {left: 0, top: 0, right: 296, bottom: 400, width: 296, height: 400} as DOMRect
      : {left: 290, top: 550, right: 340, bottom: 606, width: 50, height: 56} as DOMRect;
  });
  const {container} = render(<ProviderDatePicker {...props} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  const trigger = screen.getByRole("button", {name: /^Event date/});
  expect(trigger.querySelector("svg")).not.toBeNull();
  fireEvent.click(trigger);
  const popup = screen.getByRole("dialog");
  expect(popup.parentElement).toBe(document.body);
  expect(container).not.toContainElement(popup);
  expect(popup).toHaveClass("fixed", "overflow-y-auto");
  expect(popup).toHaveStyle({width: "296px", left: "12px", top: "142px", maxHeight: "616px"});
  expect(trigger).toHaveAttribute("aria-controls", popup.id);
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(screen.getByLabelText("Calendar days")).toHaveClass("grid-cols-7");
});
it("closes on outside interaction without changing the draft, and Escape restores focus", async () => {
  load.mockResolvedValue({month, dates: []});
  render(<><ProviderDatePicker {...props} /><button type="button">Outside field</button></>);
  const trigger = screen.getByRole("button", {name: /^Event date/});
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  fireEvent.pointerDown(screen.getByRole("button", {name: "Outside field"}));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(props.onChange).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("dialog"), {key: "Escape"});
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  screen.getByRole("button", {name: "Outside field"}).focus();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("keeps cells compact and announces each state when focused", async () => {
  load.mockResolvedValue({month, dates: [{date: `${month}-20`, state: "booked"}, {date: `${month}-21`, state: "on_hold"}, {date: `${month}-22`, state: "unavailable"}]});
  render(<ProviderDatePicker {...props} />);
  fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
  const booked = await screen.findByRole("button", {name: /, Booked$/});
  expect(booked).toHaveTextContent(/^20$/);
  expect(booked).toHaveClass("h-10", "min-w-0");
  booked.focus();
  await waitFor(() => expect(screen.getByText(/: Booked$/)).toBeVisible());
  fireEvent.keyDown(booked, {key: "ArrowRight"});
  expect(screen.getByRole("button", {name: /, On hold$/})).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("button", {name: /, On hold$/}), {key: "ArrowRight"});
  expect(screen.getByRole("button", {name: /, Unavailable$/})).toHaveFocus();
  const legend = screen.getByLabelText("Date availability legend");
  expect(legend).toHaveTextContent("AvailableBookedOn holdUnavailable");
});
it("mutes past dates without repeating status text in day cells", async () => {
  vi.setSystemTime(new Date("2026-10-16T02:00:00Z"));
  try {
    load.mockResolvedValue({month: "2026-10", dates: []});
    render(<ProviderDatePicker {...props} value="" />);
    fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const past = screen.getAllByRole("button", {name: /, Past date$/});
    expect(past).toHaveLength(15);
    expect(past[0]).toHaveTextContent(/^1$/);
    expect(past[0]).toHaveClass("opacity-40");
    expect(past[0]).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(past[0]);
    expect(props.onChange).not.toHaveBeenCalled();
    const today = screen.getByRole("button", {name: "October 16, 2026, Unavailable"});
    expect(today).toHaveAttribute("aria-disabled", "true");
  } finally {vi.useRealTimers();}
});
