import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {isProviderPubliclyEligible, USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireObject, requireString} from "../shared/validation.js";
import {
  AVAILABILITY_COUNTED_REQUEST_STATUSES, manilaDateFromKey, manilaDateKey,
  providerRequestOccupiesAvailability, validateProviderAvailability,
} from "./validate-provider-availability.js";

export type CalendarState = "booked" | "on_hold" | "unavailable";
const MAX_RECORDS = 1000;

export function parseCalendarInput(value: unknown, now = new Date()) {
  const input = requireObject(value);
  const providerId = requireString(input.providerId, "providerId", {minLength: 8, maxLength: 160});
  const month = requireString(input.month, "month", {minLength: 7, maxLength: 7});
  const current = manilaDateKey(now).slice(0, 7);
  const monthNumber = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5));
  if (Object.keys(input).some((key) => !["providerId", "month"].includes(key)) ||
    !/^[A-Za-z0-9_-]{8,160}$/u.test(providerId) || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(month) ||
    monthNumber(month) < monthNumber(current) || monthNumber(month) > monthNumber(current) + 24) {
    throw new HttpsError("invalid-argument", "Choose a month within the next 24 months.");
  }
  return {providerId, month};
}

export function buildCalendarDates(month: string, providerData: Record<string, unknown>,
  records: readonly Record<string, unknown>[], now: Date) {
  const dates: Array<{date: string; state: CalendarState}> = [];
  for (let day = 1; day <= 31; day++) {
    const key = `${month}-${String(day).padStart(2, "0")}`;
    const date = manilaDateFromKey(key);
    if (!date) break;
    const occupied = records.filter((record) => {
      const eventDate = record.eventDate instanceof Date ? record.eventDate :
        (record.eventDate as {toDate?: () => Date} | undefined)?.toDate?.();
      return eventDate && manilaDateKey(eventDate) === key &&
        providerRequestOccupiesAvailability({...record, status: record.status, now});
    });
    const schedule = validateProviderAvailability({providerData, now, existingBookings: [],
      request: {providerRequestId: "calendar", type: "catering", eventDate: date,
        eventTime: "12:00", eventEndTime: "13:00", guestCount: 1, services: []}});
    const unavailable = key < manilaDateKey(now) || schedule.issues.some((issue) =>
      ["PROVIDER_NOT_OPERATIONAL", "PROVIDER_SCHEDULE_INVALID", "OUTSIDE_OPERATING_DAY",
        "BLOCKED_DATE", "LEAD_TIME_NOT_MET"].includes(issue.code));
    const state: CalendarState | null = occupied.some((record) =>
      ["confirmed", "in_progress", "completed"].includes(String(record.status))) ? "booked" :
      occupied.length ? "on_hold" : unavailable ? "unavailable" : null;
    if (state) dates.push({date: key, state});
  }
  return dates;
}

export const getCustomerProviderCalendarAvailability = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 30}, async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.customer]);
    await enforceCallableRateLimit(request, {scope: "providerAvailability.customerCalendar", limit: 60, windowSeconds: 600});
    const now = new Date();
    const {providerId, month} = parseCalendarInput(request.data, now);
    return getCustomerProviderCalendarForInput({providerId, month}, now);
  },
);

export async function getCustomerProviderCalendarForInput(
  {providerId, month}: {providerId: string; month: string}, now = new Date(),
) {
  const provider = await db.collection("providers").doc(providerId).get();
  const data = provider.data() ?? {};
  const ownerId = typeof data.ownerId === "string" && /^[A-Za-z0-9_-]{8,160}$/u.test(data.ownerId) ? data.ownerId : null;
  const owner = ownerId ? await db.collection("users").doc(ownerId).get() : null;
  if (!provider.exists || !isProviderPubliclyEligible({...data, id: providerId}, owner?.data() ?? {})) {
    throw new HttpsError("failed-precondition", "Provider unavailable.");
  }
  const start = manilaDateFromKey(`${month}-01`)!;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1));
  const end = manilaDateFromKey(next.toISOString().slice(0, 10))!;
  const snapshot = await db.collection("providerRequests")
    .where("providerId", "==", providerId)
    .where("status", "in", [...AVAILABILITY_COUNTED_REQUEST_STATUSES])
    .where("eventDate", ">=", Timestamp.fromDate(start))
    .where("eventDate", "<", Timestamp.fromDate(end))
    .limit(MAX_RECORDS + 1).get();
  if (snapshot.size > MAX_RECORDS) throw new HttpsError("resource-exhausted", "Calendar unavailable. Please try again later.");
  return {month, dates: buildCalendarDates(month, data, snapshot.docs.map((doc) => doc.data()), now)};
}
