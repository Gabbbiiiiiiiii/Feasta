/** Immutable new-booking contract. Legacy v1/v2 contracts never pass this parser. */
export const BOOKING_POLICY_SCHEMA_VERSION = 3;
export const PAYMENT_DEFAULT_RATES = Object.freeze({
  customerRefundRateBps: 7000,
  providerReservationCompRateBps: 2000,
  feastaCancellationFeeRateBps: 1000,
});
const HOUR_MS = 3_600_000;

export const BOOKING_LIFECYCLE_POLICY_V3 = Object.freeze({schemaVersion: 3,
  preparationLeadTimeHours: 24, providerStartsManually: false, requiresFullPayment: true,
  autoStartAtScheduledTime: true, providerConfirmsCompletion: true});

export function bookingPolicyV3Evidence<T>(eventStartAt: Date, timestamp: (date: Date) => T) {
  const timing = bookingPolicyTimingV3(eventStartAt);
  return {remainingBalanceTimingSchemaVersion: 3, bookingLifecyclePolicySnapshot: {...BOOKING_LIFECYCLE_POLICY_V3},
    eventStartAt: timestamp(timing.eventStartAt), depositEligibilityCutoffAt: timestamp(timing.depositEligibilityCutoffAt),
    remainingBalanceDueAt: timestamp(timing.remainingBalanceDueAt), hardPaymentDeadlineAt: timestamp(timing.hardPaymentDeadlineAt),
    preparationStartsAt: timestamp(timing.preparationStartsAt), lifecycleNextTransitionAt: timestamp(timing.preparationStartsAt),
    remainingBalanceNextCheckAt: timestamp(timing.remainingBalanceDueAt), balanceDueHoursBeforeEvent: 48,
    balanceDueDaysBeforeEvent: null, remainingBalanceReminderAt: null, remainingBalanceGraceEndsAt: timestamp(timing.hardPaymentDeadlineAt),
    remainingBalanceDueSoonWindowDays: null, remainingBalanceGracePeriodDays: null};
}

export function bookingPolicyTimingV3(eventStartAt: Date) {
  requireDate(eventStartAt);
  const before = (hours: number) => new Date(eventStartAt.getTime() - hours * HOUR_MS);
  return {
    eventStartAt: new Date(eventStartAt), depositEligibilityCutoffAt: before(72),
    remainingBalanceDueAt: before(48), hardPaymentDeadlineAt: before(24),
    preparationStartsAt: before(24),
  };
}

/** Floors customer/provider shares; the fee receives the residual centavo(s). */
export function paymentDefaultAllocation(paidDepositInCentavos: number) {
  if (!Number.isSafeInteger(paidDepositInCentavos) || paidDepositInCentavos <= 0) {
    throw new Error("Payment-default allocation requires a positive settled deposit.");
  }
  const basis = BigInt(paidDepositInCentavos);
  const customerDefaultRefundAmountInCentavos = Number(basis * 7000n / 10000n);
  const providerReservationCompAmountInCentavos = Number(basis * 2000n / 10000n);
  const feastaCancellationFeeAmountInCentavos = paidDepositInCentavos -
    customerDefaultRefundAmountInCentavos - providerReservationCompAmountInCentavos;
  return {schemaVersion: 1, paidDepositInCentavos, ...PAYMENT_DEFAULT_RATES,
    customerDefaultRefundAmountInCentavos, providerReservationCompAmountInCentavos,
    feastaCancellationFeeAmountInCentavos};
}

export function frozenBookingPolicyTimingV3(request: Readonly<Record<string, unknown>>) {
  if (request.remainingBalanceTimingSchemaVersion !== 3) throw new Error("Booking timing version is invalid.");
  if (request.balanceDueHoursBeforeEvent !== 48 ||
    request.balanceDueDaysBeforeEvent != null || request.remainingBalanceReminderAt != null ||
    request.remainingBalanceDueSoonWindowDays != null || request.remainingBalanceGracePeriodDays != null) {
    throw new Error("Mixed historical booking timing is invalid.");
  }
  if (request.bookingLifecyclePolicySnapshot != null) {
    const policy = request.bookingLifecyclePolicySnapshot as Record<string, unknown>;
    if (Object.keys(policy).length !== Object.keys(BOOKING_LIFECYCLE_POLICY_V3).length ||
      Object.entries(BOOKING_LIFECYCLE_POLICY_V3).some(([key, value]) => policy[key] !== value)) {
      throw new Error("Booking lifecycle policy is invalid.");
    }
  } else throw new Error("Booking lifecycle policy is missing.");
  const stored = (value: unknown): Date => {
    let result: unknown;
    try { result = (value as {toDate?: () => Date} | null)?.toDate?.(); } catch { /* fail closed */ }
    requireDate(result);
    return result;
  };
  const expected = bookingPolicyTimingV3(stored(request.eventStartAt));
  for (const key of ["depositEligibilityCutoffAt", "remainingBalanceDueAt", "hardPaymentDeadlineAt",
    "preparationStartsAt"] as const) {
    if (stored(request[key]).getTime() !== expected[key].getTime()) {
      throw new Error(`Frozen ${key} is invalid.`);
    }
  }
  if (stored(request.remainingBalanceGraceEndsAt).getTime() !== expected.hardPaymentDeadlineAt.getTime()) {
    throw new Error("Frozen grace deadline is invalid.");
  }
  return expected;
}

export function balanceStatusV3(input: {
  now: Date; remainingBalanceDueAt: Date; hardPaymentDeadlineAt: Date;
  outstandingAmountInCentavos: number; paymentConfirmationHold?: boolean; cancelled?: boolean;
}) {
  requireDate(input.now); requireDate(input.remainingBalanceDueAt); requireDate(input.hardPaymentDeadlineAt);
  if (input.hardPaymentDeadlineAt.getTime() - input.remainingBalanceDueAt.getTime() !== 24 * HOUR_MS ||
    !Number.isSafeInteger(input.outstandingAmountInCentavos) || input.outstandingAmountInCentavos < 0) {
    throw new Error("Balance timing/amount is invalid.");
  }
  if (input.cancelled) return "cancelled";
  if (input.outstandingAmountInCentavos === 0) return "paid";
  if (input.now >= input.hardPaymentDeadlineAt) return input.paymentConfirmationHold ? "payment_confirmation_hold" : "overdue";
  if (input.now < input.remainingBalanceDueAt) return "not_due";
  return input.now.getTime() === input.remainingBalanceDueAt.getTime() ? "due" : "grace_period";
}

export function effectiveBookingStageV3(input: {
  request: Readonly<Record<string, unknown>>; now: Date;
}): "upcoming" | "preparation_started" | "service_started" | "blocked" | "cancelled" | "completed" {
  requireDate(input.now);
  const request = input.request;
  const timing = frozenBookingPolicyTimingV3(request);
  if (request.status === "cancelled") return "cancelled";
  if (request.status === "completed") return "completed";
  const enforcement = request.remainingBalanceEnforcement as {status?: unknown} | null;
  const eligibility = request.refundEligibilityState as {activeCancellationRequestId?: unknown} | null;
  if (!["confirmed", "in_progress"].includes(String(request.status)) ||
    request.settlementStatus !== "fully_settled" || request.outstandingAmountInCentavos !== 0 ||
    request.approvedCancellationRequestId != null || request.activeCancellationRequestId != null ||
    request.refundExecutionLock != null || request.reconciliationRequired === true ||
    eligibility?.activeCancellationRequestId != null ||
    (request.remainingBalanceEnforcementSchemaVersion != null &&
      (request.remainingBalanceEnforcementSchemaVersion !== 1 || enforcement == null)) ||
    (enforcement != null && enforcement.status !== "clear")) return "blocked";
  if (input.now >= timing.eventStartAt) return "service_started";
  if (input.now >= timing.preparationStartsAt) return "preparation_started";
  return "upcoming";
}

function requireDate(value: unknown): asserts value is Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("Booking time is invalid.");
}
