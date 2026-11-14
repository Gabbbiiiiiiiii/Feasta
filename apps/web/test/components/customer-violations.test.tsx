import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import {CustomerViolationsPanel} from "@/components/admin/users/customer-violations-panel";
import type {CustomerViolationHistory} from "@/lib/admin/users/customer-violation-client";

const mocks = vi.hoisted(() => ({load: vi.fn(), reverse: vi.fn()}));
vi.mock("@/lib/admin/users/customer-violation-client", () => ({
  loadCustomerViolations: mocks.load, reverseCustomerViolation: mocks.reverse,
}));
function fixture(): CustomerViolationHistory {
  return {revision: 3, activeCount: 3, status: "restricted", observationStart: "2026-10-15T03:00:00Z",
    observationEnd: "2026-11-14T03:00:00Z", restrictionExpiresAt: "2026-11-21T03:00:00Z", nextCursor: null,
    records: [{id: "event_001", mainEventId: "event_001", providerRequestIds: ["request_001", "request_002"],
      reason: "no_attempt_original_deadline_elapsed", occurredAt: "2026-11-14T03:00:00Z", issuedAt: "2026-11-14T03:01:00Z",
      reversedAt: null, reversalReason: null, reversedBy: null, consumedCycleId: "event_001"}]};
}
beforeEach(() => {vi.clearAllMocks(); mocks.load.mockResolvedValue(fixture()); mocks.reverse.mockResolvedValue({changed: true});});

it("shows rolling observation, strikes, booking references and Manila expiry", async () => {
  render(<CustomerViolationsPanel customerId="customer_001" />);
  expect(await screen.findByText(/3 \/ 3 active strikes/)).toBeInTheDocument();
  expect(screen.getByText(/Rolling 30-day observation/)).toHaveTextContent("Manila");
  expect(screen.getByText(/New bookings restricted until/)).toHaveTextContent("Nov 21, 2026");
  expect(screen.getByText(/Provider requests:/)).toHaveTextContent("request_002");
  expect(screen.getByText(/Consumed in restriction cycle/)).toBeInTheDocument();
});

it("requires a private reason and submits the current revision, then reloads", async () => {
  render(<CustomerViolationsPanel customerId="customer_001" />);
  const submit = await screen.findByRole("button", {name: "Reverse incorrect strike"});
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Private reversal reason"), {target: {value: "Wrong customer attribution"}});
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.reverse).toHaveBeenCalledWith({customerId: "customer_001", strikeId: "event_001",
    reason: "Wrong customer attribution", expectedRevision: 3}));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
});

it("retains original history and displays private reversal audit details", async () => {
  const data = fixture(); Object.assign(data.records[0], {reversedAt: "2026-11-14T04:00:00Z", reversalReason: "Evidence verified", reversedBy: "admin_001"});
  mocks.load.mockResolvedValue(data);
  render(<CustomerViolationsPanel customerId="customer_001" />);
  expect(await screen.findByText(/Private audit reason: Evidence verified/)).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Reverse incorrect strike"})).not.toBeInTheDocument();
});

it("offers bounded history pagination", async () => {
  mocks.load.mockResolvedValue({...fixture(), nextCursor: "event_025"});
  render(<CustomerViolationsPanel customerId="customer_001" />);
  fireEvent.click(await screen.findByRole("button", {name: "More history"}));
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith("customer_001", "event_025"));
});

it("navigates next, previous and first pages using the original cursors", async () => {
  mocks.load.mockImplementation(async (_customer: string, cursor: string | null) => ({...fixture(),
    nextCursor: cursor === null ? "event_page_025" : cursor === "event_page_025" ? "event_page_050" : null}));
  render(<CustomerViolationsPanel customerId="customer_001" />);
  fireEvent.click(await screen.findByRole("button", {name: "More history"}));
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith("customer_001", "event_page_025"));
  fireEvent.click(await screen.findByRole("button", {name: "More history"}));
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith("customer_001", "event_page_050"));
  fireEvent.click(await screen.findByRole("button", {name: "Previous history page"}));
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith("customer_001", "event_page_025"));
  fireEvent.click(await screen.findByRole("button", {name: "First history page"}));
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith("customer_001", null));
});

it("identifies newest issuance order and distinguishes occurrence from issuance", async () => {
  render(<CustomerViolationsPanel customerId="customer_001" />);
  expect(await screen.findByText(/History is ordered by issuance time, newest first/)).toBeInTheDocument();
  expect(screen.getByText(/^Occurred:/)).toHaveTextContent("Issued:");
});

it("ignores a stale response after the customer panel unmounts", async () => {
  let resolveInitial!: (value: CustomerViolationHistory) => void;
  mocks.load.mockReturnValueOnce(new Promise<CustomerViolationHistory>(resolve => {resolveInitial = resolve;}));
  const {unmount} = render(<CustomerViolationsPanel customerId="customer_001" />);
  expect(screen.getByRole("button", {name: "Refresh violations"})).toBeDisabled();
  unmount();
  render(<CustomerViolationsPanel customerId="customer_002" />);
  await screen.findByText(/3 \/ 3 active strikes/);
  resolveInitial({...fixture(), activeCount: 0});
  await waitFor(() => expect(screen.getByText(/3 \/ 3 active strikes/)).toBeInTheDocument());
});

it("reports concurrent review conflicts and allows refresh", async () => {
  mocks.reverse.mockRejectedValue(new Error("Violation state changed. Refresh before reversing."));
  render(<CustomerViolationsPanel customerId="customer_001" />);
  fireEvent.change(await screen.findByLabelText("Private reversal reason"), {target: {value: "Evidence corrected"}});
  fireEvent.click(screen.getByRole("button", {name: "Reverse incorrect strike"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Violation state changed");
  fireEvent.click(screen.getByRole("button", {name: "Refresh violations"}));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
});

it("does not display empty or failed history as a clean account", async () => {
  mocks.load.mockRejectedValue(new Error("unavailable"));
  render(<CustomerViolationsPanel customerId="customer_001" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load violations");
  expect(screen.queryByText(/No active booking restriction/)).not.toBeInTheDocument();
});
