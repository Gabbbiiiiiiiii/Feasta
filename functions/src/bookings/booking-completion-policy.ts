import {scheduledEventStart} from "../payments/canonical-balance-timing.js";
import {frozenBookingPolicyTimingV3} from "./booking-policy-v3.js";

/** Existing booking calendar/clock snapshots remain unchanged. Overnight services retain their existing next-day convention. */
export function trustedScheduledEventEnd(request: Readonly<Record<string, unknown>>, parent?: Readonly<Record<string, unknown>>): Date {
  const date = (request.eventDate as {toDate?: () => Date} | null)?.toDate?.();
  if (!(date instanceof Date)) throw new Error("Scheduled event date is unavailable.");
  const start = scheduledEventStart(date, request.eventTime);
  let end = scheduledEventStart(date, request.eventEndTime);
  if (end <= start) end = new Date(end.getTime() + 86_400_000);
  if (request.remainingBalanceTimingSchemaVersion === 3 && frozenBookingPolicyTimingV3(request).eventStartAt.getTime() !== start.getTime()) {
    throw new Error("Scheduled event start evidence disagrees.");
  }
  if (parent) {
    const parentDate = (parent.eventDate as {toDate?: () => Date} | null)?.toDate?.();
    if (!(parentDate instanceof Date) || parentDate.getTime() !== date.getTime() ||
      parent.eventTime !== request.eventTime || parent.eventEndTime !== request.eventEndTime) {
      throw new Error("Scheduled event evidence disagrees with the main event.");
    }
  }
  return end;
}

export function automaticCompletionAt(request: Readonly<Record<string, unknown>>): Date {
  return new Date(trustedScheduledEventEnd(request).getTime() + 24 * 3_600_000);
}
