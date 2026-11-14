import {HttpsError} from "firebase-functions/v2/https";
import {resolveServiceBookingPolicy, type ResolvedServiceBookingPolicy} from "./service-booking-policy.js";

export type BookingPaymentPolicySnapshot = {
  schemaVersion: 1;
  effectivePolicyKey: string;
  source: ResolvedServiceBookingPolicy["source"];
  depositAllowed: boolean;
  depositMinimumNoticeHours: number;
};

/** Freeze only payment eligibility evidence; consume no preparation/lifecycle rules. */
export function buildBookingPaymentPolicySnapshot(
  input: Parameters<typeof resolveServiceBookingPolicy>[0],
): BookingPaymentPolicySnapshot {
  const resolved = resolveServiceBookingPolicy(input);
  return {
    schemaVersion: 1, effectivePolicyKey: resolved.effectivePolicyKey,
    source: {...resolved.source},
    depositAllowed: resolved.policy.payment.depositAllowed,
    depositMinimumNoticeHours: resolved.policy.payment.depositMinimumNoticeHours,
  };
}

export function requireBookingPaymentPolicySnapshot(value: unknown): BookingPaymentPolicySnapshot {
  const data = value as BookingPaymentPolicySnapshot | null;
  const version = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
  if (!data || data.schemaVersion !== 1 || typeof data.depositAllowed !== "boolean" ||
    !Number.isSafeInteger(data.depositMinimumNoticeHours) || data.depositMinimumNoticeHours < 1 ||
    data.depositMinimumNoticeHours > 24 * 365 || !/^[a-f0-9]{64}$/u.test(data.effectivePolicyKey) ||
    !data.source || !version(data.source.platformPolicyVersion) ||
    !/^[a-z0-9_]{2,80}$/u.test(data.source.serviceCategoryCode) ||
    (data.source.serviceCategoryPolicyVersion !== null && !version(data.source.serviceCategoryPolicyVersion)) ||
    (data.source.packagePolicyVersion !== null && !version(data.source.packagePolicyVersion)) ||
    (data.source.packageId !== null && !/^[A-Za-z0-9_-]{2,160}$/u.test(data.source.packageId))) {
    throw new HttpsError("failed-precondition", "The frozen booking payment policy is invalid.",
      {reason: "booking_payment_policy_invalid"});
  }
  return data;
}
