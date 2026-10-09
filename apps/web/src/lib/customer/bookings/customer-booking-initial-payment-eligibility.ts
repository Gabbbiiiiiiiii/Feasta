type StoredRecord = Readonly<Record<string, unknown>>;
type EligibilityProjection =
  | {kind: "legacy"}
  | {kind: "invalid"}
  | {kind: "canonical"; mode: "minimum_or_full" | "full_only";
      reason: string; depositMinimumNoticeHours: number | null};

/** Project the server's frozen decision. Never use the browser or checkout clock. */
export function customerInitialPaymentEligibility(request: StoredRecord): EligibilityProjection {
  if (request.initialPaymentEligibilitySchemaVersion == null && request.initialPaymentEligibility == null &&
    request.bookingPaymentPolicySnapshot == null) return {kind: "legacy"};
  const data = request.initialPaymentEligibility as StoredRecord | null;
  const submissionBased = request.initialPaymentEligibilitySchemaVersion === 2;
  if ((!submissionBased && request.initialPaymentEligibilitySchemaVersion !== 1) || !data ||
    typeof data !== "object" || Array.isArray(data) ||
    (data.mode !== "minimum_or_full" && data.mode !== "full_only") ||
    data.depositEligible !== (data.mode === "minimum_or_full") ||
    typeof data.depositAllowed !== "boolean" ||
    !["deposit_eligible", "package_full_payment", "deposit_disabled", "short_notice"].includes(String(data.reason)) ||
    (data.reason === "deposit_eligible") !== data.depositEligible ||
    ((data.reason === "deposit_eligible" || data.reason === "short_notice") && data.depositAllowed !== true) ||
    (data.reason === "deposit_disabled" && data.depositAllowed !== false) ||
    (data.reason !== "package_full_payment" &&
      (!Number.isSafeInteger(data.depositMinimumNoticeHours) || (data.depositMinimumNoticeHours as number) <= 0 ||
        (data.depositMinimumNoticeHours as number) > 24 * 365))) {
    return {kind: "invalid"};
  }
  if (submissionBased && (data.authorityTimeSource !== "booking_submission" ||
    data.depositMinimumNoticeHours !== 72 || data.submittedAt == null || data.evaluatedAt == null)) {
    return {kind: "invalid"};
  }
  return {kind: "canonical", mode: data.mode, reason: String(data.reason),
    depositMinimumNoticeHours: typeof data.depositMinimumNoticeHours === "number" ? data.depositMinimumNoticeHours : null};
}

export function customerInitialPaymentExplanation(request: StoredRecord): string | null {
  const eligibility = customerInitialPaymentEligibility(request);
  if (eligibility.kind !== "canonical" || eligibility.mode !== "full_only") return null;
  if (eligibility.reason === "deposit_disabled") return "Full payment is required for this booking under its saved payment policy.";
  if (eligibility.reason !== "short_notice" || eligibility.depositMinimumNoticeHours === null) return null;
  const hours = eligibility.depositMinimumNoticeHours;
  const amount = hours % 24 === 0 ? hours / 24 : hours;
  const unit = hours % 24 === 0 ? "day" : "hour";
  if (request.initialPaymentEligibilitySchemaVersion === 2) {
    return "Full payment is required because the booking was submitted fewer than 3 days before the event.";
  }
  return `Full payment is required because fewer than ${amount} ${unit}${amount === 1 ? "" : "s"} remained before the event when this booking was accepted.`;
}
