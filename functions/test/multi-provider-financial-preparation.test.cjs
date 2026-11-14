"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Some FEASTA dependencies initialize the shared Firestore module on import.
// No network or database operation is performed by these tests.
const {initializeApp, getApps} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp({
    projectId: "demo-feasta-multi-provider-financial-unit-test",
  });
}

const candidates = [
  "../lib/bookings/multi-provider-financial-preparation.js",
  "../lib/src/bookings/multi-provider-financial-preparation.js",
  "../dist/bookings/multi-provider-financial-preparation.js",
  "../dist/src/bookings/multi-provider-financial-preparation.js",
];

const compiled = candidates
  .map((candidate) => path.resolve(__dirname, candidate))
  .find((candidate) => fs.existsSync(candidate));

assert.ok(compiled, "Compiled financial preparation module missing.");

const {
  prepareMultiProviderFinancials,
} = require(compiled);

function entry(index, overrides = {}) {
  const suffix = `00${index}`;
  const providerId = `provider_${suffix}`;
  const packageId = `package_${suffix}`;

  const packageData = {
    providerId,
    paymentTermsSchemaVersion: 2,
    paymentPolicy: "full_payment",
    depositPercentage: 100,
    downPaymentPercentage: 100,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: null,
    ...overrides.packageData,
  };

  return {
    providerId,
    packageId,
    packageData,
    resolved: {
      providerId,
      packageId,
      basePrice: 15000,
      ...overrides.resolved,
    },
  };
}

test("prepares canonical full-payment terms for two providers", () => {
  const result = prepareMultiProviderFinancials([
    entry(1),
    entry(2),
  ]);

  assert.equal(result.items.length, 2);
  assert.equal(result.totalGrossAmountInCentavos, 3000000);

  for (const item of result.items) {
    assert.equal(item.grossAmountInCentavos, 1500000);
    assert.equal(item.packagePaymentTerms.schemaVersion, 2);
    assert.equal(item.packagePaymentTerms.source, "canonical_package");
    assert.equal(item.packagePaymentTerms.paymentPolicy, "full_payment");
    assert.equal(item.packagePaymentTerms.depositRateBps, 10000);
    assert.equal(item.packagePaymentTerms.usesLegacyPaymentTerms, false);
  }
});

test("preserves canonical deposit terms without granting eligibility", () => {
  const deposit = {
    paymentPolicy: "deposit_then_balance",
    depositPercentage: 30,
    downPaymentPercentage: 30,
    balanceDueHoursBeforeEvent: 24,
  };

  const result = prepareMultiProviderFinancials([
    entry(1, {packageData: deposit}),
    entry(2),
  ]);

  assert.equal(
    result.items[0].packagePaymentTerms.paymentPolicy,
    "deposit_then_balance",
  );
  assert.equal(
    result.items[0].packagePaymentTerms.depositRateBps,
    3000,
  );
  assert.equal(
    result.items[0].packagePaymentTerms.balanceDueHoursBeforeEvent,
    24,
  );
  assert.equal(
    result.items[1].packagePaymentTerms.depositRateBps,
    10000,
  );

  // No upfront payment is calculated until the server evaluates
  // booking date, time, and authoritative payment policy.
  assert.equal(
    Object.hasOwn(result.items[0], "requiredUpfrontAmountInCentavos"),
    false,
  );
  assert.equal(
    Object.hasOwn(result.items[0], "depositEligible"),
    false,
  );
});

test("uses trusted resolved amounts for differing package prices", () => {
  const result = prepareMultiProviderFinancials([
    entry(1, {resolved: {basePrice: 2500.25}}),
    entry(2, {resolved: {basePrice: 18000}}),
  ]);

  assert.deepEqual(
    result.items.map((item) => item.grossAmountInCentavos),
    [250025, 1800000],
  );
  assert.equal(result.totalGrossAmountInCentavos, 2050025);
});

test("rejects inconsistent canonical down-payment percentages", () => {
  const corrupted = entry(1, {
    packageData: {
      paymentPolicy: "deposit_then_balance",
      depositPercentage: 30,
      downPaymentPercentage: 50,
      balanceDueHoursBeforeEvent: 24,
    },
  });

  assert.throws(() =>
    prepareMultiProviderFinancials([corrupted, entry(2)]),
  );
});

test("rejects malformed deposit deadlines", () => {
  const corrupted = entry(1, {
    packageData: {
      paymentPolicy: "deposit_then_balance",
      depositPercentage: 30,
      downPaymentPercentage: 30,
      balanceDueHoursBeforeEvent: 48,
    },
  });

  assert.throws(() =>
    prepareMultiProviderFinancials([corrupted, entry(2)]),
  );
});

test("rejects incomplete legacy payment terms", () => {
  const legacy = entry(1, {
    packageData: {
      paymentTermsSchemaVersion: undefined,
      paymentPolicy: undefined,
      depositPercentage: undefined,
      downPaymentPercentage: undefined,
    },
  });

  assert.throws(() =>
    prepareMultiProviderFinancials([legacy, entry(2)]),
  );
});

test("rejects fractional-centavo server amounts", () => {
  const corrupted = entry(1, {
    resolved: {basePrice: 15000.123},
  });

  assert.throws(() =>
    prepareMultiProviderFinancials([corrupted, entry(2)]),
  );
});

test("rejects mismatched resolved package identities", () => {
  const corrupted = entry(1, {
    resolved: {providerId: "provider_999"},
  });

  assert.throws(() =>
    prepareMultiProviderFinancials([corrupted, entry(2)]),
  );
});

test("rejects duplicate providers", () => {
  assert.throws(() =>
    prepareMultiProviderFinancials([entry(1), entry(1)]),
  );
});

test("rejects unsupported provider counts", () => {
  assert.throws(() =>
    prepareMultiProviderFinancials([entry(1)]),
  );

  assert.throws(() =>
    prepareMultiProviderFinancials([
      entry(1), entry(2), entry(3), entry(4), entry(5),
    ]),
  );
});