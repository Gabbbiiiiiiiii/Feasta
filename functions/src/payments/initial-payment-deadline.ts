import {Timestamp} from "firebase-admin/firestore";
import {scheduledEventStart, remainingBalanceHardDeadline} from "./canonical-balance-timing.js";

export const HISTORICAL_INITIAL_PAYMENT_HOLD_MS = 24 * 3_600_000;
export const INITIAL_PAYMENT_DEADLINE_POLICY_VERSION = 4;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MANILA_OFFSET_MS = 8 * HOUR_MS;

/** Asia/Manila is UTC+08:00 year-round. UTC accessors avoid host timezone dependence. */
export function calculateInitialPaymentDeadlineV4(input: {
  acceptedAt: Date; eventStartAt: Date; hardDeadlines?: readonly Date[];
}): Date {
  const accepted = input.acceptedAt.getTime();
  const event = input.eventStartAt.getTime();
  const hard = (input.hardDeadlines ?? []).map(date => date.getTime());
  if (![accepted, event, ...hard].every(Number.isFinite)) throw new Error("Invalid payment timing.");
  const base = accepted + (event - accepted <= 168 * HOUR_MS ? 2 : 6) * HOUR_MS;
  const protectedUntil = (instant: number): number | null => {
    const hour = new Date(instant + MANILA_OFFSET_MS).getUTCHours();
    if (hour >= 7 && hour < 22) return null;
    return Math.floor((instant + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS +
      (hour >= 22 ? DAY_MS : 0) + 10 * HOUR_MS - MANILA_OFFSET_MS;
  };
  const candidate = protectedUntil(accepted) ?? protectedUntil(base) ?? base;
  const deadline = Math.min(candidate, event, ...hard);
  if (deadline <= accepted) throw new Error("Initial payment window is not positive.");
  return new Date(deadline);
}

/** Original frozen boundaries only. No mutable package settings or renewal clock. */
export function originalInitialPaymentDeadline(request: Readonly<Record<string, unknown>>): Timestamp {
  if (!(request.acceptedAt instanceof Timestamp) || !(request.eventDate instanceof Timestamp)) {
    throw new Error("Initial payment timing evidence is missing.");
  }
  const accepted = request.acceptedAt.toMillis();
  if (request.remainingBalanceTimingSchemaVersion != null &&
    ![1, 2, 3].includes(request.remainingBalanceTimingSchemaVersion as number)) {
    throw new Error("Initial payment timing version is unsupported.");
  }
  const eventStart = scheduledEventStart(request.eventDate.toDate(), request.eventTime).getTime();
  if (request.eventStartAt != null && (!(request.eventStartAt instanceof Timestamp) ||
    request.eventStartAt.toMillis() !== eventStart)) throw new Error("Event timing evidence conflicts.");
  const optional = (value: unknown): number => {
    if (value == null) return Infinity;
    if (!(value instanceof Timestamp)) throw new Error("Initial payment deadline is invalid.");
    return value.toMillis();
  };
  const canonical = [2, 3].includes(Number(request.remainingBalanceTimingSchemaVersion))
    ? remainingBalanceHardDeadline(request).getTime() : Infinity;
  if (request.initialPaymentDeadlinePolicyVersion != null && request.initialPaymentDeadlinePolicyVersion !== 4) {
    throw new Error("Initial payment policy is unsupported.");
  }
  if (request.initialPaymentDeadlinePolicyVersion === 4) {
    const expected = calculateInitialPaymentDeadlineV4({acceptedAt: new Date(accepted), eventStartAt: new Date(eventStart),
      hardDeadlines: [canonical, optional(request.hardPaymentDeadlineAt)].filter(value => value !== Infinity).map(value => new Date(value))});
    if (!(request.initialPaymentDeadlineAt instanceof Timestamp) || request.initialPaymentDeadlineAt.toMillis() !== expected.getTime() ||
      !(request.eventStartAt instanceof Timestamp) || (request.expiresAt != null && optional(request.expiresAt) !== expected.getTime())) {
      throw new Error("Frozen initial payment evidence conflicts.");
    }
    return Timestamp.fromDate(expected);
  }
  const deadline = Math.min(accepted + HISTORICAL_INITIAL_PAYMENT_HOLD_MS, eventStart,
    optional(request.expiresAt), optional(request.hardPaymentDeadlineAt), canonical);
  if (!Number.isFinite(deadline) || deadline <= accepted) throw new Error("Initial payment timing contradicts acceptance.");
  return Timestamp.fromMillis(deadline);
}
