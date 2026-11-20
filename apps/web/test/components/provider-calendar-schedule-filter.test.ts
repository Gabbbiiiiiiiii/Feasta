import {describe, expect, it} from "vitest";

import {isScheduledCalendarEvent} from "@/lib/provider/calendar/provider-calendar-types";

describe("provider calendar schedule filter", () => {
  const today = "2026-11-19";

  it("keeps present and upcoming scheduled bookings", () => {
    expect(isScheduledCalendarEvent({
      status: "confirmed",
      event: {eventDate: today},
    }, today)).toBe(true);
    expect(isScheduledCalendarEvent({
      status: "payment_processing",
      event: {eventDate: "2026-11-24"},
    }, today)).toBe(true);
  });

  it("hides past, cancelled, and expired bookings", () => {
    expect(isScheduledCalendarEvent({
      status: "confirmed",
      event: {eventDate: "2026-11-18"},
    }, today)).toBe(false);
    expect(isScheduledCalendarEvent({
      status: "cancelled",
      event: {eventDate: "2026-11-23"},
    }, today)).toBe(false);
    expect(isScheduledCalendarEvent({
      status: "expired",
      event: {eventDate: today},
    }, today)).toBe(false);
  });
});
