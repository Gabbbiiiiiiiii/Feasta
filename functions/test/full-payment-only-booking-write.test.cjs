const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {requireNewBookingCanonicalPaymentTerms} = require("../lib/bookings/canonical-booking-payment-policy.js");
const {buildPackagePaymentTermsSnapshot} = require("../lib/payments/package-payment-terms.js");
const {rejectClientBookingFinancialAuthority} = require("../lib/bookings/booking-package-offer.js");

function terms(paymentPolicy = "deposit_then_balance", percentage = 50.5, days = 7) {
  return buildPackagePaymentTermsSnapshot({paymentPolicy, depositPercentage: percentage,
    downPaymentPercentage: percentage, balanceDueDaysBeforeEvent: days});
}

test("new bookings accept canonical full payment and exact basis-point deposits", () => {
  const full = requireNewBookingCanonicalPaymentTerms(terms("full_payment", 100, null));
  assert.equal(full.depositRateBps, 10000);
  assert.equal(full.balanceDueDaysBeforeEvent, null);
  const deposit = requireNewBookingCanonicalPaymentTerms(terms());
  assert.equal(deposit.depositRateBps, 5050);
  assert.equal(deposit.depositRateBps / 100, 50.5);
  assert.equal(deposit.balanceDueDaysBeforeEvent, null);
  assert.equal(deposit.schemaVersion, 2);
  assert.equal(deposit.balanceDueHoursBeforeEvent, 24);
});

test("legacy terms remain readable but are rejected for every new package booking", () => {
  for (const downPaymentPercentage of [0, 30, 100]) {
    const legacy = buildPackagePaymentTermsSnapshot({downPaymentPercentage});
    assert.equal(legacy.source, "legacy_package");
    assert.throws(() => requireNewBookingCanonicalPaymentTerms(legacy), {code: "failed-precondition"});
  }
});

test("canonical new-booking guard fails closed on invalid or contradictory terms", () => {
  const valid = terms();
  for (const patch of [
    {schemaVersion: 2}, {source: "legacy_package"}, {usesLegacyPaymentTerms: true},
    {usesLegacyPaymentTerms: undefined}, {paymentPolicy: null}, {paymentPolicy: "unknown"},
    {depositRateBps: 0}, {depositRateBps: 10000}, {depositRateBps: 5050.5},
    {depositRateBps: NaN}, {depositRateBps: Infinity},
    {balanceDueDaysBeforeEvent: null}, {balanceDueDaysBeforeEvent: 0},
    {balanceDueDaysBeforeEvent: 1.5}, {balanceDueDaysBeforeEvent: 366},
    {balanceDueDaysBeforeEvent: Infinity},
    {paymentPolicy: "full_payment", depositRateBps: 10000},
    {paymentPolicy: "full_payment", balanceDueDaysBeforeEvent: null},
  ]) assert.throws(() => requireNewBookingCanonicalPaymentTerms({...valid, ...patch}),
    {code: "failed-precondition"}, JSON.stringify(patch));
});

test("browser cannot supply package or payment financial authority", () => {
  for (const field of ["packagePrice", "downPaymentPercentage", "depositPercentage", "downPaymentAmount", "totalAmount"]) {
    assert.throws(() => rejectClientBookingFinancialAuthority({[field]: 1}), {code: "invalid-argument"}, field);
  }
});

test("booking wiring freezes trusted package terms and preserves independent service payment rules", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/bookings/submit-booking-request.ts"), "utf8");
  assert.match(source, /requireNewBookingCanonicalPaymentTerms\s*\(\s*buildPackagePaymentTermsSnapshot\s*\(\s*packageData/u);
  assert.match(source, /const packageDownPaymentPercentage\s*=\s*packagePaymentTerms\.depositRateBps \/ 100/u);
  assert.match(source, /downPaymentAmount:\s*calculateDownPayment\(\s*packagePrice,\s*packageDownPaymentPercentage/u);
  assert.match(source, /const cateringDownPaymentAmount\s*=\s*calculateServiceDownPayment\(\s*cateringServices/u);
  assert.match(source, /roundCurrency\(\(cateringDownPaymentAmount \/ cateringSubtotal\) \* 100\)/u);
  assert.equal((source.match(/downPaymentPercentage:\s*cateringDownPaymentPercentage/gu) ?? []).length, 2);
  assert.equal((source.match(/^\s+packagePaymentTerms,$/gmu) ?? []).length, 2, "event and catering request both freeze terms");
  assert.match(source, /customMenuSelectionService[\s\S]*downPaymentPercentage: FULL_PAYMENT_PERCENTAGE,[\s\S]*downPaymentAmount: roundCurrency\(selection\.price\)/u);
  assert.match(source, /price,\s*downPaymentPercentage:\s*FULL_PAYMENT_PERCENTAGE,\s*source,/u);
  assert.match(source, /type: "addon",[\s\S]*packagePaymentTerms:\s*null,[\s\S]*downPaymentPercentage:\s*FULL_PAYMENT_PERCENTAGE/u);
  assert.doesNotMatch(source, /input\.(?:price|paymentPolicy|depositPercentage|balanceDueDaysBeforeEvent|packagePaymentTerms|financialSnapshot)\b/u);
  const packageBranch = source.slice(source.indexOf('if (cateringSelectionType === "package") {', source.indexOf('let packagePaymentTerms')),
    source.indexOf('const resolvedGuestCount'));
  assert.doesNotMatch(packageBranch, /input\.(deposit|payment|price)|packagePaymentPolicyBounds|appSettings/u);
});
