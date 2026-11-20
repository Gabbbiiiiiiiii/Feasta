"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  prepareMultiProviderFinancials,
} = require("../lib/bookings/multi-provider-financial-preparation.js");

const {
  prepareMultiProviderBookingAgreements,
  confirmMultiProviderBookingAgreements,
} = require("../lib/bookings/multi-provider-agreement-preparation.js");

const {
  evaluateSubmissionPaymentEligibility,
} = require("../lib/payments/initial-payment-eligibility.js");

const {
  buildBookingPaymentPolicySnapshot,
} = require("../lib/bookings/booking-payment-eligibility-policy.js");

const {
  prepareMultiProviderRefundPolicies,
} = require("../lib/bookings/multi-provider-refund-preparation.js");

const {Timestamp} = require("firebase-admin/firestore");

const eventDate = new Date("2026-12-20T00:00:00+08:00");
const eventTime = "10:00";
const eventEndTime = "18:00";

function refundPolicy(version) {
  return {
    schemaVersion: 1,
    policyVersion: version,
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: 10000},
      {stage: "preparation_started", refundBasisPoints: 5000},
      {stage: "service_started", refundBasisPoints: 0},
    ],
    terms: null,
    effectiveAt: Timestamp.fromDate(
      new Date("2026-08-21T00:00:00Z"),
    ),
  };
}

function makeRows() {
  return [1, 2].map((index) => {
    const providerId = `provider_00${index}`;
    const packageId = `package_00${index}`;

    const paymentPolicy =
      index === 1 ? "deposit_then_balance" : "full_payment";

    const percent = index === 1 ? 30 : 100;

    return {
      providerId,
      providerOwnerId: `owner_00${index}`,
      providerData: {
        businessName: `Provider ${index}`,
        refundPolicy: refundPolicy(index),
      },
      packageData: {
        providerId,
        serviceCategoryCode: "catering_service",
        paymentTermsSchemaVersion: 2,
        paymentPolicy,
        depositPercentage: percent,
        downPaymentPercentage: percent,
        balanceDueDaysBeforeEvent: null,
        balanceDueHoursBeforeEvent:
          index === 1 ? 24 : null,
      },
      resolved: {
        providerId,
        packageId,
        packageName: `Package ${index}`,
        basePrice: index === 1 ? 1000.05 : 2500,
        offer: {
          serviceTier: "drop_off",
          serviceTierLabel: "Drop-off",
          serviceTierIncludedServices: [],
          packageThemeId: null,
          packageThemeName: null,
          packageThemeDescription: null,
          packageThemeImageUrls: [],
        },
        foodChoices: [],
      },
    };
  });
}

function makeFixture({
  submissionTime = "2026-12-15T10:00:00+08:00",
  refundRequired = false,
  depositAllowed = true,
} = {}) {
  const rows = makeRows();

  const financials = prepareMultiProviderFinancials(
    rows.map((row) => ({
      providerId: row.providerId,
      packageId: row.resolved.packageId,
      packageData: row.packageData,
      resolved: row.resolved,
    })),
  );

  const policySnapshot = (packageId) =>
    buildBookingPaymentPolicySnapshot({
      platformSettings: null,
      serviceCategoryCode: "catering_service",
      serviceCategory: {
        bookingPolicy: {
          payment: {
            depositAllowed,
            depositMinimumNoticeHours: 48,
          },
        },
      },
      packageId,
      packageData: {},
    });

  const eligibility = {
    items: rows.map((row, index) => {
      const terms = financials.items[index].packagePaymentTerms;
      const policy = policySnapshot(row.resolved.packageId);

      return {
        providerId: row.providerId,
        packageId: row.resolved.packageId,
        grossAmountInCentavos:
          financials.items[index].grossAmountInCentavos,
        bookingPaymentPolicySnapshot: policy,
        initialPaymentEligibility:
          evaluateSubmissionPaymentEligibility({
            eventDate,
            eventTime,
            submissionTime: new Date(submissionTime),
            packagePaymentTerms: terms,
            bookingPaymentPolicySnapshot: policy,
          }),
      };
    }),
  };

  const refunds = prepareMultiProviderRefundPolicies({
    rows,
    rollout: refundRequired
      ? {
          exists: true,
          data: {
            schemaVersion: 1,
            enforcementMode: "required",
            isPublic: false,
          },
        }
      : {exists: false, data: undefined},
  });

  return {
    customerId: "customer_001",
    rows,
    financials,
    eligibility,
    refunds,
    guestCount: 100,
    eventEndTime,
  };
}

function prepare(fixture) {
  return prepareMultiProviderBookingAgreements(fixture);
}

function ack(prepared) {
  return prepared.agreements.map((agreement) => ({
    providerId: agreement.providerId,
    agreementKey: agreement.agreementKey,
  }));
}

test("creates separate deposit and full-payment agreements", () => {
  const prepared = prepare(makeFixture());

  assert.equal(prepared.agreements.length, 2);
  assert.equal(prepared.disclosures.length, 2);

  const [first, second] = prepared.agreements;

  assert.equal(first.grossAmountInCentavos, 100005);
  assert.equal(first.requiredUpfrontAmountInCentavos, 30002);
  assert.equal(first.remainingBalanceInCentavos, 70003);
  assert.equal(first.depositEligible, true);

  assert.equal(second.grossAmountInCentavos, 250000);
  assert.equal(second.requiredUpfrontAmountInCentavos, 250000);
  assert.equal(second.remainingBalanceInCentavos, 0);
  assert.equal(second.depositEligible, false);
});

test("short notice forces full upfront payment", () => {
  const prepared = prepare(makeFixture({
    submissionTime: "2026-12-17T10:01:00+08:00",
  }));

  assert.equal(
    prepared.agreements[0].requiredUpfrontAmountInCentavos,
    100005,
  );

  assert.equal(prepared.agreements[0].depositEligible, false);
  assert.equal(prepared.agreements[0].remainingBalanceInCentavos, 0);
});

test("disabled deposits force full upfront payment", () => {
  const prepared = prepare(makeFixture({depositAllowed: false}));

  assert.equal(
    prepared.agreements[0].requiredUpfrontAmountInCentavos,
    100005,
  );

  assert.equal(prepared.agreements[0].depositEligible, false);
});

test("valid acknowledgements cover both provider agreements", () => {
  const prepared = prepare(makeFixture());

  assert.doesNotThrow(() =>
    confirmMultiProviderBookingAgreements(
      prepared,
      ack(prepared).reverse(),
    ),
  );
});

test("missing and duplicate agreement acknowledgements fail", () => {
  const prepared = prepare(makeFixture());
  const acknowledged = ack(prepared);

  for (const invalid of [
    acknowledged.slice(0, 1),
    [acknowledged[0], acknowledged[0]],
  ]) {
    assert.throws(() =>
      confirmMultiProviderBookingAgreements(prepared, invalid),
    );
  }
});

test("a changed provider price invalidates the old agreement", () => {
  const original = prepare(makeFixture());
  const oldAcknowledgements = ack(original);

  const changed = makeFixture();
  changed.rows[0].resolved.basePrice = 1200.05;

  changed.financials = prepareMultiProviderFinancials(
    changed.rows.map((row) => ({
      providerId: row.providerId,
      packageId: row.resolved.packageId,
      packageData: row.packageData,
      resolved: row.resolved,
    })),
  );

  changed.eligibility.items[0].grossAmountInCentavos = 120005;

  const current = prepare(changed);

  assert.notEqual(
    original.agreements[0].agreementKey,
    current.agreements[0].agreementKey,
  );

  assert.throws(() =>
    confirmMultiProviderBookingAgreements(
      current,
      oldAcknowledgements,
    ),
  );
});

test("refund policy changes invalidate agreement acknowledgement", () => {
  const original = prepare(makeFixture({refundRequired: true}));
  const originalAcknowledgements = ack(original);

  const changed = makeFixture({refundRequired: true});

  changed.rows[0].providerData.refundPolicy =
    refundPolicy(7);

  changed.refunds = prepareMultiProviderRefundPolicies({
    rows: changed.rows,
    rollout: {
      exists: true,
      data: {
        schemaVersion: 1,
        enforcementMode: "required",
        isPublic: false,
      },
    },
  });

  const current = prepare(changed);

  assert.notEqual(
    current.agreements[0].agreementKey,
    original.agreements[0].agreementKey,
  );

  assert.throws(() =>
    confirmMultiProviderBookingAgreements(
      current,
      originalAcknowledgements,
    ),
  );
});

test("mismatched financial provider identity fails closed", () => {
  const fixture = makeFixture();
  fixture.financials.items[1].providerId = "provider_wrong";

  assert.throws(() => prepare(fixture), {
    code: "failed-precondition",
  });
});

test("shared event start is required for all agreements", () => {
  const fixture = makeFixture();

  fixture.eligibility.items[1].initialPaymentEligibility.eventStartAt =
    new Date("2026-12-21T02:00:00Z");

  assert.throws(() => prepare(fixture), {
    code: "failed-precondition",
  });
});