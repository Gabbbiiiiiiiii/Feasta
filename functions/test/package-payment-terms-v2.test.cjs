const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {BALANCE_DUE_HOURS_BEFORE_EVENT} = require("../lib/payments/canonical-balance-timing.js");
const {buildPackagePaymentTermsSnapshot, parsePackagePaymentTermsSnapshot} = require("../lib/payments/package-payment-terms.js");
const {requireNewBookingCanonicalPaymentTerms} = require("../lib/bookings/canonical-booking-payment-policy.js");
const {parseCanonicalPackageWrite} = require("../lib/packages/package-domain.js");
const {buildProviderRequestFinancialSnapshot} = require("../lib/provider-requests/provider-request-financial-snapshot.js");

function storedPackage(patch = {}) {
  return {
    paymentTermsSchemaVersion: 2, paymentPolicy: "deposit_then_balance",
    depositPercentage: 50, downPaymentPercentage: 50,
    balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: BALANCE_DUE_HOURS_BEFORE_EVENT,
    ...patch,
  };
}

for (const paymentPolicy of ["full_payment", "deposit_then_balance"]) {
  test(`v2 ${paymentPolicy} survives package build, parse and new-booking validation`, () => {
    const full = paymentPolicy === "full_payment";
    const expected = {
      schemaVersion: 2, source: "canonical_package", paymentPolicy,
      depositRateBps: full ? 10000 : 5000, balanceDueDaysBeforeEvent: null,
      balanceDueHoursBeforeEvent: full ? null : BALANCE_DUE_HOURS_BEFORE_EVENT,
      usesLegacyPaymentTerms: false,
    };
    const snapshot = buildPackagePaymentTermsSnapshot(storedPackage({
      paymentPolicy, depositPercentage: full ? 100 : 50, downPaymentPercentage: full ? 100 : 50,
      balanceDueHoursBeforeEvent: expected.balanceDueHoursBeforeEvent,
    }));
    assert.deepEqual(snapshot, expected);
    assert.deepEqual(parsePackagePaymentTermsSnapshot(snapshot), expected);
    assert.deepEqual(requireNewBookingCanonicalPaymentTerms(snapshot), expected);
  });
}

for (const [label, patch] of [
  ["missing hours", {balanceDueHoursBeforeEvent: undefined}],
  ["null deposit hours", {balanceDueHoursBeforeEvent: null}],
  ["wrong hours", {balanceDueHoursBeforeEvent: BALANCE_DUE_HOURS_BEFORE_EVENT + 1}],
  ["string hours", {balanceDueHoursBeforeEvent: String(BALANCE_DUE_HOURS_BEFORE_EVENT)}],
  ["contradictory days", {balanceDueDaysBeforeEvent: 1}],
  ["missing explicit null days", {balanceDueDaysBeforeEvent: undefined}],
  ["mismatched compatibility percentage", {downPaymentPercentage: 30}],
  ["zero deposit", {depositPercentage: 0, downPaymentPercentage: 0}],
  ["100 percent deposit", {depositPercentage: 100, downPaymentPercentage: 100}],
]) {
  test(`v2 stored package fails closed: ${label}`, () => {
    assert.throws(() => buildPackagePaymentTermsSnapshot(storedPackage(patch)), {code: "failed-precondition"});
  });
}

test("v2 full payment rejects non-100 rates and every remaining deadline", () => {
  const full = storedPackage({paymentPolicy: "full_payment", depositPercentage: 100,
    downPaymentPercentage: 100, balanceDueHoursBeforeEvent: null});
  for (const patch of [{depositPercentage: 50, downPaymentPercentage: 50},
    {balanceDueHoursBeforeEvent: BALANCE_DUE_HOURS_BEFORE_EVENT},
    {balanceDueHoursBeforeEvent: undefined}, {balanceDueDaysBeforeEvent: 1}]) {
    assert.throws(() => buildPackagePaymentTermsSnapshot({...full, ...patch}), {code: "failed-precondition"});
  }
});

test("new-booking validator independently rejects malformed v2 snapshots", () => {
  const valid = buildPackagePaymentTermsSnapshot(storedPackage());
  for (const patch of [{balanceDueHoursBeforeEvent: undefined}, {balanceDueHoursBeforeEvent: 48},
    {balanceDueDaysBeforeEvent: 1}, {balanceDueDaysBeforeEvent: undefined},
    {source: "legacy_package"}, {usesLegacyPaymentTerms: true}, {depositRateBps: 0},
    {paymentPolicy: "full_payment"}, {schemaVersion: 3}]) {
    assert.throws(() => requireNewBookingCanonicalPaymentTerms({...valid, ...patch}), {code: "failed-precondition"});
  }
});

test("v1 snapshots retain saved days; only new canonical bookings upgrade to T-24", () => {
  for (const days of [1, 7, 365]) {
    const saved = buildPackagePaymentTermsSnapshot({paymentTermsSchemaVersion: 1,
      paymentPolicy: "deposit_then_balance", depositPercentage: 30, downPaymentPercentage: 30,
      balanceDueDaysBeforeEvent: days});
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.balanceDueDaysBeforeEvent, days);
    assert.deepEqual(parsePackagePaymentTermsSnapshot(saved), saved);
    const current = requireNewBookingCanonicalPaymentTerms(saved);
    assert.equal(current.balanceDueHoursBeforeEvent, BALANCE_DUE_HOURS_BEFORE_EVENT);
    assert.equal(current.balanceDueDaysBeforeEvent, null);
    assert.equal(saved.balanceDueDaysBeforeEvent, days);
  }
  const legacy = buildPackagePaymentTermsSnapshot({downPaymentPercentage: 30});
  assert.deepEqual(parsePackagePaymentTermsSnapshot(legacy), legacy);
  assert.throws(() => requireNewBookingCanonicalPaymentTerms(legacy), {code: "failed-precondition"});
  assert.throws(() => buildPackagePaymentTermsSnapshot({paymentPolicy: "deposit_then_balance",
    depositPercentage: 50, downPaymentPercentage: 50, balanceDueDaysBeforeEvent: null}),
  {code: "failed-precondition"});
});

for (const paymentPolicy of ["full_payment", "deposit_then_balance"]) {
  test(`create/update write output passes submission validation and financial snapshot: ${paymentPolicy}`, () => {
    const full = paymentPolicy === "full_payment";
    const validated = parseCanonicalPackageWrite({name: "Wedding package",
      description: "A complete wedding catering package.", eventType: "wedding", price: 30000,
      minimumGuests: 20, maximumGuests: 100, paymentPolicy, depositPercentage: full ? 100 : 50});
    const packageData = {...validated, paymentTermsSchemaVersion: 2,
      balanceDueHoursBeforeEvent: full ? null : BALANCE_DUE_HOURS_BEFORE_EVENT};
    // Execute the same trusted-package validation composition used inside submitBookingRequest.
    const terms = requireNewBookingCanonicalPaymentTerms(buildPackagePaymentTermsSnapshot(packageData));
    const financial = buildProviderRequestFinancialSnapshot({providerId: "provider_test",
      providerOwnerId: "owner_test", providerRequest: {amount: validated.price,
        downPaymentAmount: validated.price * terms.depositRateBps / 10000,
        remainingBalance: validated.price * (10000 - terms.depositRateBps) / 10000,
        packagePaymentTerms: terms}, platformSettings: null, providerTaxProfile: null});
    assert.deepEqual(financial.packagePaymentTerms, terms);
    assert.equal(financial.requiredUpfrontAmountInCentavos, full ? 3000000 : 1500000);
    assert.equal(financial.remainingBalanceInCentavos, full ? 0 : 1500000);
    for (const file of ["create-provider-package", "update-provider-package"]) {
      const source = fs.readFileSync(path.join(__dirname, `../src/packages/${file}.ts`), "utf8");
      assert.match(source, /parseCanonicalPackageWrite\(/u);
      assert.match(source, /paymentTermsSchemaVersion: 2/u);
      assert.match(source, /balanceDueHoursBeforeEvent: validated.paymentPolicy === "deposit_then_balance" \? BALANCE_DUE_HOURS_BEFORE_EVENT : null/u);
      assert.match(source, /balanceDueDaysBeforeEvent:\s*validated\s*\.balanceDueDaysBeforeEvent/u);
    }
  });
}
