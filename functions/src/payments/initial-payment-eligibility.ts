import {HttpsError} from "firebase-functions/v2/https";
import {requireBookingPaymentPolicySnapshot} from "../bookings/booking-payment-eligibility-policy.js";
import {scheduledEventStart} from "./canonical-balance-timing.js";
import type {PackagePaymentTermsSnapshot} from "./package-payment-terms.js";
import type {CustomerPaymentChoice} from "./payment-obligation.js";
import {parseArrangedPaymentOffer} from "../provider-requests/arranged-payment-offer.js";

export type InitialPaymentEligibility<T> = {
  authorityTimeSource?: "booking_submission";
  submittedAt?: T;
  evaluatedAt: T;
  eventStartAt: T;
  depositAllowed: boolean;
  depositMinimumNoticeHours: number | null;
  depositEligible: boolean;
  mode: "minimum_or_full" | "minimum_only" | "full_only";
  reason: "deposit_eligible" | "package_full_payment" | "deposit_disabled" | "short_notice";
};

/** The caller supplies its once-captured server time, never browser input. */
export function evaluateSubmissionPaymentEligibility(input: {
  eventDate: Date; eventTime: string; submissionTime: Date;
  packagePaymentTerms: PackagePaymentTermsSnapshot | null;
  bookingPaymentPolicySnapshot: unknown;
}): InitialPaymentEligibility<Date> {
  const eligibility = evaluateInitialPaymentEligibility({...input, acceptanceTime: input.submissionTime});
  const depositMinimumNoticeHours = 72;
  const eligible = input.packagePaymentTerms?.paymentPolicy === "deposit_then_balance" &&
    eligibility.depositAllowed && eligibility.eventStartAt.getTime() - input.submissionTime.getTime() >=
    depositMinimumNoticeHours * 3_600_000;
  const mode = !eligible ? "full_only" :
    input.packagePaymentTerms?.fullPaymentAllowed === false ? "minimum_only" : "minimum_or_full";
  return {...eligibility, authorityTimeSource: "booking_submission", submittedAt: new Date(input.submissionTime),
    depositMinimumNoticeHours, depositEligible: eligible, mode,
    reason: eligibility.reason === "package_full_payment" || eligibility.reason === "deposit_disabled"
      ? eligibility.reason : eligible ? "deposit_eligible" : "short_notice"};
}

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
  const mode = reason !== "deposit_eligible" ? "full_only" :
    input.packagePaymentTerms?.fullPaymentAllowed === false ? "minimum_only" : "minimum_or_full";
  return {
    evaluatedAt: new Date(input.acceptanceTime), eventStartAt, depositAllowed, depositMinimumNoticeHours,
    depositEligible: reason === "deposit_eligible",
    mode, reason,
  };
}

/** Validate frozen initial-payment eligibility evidence without enforcing a specific checkout choice. */
export function validateInitialPaymentEligibility(
  request: Readonly<Record<string, unknown>>,
): {mode: "minimum_or_full" | "minimum_only" | "full_only"; reason: string; arrangedAccepted: boolean} | null {
  if (request.initialPaymentEligibilitySchemaVersion == null && request.initialPaymentEligibility == null &&
    request.bookingPaymentPolicySnapshot == null) return null; // Legacy accepted requests.
  const data = request.initialPaymentEligibility as InitialPaymentEligibility<{toDate?: () => Date}> | null;
  const submissionBased = request.initialPaymentEligibilitySchemaVersion === 2;
  const isDepositMode = data?.mode === "minimum_or_full" || data?.mode === "minimum_only";
  if ((!submissionBased && request.initialPaymentEligibilitySchemaVersion !== 1) || !data ||
    !["minimum_or_full", "minimum_only", "full_only"].includes(data.mode) ||
    data.depositEligible !== isDepositMode ||
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
  if (submissionBased) {
    const submittedAt = date(data.submittedAt ?? null);
    if (data.authorityTimeSource !== "booking_submission" || !submittedAt ||
      submittedAt.getTime() !== evaluatedAt.getTime() || data.depositMinimumNoticeHours !== 72) throw invalidEligibility();
  }
  if (data.reason !== "package_full_payment") {
    const policy = requireBookingPaymentPolicySnapshot(request.bookingPaymentPolicySnapshot);
    const minimumNoticeHours = submissionBased ? 72 : policy.depositMinimumNoticeHours;
    if (data.depositAllowed !== policy.depositAllowed || data.depositMinimumNoticeHours !== minimumNoticeHours) {
      throw invalidEligibility();
    }
    const eligible = policy.depositAllowed && eventStartAt.getTime() - evaluatedAt.getTime() >=
      minimumNoticeHours * 60 * 60 * 1000;
    const reason = !policy.depositAllowed ? "deposit_disabled" : eligible ? "deposit_eligible" : "short_notice";
    if (data.depositEligible !== eligible || data.reason !== reason) throw invalidEligibility();
  } else if (data.mode !== "full_only") throw invalidEligibility();
  const arrangement = parseArrangedPaymentOffer(request.arrangedPaymentOffer);
  if (arrangement?.status === "accepted") {
    const policy = requireBookingPaymentPolicySnapshot(request.bookingPaymentPolicySnapshot);
    const snapshot = request.financialSnapshot as Record<string, unknown> | null;
    if (!submissionBased || !policy.depositAllowed ||
        eventStartAt.getTime() - evaluatedAt.getTime() < 72 * 3_600_000 ||
        snapshot?.grossAmountInCentavos !== arrangement.grossInCentavos ||
        snapshot?.requiredUpfrontAmountInCentavos !== arrangement.upfrontInCentavos ||
        snapshot?.remainingBalanceInCentavos !== arrangement.grossInCentavos - arrangement.upfrontInCentavos) {
      throw invalidEligibility();
    }
    return {mode: "minimum_or_full", reason: "arranged_payment", arrangedAccepted: true};
  }
  return {mode: data.mode, reason: data.reason, arrangedAccepted: false};
}

/** Never re-evaluate against the checkout clock or mutable current policy. */
export function enforceInitialPaymentEligibility(
  request: Readonly<Record<string, unknown>>, choice: CustomerPaymentChoice,
): void {
  if (choice === "remaining_balance") return;
  const validated = validateInitialPaymentEligibility(request);
  if (!validated || validated.arrangedAccepted) return;
  if (choice === "minimum" && validated.mode === "full_only") {
    throw new HttpsError("failed-precondition", "The deposit option is not available for this booking. Choose full payment.",
      {reason: validated.reason === "short_notice" ? "deposit_not_available_for_short_notice_booking" : "deposit_not_available_for_booking"});
  }
  if (choice === "full" && validated.mode === "minimum_only") {
    throw new HttpsError("failed-precondition", "Full upfront payment is not available for this booking. Choose the down payment option.",
      {reason: "full_payment_not_available_for_booking"});
  }
}

function invalidEligibility(): HttpsError {
  return new HttpsError("failed-precondition", "The frozen initial-payment eligibility is invalid or unavailable.",
    {reason: "initial_payment_eligibility_invalid"});
}
