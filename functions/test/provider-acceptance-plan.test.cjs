const assert = require("node:assert/strict");
const test = require("node:test");
const {providerAcceptancePlan} = require("../lib/provider-requests/provider-acceptance-plan.js");

function document(id, status, downPaymentAmount = 20) {
  const data = {
    providerRequestId: id, mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", status, amount: 100, downPaymentAmount,
  };
  return {id, data: () => data};
}

function plan(requests, overrides = {}) {
  return providerAcceptancePlan({
    mainEventId: "event_test",
    mainEvent: {customerId: "customer_test", providerRequestIds: requests.map((doc) => doc.id)},
    mainEventStatus: "pending_provider_approval",
    providerRequestId: "request_current", requests, ...overrides,
  });
}

test("pending or failed required providers keep acceptance held and payment locked", () => {
  for (const status of ["pending", "rejected", "expired", "cancelled"]) {
    const requests = [document("request_current", "pending"),
      document("request_accepted", "accepted"), document("request_other", status)];
    const result = plan(requests);
    assert.equal(result.allAccepted, false, status);
    assert.equal(result.nextStatus, "accepted", status);
    assert.deepEqual(result.overrides, [{providerRequestId: "request_current", status: "accepted"}]);
    assert.equal(result.summary.acceptedProviderRequestCount, 2);
    if (["rejected", "expired"].includes(status)) {
      assert.equal(result.summary.status, "needs_provider_replacement");
    }
    assert.equal(requests[0].data().status, "pending", "planning cannot mutate stored requests");
  }
});

test("last response promotes all held acceptances together with each required payment", () => {
  const result = plan([
    document("request_current", "pending"), document("request_accepted", "accepted"),
    document("request_free", "accepted", 0),
  ]);
  assert.equal(result.allAccepted, true);
  assert.equal(result.summary.status, "waiting_for_down_payment");
  assert.equal(result.summary.waitingPaymentProviderRequestCount, 2);
  assert.equal(result.summary.confirmedProviderRequestCount, 1);
  assert.deepEqual(result.overrides, [
    {providerRequestId: "request_current", status: "waiting_for_down_payment"},
    {providerRequestId: "request_accepted", status: "waiting_for_down_payment"},
    {providerRequestId: "request_free", status: "confirmed"},
  ]);
});

test("zero-deposit services also wait for all responses before confirmation", () => {
  assert.equal(plan([document("request_current", "pending", 0),
    document("request_other", "pending", 0)]).nextStatus, "accepted");
  const result = plan([document("request_current", "pending", 0),
    document("request_other", "accepted", 0)]);
  assert.equal(result.summary.status, "confirmed");
});

test("legacy accepted-or-later siblings retain their existing payment state", () => {
  const result = plan([document("request_current", "pending"),
    document("request_legacy", "waiting_for_down_payment"),
    document("request_paid", "confirmed")]);
  assert.equal(result.allAccepted, true);
  assert.equal(result.overrides.length, 1);
});

test("canonical IDs must be exact, unique, complete, and well formed", () => {
  const requests = [document("request_current", "pending"), document("request_other", "accepted")];
  for (const ids of [undefined, [], ["request_current"],
    ["request_current", "request_current"], ["request_current", "request_missing"],
    ["request_current", "request_other", null], ["request_current", " request_other"]]) {
    assert.throws(() => plan(requests, {mainEvent: {
      customerId: "customer_test", providerRequestIds: ids,
    }}), {code: "failed-precondition"});
  }
  assert.throws(() => plan([requests[0], requests[0]]), {code: "failed-precondition"});
});

test("cross-event/customer snapshots, unknown states, and replay plans fail closed", () => {
  for (const patch of [{mainEventId: "event_other"}, {bookingId: "event_other"},
    {customerId: "customer_other"}, {providerRequestId: "request_other"}, {status: "unknown"},
    {status: "accepted"}]) {
    const request = document("request_current", "pending");
    Object.assign(request.data(), patch);
    assert.throws(() => plan([request]), {code: "failed-precondition"});
  }
});

test("invalid sibling financial snapshots cannot become payment-ready or confirmed", () => {
  for (const amount of [undefined, null, -1, NaN, Infinity, "20", 101]) {
    const sibling = document("request_other", "accepted");
    sibling.data().downPaymentAmount = amount;
    assert.throws(() => plan([document("request_current", "pending"), sibling]),
      {code: "failed-precondition"});
  }
});
