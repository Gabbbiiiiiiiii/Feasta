const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertCustomerCancellationEnabled,
  parseCancellationRefundRollout,
} = require("../lib/cancellations/cancellation-rollout.js");

test("customer cancellation rollout is closed when configuration is absent", () => {
  assert.deepEqual(parseCancellationRefundRollout({
    exists: false,
    data: undefined,
  }), {
    customerCancellationMode: "off",
    automaticPolicyRefundApprovalMode: "off",
  });
});

test("customer cancellation rollout rejects malformed or unsafe combinations", () => {
  for (const data of [
    {},
    {schemaVersion: 1, isPublic: true},
    {
      schemaVersion: 1,
      isPublic: false,
      customerCancellationMode: "review_only",
      automaticPolicyRefundApprovalMode: "enabled",
    },
    {
      schemaVersion: 1,
      isPublic: false,
      customerCancellationMode: "unknown",
      automaticPolicyRefundApprovalMode: "off",
    },
  ]) {
    assert.throws(
      () => parseCancellationRefundRollout({exists: true, data}),
      (error) => error.details?.reason === "CANCELLATION_ROLLOUT_INVALID",
    );
  }
});

test("review-only rollout permits submission while automatic approval stays off", () => {
  const rollout = parseCancellationRefundRollout({
    exists: true,
    data: {
      schemaVersion: 1,
      isPublic: false,
      customerCancellationMode: "review_only",
      automaticPolicyRefundApprovalMode: "off",
    },
  });
  assert.doesNotThrow(() => assertCustomerCancellationEnabled(rollout));
  assert.equal(rollout.automaticPolicyRefundApprovalMode, "off");
});

test("off rollout blocks customer submission", () => {
  assert.throws(
    () => assertCustomerCancellationEnabled({
      customerCancellationMode: "off",
      automaticPolicyRefundApprovalMode: "off",
    }),
    (error) => error.details?.reason === "CUSTOMER_CANCELLATION_DISABLED",
  );
});
