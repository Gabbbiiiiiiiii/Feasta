const assert = require("node:assert/strict");
const test = require("node:test");
const {createHmac} = require("node:crypto");
const {
  awaitingProviderCandidateQuery: parentPlan, awaitingProviderRelatedQuery: relatedPlan,
  awaitingProviderCandidateMatches: matches, consumeAwaitingProviderCandidates: consume,
  candidatePosition: position, compareCandidatePositions: compare,
  encodeCandidateCursor: encode, decodeCandidateCursor: decode,
} = require("../lib/bookings/customer-booking-candidate-pagination.js");

const key = Buffer.alloc(32, 7); // Fixture only; never a production key.
const binding = {customerId: "customer_test", status: "awaiting_provider", pageSize: 10,
  section: "history", searchMode: "none", searchValue: "", order: "created_at_desc_v1"};

function row(rank, statuses = ["pending"]) {
  const id = `event_${String(1000 - rank).padStart(4, "0")}`;
  const requests = statuses.map((status, index) => ({id: `request_${rank}_${index}`, data: {
    providerRequestId: `request_${rank}_${index}`, mainEventId: id, bookingId: id,
    customerId: binding.customerId, providerId: `provider_${index}`, status,
  }}));
  return {candidate: {id, data: {mainEventId: id, bookingId: id,
    customerId: binding.customerId, createdAt: {seconds: 10000 - Math.floor(rank / 4), nanoseconds: 0},
    status: statuses.includes("rejected") ? "needs_provider_replacement" : "pending_provider_approval",
    providerRequestIds: requests.map(request => request.id), providerRequestCount: requests.length,
    pendingProviderRequestCount: statuses.filter(status => status === "pending").length,
  }}, requests};
}

// Indexed-query model only. These arrays are fixtures, not DB collection reads.
function sourceBatch(rows, context, after) {
  const plan = parentPlan(context);
  assert.deepEqual(plan.filters.map(filter => filter.field), ["customerId", "status"]);
  return rows.map(row => row.candidate).filter(candidate =>
    candidate.data.customerId === context.customerId && candidate.data.createdAt &&
    plan.filters[1].value.includes(candidate.data.status))
    .filter(candidate => !after || compare(after, position(candidate)) < 0)
    .sort((a, b) => compare(position(a), position(b))).slice(0, plan.limit);
}

function page(rows, context = binding, token = null, calls = []) {
  const after = token ? decode(token, context, key) : null;
  const candidates = sourceBatch(rows, context, after);
  const result = consume({binding: context, after, candidates, evaluate: candidate => {
    const plan = relatedPlan(candidate);
    calls.push(plan);
    const linked = rows.find(row => row.candidate.id === candidate.id).requests.slice(0, plan.limit);
    return matches(candidate, linked);
  }});
  assert.ok(result.bookings.length <= context.pageSize);
  assert.ok(result.consumed <= 30);
  return {...result, nextCursor: result.nextPosition ? encode(context, result.nextPosition, key) : null};
}

function fails(action, reason, code = "failed-precondition") {
  assert.throws(action, error => error.code === code && error.reason === reason);
}

test("parent query has customer/status indexes, chronological ties and a fixed bound", () => {
  const plan = parentPlan(binding);
  assert.deepEqual(plan.filters, [
    {field: "customerId", operator: "==", value: "customer_test"},
    {field: "status", operator: "in", value: ["pending_provider_approval", "needs_provider_replacement"]},
  ]);
  assert.deepEqual(plan.order, [{field: "createdAt", direction: "desc"}, {field: "__name__", direction: "desc"}]);
  assert.equal(plan.limit, 31);
  assert.ok(!JSON.stringify(plan).includes("pendingProviderRequestCount"));
});

test("full page leaves lookahead and all later candidates unconsumed", () => {
  const rows = Array.from({length: 32}, (_, rank) => row(rank));
  const calls = [];
  const first = page(rows, binding, null, calls);
  assert.equal(first.bookings.length, 10);
  assert.equal(first.consumed, 10);
  assert.equal(calls.length, 10);
  assert.deepEqual(decode(first.nextCursor, binding, key), position(rows[9].candidate));
  const second = page(rows, binding, first.nextCursor);
  assert.equal(second.bookings[0].id, rows[10].candidate.id);
  assert.equal(new Set([...first.bookings, ...second.bookings].map(candidate => candidate.id)).size, 20);
});

test("31st candidate lookahead is neither evaluated nor skipped at the scan budget", () => {
  const rows = Array.from({length: 31}, (_, rank) => row(rank, rank < 30 ? ["rejected"] : ["pending"]));
  const calls = [];
  const first = page(rows, binding, null, calls);
  assert.equal(first.bookings.length, 0);
  assert.equal(first.consumed, 30);
  assert.equal(calls.length, 30);
  assert.deepEqual(decode(first.nextCursor, binding, key), position(rows[29].candidate));
  const second = page(rows, binding, first.nextCursor);
  assert.deepEqual(second.bookings.map(candidate => candidate.id), [rows[30].candidate.id]);
  assert.equal(second.nextCursor, null);
});

test("maximum page size displays 30 and carries the extra matching row forward", () => {
  const rows = Array.from({length: 31}, (_, rank) => row(rank));
  const context = {...binding, pageSize: 30};
  const first = page(rows, context);
  assert.equal(first.bookings.length, 30);
  const second = page(rows, context, first.nextCursor);
  assert.deepEqual(second.bookings.map(candidate => candidate.id), [rows[30].candidate.id]);
  assert.equal(second.hasMore, false);
});

test("more than 30 tied candidates paginate with no skipped or duplicated matches", () => {
  const rows = Array.from({length: 97}, (_, rank) => row(rank, rank % 3 ? ["pending", "accepted"] : ["rejected"]));
  rows[22].candidate.data.isDeleted = true;
  const found = []; let token = null;
  for (let requests = 0; requests < 12; requests++) {
    const result = page(rows, binding, token);
    found.push(...result.bookings.map(candidate => candidate.id));
    token = result.nextCursor;
    if (!token) break;
  }
  assert.equal(token, null);
  const expected = rows.filter((row, rank) => rank % 3 && row.candidate.data.isDeleted !== true)
    .map(row => row.candidate.id);
  assert.deepEqual(found, expected);
  assert.equal(new Set(found).size, found.length);
});

test("consecutive empty pages retain continuations before an older genuine match", () => {
  const rows = Array.from({length: 65}, (_, rank) => row(rank, rank < 64 ? ["rejected"] : ["pending"]));
  const first = page(rows);
  const second = page(rows, binding, first.nextCursor);
  assert.deepEqual(first.bookings, []); assert.equal(first.hasMore, true);
  assert.deepEqual(second.bookings, []); assert.equal(second.hasMore, true);
  const third = page(rows, binding, second.nextCursor);
  assert.deepEqual(third.bookings.map(candidate => candidate.id), [rows[64].candidate.id]);
  assert.equal(third.hasMore, false);
});

test("tombstones advance scan cursor without reading relationships", () => {
  const rows = Array.from({length: 33}, (_, rank) => row(rank));
  rows.slice(0, 31).forEach(row => {row.candidate.data.isDeleted = true; row.requests = [];});
  const calls = []; const first = page(rows, binding, null, calls);
  assert.deepEqual(first.bookings, []); assert.equal(calls.length, 0);
  assert.equal(first.nextPosition.documentId, rows[29].candidate.id);
  const second = page(rows, binding, first.nextCursor, calls);
  assert.deepEqual(second.bookings.map(candidate => candidate.id), rows.slice(31).map(row => row.candidate.id));
  assert.equal(calls.length, 2);
});

test("empty, exactly-budget final and exactly-page-size final batches end correctly", () => {
  assert.deepEqual(page([]).bookings, []); assert.equal(page([]).nextCursor, null);
  for (const size of [10, 30]) {
    const rows = Array.from({length: size}, (_, rank) => row(rank, ["rejected"]));
    const result = page(rows);
    assert.equal(result.consumed, size); assert.equal(result.hasMore, false);
  }
  const rows = Array.from({length: 10}, (_, rank) => row(rank));
  assert.equal(page(rows).nextCursor, null);
});

test("nanoseconds and ID break same-time ties without millisecond truncation", () => {
  const rows = [row(0), row(1), row(2)];
  rows[2].candidate.data.createdAt.nanoseconds = 2;
  rows[1].candidate.data.createdAt.nanoseconds = 1;
  const context = {...binding, pageSize: 1};
  const first = page(rows, context);
  const second = page(rows, context, first.nextCursor);
  const third = page(rows, context, second.nextCursor);
  assert.deepEqual([first, second, third].flatMap(result => result.bookings.map(candidate => candidate.id)),
    [rows[2].candidate.id, rows[1].candidate.id, rows[0].candidate.id]);
  assert.equal(third.hasMore, false);
});

test("stale zero/positive counts fail the page rather than silently omitting a booking", () => {
  for (const [statuses, count] of [[["pending"], 0], [["rejected"], 1]]) {
    const rows = [row(0), row(1, statuses)];
    rows[1].candidate.data.pendingProviderRequestCount = count;
    fails(() => page(rows), "stored-count-mismatch");
  }
});

test("missing, inconsistent, invalid and contradictory evidence aborts with reconciliation", () => {
  for (const [mutate, reason] of [
    [row => delete row.candidate.data.pendingProviderRequestCount, "invalid-stored-counts"],
    [row => row.requests.pop(), "complete-membership-mismatch"],
    [row => row.requests[0].data.status = "bogus", "invalid-request-status"],
    [row => row.requests[0].data.respondedAt = {seconds: 5}, "pending-request-has-response-evidence"],
    [row => row.requests[0].data.customerId = "foreign_customer", "request-event-identity-mismatch"],
  ]) {
    const rows = [row(0), row(1)]; mutate(rows[1]);
    fails(() => page(rows), reason);
  }
});

test("unsupported v2 is refused before related reads; unconsumed errors wait for their page", () => {
  const rows = Array.from({length: 11}, (_, rank) => row(rank));
  rows[10].candidate.data.providerRequestRelationshipVersion = 2;
  const first = page(rows);
  assert.equal(first.bookings.length, 10);
  const calls = [];
  fails(() => page(rows, binding, first.nextCursor, calls), "relationship-version-not-enabled");
  assert.equal(calls.length, 0);
});

test("bounded exhaustive linked queries allow 30 and refuse overflow, not truncation", () => {
  const valid = row(0, Array(30).fill("pending"));
  assert.equal(matches(valid.candidate, valid.requests), true);
  assert.deepEqual(relatedPlan(valid.candidate), {collection: "providerRequests",
    filters: [{field: "mainEventId", operator: "==", value: valid.candidate.id}], limit: 31});
  const overflow = row(0, Array(31).fill("pending"));
  fails(() => relatedPlan(overflow.candidate), "related-record-budget-exceeded");
  const hidden = row(0, Array(30).fill("pending"));
  hidden.requests.push(row(1).requests[0]);
  fails(() => matches(hidden.candidate, hidden.requests), "related-record-budget-exceeded");
});

test("conservative read budget is 31 parent records + 30 bounded linked queries", () => {
  const rows = Array.from({length: 31}, (_, rank) => row(rank, Array(30).fill("rejected")));
  const calls = []; page(rows, binding, null, calls);
  assert.equal(calls.length, 30);
  assert.ok(calls.every(plan => plan.limit === 31 && plan.filters[0].field === "mainEventId"));
  assert.equal(parentPlan(binding).limit + calls.reduce((sum, plan) => sum + plan.limit, 0), 961);
});

test("signed cursor is bound to owner, filters, page size, section, search and order", () => {
  const token = encode(binding, position(row(0).candidate), key);
  assert.deepEqual(decode(token, binding, key), position(row(0).candidate));
  for (const patch of [{customerId: "customer_other"}, {status: "all"}, {pageSize: 11},
    {section: "undated_drafts"}, {searchMode: "code_prefix"}, {searchValue: "BK-1"},
    {order: "id_desc_v1"}]) {
    fails(() => decode(token, {...binding, ...patch}, key), "invalid-candidate-pagination", "invalid-argument");
  }
});

test("malformed, tampered, wrong-key and malformed signed cursor payloads reject", () => {
  const token = encode(binding, position(row(0).candidate), key);
  for (const value of ["", "garbage", `${token}.extra`, token.slice(0, -2), "x".repeat(4097),
    `${token.slice(0, 10)}Z${token.slice(11)}`]) {
    fails(() => decode(value, binding, key), "invalid-candidate-pagination", "invalid-argument");
  }
  fails(() => decode(token, binding, Buffer.alloc(32, 8)), "invalid-candidate-pagination", "invalid-argument");
  for (const payload of [
    {v: 2, binding, position: position(row(0).candidate)},
    {v: 1, binding, position: {seconds: 2, nanoseconds: 1e9, documentId: "event_test"}},
    {v: 1, binding, position: {...position(row(0).candidate), extra: 1}},
    {v: 1, binding: {...binding, extra: 1}, position: position(row(0).candidate)},
  ]) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signed = `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
    fails(() => decode(signed, binding, key), "invalid-candidate-pagination", "invalid-argument");
  }
  assert.throws(() => encode(binding, position(row(0).candidate), Buffer.alloc(8)), /32\+ bytes/u);
});

test("source boundary refuses foreign, unordered, repeated, out-of-cursor or excessive candidates", () => {
  const candidates = [row(0).candidate, row(1).candidate];
  const execute = (rows, after = null) => consume({binding, after, candidates: rows, evaluate: () => true});
  fails(() => execute([...candidates].reverse()), "invalid-candidate-pagination", "invalid-argument");
  fails(() => execute([candidates[0], candidates[0]]), "invalid-candidate-pagination", "invalid-argument");
  fails(() => execute(candidates, position(candidates[0])), "invalid-candidate-pagination", "invalid-argument");
  fails(() => execute(Array.from({length: 32}, (_, rank) => row(rank).candidate)),
    "invalid-candidate-pagination", "invalid-argument");
  const foreign = row(0).candidate; foreign.data.customerId = "customer_other";
  fails(() => execute([foreign]), "candidate-scope-mismatch");
  const undated = row(0).candidate; delete undated.data.createdAt;
  fails(() => execute([undated]), "invalid-ordering-evidence");
});

test("frozen source and linked evidence remain unchanged", () => {
  const rows = [row(0)];
  const before = structuredClone(rows);
  rows[0].requests.forEach(request => {Object.freeze(request.data); Object.freeze(request);});
  Object.freeze(rows[0].requests); Object.freeze(rows[0].candidate.data.createdAt);
  Object.freeze(rows[0].candidate.data.providerRequestIds); Object.freeze(rows[0].candidate.data);
  Object.freeze(rows[0].candidate); Object.freeze(rows[0]); Object.freeze(rows);
  assert.equal(page(rows).bookings.length, 1);
  assert.deepEqual(rows, before);
});
