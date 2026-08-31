const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {Timestamp} = require("firebase-admin/firestore");

const domain = require(
  "../lib/bookings/booking-refund-policy.js",
);

const STAGES = [
  "preparation_not_started",
  "preparation_started",
  "service_started",
];

function policy(version, values, terms = null) {
  return {
    schemaVersion: 1,
    policyVersion: version,
    rules: STAGES.map((stage, index) => ({
      stage,
      refundBasisPoints: values[index],
    })),
    terms,
    effectiveAt: Timestamp.fromDate(
      new Date(`2026-08-${String(20 + version).padStart(2, "0")}T00:00:00Z`),
    ),
  };
}

function relationship(
  providerId,
  providerPolicy,
  packagePolicy = undefined,
) {
  return {
    providerId,
    providerName: `Provider ${providerId}`,
    providerData: {
      refundPolicy: providerPolicy,
      ownerId: `owner_${providerId}`,
      privateBankAccount: "must-not-render",
    },
    packageRecord: packagePolicy === undefined
      ? null
      : {
          packageId: `package_${providerId}`,
          data: {
            providerId,
            refundPolicyOverride: packagePolicy,
            unpublishedInternalField: "must-not-render",
          },
        },
  };
}

function expectReason(reason, operation) {
  assert.throws(operation, (error) => {
    assert.equal(error.details?.reason, reason);
    return true;
  });
}

test("rollout is off when absent and fails closed when a stored gate is malformed", () => {
  assert.equal(
    domain.parseBookingRefundPolicyRollout({
      exists: false,
      data: undefined,
    }),
    "off",
  );
  assert.equal(
    domain.parseBookingRefundPolicyRollout({
      exists: true,
      data: {
        schemaVersion: 1,
        enforcementMode: "required",
        isPublic: false,
      },
    }),
    "required",
  );

  expectReason(
    "REFUND_POLICY_INVALID",
    () => domain.parseBookingRefundPolicyRollout({
      exists: true,
      data: {
        schemaVersion: 1,
        enforcementMode: "disabled",
        isPublic: false,
      },
    }),
  );
});

test("booking relationships resolve Provider defaults, package overrides, and add-on fallback", () => {
  const providerDefault = policy(4, [8_000, 3_000, 0]);
  const packageOverride = policy(7, [10_000, 5_000, 0], "Package terms");
  const addOnDefault = policy(2, [9_000, 2_500, 0]);
  const resolved = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_catering_001",
      providerDefault,
      packageOverride,
    ),
    relationship(
      "provider_photo_001",
      addOnDefault,
    ),
  ]);

  assert.equal(
    resolved.get("provider_catering_001")?.effective.source.kind,
    "package_override",
  );
  assert.equal(
    resolved.get("provider_catering_001")?.effective.effectivePolicyKey,
    "package_override:package_provider_catering_001:v7",
  );
  assert.equal(
    resolved.get("provider_photo_001")?.effective.source.kind,
    "provider_default",
  );

  const fallback = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_catering_001",
      providerDefault,
      null,
    ),
  ]);
  assert.equal(
    fallback.get("provider_catering_001")?.effective.source.kind,
    "provider_default",
  );
});

test("disclosures expose only bounded Customer-safe policy presentation", () => {
  const resolved = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_catering_001",
      policy(1, [10_000, 4_000, 0], "Customer-facing terms"),
    ),
  ]);
  const disclosures = domain.refundPolicyDisclosures(resolved);

  assert.deepEqual(Object.keys(disclosures[0]).sort(), [
    "effectivePolicyKey",
    "policyVersion",
    "providerId",
    "providerName",
    "rules",
    "sourceKind",
    "terms",
  ]);
  assert.equal(disclosures[0].terms, "Customer-facing terms");
  assert.doesNotMatch(
    JSON.stringify(disclosures),
    /owner_|privateBankAccount|unpublishedInternalField|effectiveAt/u,
  );
});

test("missing and malformed Provider policies fail with stable safe reasons", () => {
  expectReason(
    "REFUND_POLICY_REQUIRED",
    () => domain.resolveBookingRefundPolicies([
      relationship("provider_missing_001", undefined),
    ]),
  );
  expectReason(
    "REFUND_POLICY_INVALID",
    () => domain.resolveBookingRefundPolicies([
      relationship("provider_invalid_001", {
        policyVersion: 1,
      }),
    ]),
  );
});

test("acknowledgements are bounded, exact, unordered, and unique by Provider", () => {
  const parsed = domain.parseRefundPolicyAcknowledgements([
    {
      providerId: "provider_photo_001",
      effectivePolicyKey:
        "provider_default:provider_photo_001:v2",
    },
    {
      providerId: "provider_catering_001",
      effectivePolicyKey:
        "provider_default:provider_catering_001:v1",
    },
  ]);
  assert.deepEqual(
    parsed.map((entry) => entry.providerId),
    ["provider_catering_001", "provider_photo_001"],
  );

  for (const invalid of [
    [{
      providerId: "provider_catering_001",
      effectivePolicyKey: "provider_default:provider_catering_001:v1",
      rules: [],
    }],
    [{
      providerId: "provider_catering_001",
      effectivePolicyKey: "provider_default:provider_catering_001:v1",
      refundBasisPoints: 10_000,
    }],
    [{
      providerId: "provider_catering_001",
      effectivePolicyKey: "provider_default:provider_catering_001:v1",
      currentStage: "preparation_not_started",
    }],
    [
      {
        providerId: "provider_catering_001",
        effectivePolicyKey: "provider_default:provider_catering_001:v1",
      },
      {
        providerId: "provider_catering_001",
        effectivePolicyKey: "provider_default:provider_catering_001:v1",
      },
    ],
  ]) {
    expectReason(
      "REFUND_POLICY_ACKNOWLEDGEMENT_INVALID",
      () => domain.parseRefundPolicyAcknowledgements(invalid),
    );
  }
});

test("multi-Provider acknowledgements require the exact canonical set", () => {
  const policies = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_a_001",
      policy(1, [10_000, 5_000, 0]),
    ),
    relationship(
      "provider_b_001",
      policy(3, [8_000, 2_000, 0]),
    ),
    relationship(
      "provider_c_001",
      policy(2, [9_000, 4_000, 500]),
    ),
  ]);
  const valid = [...policies.values()].map((entry) => ({
    providerId: entry.providerId,
    effectivePolicyKey: entry.effective.effectivePolicyKey,
  }));

  assert.doesNotThrow(() =>
    domain.assertRefundPolicyAcknowledgements(policies, valid));
  expectReason(
    "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED",
    () => domain.assertRefundPolicyAcknowledgements(
      policies,
      valid.slice(0, 2),
    ),
  );
  expectReason(
    "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED",
    () => domain.assertRefundPolicyAcknowledgements(
      policies,
      [...valid, {
        providerId: "provider_extra_001",
        effectivePolicyKey:
          "provider_default:provider_extra_001:v1",
      }],
    ),
  );
  expectReason(
    "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED",
    () => domain.assertRefundPolicyAcknowledgements(
      policies,
      valid.map((entry, index) =>
        index === 0
          ? {...entry, providerId: "provider_wrong_001"}
          : entry),
    ),
  );
});

test("a stale policy key fails the whole match with refresh guidance", () => {
  const disclosed = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_catering_001",
      policy(1, [10_000, 5_000, 0]),
    ),
  ]);
  const acknowledgement = [{
    providerId: "provider_catering_001",
    effectivePolicyKey:
      disclosed.get("provider_catering_001").effective.effectivePolicyKey,
  }];
  const current = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_catering_001",
      policy(2, [8_000, 3_000, 0]),
    ),
  ]);

  assert.throws(
    () => domain.assertRefundPolicyAcknowledgements(
      current,
      acknowledgement,
    ),
    (error) => {
      assert.equal(error.details?.reason, "REFUND_POLICY_CHANGED");
      assert.equal(error.details?.refreshRefundPolicies, true);
      return true;
    },
  );
});

test("server evidence copies the complete policy and initializes eligibility", () => {
  const resolved = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_catering_001",
      policy(5, [7_500, 2_500, 0], "Exact agreed terms"),
    ),
  ]).get("provider_catering_001");
  const timestamp = Timestamp.fromDate(
    new Date("2026-08-30T12:00:00Z"),
  );
  const evidence =
    domain.buildProviderRequestRefundPolicyEvidence(
      resolved,
      timestamp,
    );

  assert.equal(
    evidence.refundPolicySnapshot.policyKey,
    evidence.refundPolicyAgreement.policyKey,
  );
  assert.equal(evidence.refundPolicySnapshot.source.policyVersion, 5);
  assert.deepEqual(
    evidence.refundPolicySnapshot.rules.map(
      (rule) => rule.refundBasisPoints,
    ),
    [7_500, 2_500, 0],
  );
  assert.equal(evidence.refundPolicySnapshot.terms, "Exact agreed terms");
  assert.equal(evidence.refundPolicySnapshot.capturedAt, timestamp);
  assert.equal(evidence.refundPolicyAgreement.agreedAt, timestamp);
  assert.equal(
    evidence.refundPolicyAgreement.channel,
    "booking_submission",
  );
  assert.deepEqual(evidence.refundEligibilityState, {
    schemaVersion: 1,
    currentStage: "preparation_not_started",
    stageSequence: 0,
    enteredAt: timestamp,
    activeCancellationRequestId: null,
  });
});

test("legacy evidence classification is explicit and partial or tampered evidence fails closed", () => {
  assert.deepEqual(
    domain.classifyProviderRequestRefundPolicyEvidence({}),
    {status: "legacy"},
  );

  const resolved = domain.resolveBookingRefundPolicies([
    relationship(
      "provider_catering_001",
      policy(1, [10_000, 5_000, 0]),
    ),
  ]).get("provider_catering_001");
  const evidence =
    domain.buildProviderRequestRefundPolicyEvidence(
      resolved,
      Timestamp.now(),
    );

  assert.deepEqual(
    domain.classifyProviderRequestRefundPolicyEvidence(evidence),
    {status: "policy_backed"},
  );
  assert.deepEqual(
    domain.classifyProviderRequestRefundPolicyEvidence({
      ...evidence,
      refundEligibilityState: {
        ...evidence.refundEligibilityState,
        currentStage: "preparation_started",
        stageSequence: 1,
      },
    }),
    {status: "policy_backed"},
  );
  assert.deepEqual(
    domain.classifyProviderRequestRefundPolicyEvidence({
      ...evidence,
      refundEligibilityState: {
        ...evidence.refundEligibilityState,
        currentStage: "preparation_started",
        stageSequence: 2,
      },
    }),
    {status: "invalid"},
  );
  assert.deepEqual(
    domain.classifyProviderRequestRefundPolicyEvidence({
      ...evidence,
      refundEligibilityState: {
        ...evidence.refundEligibilityState,
        activeCancellationRequestId: "cancellation_policy_001",
      },
    }),
    {status: "policy_backed"},
  );
  assert.deepEqual(
    domain.classifyProviderRequestRefundPolicyEvidence({
      refundPolicySnapshot: evidence.refundPolicySnapshot,
    }),
    {status: "invalid"},
  );
  assert.deepEqual(
    domain.classifyProviderRequestRefundPolicyEvidence({
      ...evidence,
      refundPolicyAgreement: {
        ...evidence.refundPolicyAgreement,
        policyKey: "provider_default:provider_catering_001:v99",
      },
    }),
    {status: "invalid"},
  );
});

test("booking input rejects client-selected refund policy authority", () => {
  for (const field of [
    "refundPolicy",
    "refundPolicySnapshot",
    "refundPolicyAgreement",
    "refundEligibilityState",
    "rules",
    "terms",
    "refundBasisPoints",
    "refundPercentage",
    "refundAmount",
    "policyVersion",
    "eligibilityStage",
    "currentStage",
    "stage",
  ]) {
    expectReason(
      "REFUND_POLICY_ACKNOWLEDGEMENT_INVALID",
      () => domain.rejectClientRefundPolicyAuthority({
        [field]: "browser-controlled",
      }),
    );
  }
});

test("B3 Functions constants remain in parity with the shared contract", async () => {
  const sharedPath = path.resolve(
    __dirname,
    "../../packages/shared-types/dist/index.js",
  );
  const shared = await import(pathToFileURL(sharedPath).href);

  assert.equal(
    domain.REFUND_POLICY_AGREEMENT_SCHEMA_VERSION,
    shared.REFUND_POLICY_AGREEMENT_SCHEMA_VERSION,
  );
  assert.equal(
    domain.REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION,
    shared.REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION,
  );
});
