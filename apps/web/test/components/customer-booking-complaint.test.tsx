import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({submit: vi.fn()}));
vi.mock("@/lib/customer/bookings/customer-complaint-client", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/customer/bookings/customer-complaint-client")>(),
  submitCustomerBookingComplaint: mocks.submit,
}));
import {CustomerBookingComplaintAction} from "@/components/customer/bookings/customer-booking-complaint-action";

beforeEach(() => {mocks.submit.mockReset();});
function open() {
  render(<CustomerBookingComplaintAction providerRequestId="request_owned" providerName="Owned Provider" />);
  fireEvent.click(screen.getByRole("button", {name: "Report an Issue for Owned Provider"}));
}
function fill() {
  fireEvent.change(screen.getByLabelText("Category (required)"), {target: {value: "service_quality"}});
  fireEvent.change(screen.getByLabelText("Description (required)"), {target: {value: "  The service did not match our agreement.  "}});
}
it("validates required category and description without sending", async () => {
  open(); fireEvent.click(screen.getByRole("button", {name: "Submit report"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a category");
  expect(mocks.submit).not.toHaveBeenCalled();
});
it("prevents duplicate clicks and closing while submitting, then displays success", async () => {
  let finish!: (value: {created: boolean}) => void;
  mocks.submit.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  open(); fill(); const button = screen.getByRole("button", {name: "Submit report"});
  fireEvent.click(button); fireEvent.click(button);
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  expect(mocks.submit).toHaveBeenCalledWith({providerRequestId: "request_owned", category: "service_quality", description: "  The service did not match our agreement.  "});
  expect(screen.getByRole("button", {name: "Submitting report"})).toBeDisabled();
  expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
  await act(async () => finish({created: true}));
  expect(screen.getByRole("status")).toHaveTextContent("Issue reported");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("preserves input after failure and lets the customer retry", async () => {
  mocks.submit.mockRejectedValueOnce(new Error("Please retry with the same details.")).mockResolvedValueOnce({created: false});
  open(); fill(); fireEvent.click(screen.getByRole("button", {name: "Submit report"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
  expect(screen.getByLabelText("Description (required)")).toHaveValue("  The service did not match our agreement.  ");
  await waitFor(() => expect(screen.getByRole("button", {name: "Submit report"})).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", {name: "Submit report"}));
  expect(await screen.findByRole("status")).toHaveTextContent("Issue reported");
  expect(mocks.submit).toHaveBeenCalledTimes(2);
});
