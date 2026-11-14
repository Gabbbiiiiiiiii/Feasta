import type {RemainingBalanceSchedule} from "./remaining-balance-domain.js";
import {frozenBookingPolicyTimingV3} from "../bookings/booking-policy-v3.js";

export const BALANCE_DUE_HOURS_BEFORE_EVENT = 24;
export const BALANCE_REMINDER_HOURS_BEFORE_DUE = 24;
const HOUR_MS = 60 * 60 * 1000;

/** Deadline authority is explicit. V2's due date remains its historical deadline. */
export function remainingBalanceHardDeadline(request: Readonly<Record<string, unknown>>): Date {
  switch (request.remainingBalanceTimingSchemaVersion) {
  case 3: return frozenBookingPolicyTimingV3(request).hardPaymentDeadlineAt;
  case 2: return frozenCanonicalBalanceTiming(request).dueAt;
  default: throw new Error("Canonical remaining-balance timing version is invalid.");
  }
}

/** Resolve the authoritative event calendar and clock in FEASTA's timezone. */
export function scheduledEventStart(eventDate: Date, eventTime: unknown): Date {
  if (!Number.isFinite(eventDate.getTime()) || typeof eventTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(eventTime)) {
    throw new Error("Scheduled event date/time is invalid.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(eventDate);
  const part = (key: string) => parts.find((item) => item.type === key)?.value;
  return new Date(`${part("year")}-${part("month")}-${part("day")}T${eventTime}:00+08:00`);
}

export function canonicalBalanceTiming(eventDate: Date, eventTime: unknown) {
  const eventStartAt = scheduledEventStart(eventDate, eventTime);
  const dueAt = new Date(eventStartAt.getTime() - BALANCE_DUE_HOURS_BEFORE_EVENT * HOUR_MS);
  const reminderAt = new Date(dueAt.getTime() - BALANCE_REMINDER_HOURS_BEFORE_DUE * HOUR_MS);
  return {eventStartAt, dueAt, reminderAt};
}

/** Frozen timestamps are authority; package or policy edits never move them. */
export function frozenCanonicalBalanceTiming(request: Readonly<Record<string, unknown>>) {
  const date = (value: unknown): Date => {
    const result = (value as {toDate?: () => Date} | null)?.toDate?.();
    if (!(result instanceof Date) || !Number.isFinite(result.getTime())) {
      throw new Error("Remaining-balance timing snapshot is invalid.");
    }
    return result;
  };
  if (request.remainingBalanceTimingSchemaVersion !== 2 ||
    request.balanceDueHoursBeforeEvent !== BALANCE_DUE_HOURS_BEFORE_EVENT) {
    throw new Error("Remaining-balance timing version is invalid.");
  }
  const dueAt = date(request.remainingBalanceDueAt);
  const reminderAt = date(request.remainingBalanceReminderAt);
  const eventStartAt = date(request.eventStartAt);
  if (eventStartAt.getTime() - dueAt.getTime() !== BALANCE_DUE_HOURS_BEFORE_EVENT * HOUR_MS) {
    throw new Error("Remaining-balance deadline snapshot is invalid.");
  }
  if (dueAt.getTime() - reminderAt.getTime() !== BALANCE_REMINDER_HOURS_BEFORE_DUE * HOUR_MS) {
    throw new Error("Remaining-balance reminder snapshot is invalid.");
  }
  return {dueAt, reminderAt};
}

export function canonicalBalanceSchedule(input: {
  dueAt: Date; reminderAt: Date; remainingAmountInCentavos: number; now: Date;
}): RemainingBalanceSchedule {
  if (!Number.isSafeInteger(input.remainingAmountInCentavos) || input.remainingAmountInCentavos < 0 ||
    !Number.isFinite(input.now.getTime())) throw new Error("Remaining-balance schedule is invalid.");
  return {
    status: input.remainingAmountInCentavos === 0 ? "paid" :
      input.now >= input.dueAt ? "due" : input.now >= input.reminderAt ? "due_soon" : "not_due",
    remainingAmountInCentavos: input.remainingAmountInCentavos,
    dueAt: input.dueAt, graceEndsAt: null, eventStartsOn: "",
  };
}

export function balanceDeadlineMessage(amountInCentavos: number, dueAt: Date): string {
  const amount = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(amountInCentavos / 100);
  const deadline = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(dueAt);
  return `Your remaining balance of ${amount} is due on ${deadline} (Asia/Manila).`;
}
