const assert = require("node:assert/strict");
const test = require("node:test");
const {inspectAwaitingProviderEvidence: inspect, customerBookingHistoryQueryContract: plan} =
  require("../lib/bookings/customer-booking-search-prerequisites.js");
const {calculateMainEventRequestSummary: oldSummary} =
  require("../lib/provider-requests/recalculate-main-event-status.js");

function fixture(statuses, parent = "pending_provider_approval") {
  const linkedRequests = statuses.map((status, index) => ({id: `request_${index}`, data: {
    providerRequestId: `request_${index}`, mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", providerId: `provider_${index}`, status,
  }}));
  return {mainEventId: "event_test", mainEvent: {
    mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test", status: parent,
    providerRequestIds: linkedRequests.map(request => request.id),
    providerRequestCount: statuses.length,
    pendingProviderRequestCount: statuses.filter(status => status === "pending").length,
  }, linkedRequests};
}

function reconciliation(input, reason) {
  assert.deepEqual(inspect(input), {kind: "reconciliation_required", reason});
}

test("v1 mixed unanswered, accepted, rejected, cancelled and expired requests", () => {
  for (const parent of ["pending_provider_approval", "needs_provider_replacement"]) {
    const input = fixture(["pending", "accepted", "rejected", "cancelled", "expired", "pending"], parent);
    assert.deepEqual(inspect(input), {kind: "validated", relationshipVersion: 1,
      pendingProviderRequestCount: 2, awaitingProvider: true});
  }
});

test("rejected-only and all responded bookings are never awaiting a response", () => {
  for (const statuses of [["rejected"], ["accepted", "rejected", "cancelled", "expired"],
    ["waiting_for_down_payment", "payment_processing", "confirmed", "in_progress", "completed"]]) {
    const result = inspect(fixture(statuses, "needs_provider_replacement"));
    assert.equal(result.kind, "validated");
    assert.equal(result.pendingProviderRequestCount, 0);
    assert.equal(result.awaitingProvider, false);
  }
});

test("absent version and explicit v1 have identical complete active membership", () => {
  const input = fixture(["pending", "rejected"]);
  const before = inspect(input);
  input.mainEvent.providerRequestRelationshipVersion = 1;
  assert.deepEqual(inspect(input), before);
});

test("invalid status demonstrates legacy fallback hazard without changing the calculator", () => {
  for (const status of [undefined, null, "unknown", 7, {}]) {
    const input = fixture(["rejected", status]);
    const documents = input.linkedRequests.map(({id, data}) => ({id, data: () => data}));
    assert.equal(oldSummary(documents, "needs_provider_replacement").pendingProviderRequestCount, 1);
    reconciliation(input, "invalid-request-status");
  }
  const input = fixture(["Pending"]);
  reconciliation(input, "noncanonical-request-status");
});

test("missing, extra, duplicate, or foreign linked records require reconciliation", () => {
  for (const mutate of [
    input => input.linkedRequests.pop(),
    input => input.mainEvent.providerRequestIds.pop(),
    input => input.linkedRequests.push(input.linkedRequests[0]),
  ]) {
    const input = fixture(["pending", "accepted"]); mutate(input);
    reconciliation(input, "complete-membership-mismatch");
  }
  const input = fixture(["pending"]);
  input.linkedRequests[0].data.customerId = "customer_foreign";
  reconciliation(input, "request-event-identity-mismatch");
});

test("missing or invalid membership cannot be interpreted as zero pending", () => {
  for (const ids of [undefined, null, [], ["request_0", "request_0"]]) {
    const input = fixture(["pending"]); input.mainEvent.providerRequestIds = ids;
    assert.equal(inspect(input).kind, "reconciliation_required");
  }
});

test("missing, invalid, positive stale, and zero stale indexed counts remain unknown", () => {
  for (const count of [undefined, null, "1", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const input = fixture(["pending"]); input.mainEvent.pendingProviderRequestCount = count;
    reconciliation(input, "invalid-stored-counts");
  }
  for (const [statuses, count] of [[["pending"], 0], [["rejected"], 1]]) {
    const input = fixture(statuses); input.mainEvent.pendingProviderRequestCount = count;
    reconciliation(input, "stored-count-mismatch");
  }
  const input = fixture(["pending"]); input.mainEvent.providerRequestCount = 2;
  reconciliation(input, "stored-count-mismatch");
});

test("contradictory response evidence and parent status are not silently excluded", () => {
  for (const field of ["respondedAt", "acceptedAt", "rejectedAt", "cancelledAt", "expiredAt",
    "confirmedAt", "completedAt"]) {
    const input = fixture(["pending"]); input.linkedRequests[0].data[field] = {seconds: 10};
    reconciliation(input, "pending-request-has-response-evidence");
  }
  reconciliation(fixture(["pending"], "confirmed"), "pending-parent-status-mismatch");
  reconciliation(fixture(["pending"], "pending"), "invalid-main-event-status");
  const input = fixture(["pending"]); input.linkedRequests[0].data.respondedAt = null;
  assert.equal(inspect(input).kind, "validated");
});

test("replacement data never enables v2 consumption or pretends v1 supports supersession", () => {
  const input = fixture(["rejected", "pending"]);
  input.linkedRequests[1].data.replacesProviderRequestId = "request_0";
  reconciliation(input, "mixed-v1-v2-relationship-data");
  input.mainEvent.providerRequestRelationshipVersion = 2;
  input.mainEvent.activeProviderRequestIds = ["request_1"];
  reconciliation(input, "relationship-version-not-enabled");
  input.mainEvent.providerRequestRelationshipVersion = 3;
  reconciliation(input, "relationship-version-not-enabled");
});

test("inspection is immutable and independent of Firestore/auth/network runtime", () => {
  const input = fixture(["pending", "accepted", "rejected"]);
  const before = structuredClone(input);
  input.linkedRequests.forEach(document => { Object.freeze(document.data); Object.freeze(document); });
  Object.freeze(input.mainEvent.providerRequestIds); Object.freeze(input.mainEvent);
  Object.freeze(input.linkedRequests); Object.freeze(input);
  assert.equal(inspect(input).awaitingProvider, true);
  assert.deepEqual(input, before);
});

// Small in-memory index model: tests only the emitted pure query contract.
// This does NOT simulate Firestore deployment/index availability.
function candidateBatch(contract, rows, after) {
  return rows.filter(row => contract.equalities.every(({field, value}) => row.data[field] === value))
    .filter(row => !after || row.id > after)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, contract.limit);
}

test("bounded ID-ordered history includes sparse drafts and same-time ties beyond 30", () => {
  const rows = Array.from({length: 75}, (_, index) => ({id: `event_${String(index).padStart(3, "0")}`,
    data: {customerId: "customer_test", status: index % 2 ? "draft" : "confirmed",
      ...(index % 3 ? {createdAt: {seconds: 10}, isDeleted: false} : {})}}));
  rows.push({id: "foreign", data: {customerId: "customer_foreign", status: "draft"}});
  rows[33].data.isDeleted = true;
  for (const filter of ["all", "draft"]) {
    const contract = plan({customerId: "customer_test", filter, pageSize: 10});
    assert.deepEqual(contract.order, [{field: "__name__", direction: "ASCENDING"}]);
    assert.equal(contract.limit, 11);
    assert.ok(contract.equalities.every(({field}) => field !== "createdAt" && field !== "isDeleted"));
    const found = []; let after;
    for (let batches = 0; batches < 10; batches++) {
      const batch = candidateBatch(contract, rows, after);
      // A bounded candidate-batch protocol consumes every candidate and binds
      // continuation to last SCANNED ID, including deleted records.
      found.push(...batch.filter(row => row.data.isDeleted !== true).map(row => row.id));
      if (batch.length < contract.limit) break;
      after = batch.at(-1).id;
    }
    const expected = rows.filter(row => row.data.customerId === "customer_test" &&
      row.data.isDeleted !== true && (filter === "all" || row.data.status === "draft")).map(row => row.id);
    assert.deepEqual(found, expected);
    assert.equal(new Set(found).size, found.length);
    assert.ok(found.includes("event_073"));
  }
});

test("history contract is bounded and refuses unsupported prerequisite filters", () => {
  assert.equal(plan({customerId: "customer_test", filter: "draft", pageSize: 30}).limit, 31);
  for (const patch of [{pageSize: 0}, {pageSize: 31}, {pageSize: 1.5},
    {customerId: ""}, {customerId: "bad/id"}, {filter: "awaiting_provider"}]) {
    assert.throws(() => plan({customerId: "customer_test", filter: "all", pageSize: 10, ...patch}));
  }
});

test("empty/deleted candidate batches continue from scanned IDs without restarting", () => {
  const contract = plan({customerId: "customer_test", filter: "draft", pageSize: 1});
  assert.deepEqual(candidateBatch(contract, [], undefined), []);
  const rows = ["a", "b", "c"].map(id => ({id, data: {
    customerId: "customer_test", status: "draft", ...(id !== "c" ? {isDeleted: true} : {}),
  }}));
  const first = candidateBatch(contract, rows, undefined);
  assert.equal(first.length, 2);
  assert.equal(first.filter(row => row.data.isDeleted !== true).length, 0);
  const lastScanned = first.at(-1).id;
  const next = candidateBatch(contract, rows, lastScanned);
  assert.deepEqual(next.map(row => row.id), ["c"]);
  assert.equal(next.length < contract.limit, true);
  assert.deepEqual(candidateBatch(contract, rows, "c"), []);
});
