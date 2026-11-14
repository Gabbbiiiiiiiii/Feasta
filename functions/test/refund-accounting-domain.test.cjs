const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {pathToFileURL} = require("node:url");
const {Timestamp} = require("firebase-admin/firestore");

const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../lib");
const domain = require(path.join(
  libRoot,
  "refunds/refund-accounting-domain.js",
));

const stages = [
  "preparation_not_started",
  "preparation_started",
  "service_started",
];

test("integer basis-point calculator uses explicit half-up centavo rounding", () => {
  const cases = [
    [1_000_000, 0, 0],
    [1_000_000, 1, 100],
    [1_000_000, 5_000, 500_000],
    [1_000_000, 7_500, 750_000],
    [1_000_000, 10_000, 1_000_000],
    [101, 5_000, 51],
    [1, 5_000, 1],
    [2, 2_499, 0],
    [2, 2_501, 1],
    [Number.MAX_SAFE_INTEGER, 10_000, Number.MAX_SAFE_INTEGER],
  ];
  for (const [amount, bps, expected] of cases) {
    assert.equal(domain.roundHalfUpBasisPoints(amount, bps), expected);
  }
});

test("calculator subtracts completed and reserved money from policy target", () => {
  assert.deepEqual(domain.calculateRefundAmounts({
    originalPaidAmountInCentavos: 1_000_000,
    refundBasisPoints: 7_500,
    completedRefundAmountInCentavos: 100_000,
    reservedRefundAmountInCentavos: 50_000,
    frozenStage: "preparation_started",
  }), {
    schemaVersion: 1,
    calculationStatus: "calculated",
    frozenStage: "preparation_started",
    refundBasisPoints: 7_500,
    originalPaidAmountInCentavos: 1_000_000,
    targetTotalRefundAmountInCentavos: 750_000,
    completedRefundAmountInCentavos: 100_000,
    reservedRefundAmountInCentavos: 50_000,
    eligibleRefundAmountInCentavos: 600_000,
    remainingRefundableAmountInCentavos: 850_000,
    currency: "PHP",
  });
});

test("zero-basis-point cancellation is valid and has nothing refundable", () => {
  const result = domain.calculateRefundAmounts({
    originalPaidAmountInCentavos: 100_000,
    refundBasisPoints: 0,
    completedRefundAmountInCentavos: 0,
    reservedRefundAmountInCentavos: 0,
    frozenStage: "service_started",
  });
  assert.equal(result.calculationStatus, "nothing_refundable");
  assert.equal(result.targetTotalRefundAmountInCentavos, 0);
  assert.equal(result.eligibleRefundAmountInCentavos, 0);
});

test("no settled payment yields a zero-money decision while processing waits", () => {
  const providerRequest = policyRequest([10_000, 5_000, 0]);
  const cancellationRequest = cancellation("preparation_not_started");
  const noPayment = domain.calculateCancellationRefund({
    providerRequest,
    cancellationRequest,
    payment: null,
  });
  assert.equal(noPayment.calculationStatus, "nothing_refundable");
  assert.equal(noPayment.originalPaidAmountInCentavos, 0);
  assertReason(() => domain.calculateCancellationRefund({
    providerRequest,
    cancellationRequest,
    payment: {
      ...paidPayment(100),
      status: "processing",
      paidAt: null,
    },
  }), "REFUND_PAYMENT_NOT_SETTLED");
  const failed = domain.calculateCancellationRefund({
    providerRequest,
    cancellationRequest,
    payment: {
      ...paidPayment(100),
      status: "failed",
      paidAt: null,
    },
  });
  assert.equal(failed.eligibleRefundAmountInCentavos, 0);
});

test("snapshot and frozen stage are the only policy-rate authority", () => {
  const request = policyRequest([10_000, 5_000, 0]);
  request.currentProviderRefundPolicy = policy([0, 0, 0]);
  request.currentPackageRefundPolicyOverride = policy([1, 1, 1]);
  request.refundPolicySnapshot.terms = "Free text says 100%, but is not parsed.";
  const result = domain.calculateCancellationRefund({
    providerRequest: request,
    cancellationRequest: cancellation("preparation_started"),
    payment: paidPayment(101),
  });
  assert.equal(result.refundBasisPoints, 5_000);
  assert.equal(result.targetTotalRefundAmountInCentavos, 51);
});

test("legacy cancellation requires manual review without fabricated money", () => {
  const result = domain.calculateCancellationRefund({
    providerRequest: {},
    cancellationRequest: {
      policyEvidenceStatus: "legacy",
      frozenEligibility: null,
    },
    payment: paidPayment(10_000),
  });
  assert.equal(result.calculationStatus, "manual_review_required");
  assert.equal(result.refundBasisPoints, null);
  assert.equal(result.eligibleRefundAmountInCentavos, null);
});

test("invalid or mismatched policy evidence fails closed", () => {
  const missingRule = policyRequest([10_000, 5_000, 0]);
  missingRule.refundPolicySnapshot.rules.pop();
  assertReason(() => domain.calculateCancellationRefund({
    providerRequest: missingRule,
    cancellationRequest: cancellation("preparation_started"),
    payment: paidPayment(10_000),
  }), "REFUND_POLICY_EVIDENCE_INVALID");

  const duplicate = policyRequest([10_000, 5_000, 0]);
  duplicate.refundPolicySnapshot.rules[2].stage = "preparation_started";
  assertReason(() => domain.calculateCancellationRefund({
    providerRequest: duplicate,
    cancellationRequest: cancellation("preparation_started"),
    payment: paidPayment(10_000),
  }), "REFUND_POLICY_EVIDENCE_INVALID");

  assertReason(() => domain.calculateCancellationRefund({
    providerRequest: policyRequest([10_000, 5_000, 0]),
    cancellationRequest: {
      ...cancellation("preparation_started"),
      frozenEligibility: {stage: "unknown", stageSequence: 1, frozenAt: Timestamp.now()},
    },
    payment: paidPayment(10_000),
  }), "REFUND_FROZEN_ELIGIBILITY_INVALID");
  assertReason(() => domain.calculateCancellationRefund({
    providerRequest: policyRequest([10_000, 5_000, 0]),
    cancellationRequest: {
      ...cancellation("preparation_started"),
      frozenEligibility: {
        stage: "preparation_started",
        stageSequence: 2,
        frozenAt: Timestamp.now(),
      },
    },
    payment: paidPayment(10_000),
  }), "REFUND_FROZEN_ELIGIBILITY_INVALID");
});

test("calculator rejects unsafe amounts, rates, accounting, settlement, and currency", () => {
  for (const bps of [-1, 10_001, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => domain.calculateRefundAmounts({
      originalPaidAmountInCentavos: 100,
      refundBasisPoints: bps,
      completedRefundAmountInCentavos: 0,
      reservedRefundAmountInCentavos: 0,
      frozenStage: "preparation_not_started",
    }));
  }
  assert.throws(() => domain.calculateRefundAmounts({
    originalPaidAmountInCentavos: -1,
    refundBasisPoints: 5_000,
    completedRefundAmountInCentavos: 0,
    reservedRefundAmountInCentavos: 0,
    frozenStage: "preparation_not_started",
  }));
  assert.throws(() => domain.calculateRefundAmounts({
    originalPaidAmountInCentavos: 100,
    refundBasisPoints: 10_000,
    completedRefundAmountInCentavos: 80,
    reservedRefundAmountInCentavos: 21,
    frozenStage: "preparation_not_started",
  }));
  assertReason(() => domain.calculateCancellationRefund({
    providerRequest: policyRequest([10_000, 5_000, 0]),
    cancellationRequest: cancellation("preparation_not_started"),
    payment: {...paidPayment(100), currency: "USD"},
  }), "REFUND_CURRENCY_UNSUPPORTED");
  assertReason(() => domain.calculateCancellationRefund({
    providerRequest: policyRequest([10_000, 5_000, 0]),
    cancellationRequest: cancellation("preparation_not_started"),
    payment: {...paidPayment(100), paidAt: null},
  }), "REFUND_PAYMENT_NOT_SETTLED");
});

test("legacy payment accounting is safe for untouched paid and proven full refunds", () => {
  assert.deepEqual(domain.readRefundAccounting(paidPayment(100), 100), {
    refundedAmountInCentavos: 0,
    refundReservedAmountInCentavos: 0,
    compatibility: "legacy_unrefunded",
  });
  assert.deepEqual(domain.readRefundAccounting({
    ...paidPayment(100),
    status: "refunded",
    refundStatus: "completed",
    refundedAt: Timestamp.now(),
  }, 100), {
    refundedAmountInCentavos: 100,
    refundReservedAmountInCentavos: 0,
    compatibility: "legacy_fully_refunded",
  });
  assertReason(() => domain.readRefundAccounting({
    ...paidPayment(100),
    refundStatus: "requested",
    refundId: "refund_legacy",
  }, 100), "REFUND_ACCOUNTING_INVALID");
});

test("canonical accounting derives paid, partial, and full status", () => {
  assert.equal(domain.derivePaymentRefundStatus({
    originalPaidAmountInCentavos: 100,
    completedRefundAmountInCentavos: 0,
  }), "paid");
  assert.equal(domain.derivePaymentRefundStatus({
    originalPaidAmountInCentavos: 100,
    completedRefundAmountInCentavos: 1,
  }), "partially_refunded");
  assert.equal(domain.derivePaymentRefundStatus({
    originalPaidAmountInCentavos: 100,
    completedRefundAmountInCentavos: 100,
  }), "refunded");
  assert.throws(() => domain.derivePaymentRefundStatus({
    originalPaidAmountInCentavos: 100,
    completedRefundAmountInCentavos: 101,
  }));
});

test("refund operation identity is deterministic and transition rules are fail closed", () => {
  const input = {
    paymentId: "payment_one",
    cancellationRequestId: "cancellation_one",
    operationKey: "a".repeat(64),
  };
  assert.equal(domain.refundOperationId(input), domain.refundOperationId(input));
  assert.notEqual(
    domain.refundOperationId(input),
    domain.refundOperationId({...input, operationKey: "b".repeat(64)}),
  );
  assert.doesNotThrow(() => domain.assertRefundOperationTransition("reserved", "released"));
  assert.doesNotThrow(() => domain.assertRefundOperationTransition("reserved", "completed"));
  assert.throws(() => domain.assertRefundOperationTransition("completed", "released"));
  assert.throws(() => domain.assertRefundOperationTransition("processing", "released"));
});

test("B5 Functions constants remain aligned with shared refund contracts", async () => {
  const shared = await import(pathToFileURL(path.resolve(
    __dirname,
    "../../packages/shared-types/dist/index.js",
  )).href);
  assert.equal(
    domain.REFUND_CALCULATION_SCHEMA_VERSION,
    shared.REFUND_CALCULATION_SCHEMA_VERSION,
  );
  assert.equal(
    domain.REFUND_ACCOUNTING_SCHEMA_VERSION,
    shared.REFUND_ACCOUNTING_SCHEMA_VERSION,
  );
  assert.equal(
    domain.REFUND_OPERATION_SCHEMA_VERSION,
    shared.REFUND_OPERATION_SCHEMA_VERSION,
  );
  assert.deepEqual(
    domain.REFUND_OPERATION_STATUSES,
    shared.REFUND_OPERATION_STATUSES,
  );
});

function policyRequest(rates) {
  const now = Timestamp.now();
  return {
    refundPolicySnapshot: {
      schemaVersion: 1,
      policyKey: "provider_default:provider_test:v1",
      source: {
        kind: "provider_default",
        sourceId: "provider_test",
        policyVersion: 1,
      },
      rules: policy(rates),
      terms: null,
      capturedAt: now,
    },
    refundPolicyAgreement: {
      schemaVersion: 1,
      policyKey: "provider_default:provider_test:v1",
      agreedAt: now,
      channel: "booking_submission",
    },
    refundEligibilityState: {
      schemaVersion: 1,
      currentStage: "preparation_started",
      stageSequence: 1,
      enteredAt: now,
      activeCancellationRequestId: "cancellation_test",
    },
  };
}

function policy(rates) {
  return stages.map((stage, index) => ({
    stage,
    refundBasisPoints: rates[index],
  }));
}

function cancellation(stage) {
  return {
    policyEvidenceStatus: "policy_backed",
    frozenEligibility: {
      stage,
      stageSequence: stage === "preparation_not_started" ? 0 : 1,
      frozenAt: Timestamp.now(),
    },
  };
}

function paidPayment(amountInCentavos) {
  return {
    amountInCentavos,
    currency: "PHP",
    status: "paid",
    paidAt: Timestamp.now(),
  };
}

function assertReason(fn, reason) {
  assert.throws(fn, (error) => error?.details?.reason === reason);
}
