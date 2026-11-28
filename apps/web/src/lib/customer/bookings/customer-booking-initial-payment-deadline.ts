import type {CustomerBookingProviderRequest} from "./customer-booking-types";

/** Validate frozen evidence only; never calculate or renew a deadline. */
export function projectInitialPaymentDeadline(evidence: {
  version: unknown; deadline: string | null; accepted: string | null;
  eventStart: string | null; expires: string | null; hasExpires: boolean;
}): string | null {
  const {version, deadline, accepted, eventStart, expires, hasExpires} = evidence;
  if (version !== 4 || !deadline || !accepted || !eventStart) return null;
  const [end, start, event] = [deadline, accepted, eventStart].map(Date.parse);
  if (![end, start, event].every(Number.isFinite) || end <= start || end > event ||
    (hasExpires && (!expires || Date.parse(expires) !== end))) return null;
  return new Date(end).toISOString();
}

export function initialPaymentReminderDeadline(request: CustomerBookingProviderRequest): string | null {
  if (request.status !== "waiting_for_down_payment" || !["unpaid", "pending", "failed", "expired"].includes(request.paymentStatus) ||
    request.paidAt || request.lifecycle?.initialPaymentReview || request.lifecycle?.initialPaymentExpired ||
    (request.grossSettledAmountInCentavos ?? 0) > 0) return null;
  return request.initialPaymentDeadlineAt ?? null;
}
