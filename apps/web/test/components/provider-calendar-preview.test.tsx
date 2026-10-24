import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {ProviderCalendarClient} from "@/app/provider/calendar/provider-calendar-client";
import type {ProviderCalendarData, ProviderCalendarEvent} from "@/lib/provider/calendar/provider-calendar-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn(), refresh: vi.fn()}),
}));
vi.mock("@/lib/provider/calendar/provider-calendar-client", () => ({
  updateProviderAvailability: vi.fn(),
}));

function event(overrides?: Partial<ProviderCalendarEvent>): ProviderCalendarEvent {
  return {
    id: "booking-1",
    mainEventId: "main-1",
    customer: {name: "Ana Reyes"},
    event: {
      eventType: "birthday",
      eventDate: "2026-10-21",
      eventTime: "15:00",
      eventEndTime: "20:30",
      guestCount: 100,
      venueAddress: "Ormoc Convention Center",
      city: "Ormoc City",
    },
    packageName: "Gold Celebration",
    status: "completed",
    ...overrides,
  };
}

function data(events: ProviderCalendarEvent[] = [event()]): ProviderCalendarData {
  return {
    month: "2026-10",
    providerId: "provider-1",
    settings: {
      operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      bookingLeadTimeDays: 0,
      unavailableDates: [],
      acceptsMultipleEventsPerDay: false,
      maxEventsPerDay: 1,
    },
    events,
  };
}

describe("provider calendar quick preview", () => {
  it("shows the essential overview on mouse hover without package or guests", () => {
    render(<ProviderCalendarClient initialData={data()} />);
    const date = screen.getByRole("button", {name: /2026-10-21/i});
    fireEvent.pointerEnter(date, {pointerType: "mouse"});
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText("Ana Reyes")).toBeInTheDocument();
    expect(within(tip).getByText("3:00 PM – 8:30 PM")).toBeInTheDocument();
    expect(within(tip).getByText("Ormoc Convention Center, Ormoc City")).toBeInTheDocument();
    expect(within(tip).queryByText("Gold Celebration")).not.toBeInTheDocument();
    expect(within(tip).queryByText("100 guests")).not.toBeInTheDocument();
    fireEvent.pointerLeave(date, {pointerType: "mouse"});
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens the complete panel on date selection and closes the bubble", () => {
    render(<ProviderCalendarClient initialData={data()} />);
    const date = screen.getByRole("button", {name: /2026-10-21/i});
    fireEvent.pointerEnter(date, {pointerType: "mouse"});
    fireEvent.click(date);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByText("Gold Celebration")).toBeInTheDocument();
    expect(screen.getByText("100 guests")).toBeInTheDocument();
    expect(screen.getByText("8:30 PM")).toBeInTheDocument();
    expect(date).toHaveAttribute("aria-pressed", "true");
  });

  it("shows clear missing-value fallbacks without invented end times", () => {
    const incomplete = event({
      event: {...event().event, eventEndTime: null, venueAddress: null, city: null},
      packageName: null,
    });
    render(<ProviderCalendarClient initialData={data([incomplete])} />);
    const date = screen.getByRole("button", {name: /2026-10-21/i});
    fireEvent.pointerEnter(date, {pointerType: "mouse"});
    expect(screen.getByRole("tooltip")).toHaveTextContent("End not provided");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Venue not provided");
    fireEvent.click(date);
    expect(screen.getByText("Package not provided")).toBeInTheDocument();
    expect(screen.getByText("Not provided")).toBeInTheDocument();
  });

  it("supports multiple events and Escape dismissal", () => {
    const second = event({
      id: "booking-2",
      customer: {name: "Maria Cruz"},
    });
    render(<ProviderCalendarClient initialData={data([event(), second])} />);
    const date = screen.getByRole("button", {name: /2026-10-21/i});
    fireEvent.pointerEnter(date, {pointerType: "mouse"});
    expect(within(screen.getByRole("tooltip")).getByText("Maria Cruz")).toBeInTheDocument();
    fireEvent.keyDown(date, {key: "Escape"});
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not display a mouse hover bubble for touch pointers or empty days", () => {
    render(<ProviderCalendarClient initialData={data()} />);
    fireEvent.pointerEnter(screen.getByRole("button", {name: /2026-10-21/i}), {pointerType: "touch"});
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByRole("button", {name: /2026-10-22/i}), {pointerType: "mouse"});
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
