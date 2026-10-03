const assert = require("node:assert/strict");
const test = require("node:test");
const {resolveProviderRequestDocuments, requireProviderRequestDocuments, requireActiveProviderRequest} =
  require("../lib/provider-requests/provider-request-relationship-integrity.js");

function fixture() {
  const requests = ["request_A", "request_B"].map((id) => ({id, data: () => ({
    providerRequestId: id, mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", providerId: `provider_${id}`, status: "accepted",
  })}));
  return {mainEventId: "event_test", mainEvent: {
    mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test",
    providerRequestIds: requests.map(({id}) => id),
  }, requests};
}

test("snapshot adapter preserves complete and active v1 membership in canonical order", () => {
  const input = fixture(); input.requests.reverse();
  const result = requireProviderRequestDocuments(input);
  assert.equal(result.version, 1);
  assert.deepEqual(result.complete, result.activeRequired);
  assert.deepEqual(result.activeRequests.map(({id}) => id), input.mainEvent.providerRequestIds);
  assert.deepEqual(result.historicalRequests, []);
  requireActiveProviderRequest(result, "request_A");
  assert.throws(() => requireActiveProviderRequest(result, "request_unknown"),
    {code: "failed-precondition", details: {reason: "provider-request-not-active"}});
});

test("exhaustive query adapter refuses unlisted documents and missing complete members", () => {
  for (const mutate of [
    (input) => input.mainEvent.providerRequestIds.pop(),
    (input) => input.requests.pop(),
  ]) {
    const input = fixture(); mutate(input);
    assert.deepEqual(resolveProviderRequestDocuments(input),
      {ok: false, reason: "complete-membership-mismatch"});
    assert.throws(() => requireProviderRequestDocuments(input),
      {code: "failed-precondition", details: {reason: "complete-membership-mismatch"}});
  }
});

test("adapter rejects a forged v2 active projection without successor evidence", () => {
  const input = fixture();
  Object.assign(input.mainEvent, {providerRequestRelationshipVersion: 2,
    activeProviderRequestIds: ["request_A"]});
  assert.deepEqual(resolveProviderRequestDocuments(input), {ok: false, reason: "active-set-mismatch"});
});

test("valid v2 original-only projection retains every document", () => {
  const input = fixture();
  Object.assign(input.mainEvent, {providerRequestRelationshipVersion: 2,
    activeProviderRequestIds: [...input.mainEvent.providerRequestIds]});
  const result = requireProviderRequestDocuments(input);
  assert.equal(result.version, 2);
  assert.deepEqual(result.completeRequests, input.requests);
  assert.deepEqual(result.activeRequests, input.requests);
});
