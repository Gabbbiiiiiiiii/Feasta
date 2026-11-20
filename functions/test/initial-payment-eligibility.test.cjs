const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {Timestamp} = require("firebase-admin/firestore");
const {buildBookingPaymentPolicySnapshot} = require("../lib/bookings/booking-payment-eligibility-policy.js");
const {evaluateInitialPaymentEligibility, enforceInitialPaymentEligibility} = require("../lib/payments/initial-payment-eligibility.js");
const {rejectClientBookingFinancialAuthority} = require("../lib/bookings/booking-package-offer.js");
const {providerPaymentObligationForChoice} = require("../lib/payments/payment-obligation.js");

const policyInput = () => ({platformSettings: null, serviceCategoryCode: "catering_service",
  serviceCategory: {bookingPolicy: {payment: {depositMinimumNoticeHours: 48}}}, packageId: "package_test",
  packageData: {bookingPolicyOverride: {payment: {depositRateBps: 7500}}}});
const terms = {schemaVersion: 2, source: "canonical_package", paymentPolicy: "deposit_then_balance",
  depositRateBps: 3000, balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: 24, usesLegacyPaymentTerms: false};
const snapshot = {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
  requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000, packagePaymentTerms: terms};
const policy = () => buildBookingPaymentPolicySnapshot(policyInput());
const evaluate = (time, overrides = {}) => evaluateInitialPaymentEligibility({
  eventDate: new Date("2026-10-25T00:00:00+08:00"), eventTime: "10:00",
  acceptanceTime: new Date(time), packagePaymentTerms: terms, bookingPaymentPolicySnapshot: policy(), ...overrides,
});
const request = (eligibility, frozen = policy()) => ({bookingPaymentPolicySnapshot: frozen,
  initialPaymentEligibilitySchemaVersion: 1, initialPaymentEligibility: {...eligibility,
    evaluatedAt: Timestamp.fromDate(eligibility.evaluatedAt), eventStartAt: Timestamp.fromDate(eligibility.eventStartAt)}});

for (const [time, mode] of [["2026-10-23T10:00:00+08:00", "minimum_or_full"],
  ["2026-10-23T10:01:00+08:00", "full_only"], ["2026-10-22T10:00:00+08:00", "minimum_or_full"]]) {
  test(`acceptance ${time} freezes ${mode}`, () => {
    const eligibility = evaluate(time);
    assert.equal(eligibility.mode, mode);
    assert.equal(eligibility.depositEligible, mode === "minimum_or_full");
    assert.equal(eligibility.depositMinimumNoticeHours, 48);
    assert.equal(eligibility.eventStartAt.toISOString(), "2026-10-25T02:00:00.000Z");
  });
}
test("one millisecond below threshold is ineligible and event time matters", () => {
  assert.equal(evaluate("2026-10-23T10:00:00.001+08:00").mode, "full_only");
  assert.equal(evaluate("2026-10-23T10:01:00+08:00", {eventTime: "19:30"}).mode, "minimum_or_full");
});
test("full-payment and deposit-disabled policies require full payment", () => {
  assert.equal(evaluate("2026-10-22T10:00:00+08:00", {packagePaymentTerms: {...terms,
    paymentPolicy: "full_payment", depositRateBps: 10000, balanceDueHoursBeforeEvent: null}}).reason, "package_full_payment");
  const input = policyInput(); input.serviceCategory.bookingPolicy.payment.depositAllowed = false;
  const frozen = buildBookingPaymentPolicySnapshot(input);
  const eligibility = evaluate("2026-10-22T10:00:00+08:00", {bookingPaymentPolicySnapshot: frozen});
  assert.equal(eligibility.mode, "full_only"); assert.equal(eligibility.reason, "deposit_disabled");
  assert.throws(() => enforceInitialPaymentEligibility(request(eligibility, frozen), "minimum"), {code: "failed-precondition"});
});
test("source/version evidence freezes configurable thresholds without adopting policy deposit rate", () => {
  const input = policyInput();
  const frozen = buildBookingPaymentPolicySnapshot(input);
  assert.equal(frozen.depositMinimumNoticeHours, 48);
  assert.equal(frozen.source.serviceCategoryCode, "catering_service");
  assert.equal(frozen.source.packageId, "package_test");
  assert.match(frozen.effectivePolicyKey, /^[a-f0-9]{64}$/);
  assert.equal(frozen.depositRateBps, undefined);
  input.serviceCategory.bookingPolicy.payment.depositMinimumNoticeHours = 72;
  const newer = buildBookingPaymentPolicySnapshot(input);
  assert.equal(evaluate("2026-10-23T10:00:00+08:00", {bookingPaymentPolicySnapshot: frozen}).mode, "minimum_or_full");
  assert.equal(evaluate("2026-10-23T10:00:00+08:00", {bookingPaymentPolicySnapshot: newer}).mode, "full_only");
  assert.equal(evaluate("2026-10-22T10:00:00+08:00", {bookingPaymentPolicySnapshot: newer}).mode, "minimum_or_full");
  assert.equal(providerPaymentObligationForChoice({financialSnapshot: snapshot, paymentChoice: "minimum"}).amountInCentavos, 30000);
});
test("checkout preserves acceptance decision as time passes and rejects forged minimum for short notice", () => {
  const eligible = request(evaluate("2026-10-23T03:00:00+08:00")); // 55 hours
  const short = request(evaluate("2026-10-23T11:00:00+08:00")); // 47 hours
  for (let rerun = 0; rerun < 2; rerun++) {
    assert.doesNotThrow(() => enforceInitialPaymentEligibility(eligible, "minimum"));
    assert.doesNotThrow(() => enforceInitialPaymentEligibility(eligible, "full"));
    assert.doesNotThrow(() => enforceInitialPaymentEligibility(short, "full"));
    assert.throws(() => enforceInitialPaymentEligibility(short, "minimum"), (error) =>
      error.code === "failed-precondition" && error.details.reason === "deposit_not_available_for_short_notice_booking" &&
      error.message === "The deposit option is not available for this booking. Choose full payment.");
  }
  const source = fs.readFileSync(path.join(__dirname, "../src/payments/initial-payment-eligibility.ts"), "utf8");
  assert.doesNotMatch(source, /Date\.now\(|new Date\(\)/);
});
test("legacy accepted requests stay compatible and remaining-balance gate is unchanged", () => {
  for (const choice of ["minimum", "full", "remaining_balance"]) assert.doesNotThrow(() => enforceInitialPaymentEligibility({}, choice));
  const short = request(evaluate("2026-10-23T11:00:00+08:00"));
  assert.doesNotThrow(() => enforceInitialPaymentEligibility(short, "remaining_balance"));
  assert.equal(providerPaymentObligationForChoice({financialSnapshot: snapshot, paymentChoice: "remaining_balance"}).amountInCentavos, 70000);
});
test("malformed or missing new eligibility fails closed", () => {
  const valid = request(evaluate("2026-10-23T11:00:00+08:00"));
  for (const patch of [{initialPaymentEligibilitySchemaVersion: 2}, {initialPaymentEligibility: null},
    {initialPaymentEligibility: {...valid.initialPaymentEligibility, mode: "minimum_or_full", depositEligible: true}},
    {initialPaymentEligibility: {...valid.initialPaymentEligibility, depositMinimumNoticeHours: 1}}]) {
    assert.throws(() => enforceInitialPaymentEligibility({...valid, ...patch}, "minimum"), {code: "failed-precondition"});
  }
});
test("browser cannot supply payment policy or eligibility evidence", () => {
  for (const field of ["bookingPaymentPolicySnapshot", "bookingPolicySnapshot", "serviceBookingPolicy", "depositAllowed",
    "depositMinimumNoticeHours", "initialPaymentEligibilitySchemaVersion", "initialPaymentEligibility"]) {
    assert.throws(() => rejectClientBookingFinancialAuthority({[field]: true}), {code: "invalid-argument"});
  }
});
test("submission freezes policy and acceptance uses it before checkout enforcement", () => {
  const submission = fs.readFileSync(path.join(__dirname, "../src/bookings/submit-booking-request.ts"), "utf8");
  assert.match(submission, /loadBookingPaymentPolicySnapshot\(\{\s*transaction, packageId, packageData/);
  assert.equal((submission.match(/^\s+bookingPaymentPolicySnapshot,$/gm) ?? []).length, 2);
  const acceptance = fs.readFileSync(path.join(__dirname, "../src/provider-requests/accept-provider-request.ts"), "utf8");
  assert.match(acceptance, /requireBookingPaymentPolicySnapshot\(authorized\.requestData\.bookingPaymentPolicySnapshot\)/);
  assert.match(acceptance, /evaluateInitialPaymentEligibility/);
  const checkout = fs.readFileSync(path.join(__dirname, "../src/payments/create-payment-session.ts"), "utf8");
  assert.ok(checkout.indexOf("enforceInitialPaymentEligibility(providerRequest, paymentChoice)") < checkout.indexOf("let selectingInitialPayment"));
  assert.match(checkout, /rejectUnknownFields\(input, \[\s*"providerRequestId",\s*"paymentChoice",\s*"idempotencyKey",\s*\]\)/);
});
