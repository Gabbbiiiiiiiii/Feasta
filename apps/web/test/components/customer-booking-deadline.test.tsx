import {describe, expect, it} from "vitest";
import {bookingStatusLabel} from "@/components/customer/bookings/booking-formatters";
import {
  BOOKING_SUBMISSION_DEADLINE_NOTICE,
  bookingSubmissionDeadlineNotice,
} from "@/lib/customer/bookings/booking-submission-deadline";

const event = {
  eventDate: "2026-10-16",
  eventTime: "18:00",
};

const start = new Date("2026-10-16T18:00:00+08:00").getTime();
const deadline = start - 24 * 60 * 60 * 1000;

describe("FEASTA booking submission deadline", () => {
  it("allows T-72, T-48 and before T-24", () => {
    expect(
      bookingSubmissionDeadlineNotice(
        event,
        new Date(start - 72 * 3600000),
      ),
    ).toBeNull();

    expect(
      bookingSubmissionDeadlineNotice(
        event,
        new Date(start - 48 * 3600000),
      ),
    ).toBeNull();

    expect(
      bookingSubmissionDeadlineNotice(
        event,
        new Date(deadline - 1),
      ),
    ).toBeNull();
  });

  it("blocks exactly T-24 and later", () => {
    expect(
      bookingSubmissionDeadlineNotice(event, new Date(deadline)),
    ).toBe(BOOKING_SUBMISSION_DEADLINE_NOTICE);

    expect(
      bookingSubmissionDeadlineNotice(event, new Date(deadline + 1)),
    ).toBe(BOOKING_SUBMISSION_DEADLINE_NOTICE);
  });

  it("leaves incomplete form values to form validation", () => {
    expect(
      bookingSubmissionDeadlineNotice({
        eventDate: "",
        eventTime: "",
      }),
    ).toBeNull();
  });

  it("uses a customer-friendly declined label", () => {
    expect(
      bookingStatusLabel("needs_provider_replacement"),
    ).toBe("Provider rejected");
  });
});