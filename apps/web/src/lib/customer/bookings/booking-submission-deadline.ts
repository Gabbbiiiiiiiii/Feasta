/**
 * Browser warning only.
 * The Firebase callable remains the authoritative deadline check.
 */
export const BOOKING_SUBMISSION_DEADLINE_NOTICE =
  "This event starts too soon to meet FEASTA's payment deadline (24 hours before the event). Choose a later event date or start time.";

export function bookingSubmissionDeadlineNotice(
  event: Readonly<{eventDate: string; eventTime: string}>,
  now: Date = new Date(),
): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(event.eventDate) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(event.eventTime)
  ) {
    return null;
  }

  // Customer event date/time uses the Philippines time zone.
  const eventStart = new Date(
    `${event.eventDate}T${event.eventTime}:00+08:00`,
  );

  if (
    !Number.isFinite(eventStart.getTime()) ||
    !Number.isFinite(now.getTime())
  ) {
    return null;
  }

  const deadline = eventStart.getTime() - 24 * 60 * 60 * 1000;

  return now.getTime() >= deadline
    ? BOOKING_SUBMISSION_DEADLINE_NOTICE
    : null;
}