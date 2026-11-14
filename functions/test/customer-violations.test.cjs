const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {Timestamp} = require("firebase-admin/firestore");
initializeApp({projectId: "demo-customer-violations-offline"});

// Optimistic offline Firestore: document/query read conflicts retry the actual
// production transaction. No credentials, emulator, gateway or live writes.
let records, hook, retries, sequence = 0;
const reference = path => ({path, id: path.split("/").at(-1),
  get: async () => snap(reference(path)), collection: name => collection(`${path}/${name}`)});
const collection = path => query(path);
function query(path, filters = [], max = Infinity, cursor = null, orders = []) {
  return {path, filters, max, cursor, orders, doc: id => reference(`${path}/${id ?? `auto_${++sequence}`}`),
    where: (...filter) => query(path, [...filters, filter], max, cursor, orders),
    orderBy: (field, direction = "asc") => query(path, filters, max, cursor, [...orders, [field, direction]]),
    limit: n => query(path, filters, n, cursor, orders),
    startAfter: (...values) => query(path, filters, max, values, orders)};
}
function snap(ref) {const data = records.get(ref.path); return {id: ref.id, ref, exists: data !== undefined, data: () => data};}
function read(ref) {
  if (ref.id) return snap(ref);
  const value = (path, field) => field === "__name__" ? path.split("/").at(-1) : records.get(path)[field];
  const scalar = v => v instanceof Timestamp ? v.toMillis() : v;
  const compare = (left, right) => {
    for (let i = 0; i < ref.orders.length; i++) {
      const [field, direction] = ref.orders[i];
      const a = scalar(value(left, field)), b = scalar(Array.isArray(right) ? right[i] : value(right, field));
      if (a !== b) return (a < b ? -1 : 1) * (direction === "desc" ? -1 : 1);
    }
    return 0;
  };
  const docs = [...records.keys()].filter(path => path.startsWith(`${ref.path}/`) &&
    !path.slice(ref.path.length + 1).includes("/"))
    .sort((a, b) => ref.orders.length ? compare(a, b) : a.localeCompare(b))
    .filter(path => !ref.cursor || compare(path, ref.cursor) > 0)
    .filter(path => ref.filters.every(([field, op, value]) => op === "==" && records.get(path)[field] === value))
    .slice(0, ref.max).map(path => snap(reference(path)));
  return {docs, size: docs.length, empty: docs.length === 0};
}
const signature = ref => JSON.stringify(ref.id ? read(ref).data() : read(ref).docs.map(doc => [doc.id, doc.data()]));
const db = {collection, async runTransaction(callback) {
  for (let retry = 0; retry < 10; retry++) {
    const reads = [], writes = [];
    const get = async ref => {assert.equal(writes.length, 0, "all authority reads precede writes"); reads.push([ref, signature(ref)]); return read(ref);};
    const result = await callback({get,
      update: (ref, value) => writes.push([ref, value, true]),
      create: (ref, value) => writes.push([ref, value, false, true]),
      set: (ref, value) => writes.push([ref, value, false])});
    if (hook) {const current = hook; hook = null; await current();}
    if (reads.some(([ref, before]) => signature(ref) !== before)) {retries++; continue;}
    for (const [ref, value, merge, create] of writes) {
      if (create && records.has(ref.path)) throw new Error("Already exists");
      if (merge && !records.has(ref.path)) throw new Error("Missing update target");
      records.set(ref.path, {...(merge ? records.get(ref.path) : {}), ...value});
    }
    return result;
  }
  throw new Error("Transaction conflict limit");
}};
const modulePath = require.resolve("../lib/shared/firestore.js");
require.cache[modulePath] = {id: modulePath, filename: modulePath, loaded: true, exports: {db}};
const {adjudicateCustomerExpiration: adjudicate, endCustomerRestriction, MAX_VIOLATION_EVENT_REQUESTS} = require("../lib/bookings/customer-violation-service.js");
const {reverseCustomerViolation: reverse, getCustomerBookingStanding, getAdminCustomerViolations, reverseAdminCustomerViolation,
  adjudicateExpiredCustomerBooking, retryAdminCustomerViolationAdjudication} = require("../lib/bookings/customer-violation-handlers.js");
const {assertNoCustomerBookingRestriction: gate} = require("../lib/bookings/customer-booking-restriction.js");
const {OBSERVATION_MS: WINDOW, RESTRICTION_MS: WEEK, issueStrike, activeStrikes, readViolationState} = require("../lib/bookings/customer-violation-policy.js");
const {initialExpirationPaymentIds: paymentIds} = require("../lib/payments/initial-payment-expiration.js");
const NOW = Date.parse("2026-11-14T03:00:00Z");
const originalNow = Date.now;
const stamp = ms => Timestamp.fromMillis(ms);
const customerId = "customer_violation";
const statePath = `customerViolationStates/${customerId}`;
const ledger = event => `${statePath}/violations/${event}`;
const state = () => records.get(statePath);
const notifications = () => [...records.entries()].filter(([p]) => p.startsWith("notifications/"));
function seed() {
  records = new Map(); hook = null; retries = 0; Date.now = () => NOW;
  records.set(`users/${customerId}`, {role: "customer"});
  records.set("users/admin_violation", {role: "admin", accountStatus: "active", isActive: true});
}
test.after(() => {Date.now = originalNow;});

function fixture(event = "event_strike_001", count = 1, when = NOW - 1000) {
  const acceptedAt = stamp(when - 86400000);
  const ids = Array.from({length: count}, (_, i) => `${event}_request_${i}`);
  records.set(`mainEvents/${event}`, {customerViolationPolicyVersion: 1, bookingId: event, mainEventId: event,
    customerId, providerRequestIds: ids, status: "expired", paymentStatus: "unpaid", createdAt: stamp(acceptedAt.toMillis() - 1000)});
  for (const id of ids) records.set(`providerRequests/${id}`, {
    providerRequestId: id, bookingId: event, mainEventId: event, customerId,
    providerId: `provider_${id}`, providerOwnerId: `owner_${id}`, type: "catering", status: "expired", paymentStatus: "unpaid",
    initialPaymentExpirationReason: "no_attempt_original_deadline_elapsed", initialPaymentExpiredAt: stamp(when),
    initialPaymentExpirationRecordedAt: stamp(when),
    initialPaymentWriteProtocolVersion: 1, createdAt: stamp(acceptedAt.toMillis() - 1000), acceptedAt,
    financialSnapshotCapturedAt: acceptedAt, expiresAt: stamp(when),
    eventDate: stamp(NOW + 8 * 86400000), eventTime: "10:00", eventEndTime: "14:00",
    amount: 1000, downPaymentAmount: 300,
    financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
      requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000},
    initialPaymentEligibilitySchemaVersion: 1, initialPaymentEligibility: {mode: "full_only", depositEligible: false,
      depositAllowed: false, reason: "package_full_payment", evaluatedAt: acceptedAt, eventStartAt: stamp(NOW + 8 * 86400000 - 3600000)},
  });
  return ids;
}

test("customer standing is self-scoped, minimal, read-only and follows expiry and reversal policy", async () => {
  seed();
  records.set(`users/${customerId}`, {role: "customer", accountStatus: "active", isActive: true, isBlocked: false});
  const auth = getAuth();
  const original = auth.getUser;
  auth.getUser = async uid => {
    assert.equal(uid, customerId);
    return {uid, disabled: false};
  };
  const load = () => getCustomerBookingStanding.run({auth: {uid: customerId, token: {}},
    data: {customerId: "another_customer"}, rawRequest: {headers: {}}});
  try {
    assert.deepEqual(await load(), {activeCount: 0, status: "clear", restrictionExpiresAt: null,
      serverTime: new Date(NOW).toISOString()});
    for (let n = 1; n <= 3; n++) {
      const event = `event_strike_00${n}`; fixture(event); await adjudicate(event);
      const before = JSON.stringify([...records]);
      const summary = await load();
      assert.equal(summary.activeCount, n);
      assert.equal(summary.status, ["warning", "final_warning", "restricted"][n - 1]);
      assert.deepEqual(Object.keys(summary).sort(), ["activeCount", "restrictionExpiresAt", "serverTime", "status"]);
      assert.equal(JSON.stringify([...records]), before);
    }
    assert.equal((await load()).restrictionExpiresAt, new Date(NOW + WEEK).toISOString());
    Date.now = () => NOW + WEEK;
    assert.equal((await load()).status, "clear");
    assert.equal((await load()).restrictionExpiresAt, null);
    Date.now = () => NOW;
    await reverse("admin_violation", {customerId, strikeId: "event_strike_001", expectedRevision: 3,
      reason: "Corrected booking attribution"});
    assert.equal((await load()).status, "clear");
    records.set(statePath, {schemaVersion: 9});
    await assert.rejects(load(), {code: "failed-precondition"});
  } finally {auth.getUser = original;}
});

test("customer standing rejects unauthenticated callers and enforces customer authorization", async () => {
  seed();
  await assert.rejects(getCustomerBookingStanding.run({data: {}, rawRequest: {headers: {}}}), {code: "unauthenticated"});
  const auth = getAuth();
  const original = auth.getUser;
  const transaction = db.runTransaction;
  // Unauthorized callers must be rejected before any violation-state read.
  db.runTransaction = async () => {assert.fail("Unauthorized violation-state read");};
  auth.getUser = async uid => ({uid, disabled: uid === "auth_disabled_customer"});
  const active = {role: "customer", accountStatus: "active", isActive: true, isBlocked: false};
  records.set("users/admin_violation", {...active, role: "admin"});
  records.set("users/provider_violation", {...active, role: "provider"});
  records.set("users/inactive_customer", {...active, isActive: false});
  records.set("users/blocked_customer", {...active, isBlocked: true});
  records.set("users/disabled_customer", {...active, accountStatus: "disabled"});
  records.set("users/auth_disabled_customer", active);
  records.set("users/malformed_customer", {role: "customer"});
  try {
    for (const uid of ["admin_violation", "provider_violation", "inactive_customer", "blocked_customer",
      "disabled_customer", "auth_disabled_customer", "missing_customer", "malformed_customer"]) {
      await assert.rejects(getCustomerBookingStanding.run({auth: {uid, token: {}}, data: {},
        rawRequest: {headers: {}}}), {code: "permission-denied"});
    }
  } finally {auth.getUser = original; db.runTransaction = transaction;}
});

test("first and second strikes warn; third restricts for exactly seven days and consumes the cycle", async () => {
  seed();
  for (let n = 1; n <= 3; n++) {
    const event = `event_strike_00${n}`; fixture(event);
    assert.equal(await adjudicate(event), "issued");
    assert.equal(activeStrikes(readViolationState(state()), NOW).length, n);
  }
  assert.equal(notifications().length, 3);
  assert.match(notifications()[0][1].title, /warning/);
  assert.match(notifications()[1][1].title, /Final/);
  assert.equal(state().restriction.untilMs, NOW + WEEK);
  assert.equal(state().pending.length, 0);
  for (let n = 1; n <= 3; n++) assert.equal(records.get(ledger(`event_strike_00${n}`)).consumedCycleId, "event_strike_003");
});

test("rolling window excludes the exact 30-day boundary, retains fresh strikes, and ignores delayed old events", async () => {
  seed(); fixture("event_old_001", 1, NOW - WINDOW);
  assert.equal(await adjudicate("event_old_001"), "outside_window");
  const empty = readViolationState(undefined);
  const first = issueStrike(empty, {id: "event_old_001", occurredAtMs: NOW - WINDOW + 1}, NOW).state;
  assert.equal(activeStrikes(first, NOW).length, 1);
  assert.equal(activeStrikes(first, NOW + 1).length, 0);
  assert.equal(issueStrike(first, {id: "event_new_001", occurredAtMs: NOW + 1}, NOW + 1).count, 1);
});

test("duplicate delivery and retries create exactly one strike, audit entry and notification", async () => {
  seed(); fixture();
  const result = await Promise.all([adjudicate("event_strike_001"), adjudicate("event_strike_001")]);
  assert.deepEqual(result.sort(), ["duplicate", "issued"]);
  assert.equal(state().revision, 1); assert.equal(notifications().length, 1); assert.ok(retries > 0);
  assert.equal([...records.keys()].filter(p => p.startsWith("adminLogs/")).length, 1);
});

test("concurrent third strikes serialize; extra expirations during restriction are consumed without extending punishment", async () => {
  seed(); fixture(); await adjudicate("event_strike_001");
  fixture("event_strike_002"); await adjudicate("event_strike_002");
  fixture("event_strike_003"); fixture("event_strike_004");
  await Promise.all([adjudicate("event_strike_003"), adjudicate("event_strike_004")]);
  assert.equal(state().restriction.untilMs, NOW + WEEK);
  assert.equal(notifications().length, 3); assert.ok(retries > 0);
  assert.ok(records.get(ledger("event_strike_004")).consumedCycleId);
});

test("multi-provider all-unpaid expirations produce one event-level strike", async () => {
  seed(); fixture("event_strike_001", 4);
  const results = await Promise.all(Array.from({length: 4}, () => adjudicate("event_strike_001")));
  assert.equal(results.filter(r => r === "issued").length, 1);
  assert.equal(records.get(ledger("event_strike_001")).providerRequestIds.length, 4);
});

for (const patch of [{status: "rejected"}, {status: "cancelled"}, {status: "pending"},
  {paymentStatus: "paid"}, {paymentStatus: "partially_paid"}, {paymentStatus: "pending"},
  {reconciliationRequired: true}, {refundExecutionLock: "lock"}, {initialPaymentDispatchReservedAt: stamp(NOW)},
  {paymongoCheckoutId: "checkout"}, {paymongoPaymentIntentId: "intent"}, {initialPaymentReview: {}},
  {initialPaymentWriteProtocolVersion: undefined}, {initialPaymentExpirationReason: "provider_response_timeout"},
  {initialPaymentExpiredAt: "invalid"}, {initialPaymentExpirationRecordedAt: stamp(NOW + 1)},
  {financialSnapshot: {}}, {rejectedAt: stamp(NOW)}, {cancelledAt: stamp(NOW)}]) {
  test(`mixed event exclusions: ${JSON.stringify(patch)}`, async () => {
    seed(); const ids = fixture("event_strike_001", 2);
    Object.assign(records.get(`providerRequests/${ids[1]}`), patch);
    assert.notEqual(await adjudicate("event_strike_001"), "issued"); assert.equal(state(), undefined);
  });
}

for (const kind of ["identity", "checkoutAttempts", "gatewayPayments", "refunds", "events", "linked", "event_linked", "cancellation"]) {
  test(`payment and cancellation evidence excluded: ${kind}`, async () => {
    seed(); const [id] = fixture(); const payment = paymentIds(id)[0];
    const path = kind === "identity" ? `payments/${payment}` : kind === "linked" ? "payments/noncanonical" :
      kind === "event_linked" ? "payments/eventonly" : kind === "cancellation" ? "providerRequestCancellationRequests/cancel_001" : `payments/${payment}/${kind}/orphan`;
    records.set(path, kind === "event_linked" ? {mainEventId: "event_strike_001"} : {providerRequestId: id, status: "unresolved"});
    assert.equal(await adjudicate("event_strike_001"), "payment_or_cancellation_evidence");
    assert.equal(state(), undefined);
  });
}

test("history enrollment and membership evidence are mandatory, and oversized events fail closed", async () => {
  seed(); fixture(); delete records.get("mainEvents/event_strike_001").customerViolationPolicyVersion;
  assert.equal(await adjudicate("event_strike_001"), "ineligible");
  fixture(); records.get("mainEvents/event_strike_001").providerRequestIds.push("missing_request");
  assert.equal(await adjudicate("event_strike_001"), "ineligible");
  fixture("event_strike_002", MAX_VIOLATION_EVENT_REQUESTS + 1);
  assert.equal(await adjudicate("event_strike_002"), "review"); assert.equal(state(), undefined);
});

async function restrict() {
  for (let n = 1; n <= 3; n++) {const event = `event_strike_00${n}`; fixture(event); await adjudicate(event);}
}
test("restriction expires exactly at deadline; expiry notification retries are idempotent; old strikes cannot punish again", async () => {
  seed(); await restrict();
  await assert.rejects(db.runTransaction(tx => gate(tx, db, customerId)), error =>
    error.details.reason === "customer_booking_restricted" && error.details.expiresAt === new Date(NOW + WEEK).toISOString());
  Date.now = () => NOW + WEEK;
  await db.runTransaction(tx => gate(tx, db, customerId));
  assert.equal(await endCustomerRestriction(customerId), true);
  assert.equal(await endCustomerRestriction(customerId), false);
  assert.equal(notifications().length, 4);
  fixture("event_strike_004", 1, NOW + WEEK - 1);
  await adjudicate("event_strike_004");
  assert.equal(state().pending.length, 1); assert.equal(state().restriction, null);
});

test("admin reversal requires active admin and current revision, preserves history and lifts a dependent restriction", async () => {
  seed(); await restrict();
  const input = {customerId, strikeId: "event_strike_002", reason: "Verified incorrect attribution", expectedRevision: 3};
  await assert.rejects(reverse(customerId, input), {code: "permission-denied"});
  await assert.rejects(reverse("admin_violation", {...input, reason: " "}), {code: "invalid-argument"});
  await assert.rejects(reverse("admin_violation", {...input, expectedRevision: 2}), {code: "aborted"});
  assert.deepEqual(await reverse("admin_violation", input), {changed: true});
  assert.equal(state().restriction, null); assert.equal(state().pending.length, 0);
  assert.equal(records.get(ledger(input.strikeId)).reason, "no_attempt_original_deadline_elapsed");
  assert.equal(records.get(ledger(input.strikeId)).reversalReason, input.reason);
  assert.deepEqual(await reverse("admin_violation", input), {changed: false});
  assert.equal(notifications().length, 4);
  assert.ok(!JSON.stringify(notifications()).includes(input.reason));
  assert.ok([...records.values()].some(v => v.action === "customer_violation.reversed" && v.reason === input.reason));
  await db.runTransaction(tx => gate(tx, db, customerId));
});

test("concurrent reversal and third-strike issuance retries against current state", async () => {
  seed(); fixture(); await adjudicate("event_strike_001"); fixture("event_strike_002"); await adjudicate("event_strike_002");
  fixture("event_strike_003");
  hook = () => reverse("admin_violation", {customerId, strikeId: "event_strike_001", reason: "Correct erroneous strike", expectedRevision: 2});
  assert.equal(await adjudicate("event_strike_003"), "issued");
  assert.ok(retries > 0); assert.equal(state().restriction, null); assert.equal(state().pending.length, 2);
});

test("concurrent booking intake rereads restriction document before committing", async () => {
  seed(); fixture(); await adjudicate("event_strike_001"); fixture("event_strike_002"); await adjudicate("event_strike_002"); fixture("event_strike_003");
  hook = () => adjudicate("event_strike_003");
  await assert.rejects(db.runTransaction(async tx => {
    await gate(tx, db, customerId);
    tx.create(reference("mainEvents/new_booking"), {customerId});
  }), error => error.details.reason === "customer_booking_restricted");
  assert.equal(records.has("mainEvents/new_booking"), false); assert.ok(retries > 0);
});

test("malformed state never silently enables booking creation", async () => {
  seed(); records.set(statePath, {schemaVersion: 2});
  await assert.rejects(db.runTransaction(tx => gate(tx, db, customerId)), e => e.details.reason === "customer_booking_restriction_review_required");
});

test("admin callables require authentication; creation gates follow replay and never touch payment/message authorization", async () => {
  await assert.rejects(getAdminCustomerViolations.run({data: {customerId}, rawRequest: {headers: {}}}), {code: "unauthenticated"});
  await assert.rejects(reverseAdminCustomerViolation.run({data: {customerId}, rawRequest: {headers: {}}}), {code: "unauthenticated"});
  const single = fs.readFileSync("src/bookings/submit-booking-request.ts", "utf8");
  assert.ok(single.indexOf("if (existingSnapshot.exists)") < single.indexOf("if (!disclosureOnly) await assertNoCustomerBookingRestriction"));
  const multi = fs.readFileSync("src/bookings/submit-multi-provider-booking.ts", "utf8");
  assert.match(multi, /prepare: async transaction => \{\s+await assertNoCustomerBookingRestriction/);
  const coordinator = fs.readFileSync("src/bookings/multi-provider-transaction-coordinator.ts", "utf8");
  assert.ok(coordinator.indexOf("if (bookingSnapshot.exists)") < coordinator.indexOf("const prepared = await prepare"));
  for (const path of ["src/shared/authorization.ts", "src/payments/create-payment-session.ts", "src/messaging/provider-request-chat.ts"]) {
    assert.ok(!fs.readFileSync(path, "utf8").includes("assertNoCustomerBookingRestriction"));
  }
});

test("adjudication only adds violation state, ledger, notification and audit writes", async () => {
  seed(); fixture(); const before = new Map([...records].map(([k, v]) => [k, JSON.stringify(v)]));
  await adjudicate("event_strike_001");
  for (const [path, value] of before) assert.equal(JSON.stringify(records.get(path)), value, path);
  for (const path of records.keys()) if (!before.has(path)) assert.match(path, /^(customerViolationStates|notifications|adminLogs)\//);
});

test("newest-first history uses timestamp and ID ties, survives reversal, and rejects missing cursors", async () => {
  seed();
  const authorization = require("../lib/shared/authorization.js");
  const original = authorization.requireRole;
  authorization.requireRole = async () => "admin";
  try {
    for (let n = 0; n < 57; n++) {
      const id = `event_history_${String(n).padStart(3, "0")}`;
      records.set(ledger(id), {mainEventId: id, issuedAt: stamp(NOW + Math.floor(n / 2)),
        occurredAt: stamp(NOW - n), reversedAt: null});
    }
    const load = cursor => getAdminCustomerViolations.run({auth: {uid: "admin_violation", token: {}},
      data: {customerId, cursor}, rawRequest: {headers: {}}});
    const first = await load(null);
    assert.equal(first.records.length, 25);
    assert.equal(first.records[0].id, "event_history_056");
    await reverse("admin_violation", {customerId, strikeId: first.records[0].id,
      expectedRevision: 0, reason: "Historical record correction"});
    assert.deepEqual((await load(null)).records.map(r => r.id), first.records.map(r => r.id));
    const second = await load(first.nextCursor), third = await load(second.nextCursor);
    const ids = [...first.records, ...second.records, ...third.records].map(r => r.id);
    assert.equal(ids.length, 57); assert.equal(new Set(ids).size, 57); assert.equal(third.nextCursor, null);
    assert.deepEqual((await load(first.nextCursor)).records.map(r => r.id), second.records.map(r => r.id));
    await assert.rejects(load("missing_cursor"), {code: "invalid-argument"});
  } finally {authorization.requireRole = original;}
});

for (const number of [1, 2]) test(`reversing pending strike ${number} preserves unrelated pending history`, async () => {
  seed(); fixture(); await adjudicate("event_strike_001"); fixture("event_strike_002"); await adjudicate("event_strike_002");
  await reverse("admin_violation", {customerId, strikeId: `event_strike_00${number}`,
    expectedRevision: 2, reason: "Incorrect pending strike"});
  assert.deepEqual(state().pending.map(s => s.id), [`event_strike_00${number === 1 ? 2 : 1}`]);
  assert.ok(records.has(ledger("event_strike_001")) && records.has(ledger("event_strike_002")));
});

test("old consumed corrections cannot lift a newer independent restriction", async () => {
  seed(); await restrict(); Date.now = () => NOW + WEEK;
  for (let n = 4; n <= 6; n++) {const id = `event_strike_00${n}`; fixture(id, 1, NOW + WEEK - 1); await adjudicate(id);}
  const cycle = state().restriction;
  await reverse("admin_violation", {customerId, strikeId: "event_strike_001", expectedRevision: 6,
    reason: "Old historical correction"});
  assert.deepEqual(state().restriction, cycle); assert.deepEqual(state().pending, []);
});

test("correction after expiry never revives consumed strikes", async () => {
  seed(); await restrict(); Date.now = () => NOW + WEEK;
  await reverse("admin_violation", {customerId, strikeId: "event_strike_002", expectedRevision: 3,
    reason: "Expired cycle correction"});
  assert.equal(state().restriction, null); assert.deepEqual(state().pending, []);
  fixture("event_strike_004", 1, NOW + WEEK - 1); await adjudicate("event_strike_004");
  assert.equal(state().pending.length, 1);
});

test("concurrent administrators serialize reversals and completed retries are no-ops", async () => {
  seed(); await restrict();
  const input = {customerId, strikeId: "event_strike_001", expectedRevision: 3, reason: "Confirmed duplicate attribution"};
  const results = await Promise.all([reverse("admin_violation", input), reverse("admin_violation", input)]);
  assert.equal(results.filter(r => r.changed).length, 1); assert.equal(state().revision, 4);
  assert.equal(notifications().length, 4);
});

test("permanent malformed state is recorded once and exact-event replay recovers after repair", async () => {
  seed(); fixture(); records.set(statePath, {schemaVersion: 9});
  assert.equal(await adjudicate("event_strike_001"), "review");
  assert.equal(await adjudicate("event_strike_001"), "review");
  assert.equal(notifications().length, 0);
  assert.equal([...records.values()].filter(v => v.action === "customer_violation.review_required").length, 1);
  assert.equal(records.get("customerViolationAdjudicationReviews/event_strike_001").reason, "invalid_violation_state");
  records.set(statePath, readViolationState(undefined));
  assert.equal(await adjudicate("event_strike_001"), "issued");
  assert.equal(await adjudicate("event_strike_001"), "duplicate");
  assert.equal(notifications().length, 1);
  assert.equal(records.get("customerViolationAdjudicationReviews/event_strike_001").status, "resolved");
});

test("trigger retries transient failures, acknowledges permanent review, and duplicate delivery is harmless", async () => {
  seed(); const [id] = fixture();
  const event = {id: "delivery_001", params: {providerRequestId: id}, data: {
    before: {data: () => ({status: "accepted"})}, after: {data: () => records.get(`providerRequests/${id}`)},
  }};
  const run = db.runTransaction;
  db.runTransaction = async () => {throw Object.assign(new Error("Unavailable"), {code: 14});};
  try {await assert.rejects(adjudicateExpiredCustomerBooking.run(event), {code: 14});}
  finally {db.runTransaction = run;}
  records.set(statePath, {schemaVersion: 9});
  await adjudicateExpiredCustomerBooking.run(event);
  assert.equal(notifications().length, 0);
  records.set(statePath, readViolationState(undefined));
  await adjudicateExpiredCustomerBooking.run(event); await adjudicateExpiredCustomerBooking.run(event);
  assert.equal(notifications().length, 1); assert.equal(state().revision, 1);
});

test("exact-event recovery requires active admin, audits its reason and rechecks financial exclusions", async () => {
  seed(); fixture();
  const authorization = require("../lib/shared/authorization.js"), original = authorization.requireRole;
  authorization.requireRole = async () => "admin";
  const request = {auth: {uid: "admin_violation", token: {}}, rawRequest: {headers: {}},
    data: {mainEventId: "event_strike_001", reason: "Retry after incident diagnosis"}};
  try {
    await assert.rejects(retryAdminCustomerViolationAdjudication.run({...request, auth: undefined}), {code: "unauthenticated"});
    records.get("users/admin_violation").isBlocked = true;
    await assert.rejects(retryAdminCustomerViolationAdjudication.run(request), {code: "permission-denied"});
    records.get("users/admin_violation").isBlocked = false;
    records.set("payments/uncertain_payment", {mainEventId: "event_strike_001"});
    assert.deepEqual(await retryAdminCustomerViolationAdjudication.run(request), {result: "payment_or_cancellation_evidence"});
    assert.equal(state(), undefined);
    records.delete("payments/uncertain_payment");
    assert.deepEqual(await retryAdminCustomerViolationAdjudication.run(request), {result: "issued"});
    assert.deepEqual(await retryAdminCustomerViolationAdjudication.run(request), {result: "duplicate"});
    assert.ok([...records.values()].some(v => v.action === "customer_violation.recovery_requested" && v.reason === request.data.reason));
    assert.ok(!JSON.stringify(notifications()).includes(request.data.reason));
  } finally {authorization.requireRole = original;}
});

test("missing or consumed pending ledger cannot cause permanent update failure or another penalty", async () => {
  for (const patch of [null, {consumedCycleId: "historical_cycle"}, {reversedAt: stamp(NOW)}]) {
    seed(); fixture(); await adjudicate("event_strike_001"); fixture("event_strike_002"); await adjudicate("event_strike_002");
    if (patch) Object.assign(records.get(ledger("event_strike_001")), patch); else records.delete(ledger("event_strike_001"));
    fixture("event_strike_003"); assert.equal(await adjudicate("event_strike_003"), "review");
    assert.equal(state().restriction, null); assert.equal(state().revision, 2); assert.equal(notifications().length, 2);
  }
});

test("temporary transaction failure can retry without mutating expiration evidence", async () => {
  seed(); fixture(); const parent = JSON.stringify(records.get("mainEvents/event_strike_001"));
  const run = db.runTransaction;
  db.runTransaction = async () => {throw Object.assign(new Error("Unavailable"), {code: 14});};
  try {await assert.rejects(adjudicate("event_strike_001"), {code: 14});}
  finally {db.runTransaction = run;}
  assert.equal(state(), undefined);
  assert.equal(await adjudicate("event_strike_001"), "issued");
  assert.equal(JSON.stringify(records.get("mainEvents/event_strike_001")), parent);
});

test("real single-provider callable blocks restricted new submissions and preserves successful replay", async () => {
  seed(); await restrict();
  // Isolate external auth/rate/maintenance services; exercise the real callable,
  // its input parser, replay branch and production transactional restriction gate.
  const mockModule = (name, exports) => {
    const id = require.resolve(name); require.cache[id] = {id, filename: id, loaded: true, exports};
  };
  mockModule("firebase-admin/auth", {getAuth: () => ({getUser: async () => ({phoneNumber: "+639171234567", disabled: false})})});
  mockModule("../lib/shared/authorization.js", {requireRole: async () => "customer"});
  mockModule("../lib/shared/rate-limit.js", {enforceCallableRateLimit: async () => {}});
  mockModule("../lib/shared/maintenance.js", {requireMaintenanceOpen: async () => {}});
  mockModule("../lib/packages/occasion-publication-generation.js", {
    stableOccasionPublicationGeneration: () => 1, activeOccasionAuthority: () => true,
  });
  const {submitBookingRequest} = require("../lib/bookings/submit-booking-request.js");
  const {bookingOutcomeId} = require("../lib/bookings/submission-outcome.js");
  const input = {clientRequestId: "client_request_001", providerId: "provider_booking", packageId: "package_booking",
    eventType: "wedding", eventDate: "2027-09-20", eventTime: "10:00", eventEndTime: "14:00",
    eventLocation: "Ormoc City", eventAddress: "Ormoc City, Leyte", guestCount: 100,
    selectedFoods: [], selectedDecorations: [], selectedFurniture: [], addonIds: [], willArrangeOwnAddOns: false,
    policyAcknowledgements: [], agreementAcknowledgements: []};
  const request = {auth: {uid: customerId, token: {email_verified: true}}, rawRequest: {headers: {}}, data: input};
  await assert.rejects(submitBookingRequest.run(request), e => e.details?.reason === "customer_booking_restricted");
  const id = bookingOutcomeId(customerId, input.clientRequestId);
  records.set(`mainEvents/${id}`, {customerId, providerRequestIds: ["existing_request"]});
  const replay = await submitBookingRequest.run(request);
  assert.equal(replay.created, false); assert.equal(replay.bookingId, id);
  assert.deepEqual(replay.providerRequestIds, ["existing_request"]);
});
