import {HttpsError} from "firebase-functions/v2/https";
import {requireBookingPaymentPolicySnapshot} from "../bookings/booking-payment-eligibility-policy.js";
import {scheduledEventStart} from "./canonical-balance-timing.js";
import type {PackagePaymentTermsSnapshot} from "./package-payment-terms.js";
import type {CustomerPaymentChoice} from "./payment-obligation.js";

export type InitialPaymentEligibility<T> = {
  evaluatedAt: T;
  eventStartAt: T;
  depositAllowed: boolean;
  depositMinimumNoticeHours: number | null;
  depositEligible: boolean;
  mode: "minimum_or_full" | "full_only";
  reason: "deposit_eligible" | "package_full_payment" | "deposit_disabled" | "short_notice";
};

export function evaluateInitialPaymentEligibility(input: {
  eventDate: Date; eventTime: string; acceptanceTime: Date;
  packagePaymentTerms: PackagePaymentTermsSnapshot | null;
  bookingPaymentPolicySnapshot: unknown;
}): InitialPaymentEligibility<Date> {
  const eventStartAt = scheduledEventStart(input.eventDate, input.eventTime);
  if (!Number.isFinite(input.acceptanceTime.getTime())) throw invalidEligibility();
  const policy = input.bookingPaymentPolicySnapshot == null ? null :
    requireBookingPaymentPolicySnapshot(input.bookingPaymentPolicySnapshot);
  const depositPackage = input.packagePaymentTerms?.paymentPolicy === "deposit_then_balance";
  if (depositPackage && !policy) throw invalidEligibility();
  const depositAllowed = policy?.depositAllowed ?? false;
  const depositMinimumNoticeHours = policy?.depositMinimumNoticeHours ?? null;
  const reason = !depositPackage ? "package_full_payment" : !depositAllowed ? "deposit_disabled" :
    eventStartAt.getTime() - input.acceptanceTime.getTime() >= depositMinimumNoticeHours! * 60 * 60 * 1000
      ? "deposit_eligible" : "short_notice";
  return {
    evaluatedAt: new Date(input.acceptanceTime), eventStartAt, depositAllowed, depositMinimumNoticeHours,
    depositEligible: reason === "deposit_eligible",
    mode: reason === "deposit_eligible" ? "minimum_or_full" : "full_only", reason,
  };
}

/** Never re-evaluate against the checkout clock or mutable current policy. */
export function enforceInitialPaymentEligibility(
  request: Readonly<Record<string, unknown>>, choice: CustomerPaymentChoice,
): void {
  if (choice === "remaining_balance") return;
  if (request.initialPaymentEligibilitySchemaVersion == null && request.initialPaymentEligibility == null &&
    request.bookingPaymentPolicySnapshot == null) return; // Legacy accepted requests.
  const data = request.initialPaymentEligibility as InitialPaymentEligibility<{toDate?: () => Date}> | null;
  if (request.initialPaymentEligibilitySchemaVersion !== 1 || !data ||
    !["minimum_or_full", "full_only"].includes(data.mode) ||
    data.depositEligible !== (data.mode === "minimum_or_full") ||
    typeof data.depositAllowed !== "boolean" ||
    !["deposit_eligible", "package_full_payment", "deposit_disabled", "short_notice"].includes(data.reason)) {
    throw invalidEligibility();
  }
  const date = (value: {toDate?: () => Date} | null): Date | null => {
    try { return typeof value?.toDate === "function" ? value.toDate() : null; }
    catch { return null; }
  };
  const evaluatedAt = date(data.evaluatedAt);
  const eventStartAt = date(data.eventStartAt);
  if (!(evaluatedAt instanceof Date) || !(eventStartAt instanceof Date) ||
    !Number.isFinite(evaluatedAt.getTime()) || !Number.isFinite(eventStartAt.getTime())) throw invalidEligibility();
  if (data.reason !== "package_full_payment") {
    const policy = requireBookingPaymentPolicySnapshot(request.bookingPaymentPolicySnapshot);
    if (data.depositAllowed !== policy.depositAllowed || data.depositMinimumNoticeHours !== policy.depositMinimumNoticeHours) {
      throw invalidEligibility();
    }
    const eligible = policy.depositAllowed && eventStartAt.getTime() - evaluatedAt.getTime() >=
      policy.depositMinimumNoticeHours * 60 * 60 * 1000;
    const reason = !policy.depositAllowed ? "deposit_disabled" : eligible ? "deposit_eligible" : "short_notice";
    if (data.depositEligible !== eligible || data.reason !== reason) throw invalidEligibility();
  } else if (data.mode !== "full_only") throw invalidEligibility();
  if (choice === "minimum" && data.mode === "full_only") {
    throw new HttpsError("failed-precondition", "The deposit option is not available for this booking. Choose full payment.",
      {reason: data.reason === "short_notice" ? "deposit_not_available_for_short_notice_booking" : "deposit_not_available_for_booking"});
  }
}

function invalidEligibility(): HttpsError {
  return new HttpsError("failed-precondition", "The frozen initial-payment eligibility is invalid or unavailable.",
    {reason: "initial_payment_eligibility_invalid"});
}
