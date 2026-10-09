import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {customerBookingCheckoutOptions} from "@/lib/customer/bookings/customer-booking-checkout-options";
import {customerInitialPaymentExplanation} from "@/lib/customer/bookings/customer-booking-initial-payment-eligibility";

const eligibility = (mode: "full_only" | "minimum_or_full", hours = 48) => ({
  initialPaymentEligibilitySchemaVersion: 1,
  initialPaymentEligibility: {mode, reason: mode === "full_only" ? "short_notice" : "deposit_eligible",
    depositAllowed: true, depositEligible: mode === "minimum_or_full", depositMinimumNoticeHours: hours},
});
const request = (extra = {}) => ({status: "waiting_for_down_payment", paymentStatus: "unpaid",
  financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
    requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000}, ...extra});
const options = (value: Record<string, unknown>) => customerBookingCheckoutOptions("request_test", value, "waiting_for_down_payment");

describe("frozen initial-payment eligibility projection", () => {
  it("reads submission v2 and explains the 72-hour submission cutoff", () => {
    const submittedAt = "2026-10-13T10:00:01.000Z";
    const evidence = {...eligibility("full_only", 72).initialPaymentEligibility,
      authorityTimeSource: "booking_submission", submittedAt, evaluatedAt: submittedAt};
    const saved = request({initialPaymentEligibilitySchemaVersion: 2, initialPaymentEligibility: evidence});
    expect(options(saved)).toEqual([{choice: "full", amount: 1000}]);
    expect(customerInitialPaymentExplanation(saved)).toBe(
      "Full payment is required because the booking was submitted fewer than 3 days before the event.",
    );
    expect(options({...saved, acceptedAt: "2026-10-15T09:59:59.000Z"})).toEqual(options(saved));
    expect(options({...saved, initialPaymentEligibility: {...evidence,
      authorityTimeSource: "browser"}})).toEqual([]);
  });
  it("uses correctly spaced saved payment policy wording", () => {
    expect(customerInitialPaymentExplanation(request({initialPaymentEligibilitySchemaVersion: 1,
      initialPaymentEligibility: {mode: "full_only", reason: "deposit_disabled", depositAllowed: false,
        depositEligible: false, depositMinimumNoticeHours: 48}})))
      .toBe("Full payment is required for this booking under its saved payment policy.");
  });
  it("short notice exposes only full payment and explains the saved threshold", () => {
    const saved = request(eligibility("full_only"));
    expect(options(saved)).toEqual([{choice: "full", amount: 1000}]);
    expect(customerInitialPaymentExplanation(saved)).toBe("Full payment is required because fewer than 2 days remained before the event when this booking was accepted.");
  });
  it("eligible and legacy requests expose both initial options", () => {
    const expected = [{choice: "minimum", amount: 300}, {choice: "full", amount: 1000}];
    expect(options(request(eligibility("minimum_or_full")))).toEqual(expected);
    expect(options(request())).toEqual(expected);
    expect(customerInitialPaymentExplanation(request())).toBeNull();
  });
  it("formats configured whole days and exact hours without hard-coding 48", () => {
    expect(customerInitialPaymentExplanation(request(eligibility("full_only", 72)))).toContain("fewer than 3 days");
    expect(customerInitialPaymentExplanation(request(eligibility("full_only", 49)))).toContain("fewer than 49 hours");
    expect(customerInitialPaymentExplanation(request(eligibility("full_only", 24)))).toContain("fewer than 1 day remained");
  });
  it("rejects missing or malformed new evidence without affecting legacy", () => {
    expect(options(request({bookingPaymentPolicySnapshot: {schemaVersion: 1}}))).toEqual([]);
    expect(options(request({...eligibility("full_only"), initialPaymentEligibilitySchemaVersion: 2}))).toEqual([]);
    expect(options(request({initialPaymentEligibilitySchemaVersion: 1,
      initialPaymentEligibility: {mode: "minimum_or_full", depositEligible: false}}))).toEqual([]);
  });
  it("does not restore or remove deposit based on the current clock", () => {
    const saved = request(eligibility("minimum_or_full"));
    expect(options(saved)).toEqual(options({...saved, eventDate: "1900-01-01"}));
    const short = request(eligibility("full_only"));
    expect(options(short)).toEqual(options({...short, eventDate: "2100-01-01"}));
  });
  it("preserves the existing settled-deposit remaining-balance path", () => {
    const id = (choice: string) => `payment_${createHash("sha256").update(
      ["provider-request", "request_test", "payment-choice", choice, "v1"].join(":"),
    ).digest("hex").slice(0, 32)}`;
    const saved = request({...eligibility("minimum_or_full"), status: "confirmed", paymentStatus: "paid",
      initialPaymentChoice: "minimum", initialPaymentId: id("minimum"), paymentId: id("minimum"),
      settlementSchemaVersion: 1, settlementStatus: "deposit_settled",
      grossSettledAmountInCentavos: 30000, outstandingAmountInCentavos: 70000});
    expect(customerBookingCheckoutOptions("request_test", saved, "confirmed"))
      .toEqual([{choice: "remaining_balance", amount: 700}]);
  });
});
