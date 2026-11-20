import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";

const actions = vi.hoisted(() => ({checkWalkInDayAction: vi.fn(), saveWalkIn: vi.fn(), push: vi.fn()}));
vi.mock("@/app/provider/bookings/walk-in/actions", () => actions);
vi.mock("next/navigation", () => ({useRouter: () => ({push: actions.push})}));

import {WalkInForm} from "@/app/provider/bookings/walk-in/walk-in-form";

const eventDate = (offset: number) => new Date(Date.now() + (8 + offset * 24) * 3600000).toISOString().slice(0, 10);

beforeEach(() => {
  actions.checkWalkInDayAction.mockReset().mockResolvedValue({capacity: 3, occupied: 2, remaining: 1, blocked: false});
  actions.saveWalkIn.mockReset();
  actions.push.mockReset();
});

it("checks availability automatically and shows one free slot", async () => {
  render(<WalkInForm packages={[]} />);
  expect(actions.checkWalkInDayAction).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", {name: "Check availability"})).not.toBeInTheDocument();
  const date = screen.getByLabelText("Event date");
  fireEvent.change(date, {target: {value: eventDate(1)}});
  expect(await screen.findByText("Available (1 slot free)")).toBeVisible();
  expect(actions.checkWalkInDayAction).toHaveBeenCalledWith(eventDate(1));
  actions.checkWalkInDayAction.mockResolvedValueOnce({capacity: 3, occupied: 3, remaining: 0, blocked: false});
  fireEvent.change(date, {target: {value: eventDate(2)}});
  expect(await screen.findByText("Date Fully Booked")).toBeVisible();
  expect(screen.getByText("Occupied slots")).toBeVisible();
  expect(screen.getByRole("button", {name: "Save & Confirm Booking"})).toBeDisabled();
});

it("pre-fills the agreement, defaults to custom service for empty catalogs, and offers Other event type", () => {
  render(<WalkInForm packages={[]} agreementDefaults={{date: "2026-11-19", time: "09:30"}} />);
  expect(screen.getByLabelText("Date of agreement")).toHaveValue("2026-11-19");
  expect(screen.getByLabelText("Time of agreement")).toHaveValue("09:30");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(screen.getByLabelText("Service selection")).toHaveValue("custom");
  expect(screen.getByLabelText("Service name")).toBeRequired();
  fireEvent.change(screen.getByLabelText("Event type"), {target: {value: "other"}});
  expect(screen.getByLabelText("Specify event type")).toBeRequired();
});

it("shows invalid customer details and guest counts before submitting", () => {
  render(<WalkInForm packages={[]} />);
  const name = screen.getByLabelText("Full name");
  const guests = screen.getByLabelText("Expected guests (where applicable)");
  fireEvent.change(name, {target: {value: "Sophia 123"}});
  fireEvent.blur(name);
  expect(name).toHaveAccessibleDescription("Enter a name using letters only.");
  const phone = screen.getByLabelText("Contact number");
  fireEvent.change(phone, {target: {value: "08123456789"}});
  fireEvent.blur(phone);
  expect(phone).toHaveAccessibleDescription("Enter an 11-digit mobile number starting with 09.");
  const email = screen.getByLabelText("Email (optional)");
  fireEvent.change(email, {target: {value: "sophia.com"}});
  fireEvent.blur(email);
  expect(email).toHaveAccessibleDescription("Please enter a valid email address");
  fireEvent.change(guests, {target: {value: "100001"}});
  fireEvent.submit(screen.getByRole("button", {name: "Save & Confirm Booking"}).closest("form")!);
  expect(guests).toHaveAccessibleDescription("Enter a whole number from 1 to 100,000.");
  expect(actions.saveWalkIn).not.toHaveBeenCalled();
});

it("returns to the walk-in list with the saved reference", async () => {
  const reference = "abcdefghijklmnopqrst";
  actions.saveWalkIn.mockResolvedValueOnce({message: "Walk-in booking recorded successfully.", reference});
  const tomorrow = new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString().slice(0, 10);
  render(<WalkInForm packages={[]} />);
  fireEvent.change(screen.getByLabelText("Service selection"), {target: {value: "custom"}});
  for (const [label, value] of [
    ["Full name", "Sample Customer"], ["Contact number", "09123456789"],
    ["Event type", "Birthday"], ["Event date", tomorrow], ["Event Start Time", "09:00"],
    ["Event End Time", "12:00"], ["Venue name", "Sample Hall"], ["Complete venue address", "Ormoc City"],
    ["Service name", "Catering"], ["Date of agreement", "2025-01-01"], ["Time of agreement", "10:00"],
  ]) {
    fireEvent.change(screen.getByLabelText(label), {target: {value}});
  }
  for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
  await screen.findByText("Available (1 slot free)");
  fireEvent.submit(screen.getByRole("button", {name: "Save & Confirm Booking"}).closest("form")!);
  await waitFor(() => expect(actions.push).toHaveBeenCalledWith(`/provider/bookings/walk-in?saved=${reference}`));
});

it("shows guests and inclusions without description text and supports switching to a custom service", () => {
  render(<WalkInForm packages={[
    {id: "wedding", kind: "packages", name: "Wedding catering", category: "catering_service",
      description: "Wedding buffet", inclusions: ["Rice and entrées"], publishedPriceCentavos: 1500000,
      pricingModel: "per_bundle", minimumGuests: 40, maximumGuests: 100, freelanceDetails: null,
      options: [
        {id: "drop_off", label: "Drop-off", priceCentavos: 1500000, inclusions: []},
        {id: "full_service", label: "Full service", priceCentavos: 2000000, inclusions: ["Buffet staff"]},
      ]},
    {id: "photos", kind: "addons", name: "Wedding photography", category: "photographer",
      description: "Wedding coverage", inclusions: [], publishedPriceCentavos: 800000,
      pricingModel: "fixed", minimumGuests: null, maximumGuests: null, options: [],
      freelanceDetails: {coverageMinutes: 240, deliverables: [
        {id: "gallery", name: "Edited gallery", min: 2, max: 3, unit: "weeks", method: "gallery"},
      ], collaboration: "", collaborationNotes: "", addOns: [], travelZones: []}},
  ]} />);
  const select = screen.getByLabelText("Service selection");
  expect(screen.getAllByRole("option").at(-1)).toHaveTextContent("+ Custom Walk-In Service");
  fireEvent.change(select, {target: {value: "packages/wedding"}});
  expect(screen.queryByText("Wedding buffet")).not.toBeInTheDocument();
  expect(screen.getByText("Minimum guests: 40 · Maximum guests: 100")).toBeVisible();
  expect(screen.getByText("Rice and entrées")).toBeVisible();
  expect(screen.queryByRole("option", {name: /Enter an agreed amount instead/i})).not.toBeInTheDocument();
  expect(screen.getByLabelText("Pricing option")).toHaveValue("drop_off");
  expect(screen.getByLabelText("Estimated Drop-Off Time")).toBeVisible();
  expect(screen.getByText(/Delivery window for your event location/i)).toBeVisible();
  expect(screen.getByLabelText("to")).toBeVisible();
  expect(screen.queryByLabelText("Event End Time")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Agreed price in/)).not.toBeRequired();
  expect(screen.getByLabelText(/Agreed price in/)).toHaveValue("15000.00");
  fireEvent.change(screen.getByLabelText("Pricing option"), {target: {value: "full_service"}});
  const price = screen.getByLabelText(/Agreed price in/);
  expect(price).toHaveValue("20000.00");
  expect(screen.getByLabelText("Event Start Time")).toBeVisible();
  expect(screen.getByLabelText("Event End Time")).toBeVisible();
  expect(screen.getByText("Buffet staff")).toBeVisible();
  fireEvent.change(price, {target: {value: "18500"}});
  expect(price).toHaveValue("18500");
  fireEvent.change(select, {target: {value: "addons/photos"}});
  expect(screen.queryByText("Wedding buffet")).not.toBeInTheDocument();
  expect(screen.getByText("Coverage: 240 minutes")).toBeVisible();
  expect(screen.getByLabelText(/Agreed price in/)).toHaveValue("8000.00");
  fireEvent.change(select, {target: {value: "custom"}});
  expect(screen.getByLabelText("Service name")).toBeRequired();
  expect(screen.getByLabelText("Service description (optional)")).toBeVisible();
  expect(screen.getByLabelText(/Agreed price in/)).toHaveValue("");
});

it("checks the event date supplied from the calendar", async () => {
  const date = eventDate(1);
  render(<WalkInForm packages={[]} initialEventDate={date} />);
  expect(screen.getByLabelText("Event date")).toHaveValue(date);
  expect(await screen.findByText("Available (1 slot free)")).toBeVisible();
  expect(actions.checkWalkInDayAction).toHaveBeenCalledWith(date);
});
