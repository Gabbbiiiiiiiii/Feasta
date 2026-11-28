import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {SpecialRequestForm} from "@/components/customer/packages/special-request-form";

vi.mock("@/lib/firebase/client", () => ({
  auth: {}, functions: {}, initializeBrowserAppCheck: vi.fn(),
}));
vi.mock("@/components/customer/bookings/provider-date-picker", () => ({
  ProviderDatePicker: () => null,
}));

it("shows the subtotal at the limit and blocks quantities above it", () => {
  render(<SpecialRequestForm packageId="lechon" providerId="provider" price={3000} maxQuantity={5} />);
  fireEvent.click(screen.getByRole("button", {name: "Special Request"}));
  const dialog = within(screen.getByRole("dialog", {name: "Special Request"}));
  const quantity = dialog.getByLabelText(/Quantity/);
  const submit = dialog.getByRole("button", {name: "Submit Special Request"});
  fireEvent.change(quantity, {target: {value: "5"}});
  expect(dialog.getByText(/Estimated subtotal.*15,000/)).toBeVisible();
  expect(submit).toBeEnabled();
  for (const value of ["0", "1.5", "6"]) {
    fireEvent.change(quantity, {target: {value}});
    expect(dialog.getByText("Enter a whole quantity from 1 to 5.")).toBeVisible();
    expect(submit).toBeDisabled();
  }
});

it("uses a single unit when the package has a limit of one", () => {
  render(<SpecialRequestForm packageId="lechon" providerId="provider" price={3000} maxQuantity={1} />);
  fireEvent.click(screen.getByRole("button", {name: "Special Request"}));
  const dialog = within(screen.getByRole("dialog", {name: "Special Request"}));
  expect(dialog.queryByLabelText(/Quantity/)).not.toBeInTheDocument();
  expect(dialog.getByText(/Estimated subtotal.*3,000/)).toBeVisible();
});
