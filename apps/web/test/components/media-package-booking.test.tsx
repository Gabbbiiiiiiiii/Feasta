import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";

import {MediaPackageBooking} from "@/components/customer/providers/media-package-booking";

vi.mock("@/lib/customer/bookings/customer-provider-availability-client", () => ({
  getCustomerProviderCalendarAvailability: async (_providerId: string, month: string) => ({month, dates: []}),
}));

vi.mock("@/components/customer/bookings/customer-event-address-map", () => ({
  CustomerEventAddressMap: ({onConfirm}: {onConfirm: (location: unknown) => void}) => (
    <button type="button" onClick={() => onConfirm({
      address: "Barangay Linao, Ormoc City",
      city: "Ormoc City",
      province: "Leyte",
      latitude: 11,
      longitude: 124,
    })}>Confirm venue</button>
  ),
}));

it("uses the catering calendar and fills the location and address from the map", async () => {
  render(<MediaPackageBooking providerId="provider-one" serviceId="photo-package" serviceName="Wedding Photography"
    revision={1} occasions={[{id: "wedding", label: "Wedding"}]} defaultLocation="Ormoc City, Eastern Visayas"
    guestCapacity="20–25 guests" providerName="Example Studio" authenticated returnTo="/customer/packages"
    requestClassName="" />);

  fireEvent.click(screen.getByRole("button", {name: "Customize & request"}));
  expect(screen.getByRole("heading", {name: "Event details"})).toBeVisible();
  expect(screen.getByLabelText("Event type")).toHaveValue("wedding");
  expect(screen.queryByLabelText(/^Municipality$/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Event location")).toHaveValue("Ormoc City, Eastern Visayas");

  const calendarTrigger = screen.getByRole("button", {name: "Event date"});
  fireEvent.click(calendarTrigger);
  const booking = screen.getByRole("dialog", {name: "Wedding Photography"});
  const calendar = within(booking).getByRole("dialog", {name: "Choose event date"});
  const [availableDate] = await within(calendar).findAllByRole("button", {name: /, Available$/});
  fireEvent.click(availableDate);
  expect(within(booking).queryByRole("dialog", {name: "Choose event date"})).not.toBeInTheDocument();
  expect(calendarTrigger).toHaveAccessibleName(/^Event date: /);

  fireEvent.click(screen.getByRole("button", {name: "Choose on map"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm venue"}));
  expect(screen.getByLabelText("Event location")).toHaveValue("Ormoc City, Leyte");
  expect(screen.getByLabelText("Complete event address")).toHaveValue("Barangay Linao, Ormoc City");
  expect(screen.getByRole("button", {name: "Choose on map"})).toHaveAttribute("aria-expanded", "false");
});
