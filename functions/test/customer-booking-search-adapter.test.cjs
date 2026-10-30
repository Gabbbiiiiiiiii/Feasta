const assert = require("node:assert/strict");
const test = require("node:test");
const {Timestamp} = require("firebase-admin/firestore");
const {readAwaitingProviderCandidatePage: read} =
  require("../lib/bookings/customer-booking-search-adapter.js");
const {candidatePosition: position, compareCandidatePositions: compare} =
  require("../lib/bookings/customer-booking-candidate-pagination.js");

function row(rank, statuses = ["pending"]) {
  const id = `event_${String(1000 - rank).padStart(4, "0")}`;
  const requests = statuses.map((status, index) => ({id: `request_${rank}_${index}`, data: {
    providerRequestId: `request_${rank}_${index}`, mainEventId: id, bookingId: id,
    customerId: "customer_test", providerId: `provider_${index}`, status,
  }}));
  return {id, data: {mainEventId: id, bookingId: id, customerId: "customer_test",
    createdAt: new Timestamp(10000 - rank, rank), status: "pending_provider_approval",
    providerRequestIds: requests.map(request => request.id), providerRequestCount: requests.length,
    pendingProviderRequestCount: statuses.filter(status => status === "pending").length,
  }, requests};
}

function fixture(rows, options = {}) {
  const calls = [];
  let returned = 0;
  let callbacks = 0;
  const time = new Timestamp(20000, 17);
  const docs = values => values.map(value => ({id: value.id, data: () => value.data}));
  class Query {
    constructor(collection) { this.collection = collection; this.filters = []; this.orders = []; }
    where(...args) { this.filters.push(args); return this; }
    orderBy(...args) { this.orders.push(args); return this; }
    limit(value) { this.cap = value; return this; }
    startAfter(...args) { this.after = args; return this; }
    get() { throw Error("Nontransactional read forbidden"); }
  }
  const transaction = {get: async query => {
    calls.push(query);
    assert.equal(query.cap, 31);
    if (query.collection === "mainEvents") {
      assert.deepEqual(query.filters, [["customerId", "==", "customer_test"],
        ["status", "in", ["pending_provider_approval", "needs_provider_replacement"]]]);
      assert.equal(query.orders[0][0], "createdAt");
      assert.equal(query.orders[1][0].isEqual(require("firebase-admin/firestore").FieldPath.documentId()), true);
      let selected = rows.filter(row => options.leak || row.data.customerId === "customer_test");
      if (query.after) {
        assert.ok(query.after[0] instanceof Timestamp);
        const after = {seconds: query.after[0].seconds, nanoseconds: query.after[0].nanoseconds,
          documentId: query.after[1]};
        selected = selected.filter(row => compare(after, position(row)) < 0);
      }
      returned += selected.slice(0, query.cap).length;
      return {docs: docs(selected.slice(0, query.cap)), readTime: time};
    }
    assert.equal(query.collection, "providerRequests");
    assert.deepEqual(query.filters[0].slice(0, 2), ["mainEventId", "=="]);
    if (options.wait) await options.wait;
    if (options.error) throw options.error;
    const selected = rows.find(row => row.id === query.filters[0][2]).requests;
    returned += selected.slice(0, query.cap).length;
    return {docs: docs(selected.slice(0, query.cap)),
      readTime: options.mismatch ? new Timestamp(20001, 17) : time};
  }};
  const firestore = {
    collection: name => new Query(name),
    runTransaction: async (callback, config) => {
      assert.deepEqual(config, {readOnly: true});
      callbacks++;
      const result = await callback(transaction);
      if (options.replay) { callbacks++; return callback(transaction); }
      return result;
    },
  };
  return {calls, returned: () => returned, callbacks: () => callbacks,
    page: (pageSize = 10, after = null) => read({firestore,
      customer: {uid: "customer_test"}, pageSize, after})};
}

test("awaits deferred evidence; a Promise resolving to rejected-only is never a match", async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const f = fixture([row(0, ["rejected"])], {wait});
  let settled = false;
  const pending = f.page().then(result => { settled = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  release();
  assert.deepEqual((await pending).bookings, []);
});

test("server ownership predicate isolates rows and scope leaks abort before related reads", async () => {
  const foreign = row(0); foreign.data.customerId = "foreign_customer";
  assert.equal((await fixture([foreign, row(1)]).page()).bookings.length, 1);
  const f = fixture([foreign], {leak: true});
  await assert.rejects(f.page(), {reason: "candidate-scope-mismatch"});
  assert.equal(f.calls.length, 1);
});

test("early completion leaves later malformed evidence and lookahead unread", async () => {
  const rows = Array.from({length: 31}, (_, i) => row(i));
  rows[1].data.providerRequestRelationshipVersion = 2;
  const f = fixture(rows);
  const page = await f.page(1);
  assert.equal(f.calls.length, 2);
  assert.equal(page.consumed, 1);
  assert.deepEqual(page.nextPosition, position(rows[0]));
});

test("30 rejected-only candidates yield an empty continuation; lookahead is next page", async () => {
  const rows = Array.from({length: 31}, (_, i) => row(i, i < 30 ? ["rejected"] : ["pending"]));
  const f = fixture(rows);
  const page = await f.page();
  assert.equal(page.bookings.length, 0);
  assert.equal(page.consumed, 30);
  assert.equal(f.calls.length, 31);
  assert.deepEqual(page.nextPosition, position(rows[29]));
  const final = await f.page(10, page.nextPosition);
  assert.equal(final.bookings[0].id, rows[30].id);
  assert.equal(final.hasMore, false);
  assert.equal(final.nextPosition, null);
});

test("deleted candidates consume positions without relationship reads", async () => {
  const rows = Array.from({length: 31}, (_, i) => row(i));
  rows.forEach(row => { row.data.isDeleted = true; delete row.data.providerRequestIds; });
  const f = fixture(rows);
  assert.equal((await f.page()).consumed, 30);
  assert.equal(f.calls.length, 1);
});

test("large valid sets stay within 931 returned documents / 31 query success budget", async () => {
  const rows = Array.from({length: 31}, (_, i) => row(i, Array(30).fill("pending")));
  const f = fixture(rows);
  assert.equal((await f.page(30)).bookings.length, 30);
  assert.equal(f.calls.length, 31);
  assert.equal(f.returned(), 931);
});

test("late overflow stays within conservative 961 and tight 932 document budgets", async () => {
  const rows = Array.from({length: 31}, (_, i) => row(i, Array(30).fill("pending")));
  rows[29].requests.push({id: "overflow_request", data: {}});
  const f = fixture(rows);
  await assert.rejects(f.page(30), {reason: "related-record-budget-exceeded"});
  assert.equal(f.calls.length, 31);
  assert.equal(f.returned(), 932);
  assert.ok(f.returned() <= 961);
});

for (const [name, mutate, reason, queryCount] of [
  ["stale count", row => { row.data.pendingProviderRequestCount = 0; }, "stored-count-mismatch", 3],
  ["contradictory response", row => { row.requests[0].data.rejectedAt = 1; },
    "pending-request-has-response-evidence", 3],
  ["v2", row => { row.data.providerRequestRelationshipVersion = 2; },
    "relationship-version-not-enabled", 2],
  ["stored overflow", row => { row.data.providerRequestIds = Array(31).fill("request_overflow"); },
    "related-record-budget-exceeded", 2],
  ["query overflow", row => { row.requests = Array.from({length: 40}, (_, i) => ({id: `extra_${i}`, data: {}})); },
    "related-record-budget-exceeded", 3],
]) {
  test(`${name} aborts after an earlier match without returning a partial cursor`, async () => {
    const rows = [row(0), row(1)]; mutate(rows[1]);
    const f = fixture(rows);
    await assert.rejects(f.page(), {code: "failed-precondition", reason});
    assert.equal(f.calls.length, queryCount);
  });
}

test("transaction snapshot mismatch aborts rather than validating inconsistent evidence", async () => {
  const f = fixture([row(0)], {mismatch: true});
  await assert.rejects(f.page(), /snapshot mismatch/);
  assert.equal(f.calls.length, 2);
});

test("query errors are propagated without retry or partial cursor", async () => {
  const error = Object.assign(new Error("unavailable"), {code: 14});
  const f = fixture([row(0)], {error});
  await assert.rejects(f.page(), e => e === error);
  assert.equal(f.callbacks(), 1);
  assert.equal(f.calls.length, 2);
});

test("unexpected transaction replay is rejected before multiplying reads", async () => {
  const f = fixture([row(0)], {replay: true});
  await assert.rejects(f.page(), /replay refused/);
  assert.equal(f.calls.length, 2);
});

test("stable traversal has no skipped or duplicate matches and never mutates sources", async () => {
  const rows = Array.from({length: 97}, (_, i) => row(i, i % 3 ? ["pending"] : ["rejected"]));
  const original = JSON.stringify(rows);
  for (const row of rows) {
    Object.freeze(row.data.providerRequestIds); Object.freeze(row.data);
    row.requests.forEach(request => { Object.freeze(request.data); Object.freeze(request); });
    Object.freeze(row.requests); Object.freeze(row);
  }
  const f = fixture(rows);
  const ids = [];
  let after = null;
  do {
    const page = await f.page(10, after);
    ids.push(...page.bookings.map(row => row.id));
    after = page.nextPosition;
  } while (after);
  assert.deepEqual(ids, rows.filter((_, i) => i % 3).map(row => row.id));
  assert.equal(JSON.stringify(rows), original);
});
