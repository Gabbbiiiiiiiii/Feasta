"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {Timestamp} = require("firebase-admin/firestore");

const candidates = [
  "../lib/bookings/multi-provider-refund-preparation.js",
  "../lib/src/bookings/multi-provider-refund-preparation.js",
  "../dist/bookings/multi-provider-refund-preparation.js",
  "../dist/src/bookings/multi-provider-refund-preparation.js",
];

const compiled = candidates
  .map((candidate) => path.resolve(__dirname, candidate))
  .find((candidate) => fs.existsSync(candidate));

assert.ok(compiled, "Compiled refund preparation module missing.");

const {
  prepareMultiProviderRefundPolicies,
  confirmMultiProviderRefundAcknowledgements,
} = require(compiled);

const stages = [
  "preparation_not_started",
  "preparation_started",
  "service_started",
];

function policy(version, rates) {
  return {
    schemaVersion: 1,
    policyVersion: version,
    rules: stages.map((stage, index) => ({
      stage,
      refundBasisPoints: rates[index],
    })),
    terms: null,
    effectiveAt: Timestamp.fromDate(
      new Date("2026-08-21T00:00:00Z"),
    ),
  };
}

function rows() {
  return [1, 2].map((index) => {
    const suffix = `00${index}`;
    const providerId = `provider_${suffix}`;

    return {
      providerId,
      providerOwnerId: `owner_${suffix}`,
      providerData: {
        businessName: `Provider ${index}`,
        refundPolicy: policy(
          index,
          index === 1 ? [10000, 5000, 0] : [8000, 2500, 0],
        ),
      },
      packageData: {
        providerId,
      },
      resolved: {
        providerId,
        packageId: `package_${suffix}`,
        packageName: `Package ${index}`,
      },
    };
  });
}

const required = {
  exists: true,
  data: {
    schemaVersion: 1,
    enforcementMode: "required",
    isPublic: false,
  },
};

const capturedAt = Timestamp.fromDate(
  new Date("2026-11-12T08:00:00Z"),
);

function prepare(inputRows = rows(), rollout = required) {
  return prepareMultiProviderRefundPolicies({
    rows: inputRows,
    rollout,
  });
}

function acknowledgements(prepared) {
  return [...prepared.policies.values()].map((item) => ({
    providerId: item.providerId,
    effectivePolicyKey: item.effective.effectivePolicyKey,
  }));
}

function expectReason(expected, action) {
  assert.throws(action, (error) => {
    assert.equal(error.details?.reason, expected);
    return true;
  });
}

test("required rollout resolves both provider refund policies", () => {
  const prepared = prepare();

  assert.equal(prepared.mode, "required");
  assert.equal(prepared.policies.size, 2);
  assert.equal(prepared.disclosures.length, 2);

  assert.deepEqual(
    prepared.disclosures.map((item) => item.providerId),
    ["provider_001", "provider_002"],
  );

  for (const item of prepared.disclosures) {
    assert.equal(
      Object.hasOwn(item, "privateBankAccount"),
      false,
    );
  }
});

test("valid acknowledgements produce independent frozen evidence", () => {
  const prepared = prepare();

  const evidence = confirmMultiProviderRefundAcknowledgements(
    prepared,
    acknowledgements(prepared).reverse(),
    capturedAt,
  );

  assert.equal(evidence.size, 2);

  for (const [providerId, item] of evidence) {
    assert.equal(
      item.refundPolicySnapshot.policyKey,
      prepared.policies.get(providerId).effective.effectivePolicyKey,
    );
    assert.equal(
      item.refundPolicyAgreement.channel,
      "booking_submission",
    );
    assert.equal(
      item.refundEligibilityState.currentStage,
      "preparation_not_started",
    );
    assert.equal(item.refundPolicySnapshot.capturedAt, capturedAt);
  }
});

test("missing provider acknowledgement is rejected", () => {
  const prepared = prepare();

  expectReason("REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED", () =>
    confirmMultiProviderRefundAcknowledgements(
      prepared,
      acknowledgements(prepared).slice(0, 1),
      capturedAt,
    ),
  );
});

test("duplicate provider acknowledgement is rejected", () => {
  const prepared = prepare();
  const first = acknowledgements(prepared)[0];

  expectReason("REFUND_POLICY_ACKNOWLEDGEMENT_INVALID", () =>
    confirmMultiProviderRefundAcknowledgements(
      prepared,
      [first, first],
      capturedAt,
    ),
  );
});

test("stale refund acknowledgement is rejected", () => {
  const prepared = prepare();
  const accepted = acknowledgements(prepared);

  accepted[0].effectivePolicyKey = "provider_default:provider_001:v99";

  expectReason("REFUND_POLICY_CHANGED", () =>
    confirmMultiProviderRefundAcknowledgements(
      prepared,
      accepted,
      capturedAt,
    ),
  );
});

test("package override takes precedence over provider default", () => {
  const data = rows();

  data[0].packageData.refundPolicyOverride =
    policy(7, [10000, 2500, 0]);

  const prepared = prepare(data);

  assert.equal(
    prepared.policies.get("provider_001").effective.source.kind,
    "package_override",
  );

  assert.equal(
    prepared.policies.get("provider_002").effective.source.kind,
    "provider_default",
  );
});

test("missing provider refund policy fails closed", () => {
  const data = rows();

  delete data[0].providerData.refundPolicy;

  expectReason("REFUND_POLICY_REQUIRED", () =>
    prepare(data),
  );
});

test("off rollout produces no refund agreement evidence", () => {
  const prepared = prepare(rows(), {
    exists: false,
    data: undefined,
  });

  assert.equal(prepared.mode, "off");
  assert.equal(prepared.policies.size, 0);
  assert.deepEqual(prepared.disclosures, []);

  const evidence = confirmMultiProviderRefundAcknowledgements(
    prepared,
    undefined,
    capturedAt,
  );

  assert.equal(evidence.size, 0);
});

test("malformed rollout configuration fails closed", () => {
  expectReason("REFUND_POLICY_INVALID", () =>
    prepare(rows(), {
      exists: true,
      data: {
        schemaVersion: 1,
        enforcementMode: "disabled",
        isPublic: false,
      },
    }),
  );
});

test("mismatched package ownership is rejected", () => {
  const data = rows();

  data[1].packageData.providerId = "provider_wrong";

  assert.throws(() => prepare(data), {
    code: "failed-precondition",
  });
});