import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";

const {saveWalkIn} = vi.hoisted(() => ({saveWalkIn: vi.fn()}));
vi.mock("@/app/provider/bookings/walk-in/actions", () => ({saveWalkIn}));

import {WalkInStatusForm} from "@/app/provider/bookings/walk-in/walk-in-status-form";

it("opens the cancellation dialog and submits only a nonblank reason", async () => {
  saveWalkIn.mockResolvedValueOnce({message: "Walk-in cancelled."});
  render(<WalkInStatusForm id="booking-reference" />);
  fireEvent.click(screen.getByRole("button", {name: "Cancel Booking"}));
  const dialog = screen.getByRole("dialog", {name: "Cancel booking?"});
  const reason = within(dialog).getByLabelText("Cancellation reason");
  const confirm = within(dialog).getByRole("button", {name: "Confirm cancellation"});
  fireEvent.change(reason, {target: {value: "  "}});
  fireEvent.submit(confirm.closest("form")!);
  expect(reason).toHaveAccessibleDescription("Enter a cancellation reason.");
  expect(saveWalkIn).not.toHaveBeenCalled();
  fireEvent.change(reason, {target: {value: "Customer requested cancellation"}});
  fireEvent.submit(confirm.closest("form")!);
  await waitFor(() => expect(saveWalkIn).toHaveBeenCalledTimes(1));
  const fields = saveWalkIn.mock.calls[0][1] as FormData;
  expect(fields.get("reference")).toBe("booking-reference");
  expect(fields.get("action")).toBe("cancelled");
  expect(fields.get("cancellation reason")).toBe("Customer requested cancellation");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("keeps the booking when the provider dismisses the dialog", () => {
  saveWalkIn.mockClear();
  render(<WalkInStatusForm id="booking-reference" />);
  fireEvent.click(screen.getByRole("button", {name: "Cancel Booking"}));
  fireEvent.click(screen.getByRole("button", {name: "Keep booking"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(saveWalkIn).not.toHaveBeenCalled();
});
