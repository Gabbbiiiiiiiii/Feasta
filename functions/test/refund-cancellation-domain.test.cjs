const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {pathToFileURL} = require("node:url");
const {Timestamp} = require("firebase-admin/firestore");

const domain = require(
  "../lib/cancellations/refund-cancellation-domain.js",
);

function state(overrides = {}) {
  return {
    schemaVersion: 1,
    currentStage: "preparation_not_started",
    stageSequence: 0,
    enteredAt: Timestamp.now(),
    activeCancellationRequestId: null,
    ...overrides,
  };
}

function reason(expected, operation) {
  assert.throws(operation, (error) => {
    assert.equal(error.details?.reason, expected);
    return true;
  });
}

test("refund eligibility transitions are monotonic and server sequenced", () => {
  assert.equal(
    domain.assertRefundEligibilityTransition(
      "preparation_not_started",
      "preparation_not_started",
    ),
    false,
  );
  assert.equal(
    domain.assertRefundEligibilityTransition(
      "preparation_not_started",
      "preparation_started",
    ),
    true,
  );
  assert.equal(
    domain.assertRefundEligibilityTransition(
      "preparation_not_started",
      "service_started",
    ),
    true,
  );
  assert.equal(
    domain.assertRefundEligibilityTransition(
      "preparation_started",
      "service_started",
    ),
    true,
  );
  reason(
    "REFUND_ELIGIBILITY_TRANSITION_INVALID",
    () => domain.assertRefundEligibilityTransition(
      "preparation_started",
      "preparation_not_started",
    ),
  );
  reason(
    "REFUND_ELIGIBILITY_TRANSITION_INVALID",
    () => domain.assertRefundEligibilityTransition(
      "service_started",
      "preparation_started",
    ),
  );

  const enteredAt = Timestamp.now();
  assert.deepEqual(
    domain.nextRefundEligibilityState(
      state({stageSequence: 7}),
      "preparation_started",
      enteredAt,
    ),
    {
      schemaVersion: 1,
      currentStage: "preparation_started",
      stageSequence: 8,
      enteredAt,
      activeCancellationRequestId: null,
    },
  );
});

test("unknown stages and active cancellation locks fail closed", () => {
  assert.equal(
    domain.parseRefundEligibilityStage("service_started"),
    "service_started",
  );
  reason(
    "REFUND_ELIGIBILITY_INVALID",
    () => domain.parseRefundEligibilityStage("procurement_started"),
  );
  reason(
    "REFUND_ELIGIBILITY_LOCKED",
    () => domain.assertRefundEligibilityUnlocked(state({
      activeCancellationRequestId: "cancellation_locked_001",
    })),
  );
});

test("preparation readiness follows confirmed payment truth", () => {
  const paidAt = Timestamp.now();
  assert.doesNotThrow(() => domain.assertPreparationReady({
    providerRequestStatus: "confirmed",
    downPaymentAmount: 0,
    providerRequestPaymentStatus: "unpaid",
    paidAt: null,
    paymentStatus: null,
  }));
  assert.doesNotThrow(() => domain.assertPreparationReady({
    providerRequestStatus: "confirmed",
    downPaymentAmount: 2000,
    providerRequestPaymentStatus: "paid",
    paidAt,
    paymentStatus: "paid",
  }));
  for (const candidate of [
    {
      providerRequestStatus: "waiting_for_down_payment",
      downPaymentAmount: 0,
      providerRequestPaymentStatus: "unpaid",
      paidAt: null,
      paymentStatus: null,
    },
    {
      providerRequestStatus: "confirmed",
      downPaymentAmount: 2000,
      providerRequestPaymentStatus: "unpaid",
      paidAt: null,
      paymentStatus: "pending",
    },
  ]) {
    reason(
      "REFUND_ELIGIBILITY_TRANSITION_INVALID",
      () => domain.assertPreparationReady(candidate),
    );
  }
});

test("lifecycle invariants bind in-progress work to service started", () => {
  assert.doesNotThrow(() => domain.assertEligibilityLifecycleInvariant({
    providerRequestStatus: "in_progress",
    state: state({
      currentStage: "service_started",
      stageSequence: 1,
    }),
  }));
  reason(
    "CANCELLATION_POLICY_EVIDENCE_INVALID",
    () => domain.assertEligibilityLifecycleInvariant({
      providerRequestStatus: "in_progress",
      state: state(),
    }),
  );
  reason(
    "CANCELLATION_POLICY_EVIDENCE_INVALID",
    () => domain.assertEligibilityLifecycleInvariant({
      providerRequestStatus: "confirmed",
      state: state({currentStage: "service_started"}),
    }),
  );
});

test("cancellation submission statuses and routing are explicit", () => {
  for (const status of [
    "waiting_for_down_payment",
    "payment_processing",
    "confirmed",
    "in_progress",
  ]) {
    assert.doesNotThrow(() =>
      domain.assertCancellationSubmissionAllowed(status));
  }
  for (const status of [
    "pending",
    "accepted",
    "rejected",
    "completed",
    "cancelled",
    "expired",
  ]) {
    reason(
      "CANCELLATION_NOT_ALLOWED",
      () => domain.assertCancellationSubmissionAllowed(status),
    );
  }
  assert.equal(domain.cancellationInitialStatus({
    policyEvidenceStatus: "policy_backed",
    paymentResolutionPending: false,
  }), "submitted");
  assert.equal(domain.cancellationInitialStatus({
    policyEvidenceStatus: "legacy",
    paymentResolutionPending: false,
  }), "under_review");
  assert.equal(domain.cancellationInitialStatus({
    policyEvidenceStatus: "policy_backed",
    paymentResolutionPending: true,
  }), "awaiting_payment_resolution");
});

test("the reserved cancellation state machine rejects forbidden transitions", () => {
  for (const [from, to] of [
    ["submitted", "under_review"],
    ["awaiting_payment_resolution", "submitted"],
    ["under_review", "approved"],
    ["approved", "refund_processing"],
    ["refund_processing", "refund_failed"],
    ["refund_failed", "refund_processing"],
    ["refund_failed", "refund_completed"],
  ]) {
    assert.doesNotThrow(() =>
      domain.assertCancellationStatusTransition(from, to));
  }
  reason(
    "CANCELLATION_NOT_ALLOWED",
    () => domain.assertCancellationStatusTransition(
      "refund_completed",
      "submitted",
    ),
  );
  reason(
    "CANCELLATION_NOT_ALLOWED",
    () => domain.assertCancellationStatusTransition(
      "submitted",
      "refund_completed",
    ),
  );
  reason(
    "CANCELLATION_NOT_ALLOWED",
    () => domain.assertCancellationStatusTransition(
      "unknown",
      "submitted",
    ),
  );
});

test("active workflow and attempt-specific request identity are bounded", () => {
  assert.equal(domain.isCancellationWorkflowActive("submitted"), true);
  assert.equal(domain.isCancellationWorkflowActive("refund_failed"), true);
  assert.equal(domain.isCancellationWorkflowActive("rejected"), false);
  assert.equal(domain.isCancellationWorkflowActive("refund_completed"), false);

  const attempt = {
    providerRequestId: "provider_request_001",
    customerId: "customer_001",
    operationKey: "operation_hash_001",
  };
  const first = domain.cancellationRequestIdForAttempt(attempt);
  assert.equal(
    first,
    domain.cancellationRequestIdForAttempt(attempt),
  );
  assert.notEqual(
    first,
    domain.cancellationRequestIdForAttempt({
      ...attempt,
      operationKey: "operation_hash_002",
    }),
  );
  assert.notEqual(
    first,
    domain.cancellationRequestIdForAttempt({
      ...attempt,
      customerId: "customer_002",
    }),
  );
  assert.match(first, /^cancellation_[a-f0-9]{40}$/u);
});

test("cleared active pointers permit a new attempt without reopening rejected history", () => {
  const first = domain.cancellationRequestIdForAttempt({
    providerRequestId: "provider_request_001",
    customerId: "customer_001",
    operationKey: "operation_hash_001",
  });
  const second = domain.cancellationRequestIdForAttempt({
    providerRequestId: "provider_request_001",
    customerId: "customer_001",
    operationKey: "operation_hash_002",
  });

  assert.notEqual(first, second);
  assert.equal(domain.isCancellationWorkflowActive("rejected"), false);
  assert.equal(domain.legacyActiveCancellationRequestId({
    activeCancellationRequestId: null,
  }), null);
  assert.equal(domain.legacyActiveCancellationRequestId({
    activeCancellationRequestId: second,
  }), second);
  reason(
    "CANCELLATION_POLICY_EVIDENCE_INVALID",
    () => domain.legacyActiveCancellationRequestId({
      activeCancellationRequestId: "unsafe/id",
    }),
  );
});

test("B4 Functions constants remain aligned with the shared contract", async () => {
  const shared = await import(pathToFileURL(path.resolve(
    __dirname,
    "../../packages/shared-types/dist/index.js",
  )).href);
  assert.equal(
    domain.PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION,
    shared.PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION,
  );
  assert.deepEqual(
    domain.PROVIDER_REQUEST_CANCELLATION_STATUSES,
    shared.PROVIDER_REQUEST_CANCELLATION_STATUSES,
  );
});
