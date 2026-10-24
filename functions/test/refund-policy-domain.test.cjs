const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const test = require("node:test");
const {Timestamp} = require("firebase-admin/firestore");

const domain = require(
  "../lib/refund-policies/refund-policy-domain.js",
);

const STAGES = [
  "preparation_not_started",
  "preparation_started",
  "service_started",
];

function policyDraft(values = [10_000, 5_000, 0], terms = null) {
  return {
    rules: STAGES.map((stage, index) => ({
      stage,
      refundBasisPoints: values[index],
    })),
    terms,
  };
}

function storedPolicy(version, overrides = {}) {
  return {
    schemaVersion: 1,
    policyVersion: version,
    ...policyDraft(),
    effectiveAt: Timestamp.fromDate(
      new Date("2026-08-30T04:00:00.000Z"),
    ),
    ...overrides,
  };
}

function assertCode(expectedCode, operation) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

test("policy validation accepts zero, partial, and full integer basis points", () => {
  for (const values of [
    [0, 0, 0],
    [8_000, 3_333, 125],
    [10_000, 10_000, 10_000],
  ]) {
    const parsed = domain.parseRefundPolicyDraft(
      policyDraft(values),
    );
    assert.deepEqual(
      parsed.rules.map((rule) => rule.refundBasisPoints),
      values,
    );
  }
});

test("policy validation canonicalizes rule order and trims optional terms", () => {
  const draft = policyDraft(
    [10_000, 5_000, 0],
    "  Additional provider terms.  ",
  );
  draft.rules.reverse();

  const parsed = domain.parseRefundPolicyDraft(draft);
  assert.deepEqual(
    parsed.rules.map((rule) => rule.stage),
    STAGES,
  );
  assert.equal(parsed.terms, "Additional provider terms.");
  assert.equal(
    domain.parseRefundPolicyDraft(policyDraft(undefined, "   ")).terms,
    null,
  );
});

test("policy validation rejects invalid basis points", () => {
  for (const invalid of [-1, 10_001, 5.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const draft = policyDraft();
    draft.rules[0].refundBasisPoints = invalid;
    assertCode(
      "invalid-argument",
      () => domain.parseRefundPolicyDraft(draft),
    );
  }
});

test("policy validation rejects unknown, duplicate, and missing stages", () => {
  const unknown = policyDraft();
  unknown.rules[0].stage = "booking_confirmed";
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(unknown),
  );

  const duplicate = policyDraft();
  duplicate.rules[1].stage = duplicate.rules[0].stage;
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(duplicate),
  );

  const missing = policyDraft();
  missing.rules.pop();
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(missing),
  );
});

test("policy validation rejects unknown fields and client-owned authority", () => {
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft({
      ...policyDraft(),
      policyVersion: 99,
    }),
  );
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft({
      ...policyDraft(),
      schemaVersion: 1,
    }),
  );
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft({
      ...policyDraft(),
      effectiveAt: new Date(),
    }),
  );
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft({
      ...policyDraft(),
      source: "provider_default",
    }),
  );

  const unknownRule = policyDraft();
  unknownRule.rules[0].refundPercentage = 100;
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(unknownRule),
  );
});

test("policy validation bounds written terms", () => {
  const accepted = domain.parseRefundPolicyDraft(
    policyDraft(undefined, "x".repeat(4_000)),
  );
  assert.equal(accepted.terms.length, 4_000);

  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(
      policyDraft(undefined, "x".repeat(4_001)),
    ),
  );
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(
      policyDraft(undefined, ` ${"x".repeat(4_000)}`),
    ),
  );
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(
      policyDraft(undefined, " ".repeat(4_001)),
    ),
  );
  assertCode(
    "invalid-argument",
    () => domain.parseRefundPolicyDraft(
      policyDraft(undefined, 42),
    ),
  );
});

test("stored policies fail closed on malformed server-owned fields", () => {
  assert.equal(domain.parseStoredRefundPolicy(null), null);
  assert.equal(
    domain.parseStoredRefundPolicy(undefined),
    null,
  );
  assert.equal(
    domain.parseStoredRefundPolicy(storedPolicy(1)).policyVersion,
    1,
  );

  for (const malformed of [
    storedPolicy(1, {schemaVersion: 2}),
    storedPolicy(0),
    storedPolicy(1, {effectiveAt: new Date()}),
    {...storedPolicy(1), unexpected: true},
  ]) {
    assertCode(
      "failed-precondition",
      () => domain.parseStoredRefundPolicy(malformed),
    );
  }
});

test("server versioning starts at one and increments safely", () => {
  const first = domain.buildNextRefundPolicy({
    currentPolicyVersion: null,
    draft: domain.parseRefundPolicyDraft(policyDraft()),
    effectiveAt: "server-time-1",
  });
  const second = domain.buildNextRefundPolicy({
    currentPolicyVersion: first.policyVersion,
    draft: domain.parseRefundPolicyDraft(
      policyDraft([9_000, 4_000, 0]),
    ),
    effectiveAt: "server-time-2",
  });

  assert.equal(first.policyVersion, 1);
  assert.equal(second.policyVersion, 2);
  assert.equal(second.effectiveAt, "server-time-2");
  assertCode(
    "failed-precondition",
    () => domain.nextRefundPolicyVersion(Number.MAX_SAFE_INTEGER),
  );
});

test("effective policy resolution prefers a canonical package override", () => {
  const provider = {refundPolicy: storedPolicy(4)};
  const packageOverride = storedPolicy(7, {
    rules: policyDraft([7_500, 2_500, 0]).rules,
  });
  const resolved = domain.resolveEffectiveRefundPolicy({
    providerId: "provider_alpha_001",
    provider,
    packageRecord: {
      packageId: "package_alpha_001",
      data: {
        providerId: "provider_alpha_001",
        refundPolicyOverride: packageOverride,
      },
    },
  });

  assert.equal(resolved.status, "resolved");
  assert.equal(
    resolved.effective.source.kind,
    "package_override",
  );
  assert.equal(
    resolved.effective.effectivePolicyKey,
    "package_override:package_alpha_001:v7",
  );
  assert.equal(resolved.effective.policy.policyVersion, 7);
});

test("resolution falls back to Provider default for package and add-on requests", () => {
  const provider = {refundPolicy: storedPolicy(4)};

  for (const packageRecord of [
    null,
    {
      packageId: "package_alpha_001",
      data: {
        providerId: "provider_alpha_001",
        refundPolicyOverride: null,
      },
    },
  ]) {
    const resolved = domain.resolveEffectiveRefundPolicy({
      providerId: "provider_alpha_001",
      provider,
      packageRecord,
    });
    assert.equal(resolved.status, "resolved");
    assert.equal(
      resolved.effective.source.kind,
      "provider_default",
    );
    assert.equal(
      resolved.effective.effectivePolicyKey,
      "provider_default:provider_alpha_001:v4",
    );
  }
});

test("resolution represents missing legacy policy and rejects foreign packages", () => {
  assert.deepEqual(
    domain.resolveEffectiveRefundPolicy({
      providerId: "provider_alpha_001",
      provider: {},
    }),
    {
      status: "missing",
      reason: "provider_default_missing",
    },
  );

  assertCode(
    "failed-precondition",
    () => domain.resolveEffectiveRefundPolicy({
      providerId: "provider_alpha_001",
      provider: {refundPolicy: storedPolicy(1)},
      packageRecord: {
        packageId: "package_foreign_001",
        data: {
          providerId: "provider_foreign_001",
        },
      },
    }),
  );
});

test("effective keys are deterministic, bounded, and reject unsafe identifiers", () => {
  const input = {
    kind: "provider_default",
    sourceId: "provider_alpha_001",
    policyVersion: 12,
  };
  assert.equal(
    domain.effectiveRefundPolicyKey(input),
    domain.effectiveRefundPolicyKey(input),
  );
  assert.equal(
    domain.effectiveRefundPolicyKey(input),
    "provider_default:provider_alpha_001:v12",
  );
  assertCode(
    "failed-precondition",
    () => domain.effectiveRefundPolicyKey({
      ...input,
      sourceId: "../unsafe",
    }),
  );
});

test("Functions runtime constants remain in parity with shared serializable contract", async () => {
  const sharedPath = path.resolve(
    __dirname,
    "../../packages/shared-types/dist/index.js",
  );
  const shared = await import(
    pathToFileURL(sharedPath).href
  );

  assert.equal(
    domain.REFUND_POLICY_SCHEMA_VERSION,
    shared.REFUND_POLICY_SCHEMA_VERSION,
  );
  assert.deepEqual(
    domain.REFUND_ELIGIBILITY_STAGES,
    shared.REFUND_ELIGIBILITY_STAGES,
  );
  assert.equal(
    domain.REFUND_BASIS_POINTS_MIN,
    shared.REFUND_BASIS_POINTS_MIN,
  );
  assert.equal(
    domain.REFUND_BASIS_POINTS_MAX,
    shared.REFUND_BASIS_POINTS_MAX,
  );
  assert.equal(
    domain.REFUND_POLICY_TERMS_MAX_LENGTH,
    shared.REFUND_POLICY_TERMS_MAX_LENGTH,
  );
});
