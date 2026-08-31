import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRESTORE_COLLECTIONS,
  REFUND_BASIS_POINTS_MAX,
  REFUND_BASIS_POINTS_MIN,
  REFUND_ELIGIBILITY_STAGES,
  REFUND_POLICY_SCHEMA_VERSION,
  REFUND_POLICY_TERMS_MAX_LENGTH,
  REFUND_POLICY_AGREEMENT_SCHEMA_VERSION,
  REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION,
  PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION,
  PROVIDER_REQUEST_CANCELLATION_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_TRANSITIONS,
} from "../dist/index.js";

test("refund policy shared constants describe the approved serializable contract", () => {
  assert.equal(REFUND_POLICY_SCHEMA_VERSION, 1);
  assert.deepEqual(REFUND_ELIGIBILITY_STAGES, [
    "preparation_not_started",
    "preparation_started",
    "service_started",
  ]);
  assert.equal(REFUND_BASIS_POINTS_MIN, 0);
  assert.equal(REFUND_BASIS_POINTS_MAX, 10_000);
  assert.equal(REFUND_POLICY_TERMS_MAX_LENGTH, 4_000);
  assert.equal(REFUND_POLICY_AGREEMENT_SCHEMA_VERSION, 1);
  assert.equal(REFUND_ELIGIBILITY_STATE_SCHEMA_VERSION, 1);
  assert.equal(PROVIDER_REQUEST_CANCELLATION_SCHEMA_VERSION, 1);
  assert.deepEqual(PROVIDER_REQUEST_CANCELLATION_STATUSES, [
    "submitted",
    "awaiting_payment_resolution",
    "under_review",
    "approved",
    "rejected",
    "refund_processing",
    "refund_failed",
    "refund_completed",
    "cancelled_no_refund",
  ]);
  assert.equal(
    FIRESTORE_COLLECTIONS.providerRequestCancellationRequests,
    "providerRequestCancellationRequests",
  );
});

test("payment contracts include canonical partial-refund transitions", () => {
  assert.equal(PAYMENT_STATUSES.includes("partially_refunded"), true);
  assert.deepEqual(
    PAYMENT_STATUS_TRANSITIONS.paid,
    ["partially_refunded", "refunded"],
  );
  assert.deepEqual(
    PAYMENT_STATUS_TRANSITIONS.partially_refunded,
    ["refunded"],
  );
});
