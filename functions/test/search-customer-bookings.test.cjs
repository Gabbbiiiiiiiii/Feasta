const assert = require("node:assert/strict");
const test = require("node:test");
const {readFileSync} = require("node:fs");
const {randomBytes, createHmac} = require("node:crypto");
const {Timestamp} = require("firebase-admin/firestore");
const {HttpsError} = require("firebase-functions/v2/https");
require("firebase-admin/app").initializeApp({projectId: "demo-feasta-search-local"});
const {handleCustomerBookingSearch: handle, requireBookingSearchReadiness: ready,
  SEARCH_LIMITS} = require("../lib/bookings/search-customer-bookings.js");
const {parseBookingSearch: parse, encodeSearchCursor: encode, decodeSearchCursor: decode,
  SEARCH_STATUS_GROUPS: groups} = require("../lib/bookings/customer-booking-search-contract.js");

const key = randomBytes(32);
const now = 2000000000000;
const readiness = {version: 1, enabled: true, indexesReady: true, historicalInventoryReady: true,
  relationshipsReady: true, canonicalStatusesAndDatesReady: true, reviewExpiresAtMs: now + 100000,
  companionContractApproved: true, codeStrategy: "canonical_uppercase_v1",
  historicalCodeCoverageReady: true, canonicalCodeWritersReady: true};
const input = changes => ({search: {mode: "none", value: ""}, status: "all", ...changes});
const request = data => ({data, auth: {uid: "customer_test", token: {}}, app: {appId: "test_app"},
  rawRequest: {headers: {}, ip: "127.0.0.1"}});
function row(rank, status = "confirmed", count = 1) {
  const id = `event_${String(10000 - rank).padStart(5, "0")}`;
  const requests = Array.from({length: count}, (_, i) => ({id: `request_${rank}_${i}`, data: {
    providerRequestId: `request_${rank}_${i}`, mainEventId: id, bookingId: id,
    customerId: "customer_test", providerId: `provider_${i}`, status: "pending",
  }}));
  return {id, data: {mainEventId: id, bookingId: id, customerId: "customer_test", status,
    createdAt: new Timestamp(10000 - rank, rank),
    bookingCode: `BK-${rank.toString(16).toUpperCase().padStart(10, "0")}`,
    providerRequestIds: requests.map(r => r.id), providerRequestCount: count,
    pendingProviderRequestCount: count}, requests};
}
function fixture(rows = [], options = {}) {
  const calls = [];
  let returned = 0;
  const readTime = new Timestamp(20000, 0);
  const doc = r => ({id: r.id, exists: true, data: () => r.data, readTime});
  const value = (r, f) => f === "__name__" ? r.id : r.data[f];
  const cmp = (a, b) => a instanceof Timestamp ? a.seconds - b.seconds || a.nanoseconds - b.nanoseconds :
    typeof a === "string" ? Buffer.compare(Buffer.from(a), Buffer.from(b)) : (a ?? -1) - (b ?? -1);
  class Query {
    constructor(name) { this.name = name; this.filters = []; this.orders = []; }
    where(...args) { this.filters.push(args); return this; }
    orderBy(field, direction) {
      this.orders.push([typeof field === "string" ? field : "__name__", direction]); return this;
    }
    limit(cap) { this.cap = cap; return this; }
    startAfter(...after) { this.after = after; return this; }
    doc(id) { return {name: this.name, id}; }
    get() { throw Error("Nontransactional query forbidden"); }
  }
  const transaction = {get: async q => {
    calls.push(q);
    if (options.wait) await options.wait;
    if (options.failure) throw options.failure;
    if (q.id) {
      const r = rows.find(r => r.id === q.id);
      returned++;
      return r ? doc(r) : {id: q.id, exists: false, data: () => undefined, readTime};
    }
    assert.equal(q.cap, 31);
    let selected = q.name === "mainEvents" ? rows : rows.flatMap(r => r.requests);
    selected = selected.filter(r => q.filters.every(([f, op, v]) => {
      if (options.leak && f === "customerId") return true;
      const actual = value(r, f);
      if (actual === undefined) return false;
      return op === "==" ? actual === v : op === "in" ? v.includes(actual) :
        op === ">=" ? cmp(actual, v) >= 0 : cmp(actual, v) < 0;
    }));
    selected = selected.filter(r => q.orders.every(([f]) => value(r, f) !== undefined));
    const compareRow = (a, b) => {
      for (const [field, direction] of q.orders) {
        const c = cmp(value(a, field), value(b, field)) * (direction === "desc" ? -1 : 1);
        if (c) return c;
      }
      return 0;
    };
    selected = selected.slice().sort(compareRow);
    if (q.after) selected = selected.filter(r => {
      const afterRow = {id: "", data: {}};
      q.orders.forEach(([f], i) => {
        if (f === "__name__") afterRow.id = q.after[i];
        else afterRow.data[f] = q.after[i];
      });
      return compareRow(r, afterRow) > 0;
    });
    selected = selected.slice(0, q.cap);
    // Explicitly simulate a broken query boundary without relying on mock sort/filter behavior.
    if (q.name === "mainEvents" && options.sourceRows) selected = options.sourceRows;
    returned += selected.length;
    return {docs: selected.map(doc), readTime: options.mismatch && q.name === "providerRequests" ?
      new Timestamp(20001, 0) : readTime};
  }};
  const firestore = {collection: name => new Query(name), runTransaction: async (callback, config) => {
    assert.deepEqual(config, {readOnly: true});
    const result = await callback(transaction);
    return options.replay ? callback(transaction) : result;
  }};
  const security = [];
  const deps = {firestore, authorize: async req => { security.push("auth"); return req.auth.uid; },
    rateLimit: async () => { security.push("rate"); }, readiness: async () => readiness,
    key: () => key.toString("hex"), now: () => now, timeoutMs: 1000};
  return {deps, calls, security, returned: () => returned,
    page: (data = input()) => handle(request(data), deps)};
}

test("strict public parser defaults and normalization", () => {
  assert.deepEqual(parse(input()), {search: {mode: "none", value: ""}, status: "all",
    pageSize: 10, cursor: null, section: "history"});
  assert.equal(parse(input({search: {mode: "code_prefix", value: " bk-ab "}})).search.value, "BK-AB");
  assert.equal(parse(input({search: {mode: "booking_id", value: " Event_a "}})).search.value, "Event_a");
  for (const value of [null, [], {}, input({customerId: "foreign"}), input({search: {mode: "none", value: "x"}}),
    input({search: {mode: "none", value: "", extra: 1}}), input({search: {mode: "full", value: ""}}),
    input({search: {mode: ["none"], value: ""}}), input({search: {mode: null, value: ""}}),
    input({search: {mode: "code_prefix", value: ""}}), input({search: {mode: "code_prefix", value: "BK-Ｇ"}}),
    input({search: {mode: "booking_id", value: "a/b"}}), input({status: "__proto__"}),
    input({pageSize: "10"}), input({pageSize: 0}), input({pageSize: 31}), input({pageSize: 1.1}),
    input({cursor: ""}), input({cursor: false}), input({cursor: "x".repeat(4097)}), input({section: "other"}),
    input({section: "undated_drafts", status: "completed"}),
    input({section: "undated_drafts", search: {mode: "code_prefix", value: "BK"}}),
    input({search: {mode: "booking_id", value: "event"}, cursor: "x"})]) {
    assert.throws(() => parse(value), {code: "invalid-argument"});
  }
});

test("authentication, App Check and rate-limit rejection precede source reads", async () => {
  const f = fixture();
  for (const req of [{...request(input()), auth: undefined}, {...request(input()), app: undefined}]) {
    await assert.rejects(handle(req, f.deps), {code: "unauthenticated"});
  }
  assert.deepEqual(f.security, []);
  f.deps.authorize = async () => { throw new HttpsError("permission-denied", "Account unavailable"); };
  await assert.rejects(f.page(), {code: "permission-denied"});
  f.deps.authorize = async () => "customer_test";
  f.deps.rateLimit = async () => { throw new HttpsError("resource-exhausted", "Rate limited"); };
  await assert.rejects(f.page(), {code: "resource-exhausted"});
  assert.equal(f.calls.length, 0);
});

test("production authorize uses real active-account and role helpers", async () => {
  const {db} = require("../lib/shared/firestore.js");
  const {getAuth} = require("firebase-admin/auth");
  const limiter = require("../lib/shared/rate-limit.js");
  const auth = getAuth();
  const saved = {collection: db.collection, getUser: auth.getUser, limit: limiter.enforceCallableRateLimit};
  let profile = {role: "customer", accountStatus: "active", isActive: true, isBlocked: false};
  let disabled = false;
  let rates = 0;
  try {
    auth.getUser = async () => ({disabled});
    db.collection = name => ({doc: () => ({get: async () => ({exists: true,
      data: () => name === "users" ? profile : undefined})})});
    limiter.enforceCallableRateLimit = async () => { rates++; };
    for (const change of [{role: "provider"}, {role: "admin"}, {isActive: false}, {isBlocked: true},
      {accountStatus: "disabled"}, {accountStatus: "pending_deletion"}]) {
      const original = profile;
      profile = {...profile, ...change};
      await assert.rejects(handle(request(input())), {code: "permission-denied"});
      profile = original;
    }
    disabled = true;
    await assert.rejects(handle(request(input())), {code: "permission-denied"});
    disabled = false;
    assert.equal(rates, 0);
    // No submission-only verification gate: valid customer reaches the closed readiness guard.
    await assert.rejects(handle(request(input())), {code: "failed-precondition"});
    assert.equal(rates, 1);
  } finally {
    db.collection = saved.collection; auth.getUser = saved.getUser;
    limiter.enforceCallableRateLimit = saved.limit;
  }
});

test("readiness and signing key fail closed without any booking query", async () => {
  const f = fixture();
  for (const value of [undefined, {}, {...readiness, enabled: false}, {...readiness, version: 2},
    {...readiness, indexesReady: false}, {...readiness, reviewExpiresAtMs: now},
    {...readiness, relationshipsReady: false}, {...readiness, historicalInventoryReady: false},
    {...readiness, canonicalStatusesAndDatesReady: false}]) {
    f.deps.readiness = async () => value;
    await assert.rejects(f.page(), {code: "failed-precondition"});
  }
  for (const field of ["historicalCodeCoverageReady", "canonicalCodeWritersReady", "codeStrategy"]) {
    assert.throws(() => ready({...readiness, [field]: false},
      parse(input({search: {mode: "code_prefix", value: "BK"}})), now), {code: "failed-precondition"});
  }
  assert.throws(() => ready({...readiness, companionContractApproved: false},
    parse(input({section: "undated_drafts"})), now), {code: "failed-precondition"});
  f.deps.readiness = async () => readiness;
  for (const bad of ["", "x".repeat(64), "ab".repeat(31), "a".repeat(65)]) {
    f.deps.key = () => bad;
    await assert.rejects(f.page(), {code: "failed-precondition"});
  }
  assert.equal(f.calls.length, 0);
});

test("companion approval gates both no-search draft sections for all/draft", async () => {
  for (const status of ["all", "draft"]) {
    for (const section of ["history", "undated_drafts"]) {
      const f = fixture();
      for (const approval of [false, undefined, null]) {
        f.deps.readiness = async () => ({...readiness, companionContractApproved: approval});
        await assert.rejects(f.page(input({status, section})), {code: "failed-precondition"});
      }
      assert.equal(f.calls.length, 0);
      f.deps.readiness = async () => readiness;
      assert.deepEqual(await f.page(input({status, section})),
        {bookings: [], nextCursor: null, hasMore: false});
      assert.equal(f.calls.length, 1);
    }
  }
});

test("unapproved companion preserves exact ID, prefix and nondraft status searches", async () => {
  const draft = row(0, "draft"); delete draft.data.createdAt;
  const cases = [input({search: {mode: "booking_id", value: draft.id}}),
    input({status: "draft", search: {mode: "booking_id", value: draft.id}}),
    ...["all", "draft"].map(status => input({status, search: {mode: "code_prefix", value: "BK"}})),
    ...Object.keys(groups).filter(s => !["all", "draft"].includes(s)).map(status => input({status}))];
  for (const data of cases) {
    const f = fixture([draft]);
    f.deps.readiness = async () => ({...readiness, companionContractApproved: false});
    const page = await f.page(data);
    assert.equal(page.hasMore, false);
    assert.equal(page.bookings.length, ["booking_id", "code_prefix"].includes(data.search.mode) ? 1 : 0);
  }
});

const validationModes = [
  {data: input(), make: rank => row(rank)},
  {data: input({search: {mode: "code_prefix", value: "BK"}}), make: rank => row(rank)},
  {data: input({section: "undated_drafts"}), make: rank => {
    const r = row(rank, "draft"); delete r.data.createdAt; return r;
  }},
];

test("deleted rows ignore irrelevant malformed fields but preserve empty-page continuation", async () => {
  for (const {data, make} of validationModes) {
    const rows = Array.from({length: 31}, (_, i) => make(i));
    for (const r of rows.slice(0, 30)) {
      Object.assign(r.data, {isDeleted: true, eventType: {}, guestCount: "bad", updatedAt: "bad"});
      if (data.section === "undated_drafts" || data.search.mode === "code_prefix") {
        r.data.createdAt = "irrelevant nonordering value";
      }
      if (data.section !== "undated_drafts") r.data.status = "irrelevant deleted status";
    }
    const f = fixture(rows);
    const page = await f.page(data);
    assert.deepEqual(page.bookings, []); assert.equal(page.hasMore, true);
    const p = decode("customer_test", parse({...data, cursor: page.nextCursor}), key);
    assert.equal(p.documentId, rows[29].id);
    const final = await f.page({...data, cursor: page.nextCursor});
    assert.deepEqual(final.bookings.map(b => b.id), [rows[30].id]);
    assert.equal(final.hasMore, false); assert.equal(f.calls.length, 2);
  }
});

test("nonordering validation waits for consumption/display after a full page or 31st lookahead", async () => {
  for (const {data, make} of validationModes) {
    for (const pageSize of [1, 30]) {
      for (const defect of ["source", "presentation", "deletion"]) {
        const rows = Array.from({length: pageSize + 1}, (_, i) => make(i));
        const bad = rows[pageSize];
        if (defect === "presentation") bad.data.eventType = {};
        else if (defect === "deletion") bad.data.isDeleted = "ambiguous";
        else if (data.section === "undated_drafts" || data.search.mode === "code_prefix") {
          bad.data.createdAt = "malformed nonordering date";
        } else bad.data.status = "malformed live status";
        const f = fixture(rows);
        const page = await f.page({...data, pageSize});
        assert.equal(page.bookings.length, pageSize); assert.equal(page.hasMore, true);
        const p = decode("customer_test", parse({...data, pageSize, cursor: page.nextCursor}), key);
        assert.equal(p.documentId, rows[pageSize - 1].id);
        await assert.rejects(f.page({...data, pageSize, cursor: page.nextCursor}),
          {code: "failed-precondition"});
      }
    }
  }
});

test("presentation-only defects on consumed companion nonmatches do not block eligible drafts", async () => {
  const dated = row(0, "draft"), undated = row(1, "draft");
  delete undated.data.createdAt;
  Object.assign(dated.data, {eventType: {}, guestCount: "invalid", updatedAt: "invalid"});
  const f = fixture([dated, undated]);
  assert.deepEqual((await f.page(input({section: "undated_drafts"}))).bookings.map(b => b.id), [undated.id]);
  dated.data.createdAt = null;
  await assert.rejects(f.page(input({section: "undated_drafts"})), {code: "failed-precondition"});
});

test("invalid ordering on deleted rows and unconsumed rows always requires reconciliation", async () => {
  for (const {data, make} of validationModes) {
    for (const index of [0, 1, 30]) {
      const rows = Array.from({length: 31}, (_, i) => make(i));
      const bad = rows[index]; bad.data.isDeleted = index === 0;
      if (data.section === "undated_drafts") bad.id = "invalid/id";
      else if (data.search.mode === "code_prefix") bad.data.bookingCode = "BK-not-hex";
      else bad.data.createdAt = "invalid timestamp";
      await assert.rejects(fixture(rows, {sourceRows: rows}).page({...data, pageSize: 1}),
        {code: "failed-precondition"});
    }
    const rows = [make(0), make(1)];
    await assert.rejects(fixture(rows, {sourceRows: [...rows].reverse()}).page({...data, pageSize: 1}),
      {code: "failed-precondition"});
  }
});

test("ownership and query scope are checked even on tombstones and unconsumed rows", async () => {
  for (const {data, make} of validationModes) {
    for (const index of [0, 1, 30]) {
      const rows = Array.from({length: 31}, (_, i) => make(i));
      rows[index].data.isDeleted = index === 0;
      rows[index].data.customerId = "foreign";
      await assert.rejects(fixture(rows, {sourceRows: rows}).page({...data, pageSize: 1}),
        {code: "failed-precondition"});
    }
  }
  for (const index of [0, 1, 30]) {
    const rows = Array.from({length: 31}, (_, i) => row(i, "draft"));
    rows[index].data.status = "confirmed";
    rows[index].data.isDeleted = index === 0;
    for (const data of [input({status: "draft"}), input({section: "undated_drafts"}),
      input({status: "draft", search: {mode: "code_prefix", value: "BK"}})]) {
      await assert.rejects(fixture(rows, {sourceRows: rows}).page({...data, pageSize: 1}),
        {code: "failed-precondition"});
    }
  }
  const rows = [row(0), row(1)]; rows[1].data.bookingCode = "BK-FFFFFFFFFF";
  await assert.rejects(fixture(rows, {sourceRows: rows}).page(input({pageSize: 1,
    search: {mode: "code_prefix", value: "BK-0"}})), {code: "failed-precondition"});
});

test("owned exact lookup, foreign/missing/deleted indistinguishable; filter nonmatch is empty", async () => {
  const own = row(1), foreign = row(2), deleted = row(3);
  foreign.data.customerId = "foreign"; deleted.data.isDeleted = true;
  const f = fixture([own, foreign, deleted]);
  const exact = id => input({search: {mode: "booking_id", value: id}});
  assert.equal((await f.page(exact(own.id))).bookings[0].id, own.id);
  const errors = [];
  for (const id of [foreign.id, deleted.id, "missing"]) {
    try { await f.page(exact(id)); assert.fail(); } catch (e) { errors.push([e.code, e.message, e.details]); }
  }
  assert.deepEqual(errors, Array(3).fill(["not-found", "Booking could not be found.", undefined]));
  assert.deepEqual(await f.page({...exact(own.id), status: "completed"}),
    {bookings: [], nextCursor: null, hasMore: false});
  assert.equal(f.calls.length, 5);
});

for (const status of Object.keys(groups)) test(`status filter ${status}`, async () => {
  const statuses = [...new Set(Object.values(groups).flat().filter(Boolean))];
  const rows = statuses.map((s, i) => row(i, s));
  const f = fixture(rows);
  const result = await f.page(input({status, pageSize: 30}));
  assert.deepEqual(result.bookings.map(b => b.status), statuses.filter(s => !groups[status] || groups[status].includes(s)));
  assert.ok(f.calls.length <= 3);
});

test("all source modes remain customer scoped and reject a leaked foreign row", async () => {
  const own = row(0), foreign = row(1); foreign.data.customerId = "foreign";
  for (const data of [input(), input({search: {mode: "code_prefix", value: "bk-0"}})]) {
    assert.equal((await fixture([own, foreign]).page(data)).bookings.length, 1);
    await assert.rejects(fixture([foreign], {leak: true}).page(data), {code: "failed-precondition"});
  }
});

test("prefix normalization, exclusive ranges, ASC code/ID order and stable traversal beyond 30", async () => {
  const rows = Array.from({length: 97}, (_, i) => row(i));
  rows[1].data.bookingCode = rows[0].data.bookingCode; // ID tie break
  const f = fixture(rows);
  let cursor = null;
  const seen = [];
  do {
    const page = await f.page(input({search: {mode: "code_prefix", value: " bk-0 "}, cursor}));
    seen.push(...page.bookings.map(b => b.id)); cursor = page.nextCursor;
    assert.equal(page.hasMore, cursor !== null);
  } while (cursor);
  assert.equal(seen.length, 97); assert.equal(new Set(seen).size, 97);
  assert.ok(f.calls.every(q => q.cap === 31 && q.filters.some(([f, op]) => f === "bookingCode" && op === "<")));
});

test("mixed-case historical corpus never silently produces a successful incomplete prefix page", async () => {
  const f = fixture([row(0)]);
  f.deps.readiness = async () => ({...readiness, historicalCodeCoverageReady: false});
  await assert.rejects(f.page(input({search: {mode: "code_prefix", value: "bk"}})),
    {code: "failed-precondition"});
  assert.equal(f.calls.length, 0);
});

test("history traverses ties, deleted cursor documents, and empty candidate continuations", async () => {
  const rows = Array.from({length: 97}, (_, i) => row(i));
  rows.forEach(r => { r.data.createdAt = new Timestamp(10000, 1); });
  rows.slice(0, 60).forEach(r => { r.data.isDeleted = true; });
  const f = fixture(rows);
  let page = await f.page();
  assert.equal(page.bookings.length, 0); assert.equal(page.hasMore, true);
  rows.splice(29, 1); // cursor position remains valid after the source document is removed
  page = await f.page(input({cursor: page.nextCursor}));
  assert.equal(page.bookings.length, 0); assert.equal(page.hasMore, true);
  const seen = [];
  do {
    page = await f.page(input({cursor: page.nextCursor}));
    seen.push(...page.bookings.map(b => b.id));
  } while (page.hasMore);
  assert.equal(seen.length, 37); assert.equal(new Set(seen).size, 37);
  assert.equal(f.calls.length, 6);
});

test("undated drafts have separate ID cursors, omit dated drafts, and never fabricate dates", async () => {
  const rows = Array.from({length: 65}, (_, i) => row(i, "draft"));
  rows.slice(30).forEach(r => { delete r.data.createdAt; });
  const f = fixture(rows);
  assert.equal((await f.page(input({pageSize: 30}))).bookings.length, 30);
  let page = await f.page(input({section: "undated_drafts"}));
  assert.equal(page.bookings.length, 0); assert.equal(page.hasMore, true);
  const seen = [];
  while (page.hasMore) {
    page = await f.page(input({section: "undated_drafts", cursor: page.nextCursor}));
    seen.push(...page.bookings);
  }
  assert.equal(seen.length, 35); assert.ok(seen.every(b => b.createdAt === null));
  assert.equal(new Set(seen.map(b => b.id)).size, 35);
  const invalid = row(0, "draft"); invalid.data.createdAt = "yesterday";
  await assert.rejects(fixture([invalid]).page(input({section: "undated_drafts"})), {code: "failed-precondition"});
  const missing = row(0); delete missing.data.createdAt;
  await assert.rejects(fixture([missing]).page(input({search: {mode: "booking_id", value: missing.id}})),
    {code: "failed-precondition"});
});

test("all cursor schemas authenticate customer/filter/size/section/mode/value/order and reject tampering", async () => {
  for (const data of [input(), input({section: "undated_drafts"}),
    input({search: {mode: "code_prefix", value: "BK-0"}})]) {
    const i = parse(data);
    const p = i.section === "undated_drafts" ? {documentId: "event"} : i.search.mode === "none" ?
      {documentId: "event", seconds: 10, nanoseconds: 12} : {documentId: "event", code: "BK-01"};
    const token = encode("customer_test", i, p, key);
    assert.deepEqual(decode("customer_test", {...i, cursor: token}, key), p);
    for (const change of [{status: "draft"}, {pageSize: 30}, {section: "other"},
      {search: {...i.search, value: "BK-1"}}]) {
      assert.throws(() => decode("customer_test", {...i, ...change, cursor: token}, key));
    }
    assert.throws(() => decode("foreign", {...i, cursor: token}, key));
    for (const bad of [token + "x", token.split(".")[0] + ".AA", "garbage", token.replace(/^./, "!")]) {
      assert.throws(() => decode("customer_test", {...i, cursor: bad}, key));
    }
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url"));
    payload.v = 0;
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const expiredVersion = `${encoded}.${createHmac("sha256", key).update(encoded).digest("base64url")}`;
    assert.throws(() => decode("customer_test", {...i, cursor: expiredVersion}, key));
  }
  const f = fixture([row(0)]);
  await assert.rejects(f.page(input({cursor: "invalid"})), {code: "invalid-argument"});
  assert.equal(f.calls.length, 0);
});

test("awaiting-provider v1 evidence is reused in chronological, prefix, and exact modes", async () => {
  for (const mode of ["none", "code_prefix", "booking_id"]) {
    const a = row(0, "pending_provider_approval"), b = row(1, "pending_provider_approval");
    a.requests[0].data.status = "rejected"; a.data.pendingProviderRequestCount = 0;
    const data = input({status: "awaiting_provider", search: {mode,
      value: mode === "none" ? "" : mode === "code_prefix" ? "bk" : b.id}});
    const f = fixture([a, b]);
    assert.deepEqual((await f.page(data)).bookings.map(r => r.id), [b.id]);
    b.data.pendingProviderRequestCount = 0;
    await assert.rejects(f.page(data), {code: "failed-precondition"});
    b.data.pendingProviderRequestCount = 1;
    b.data.providerRequestRelationshipVersion = 2;
    const broken = fixture([b]);
    await assert.rejects(broken.page(data), {code: "failed-precondition"});
    assert.equal(broken.calls.length, 1); // v2 rejected before related reads
  }
});

test("reconciliation/backend/snapshot failures never return partial rows or cursor", async () => {
  const a = row(0, "pending_provider_approval"), b = row(1, "pending_provider_approval");
  b.requests[0].data.acceptedAt = Timestamp.now();
  await assert.rejects(fixture([a, b]).page(input({status: "awaiting_provider"})), {code: "failed-precondition"});
  await assert.rejects(fixture([a], {mismatch: true}).page(input({status: "awaiting_provider"})),
    {code: "unavailable"});
  for (const [failure, code] of [[Error("private booking details"), "unavailable"],
    [Object.assign(Error("index internals"), {code: 9}), "failed-precondition"],
    [Object.assign(Error("rpc internals"), {code: 4}), "deadline-exceeded"]]) {
    await assert.rejects(fixture([a], {failure}).page(), e => e.code === code && !e.message.includes("internals") &&
      !e.message.includes("private"));
  }
  await assert.rejects(fixture([a], {replay: true}).page(), {code: "unavailable"});
});

test("read budgets measured: 31 sequential queries, 931 documents success; overflow fails", async () => {
  const rows = Array.from({length: 31}, (_, i) => row(i, "pending_provider_approval", 30));
  const f = fixture(rows);
  const page = await f.page(input({status: "awaiting_provider", pageSize: 30}));
  assert.equal(page.bookings.length, 30); assert.equal(f.calls.length, SEARCH_LIMITS.queries);
  assert.equal(f.returned(), 931);
  const oversized = fixture([row(0, "pending_provider_approval", 31)]);
  await assert.rejects(oversized.page(input({status: "awaiting_provider"})), {code: "failed-precondition"});
  assert.equal(oversized.calls.length, 1);
  const unlisted = row(0, "pending_provider_approval", 31);
  unlisted.data.providerRequestIds.pop();
  const overflow = fixture([unlisted]);
  await assert.rejects(overflow.page(input({status: "awaiting_provider"})), {code: "failed-precondition"});
  assert.equal(overflow.returned(), 32);
});

test("deadline returns safely and prevents later sequential reads after in-flight RPC resolves", async () => {
  let release;
  const f = fixture([row(0, "pending_provider_approval")], {wait: new Promise(r => { release = r; })});
  f.deps.timeoutMs = 10;
  await assert.rejects(f.page(input({status: "awaiting_provider"})), {code: "deadline-exceeded"});
  release();
  await new Promise(r => setImmediate(r));
  assert.equal(f.calls.length, 1);
});

test("source-byte limit fails closed and DTO exposes only bounded public fields", async () => {
  const a = row(0); a.data.internalSecret = "private"; a.data.paymentId = "secret";
  a.data.providerBankDetails = {secret: "secret"}; a.data.eventType = "Wedding";
  const result = await fixture([a]).page();
  assert.deepEqual(Object.keys(result.bookings[0]).sort(), ["id", "bookingId", "bookingCode", "status",
    "eventType", "eventDate", "eventTime", "eventEndTime", "guestCount", "eventLocation",
    "providerName", "packageName", "createdAt", "updatedAt"].sort());
  assert.equal(JSON.stringify(result).includes("secret"), false);
  a.data.internalSecret = "x".repeat(SEARCH_LIMITS.sourceBytes);
  await assert.rejects(fixture([a]).page(), {code: "resource-exhausted"});
  delete a.data.internalSecret; a.data.eventType = "x".repeat(101);
  await assert.rejects(fixture([a]).page(), {code: "failed-precondition"});
});

test("local registration, server-only guard, indexes and no booking/payment mutation", () => {
  const source = file => readFileSync(require("node:path").join(__dirname, "../src", file), "utf8");
  assert.match(source("index.ts"), /export \{searchCustomerBookings\}/u);
  const callable = source("bookings/search-customer-bookings.ts");
  assert.match(callable, /enforceAppCheck: true/u);
  assert.match(callable, /secrets: \[signingSecret\]/u);
  for (const name of ["search-customer-bookings", "customer-booking-search-reader"]) {
    assert.doesNotMatch(source(`bookings/${name}.ts`), /\.(?:set|update|create|delete|commit)\s*\(/u);
  }
  const rules = readFileSync(require("node:path").join(__dirname, "../../firebase/firestore.rules"), "utf8");
  assert.match(rules, /settingId != 'customerBookingSearch'/u);
  const indexes = JSON.parse(readFileSync(require("node:path").join(__dirname, "../../firebase/firestore.indexes.json")));
  for (const fields of [["customerId", "status", "__name__"], ["customerId", "bookingCode", "__name__"],
    ["customerId", "status", "bookingCode", "__name__"]]) {
    assert.ok(indexes.indexes.some(i => i.collectionGroup === "mainEvents" &&
      i.fields.map(f => f.fieldPath).join() === fields.join()));
  }
});
