"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {initializeApp, getApps} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp({
    projectId: "demo-feasta-multi-provider-eligibility-test",
  });
}

function compiledFile(name) {
  const candidates = [
    `../lib/bookings/${name}.js`,
    `../lib/src/bookings/${name}.js`,
    `../dist/bookings/${name}.js`,
    `../dist/src/bookings/${name}.js`,
  ];

  const result = candidates
    .map((candidate) => path.resolve(__dirname, candidate))
    .find((candidate) => fs.existsSync(candidate));

  assert.ok(result, `Compiled module missing: ${name}`);
  return result;
}

const {
  prepareMultiProviderFinancials,
} = require(compiledFile("multi-provider-financial-preparation"));

const {
  prepareMultiProviderPaymentEligibility,
} = require(compiledFile("multi-provider-payment-eligibility"));

function makeEntries() {
  return [1, 2].map((index) => {
    const suffix = `00${index}`;
    const providerId = `provider_${suffix}`;
    const packageId = `package_${suffix}`;

    return {
      providerId,
      packageId,
      packageData: {
        providerId,
        serviceCategoryCode: "catering_service",
        paymentTermsSchemaVersion: 2,
        paymentPolicy: "deposit_then_balance",
        depositPercentage: 30,
        downPaymentPercentage: 30,
        balanceDueDaysBeforeEvent: null,
        balanceDueHoursBeforeEvent: 24,
      },
      resolved: {
        providerId,
        packageId,
        basePrice: index === 1 ? 15000 : 20000,
      },
    };
  });
}

function makeTransaction(options = {}) {
  const reads = [];

  const records = {
    "serviceCategories/catering_service": {
      code: "catering_service",
      name: "Catering",
      serviceType: "catering",
      status: "active",
      bookingPolicy: {
        payment: {
          depositAllowed: options.depositAllowed !== false,
          depositMinimumNoticeHours: 48,
        },
      },
    },
  };

  if (options.missingCategory) {
    delete records["serviceCategories/catering_service"];
  }

  const transaction = {
    async get(ref) {
      assert.equal(typeof ref?.path, "string");
      reads.push(ref.path);

      assert.ok(
        ref.path === "serviceCategories/catering_service" ||
        ref.path === "appSettings/platform",
        `Unexpected Firestore read: ${ref.path}`,
      );

      const exists = Object.hasOwn(records, ref.path);

      return {
        id: ref.id ?? ref.path.split("/").pop(),
        exists,
        data: () => records[ref.path],
      };
    },
    create() {
      throw new Error("Unexpected Firestore write");
    },
    set() {
      throw new Error("Unexpected Firestore write");
    },
    update() {
      throw new Error("Unexpected Firestore write");
    },
    delete() {
      throw new Error("Unexpected Firestore write");
    },
  };

  return {transaction, reads};
}

const eventDate = new Date("2026-12-20T00:00:00+08:00");
const eventTime = "10:00";

function fixture(options = {}) {
  const entries = makeEntries();
  const financials = prepareMultiProviderFinancials(entries);
  const mock = makeTransaction(options);

  return {
    entries,
    financials,
    ...mock,
  };
}

async function prepare(fixtureData, submissionTime) {
  return prepareMultiProviderPaymentEligibility({
    transaction: fixtureData.transaction,
    entries: fixtureData.entries,
    financials: fixtureData.financials,
    eventDate,
    eventTime,
    submissionTime: new Date(submissionTime),
  });
}

test("both providers qualify for deposit when event is far enough away", async () => {
  const f = fixture();

  const result = await prepare(
    f,
    "2026-12-15T10:00:00+08:00",
  );

  assert.equal(result.items.length, 2);

  for (const item of result.items) {
    assert.equal(item.initialPaymentEligibility.depositEligible, true);
    assert.equal(item.initialPaymentEligibility.mode, "minimum_or_full");
    assert.equal(item.initialPaymentEligibility.reason, "deposit_eligible");
    assert.equal(item.initialPaymentEligibility.depositMinimumNoticeHours, 72);
    assert.equal(item.bookingPaymentPolicySnapshot.depositAllowed, true);
    assert.match(
      item.bookingPaymentPolicySnapshot.effectivePolicyKey,
      /^[a-f0-9]{64}$/,
    );
  }

  assert.deepEqual(
    result.items.map((item) => item.grossAmountInCentavos),
    [1500000, 2000000],
  );

  assert.ok(
    f.reads.includes("serviceCategories/catering_service"),
  );
});

test("short-notice event requires full payment for every provider", async () => {
  const result = await prepare(
    fixture(),
    "2026-12-17T10:01:00+08:00",
  );

  assert.deepEqual(
    result.items.map((item) => item.initialPaymentEligibility.mode),
    ["full_only", "full_only"],
  );

  assert.deepEqual(
    result.items.map((item) => item.initialPaymentEligibility.reason),
    ["short_notice", "short_notice"],
  );
});

test("disabled deposits require full payment for both providers", async () => {
  const result = await prepare(
    fixture({depositAllowed: false}),
    "2026-12-15T10:00:00+08:00",
  );

  assert.deepEqual(
    result.items.map((item) => item.initialPaymentEligibility.reason),
    ["deposit_disabled", "deposit_disabled"],
  );
});

test("full-payment package cannot become deposit eligible", async () => {
  const f = fixture();

  Object.assign(f.entries[0].packageData, {
    paymentPolicy: "full_payment",
    depositPercentage: 100,
    downPaymentPercentage: 100,
    balanceDueHoursBeforeEvent: null,
  });

  f.financials = prepareMultiProviderFinancials(f.entries);

  const result = await prepare(
    f,
    "2026-12-15T10:00:00+08:00",
  );

  assert.equal(
    result.items[0].initialPaymentEligibility.reason,
    "package_full_payment",
  );

  assert.equal(
    result.items[0].initialPaymentEligibility.mode,
    "full_only",
  );

  assert.equal(
    result.items[1].initialPaymentEligibility.depositEligible,
    true,
  );
});

test("missing category authority rejects the complete preparation", async () => {
  const f = fixture({missingCategory: true});

  await assert.rejects(
    () => prepare(f, "2026-12-15T10:00:00+08:00"),
    (error) => {
      assert.ok(
        ["invalid-argument", "failed-precondition"].includes(error.code),
      );
      return true;
    },
  );
});

test("all providers use one captured submission timestamp", async () => {
  const submissionTime = "2026-12-15T10:00:00+08:00";

  const result = await prepare(fixture(), submissionTime);

  const times = result.items.map((item) =>
    item.initialPaymentEligibility.submittedAt.toISOString(),
  );

  assert.equal(times[0], new Date(submissionTime).toISOString());
  assert.equal(times[1], times[0]);
});

test("financial identity mismatch fails before policy reads", async () => {
  const f = fixture();

  f.financials.items[1].packageId = "package_wrong";

  await assert.rejects(
    () => prepare(f, "2026-12-15T10:00:00+08:00"),
  );

  assert.equal(
    f.reads.includes("serviceCategories/package_wrong"),
    false,
  );
});