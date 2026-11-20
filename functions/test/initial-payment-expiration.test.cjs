const test = require("node:test");
const assert = require("node:assert/strict");
const {initializeApp} = require("firebase-admin/app");
const {Timestamp} = require("firebase-admin/firestore");
initializeApp({projectId: "demo-initial-expiration-offline"});

// Optimistic in-memory Firestore: rereads document/query sets on commit and retries conflicts.
// No emulator, gateway, credentials or network. Real production transaction code runs below.
let records, hook, retries, sequence = 0;
const reference = path => ({path, id: path.split("/").at(-1), collection: name => collection(`${path}/${name}`),
  get: async () => snap(reference(path))});
const collection = path => query(path);
function query(path, filters = [], max = Infinity, cursor = null) {
  return {path, filters, max, cursor, doc: id => reference(`${path}/${id ?? `auto_${++sequence}`}`),
    where: (...filter) => query(path, [...filters, filter], max, cursor),
    orderBy: () => query(path, filters, max, cursor), limit: n => query(path, filters, n, cursor),
    startAfter: id => query(path, filters, max, id), get: async () => read(query(path, filters, max, cursor))};
}
function snap(ref) {
  const data = records.get(ref.path);
  return {id: ref.id, ref, exists: data !== undefined, data: () => data};
}
function read(ref) {
  if (ref.id) return snap(ref);
  const docs = [...records.keys()].sort().filter(path => path.startsWith(`${ref.path}/`) &&
    !path.slice(ref.path.length + 1).includes("/") && (!ref.cursor || path.split("/").at(-1) > ref.cursor))
    .filter(path => (ref.filters ?? []).every(([field, op, value]) => op === "==" ?
      records.get(path)[field] === value : op === "in" ? value.includes(records.get(path)[field]) :
        op === ">=" ? records.get(path)[field] >= value : op === "<" ? records.get(path)[field] < value : false))
    .slice(0, ref.max).map(path => snap(reference(path)));
  return {docs, size: docs.length, empty: docs.length === 0};
}
const signature = ref => JSON.stringify(ref.id ? read(ref).data() : read(ref).docs.map(doc => [doc.id, doc.data()]));
const db = {collection, async runTransaction(callback) {
  for (let retry = 0; retry < 5; retry++) {
    const reads = [], writes = [];
    const get = async ref => {reads.push([ref, signature(ref)]); return read(ref);};
    const result = await callback({get, getAll: (...refs) => Promise.all(refs.map(get)),
      update: (ref, value) => writes.push([ref, value, true]),
      create: (ref, value) => writes.push([ref, value, false, true]),
      set: (ref, value) => writes.push([ref, value, false])});
    if (hook) {const current = hook; hook = null; await current();}
    if (reads.some(([ref, before]) => signature(ref) !== before)) {retries++; continue;}
    for (const [ref, value, merge, create] of writes) {
      if (create && records.has(ref.path)) throw new Error("Already exists");
      records.set(ref.path, {...(merge ? records.get(ref.path) : {}), ...value});
    }
    return result;
  }
  throw new Error("Transaction conflict limit");
}};
const modulePath = require.resolve("../lib/shared/firestore.js");
require.cache[modulePath] = {id: modulePath, filename: modulePath, loaded: true, exports: {db}};
const {initialExpirationDecision: decide, initialExpirationPaymentIds: paymentIds,
  expireNeverAttemptedInitialPayment: expire, sweepInitialPaymentExpiration: sweep,
  INITIAL_EXPIRATION_SWEEP_LIMIT: LIMIT} = require("../lib/payments/initial-payment-expiration.js");
const {originalInitialPaymentDeadline: deadline, requireInitialPaymentHold} = require("../lib/payments/initial-payment-reservation.js");
const {existingAcceptancePlan} = require("../lib/provider-requests/existing-acceptance-plan.js");
const {createPaymentSessionForCustomer} = require("../lib/payments/create-payment-session.js");
const {buildBookingPaymentPolicySnapshot} = require("../lib/bookings/booking-payment-eligibility-policy.js");
const {evaluateInitialPaymentEligibility} = require("../lib/payments/initial-payment-eligibility.js");
const {providerRequestSettlementUpdateForPaymentOutcome} = require("../lib/payments/payment-settlement.js");
const {providerRequestOccupiesAvailability: occupies} = require("../lib/provider-availability/validate-provider-availability.js");
const {bookingPolicyTimingV3, BOOKING_LIFECYCLE_POLICY_V3} = require("../lib/bookings/booking-policy-v3.js");
const NOW = new Date("2026-10-22T07:27:45Z"); // historical equivalent: 15:27:45 PHT
const stamp = ms => Timestamp.fromMillis(ms);
const ids = ["request_catering", "request_photography", "request_videography"];
const request = (id = ids[0]) => records.get(`providerRequests/${id}`);
const parent = () => records.get("mainEvents/event_expiration");
function fixture(id = ids[0]) {
  const acceptedAt = stamp(NOW.getTime() - 86400000);
  return {providerRequestId: id, bookingId: "event_expiration", mainEventId: "event_expiration",
    providerId: `provider_${id}`, providerOwnerId: `owner_${id}`, customerId: "customer_expiration",
    type: "catering", status: "waiting_for_down_payment", paymentStatus: "unpaid",
    initialPaymentWriteProtocolVersion: 1, createdAt: stamp(acceptedAt.toMillis() - 1000), acceptedAt,
    financialSnapshotCapturedAt: acceptedAt, expiresAt: stamp(NOW.getTime()),
    eventDate: Timestamp.fromDate(new Date("2026-10-30T00:00:00+08:00")), eventTime: "10:00", eventEndTime: "14:00",
    amount: 1000, downPaymentAmount: 300,
    financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
      requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000},
    initialPaymentEligibilitySchemaVersion: 1, initialPaymentEligibility: {mode: "full_only", depositEligible: false,
      depositAllowed: false, reason: "package_full_payment", evaluatedAt: acceptedAt,
      eventStartAt: Timestamp.fromDate(new Date("2026-10-30T02:00:00Z"))}};
}
const rolloutPath = "appSettings/initialPaymentExpirationPhaseA";
const enabledRollout = () => ({schemaVersion: 1, isPublic: false, enrollmentEnabled: true, expirationEnabled: true, historicalReviewEnabled: true});
function seed() {
  records = new Map(); hook = null; retries = 0;
  records.set(rolloutPath, enabledRollout());
  records.set("mainEvents/event_expiration", {bookingId: "event_expiration", mainEventId: "event_expiration",
    customerId: "customer_expiration", providerRequestIds: ids, status: "needs_provider_replacement"});
  for (const id of ids) {
    const data = fixture(id); records.set(`providerRequests/${id}`, data);
    records.set(`providers/${data.providerId}`, {ownerId: data.providerOwnerId});
  }
  request(ids[1]).status = "rejected";
  Object.assign(request(ids[2]), {status: "confirmed", paymentStatus: "paid"});
}
const notifications = () => [...records.keys()].filter(path => path.startsWith("notifications/"));

test("isolated worker refuses truncated event membership without any request or money writes", async () => {
  seed(); const before = JSON.stringify([...records]);
  assert.equal(await expire(ids[0], NOW, {remaining: () => true, maxEventRequests: 1}), "membership_limit");
  assert.equal(JSON.stringify([...records]), before);
});

test("isolated worker page limit checkpoints a completed candidate", async () => {
  seed(); let page;
  await sweep(NOW, {remaining: () => true, pageLimit: 1, maxEventRequests: 50, onPage: value => {page = value;}});
  assert.deepEqual(page, {scanned: 1, completed: 1});
  assert.equal(request().status, "expired");
  assert.equal(records.get("bookingLifecycleCursors/initial_payment_expiration_v1").lastRequestId, ids[0]);
});

test("cutoff before, exactly at and after; future acceptance and invalid time fail closed", () => {
  seed(); const data = request();
  assert.equal(decide(data, new Date(NOW.getTime() - 1)).kind, "waiting");
  assert.equal(decide(data, NOW).kind, "candidate");
  assert.equal(decide(data, new Date(NOW.getTime() + 1)).kind, "candidate");
  assert.equal(decide({...data, acceptedAt: stamp(NOW.getTime() + 1)}, NOW).kind, "review");
  assert.throws(() => decide(data, new Date(NaN)));
  assert.throws(() => requireInitialPaymentHold(data, NOW), {code: "failed-precondition"});
});
test("deadline never exceeds acceptance plus 24 hours, stored expiry, event or frozen hard boundary", () => {
  seed(); const data = request();
  assert.equal(deadline({...data, expiresAt: null}).toMillis(), NOW.getTime());
  assert.equal(deadline({...data, expiresAt: stamp(NOW.getTime() + 99999)}).toMillis(), NOW.getTime());
  assert.equal(deadline({...data, hardPaymentDeadlineAt: stamp(NOW.getTime() - 1000)}).toMillis(), NOW.getTime() - 1000);
  const earlier = {...data, eventDate: Timestamp.fromDate(new Date("2026-10-22T00:00:00+08:00")), eventTime: "10:00"};
  assert.equal(deadline(earlier).toMillis(), Date.parse("2026-10-22T02:00:00Z"));
  for (const patch of [{expiresAt: "bad"}, {acceptedAt: null}, {eventDate: null},
    {hardPaymentDeadlineAt: "bad"}, {eventStartAt: stamp(1)}, {expiresAt: data.acceptedAt},
    {remainingBalanceTimingSchemaVersion: "3"}, {remainingBalanceTimingSchemaVersion: 999}]) {
    assert.equal(decide({...data, ...patch}, NOW).kind, "review");
  }
  const timing = bookingPolicyTimingV3(new Date("2026-10-23T06:00:00Z"));
  const v3 = {...data, remainingBalanceTimingSchemaVersion: 3, balanceDueHoursBeforeEvent: 48,
    bookingLifecyclePolicySnapshot: BOOKING_LIFECYCLE_POLICY_V3,
    eventDate: Timestamp.fromDate(new Date("2026-10-23T00:00:00+08:00")), eventTime: "14:00",
    ...Object.fromEntries(Object.entries(timing).map(([key, value]) => [key, Timestamp.fromDate(value)])),
    remainingBalanceGraceEndsAt: Timestamp.fromDate(timing.hardPaymentDeadlineAt)};
  assert.equal(deadline(v3).toMillis(), Date.parse("2026-10-22T06:00:00Z"));
});
test("prospective accepted with null expiry expires; historical equivalent never acquires provenance or renews hold", async () => {
  seed(); Object.assign(request(), {status: "accepted", expiresAt: null});
  assert.equal(await expire(ids[0], NOW), "expired");
  assert.equal(request().initialPaymentExpiredAt.toMillis(), NOW.getTime());
  seed(); Object.assign(request(), {status: "accepted", expiresAt: null}); delete request().initialPaymentWriteProtocolVersion;
  const original = request().acceptedAt;
  assert.doesNotThrow(() => existingAcceptancePlan(request(), new Date(NOW.getTime() - 1)));
  assert.throws(() => existingAcceptancePlan(request(), NOW), {code: "failed-precondition"});
  assert.equal(await expire(ids[0], new Date(NOW.getTime() - 1)), "waiting");
  assert.equal(await expire(ids[0], NOW), "review");
  assert.equal(request().status, "accepted"); assert.equal(request().expiresAt, null);
  assert.equal(request().initialPaymentReview.reason, "initial_payment_protocol_unproven");
  assert.deepEqual(request().acceptedAt, original); assert.equal(notifications().length, 0);
});
test("missing and contradictory frozen finance, zero upfront and incomplete provenance require review", () => {
  seed();
  for (const patch of [{financialSnapshot: null}, {financialSnapshotCapturedAt: null}, {amount: 999},
    {downPaymentAmount: 0}, {initialPaymentEligibilitySchemaVersion: null}, {createdAt: null},
    {initialPaymentWriteProtocolVersion: 2}, {createdAt: stamp(NOW.getTime() + 1)}]) {
    assert.equal(decide({...request(), ...patch}, NOW).kind, "review", JSON.stringify(patch));
  }
});
test("confirmed, paid, zero-upfront confirmed, processing, terminal and locked requests remain untouched", async () => {
  for (const patch of [{status: "confirmed", downPaymentAmount: 0}, {paymentStatus: "paid"}, {status: "in_progress"},
    {status: "completed"}, {status: "rejected"}, {status: "cancelled"}, {status: "expired"},
    {status: "payment_processing"}, {reconciliationRequired: true}, {lifecycleReconciliationRequired: true},
    {activeCancellationRequestId: "cancel_test"}, {approvedCancellationRequestId: "cancel_test"}, {refundExecutionLock: {}}]) {
    seed(); Object.assign(request(), patch); const before = {...request()};
    assert.equal(await expire(ids[0], NOW), "skip"); assert.deepEqual(request(), before);
    assert.equal(notifications().length, 0);
  }
});
for (const identity of [0, 1, 2, 3]) {
  test(`payment identity ${identity}: pending, processing, paid, expired, failed all block expiration`, async () => {
    for (const status of ["pending", "processing", "paid", "expired", "failed"]) {
      seed(); records.set(`payments/${paymentIds(ids[0])[identity]}`, {status});
      assert.equal(await expire(ids[0], NOW), "review");
      assert.equal(request().status, "waiting_for_down_payment"); assert.equal(notifications().length, 0);
    }
  });
  for (const child of ["checkoutAttempts", "gatewayPayments", "refunds", "events"]) {
    test(`orphan ${child} under identity ${identity} blocks even without payment parent`, async () => {
      seed(); records.set(`payments/${paymentIds(ids[0])[identity]}/${child}/orphan`,
        {resolution: "unresolved", paymongoCheckoutId: null, observedCheckoutStatus: "expired"});
      assert.equal(await expire(ids[0], NOW), "review"); assert.equal(request().status, "waiting_for_down_payment");
    });
  }
}
test("sticky reservation, legacy pointer, foreign identity and cancellation history block expiration", async () => {
  for (const field of ["initialPaymentDispatchReservedAt", "paymentId", "initialPaymentId", "initialPaymentChoice",
    "paymongoPaymentIntentId", "paidAt", "settlementSchemaVersion"]) {
    seed(); request()[field] = "reserved";
    assert.equal(await expire(ids[0], NOW), "review");
  }
  for (const path of ["payments/foreign", "providerRequestCancellationRequests/cancel_test"]) {
    seed(); records.set(path, {providerRequestId: ids[0]}); assert.equal(await expire(ids[0], NOW), "review");
  }
});
test("multiple expired/failed attempts and irreversible-failure claims still require Phase B; reviews are idempotent", async () => {
  seed(); const paymentId = paymentIds(ids[0])[1];
  records.set(`payments/${paymentId}`, {providerRequestId: ids[0], status: "expired", attemptSchemaVersion: 1,
    attemptCount: 2, currentCheckoutAttemptId: "second"});
  for (const attemptId of ["first", "second"]) records.set(`payments/${paymentId}/checkoutAttempts/${attemptId}`,
    {attemptId, paymentId, resolution: "expired", observedCheckoutStatus: "expired",
      terminalEvidence: {authority: "paymongo", irreversible: true}});
  const financialBefore = [...records].filter(([path]) => path.startsWith("payments/"));
  assert.equal(await expire(ids[0], NOW), "review");
  assert.equal(await expire(ids[0], NOW), "skip");
  assert.equal(request().paymentStatus, "unpaid"); assert.equal(request().status, "waiting_for_down_payment");
  assert.deepEqual([...records].filter(([path]) => path.startsWith("payments/")), financialBefore);
  assert.equal(notifications().length, 0);
  assert.equal([...records.keys()].filter(path => path.startsWith("adminLogs/")).length, 1);
});
test("exact request expires once, preserves paid siblings, evidence and parent money; no money movement", async () => {
  seed(); Object.assign(request(ids[1]), {status: "confirmed", paymentStatus: "paid"});
  const siblings = ids.slice(1).map(id => ({...request(id)}));
  parent().remainingBalance = 12345; const original = {...request()};
  assert.equal(await expire(ids[0], NOW), "expired");
  assert.equal(await expire(ids[0], NOW), "skip");
  assert.equal(parent().status, "needs_provider_replacement"); assert.equal(parent().remainingBalance, 12345);
  assert.equal(parent().confirmedProviderRequestCount, 2); assert.equal(parent().expiredProviderRequestCount, 1);
  assert.deepEqual(ids.slice(1).map(id => request(id)), siblings);
  for (const field of ["acceptedAt", "expiresAt", "financialSnapshot", "financialSnapshotCapturedAt", "paymentStatus"]) {
    assert.deepEqual(request()[field], original[field]);
  }
  assert.equal(notifications().length, 2);
  assert.equal([...records.keys()].filter(path => path.startsWith("adminLogs/")).length, 1);
  assert.equal([...records.keys()].filter(path => path.includes("/timeline/")).length, 1);
  assert.equal([...records.keys()].some(path => /^(payments|refunds|providerDisbursements)\//u.test(path)), false);
  assert.equal(occupies({...request(), now: NOW}), false);
  assert.equal(occupies({...request(ids[2]), now: NOW}), true);
});
test("awaiting or rejected siblings stay unchanged; all unpaid expiration uses canonical terminal rules", async () => {
  for (const status of ["waiting_for_down_payment", "rejected"]) {
    seed(); request(ids[1]).status = status; const before = {...request(ids[1])};
    await expire(ids[0], NOW); assert.deepEqual(request(ids[1]), before); assert.equal(parent().status, "needs_provider_replacement");
  }
  seed(); for (const id of ids) Object.assign(request(id), {status: "waiting_for_down_payment", paymentStatus: "unpaid"});
  for (const id of ids) assert.equal(await expire(id, NOW), "expired");
  assert.equal(parent().status, "expired"); assert.equal(notifications().length, 6);
});
test("incomplete membership, owner mismatch and parent locks never write aggregates", async () => {
  seed(); parent().providerRequestIds = ids.slice(0, 2);
  await assert.rejects(expire(ids[0], NOW)); assert.equal(request().status, "waiting_for_down_payment");
  seed(); records.get(`providers/${request().providerId}`).ownerId = "other_owner";
  assert.equal(await expire(ids[0], NOW), "invalid_relationship");
  seed(); parent().refundExecutionLock = {}; assert.equal(await expire(ids[0], NOW), "invalid_relationship");
});
test("checkout reservation racing final commit forces retry and protects in-flight dispatch", async () => {
  seed(); hook = () => {
    const data = request(); records.set(`providerRequests/${ids[0]}`, {...data, paymentId: paymentIds(ids[0])[1],
      initialPaymentDispatchReservedAt: Timestamp.now()});
    records.set(`payments/${paymentIds(ids[0])[1]}`, {status: "pending", providerRequestId: ids[0]});
  };
  assert.equal(await expire(ids[0], NOW), "review"); assert.equal(retries, 1);
  assert.equal(notifications().length, 0); assert.equal(request().status, "waiting_for_down_payment");
});
function seedCheckout() {
  seed(); const data = request();
  const acceptedAt = Timestamp.fromMillis(Date.now() - 1000);
  Object.assign(data, {acceptedAt, financialSnapshotCapturedAt: acceptedAt,
    createdAt: Timestamp.fromMillis(Date.now() - 2000), expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
    eventDate: Timestamp.fromDate(new Date("2099-10-30T00:00:00+08:00")), guestCount: 50});
  data.initialPaymentEligibility = {...data.initialPaymentEligibility, evaluatedAt: acceptedAt,
    eventStartAt: Timestamp.fromDate(new Date("2099-10-30T02:00:00Z"))};
  records.set(`providers/${data.providerId}`, {ownerId: data.providerOwnerId, verificationStatus: "approved", isActive: true,
    providerServiceType: "catering", providerCategory: "catering_service", serviceCategories: ["catering_service"],
    operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    bookingLeadTimeDays: 0, minGuestsPerEvent: 1, maxGuestsPerEvent: 100,
    availableStaffCount: 5, availableEquipmentCount: 10, maxEventsPerDay: 1});
  records.set(`users/${data.providerOwnerId}`, {role: "provider", providerId: data.providerId, accountStatus: "active"});
  records.set(`providerPaymentAccounts/${data.providerId}`, {providerId: data.providerId, schemaVersion: 1, setupStatus: "ready",
    linkedAccountType: "merchant", payoutReady: true, paymongoAccountId: "org_unit"});
  return data;
}
test("real checkout foundation reserves sticky identity before a mocked network error; expiration cannot release it", async () => {
  const data = seedCheckout();
  let dispatches = 0;
  await assert.rejects(createPaymentSessionForCustomer({customerId: data.customerId, providerRequestId: ids[0],
    paymentChoice: "full", clientKey: "offline_expiration_test", secretKey: "unused",
    successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel",
    createCheckout: async input => {
      dispatches++;
      assert.ok(request().initialPaymentDispatchReservedAt);
      assert.ok(request().initialPaymentId);
      assert.ok(records.has(`payments/${input.paymentId}/checkoutAttempts/${input.checkoutAttemptId}`));
      throw new Error("Mock gateway network error; no HTTP was called");
    }}));
  assert.equal(dispatches, 1);
  const after = new Date(data.expiresAt.toMillis() + 1);
  assert.notEqual(await expire(ids[0], after), "expired");
  assert.notEqual(request().status, "expired"); assert.equal(notifications().length, 0);
});
test("late authoritative deposit confirmation supersedes initial review and preserves actual remaining-balance checkout", async () => {
  const data = seedCheckout();
  const frozen = buildBookingPaymentPolicySnapshot({platformSettings: null,
    serviceCategoryCode: "catering_service", serviceCategory: {}, packageId: "package_test", packageData: {}});
  const terms = {schemaVersion: 2, source: "canonical_package", paymentPolicy: "deposit_then_balance",
    depositRateBps: 3000, balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: 24, usesLegacyPaymentTerms: false};
  const eligible = evaluateInitialPaymentEligibility({eventDate: data.eventDate.toDate(), eventTime: data.eventTime,
    acceptanceTime: data.acceptedAt.toDate(), packagePaymentTerms: terms, bookingPaymentPolicySnapshot: frozen});
  Object.assign(data, {bookingPaymentPolicySnapshot: frozen, financialSnapshot: {...data.financialSnapshot, packagePaymentTerms: terms},
    initialPaymentEligibility: {...eligible, evaluatedAt: data.acceptedAt, eventStartAt: Timestamp.fromDate(eligible.eventStartAt)}});
  const common = {customerId: data.customerId, providerRequestId: ids[0], clientKey: "offline_late_payment_test", secretKey: "unused",
    successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel"};
  await assert.rejects(createPaymentSessionForCustomer({...common, paymentChoice: "minimum", createCheckout: async () => {
    assert.equal(await expire(ids[0], new Date(data.expiresAt.toMillis() + 1)), "review");
    return {id: "cs_initial_test", checkoutUrl: "https://checkout.paymongo.com/initial_test"};
  }}));
  assert.ok(request().initialPaymentReview);
  const paymentId = request().initialPaymentId;
  // The verified webhook uses this existing settlement helper. Preserve the review audit evidence.
  Object.assign(request(), providerRequestSettlementUpdateForPaymentOutcome({providerRequestId: ids[0],
    providerRequest: request(), paymentId, paymentStatus: "paid", timestamp: Timestamp.now()}),
  {status: "confirmed", paymentStatus: "paid", remainingBalanceTimingSchemaVersion: 2, balanceDueHoursBeforeEvent: 24,
    eventStartAt: Timestamp.fromDate(new Date("2099-10-30T02:00:00Z")),
    remainingBalanceDueAt: Timestamp.fromDate(new Date("2099-10-29T02:00:00Z")),
    remainingBalanceReminderAt: Timestamp.fromDate(new Date("2099-10-28T02:00:00Z")),
    remainingBalanceGraceEndsAt: Timestamp.fromDate(new Date("2099-10-29T02:00:00Z"))});
  Object.assign(records.get(`payments/${paymentId}`), {status: "paid", paidAt: Timestamp.now()});
  const balance = await createPaymentSessionForCustomer({...common, paymentChoice: "remaining_balance", createCheckout: async input => {
    assert.equal(input.amountInCentavos, 70000);
    return {id: "cs_balance_test", checkoutUrl: "https://checkout.paymongo.com/balance_test"};
  }});
  assert.equal(balance.paymentId, paymentIds(ids[0])[3]); assert.equal(request().status, "confirmed");
  assert.equal(notifications().length, 0);
});
test("real checkout cannot dispatch after expiration commits first", async () => {
  seed(); assert.equal(await expire(ids[0], NOW), "expired"); let dispatches = 0;
  await assert.rejects(createPaymentSessionForCustomer({customerId: request().customerId, providerRequestId: ids[0],
    paymentChoice: "full", clientKey: "offline_expiration_test", secretKey: "unused",
    successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel",
    createCheckout: async () => {dispatches++; throw new Error("Must not dispatch");}}));
  assert.equal(dispatches, 0); assert.equal(request().status, "expired");
});
test("successful/late webhook, cancellation, availability, parent and sibling races revalidate", async () => {
  for (const race of ["paid", "cancelled", "provider", "parent", "sibling", "orphan"]) {
    seed(); hook = () => {
      if (race === "paid") records.set(`providerRequests/${ids[0]}`, {...request(), status: "confirmed", paymentStatus: "paid"});
      if (race === "cancelled") records.set(`providerRequests/${ids[0]}`, {...request(), status: "cancelled"});
      if (race === "provider") records.set(`providers/${request().providerId}`, {ownerId: "new_owner"});
      if (race === "parent") records.set("mainEvents/event_expiration", {...parent(), status: "cancelled"});
      if (race === "sibling") records.set(`providerRequests/${ids[1]}`, {...request(ids[1]), status: "confirmed", paymentStatus: "paid"});
      if (race === "orphan") records.set(`payments/${paymentIds(ids[0])[0]}/checkoutAttempts/late_attempt`, {resolution: "success"});
    };
    const outcome = await expire(ids[0], NOW); assert.equal(retries, 1, race);
    if (race === "sibling") {assert.equal(outcome, "expired"); assert.equal(parent().confirmedProviderRequestCount, 2);}
    else {assert.notEqual(outcome, "expired"); assert.equal(notifications().length, 0);}
  }
});
test("overlapping expiration transactions and duplicate webhook-safe state do not duplicate notifications", async () => {
  seed(); await Promise.all([expire(ids[0], NOW), expire(ids[0], NOW)]);
  assert.equal(request().status, "expired"); assert.equal(notifications().length, 2);
  assert.equal([...records.keys()].filter(path => path.startsWith("adminLogs/")).length, 1);
});
test("bounded cursor covers later candidates despite malformed historical records and overlap", async () => {
  seed(); records = new Map([[rolloutPath, enabledRollout()]]);
  for (let i = 0; i < LIMIT + 3; i++) {
    const id = `request_page_${String(i).padStart(3, "0")}`; const data = fixture(id);
    records.set(`providerRequests/${id}`, {...data, acceptedAt: null}); // invalid relationship, still advances
  }
  const finalId = "zz_request_valid"; const data = fixture(finalId);
  records.set(`providerRequests/${finalId}`, data);
  records.set(`providers/${data.providerId}`, {ownerId: data.providerOwnerId});
  records.set("mainEvents/event_expiration", {bookingId: "event_expiration", mainEventId: "event_expiration",
    customerId: data.customerId, providerRequestIds: [...records.keys()].filter(path => path.startsWith("providerRequests/")).map(path => path.split("/")[1]),
    status: "waiting_for_down_payment"});
  await Promise.all([sweep(NOW), sweep(NOW)]);
  assert.equal(records.get("bookingLifecycleCursors/initial_payment_expiration_v1").generation, 1);
  assert.equal(request(finalId).status, "waiting_for_down_payment");
  await sweep(NOW); assert.equal(request(finalId).status, "expired");
  assert.equal(records.get("bookingLifecycleCursors/initial_payment_expiration_v1").lastRequestId, null);
});
test("an empty idle sweep leaves Firestore entirely untouched", async () => {
  seed(); for (const id of ids) request(id).status = "confirmed";
  const before = [...records];
  await sweep(NOW);
  assert.deepEqual([...records], before);
});

const {parseInitialPaymentRollout: parseRollout, readInitialPaymentRollout: readRollout,
  initialPaymentEnrollment: enrollment} = require("../lib/payments/initial-payment-rollout.js");

test("all flags absent, malformed, public or disabled fail closed without Phase A writes", async () => {
  for (const config of [undefined, {}, {schemaVersion: 1}, {...enabledRollout(), schemaVersion: 2},
    {...enabledRollout(), isPublic: true}, {...enabledRollout(), enrollmentEnabled: "true"},
    {...enabledRollout(), expirationEnabled: 1}, {...enabledRollout(), historicalReviewEnabled: null},
    {...enabledRollout(), enrollmentEnabled: false, expirationEnabled: false, historicalReviewEnabled: false}]) {
    seed(); if (config) records.set(rolloutPath, config); else records.delete(rolloutPath);
    const before = [...records];
    assert.deepEqual(parseRollout(config), {enrollmentEnabled: false, expirationEnabled: false, historicalReviewEnabled: false});
    assert.equal(await expire(ids[0], NOW), "disabled");
    await sweep(NOW); assert.deepEqual([...records], before);
    assert.deepEqual(enrollment(await readRollout()), {});
  }
});

test("unreadable or unauthorized configuration disables enrollment, direct expiration and sweep", async () => {
  for (const code of ["permission-denied", "unavailable"]) {
    seed(); const before = [...records], originalCollection = db.collection;
    db.collection = name => {
      if (name === "appSettings") throw Object.assign(new Error("offline injected read failure"), {code});
      return originalCollection(name);
    };
    try {
      assert.deepEqual(enrollment(await readRollout()), {});
      assert.equal(await expire(ids[0], NOW), "disabled");
      await sweep(NOW); assert.deepEqual([...records], before);
    } finally {db.collection = originalCollection;}
  }
});

test("enrollment is independently enabled and does not mutate an existing submission", () => {
  for (const expirationEnabled of [false, true]) for (const historicalReviewEnabled of [false, true]) {
    const config = {...enabledRollout(), expirationEnabled, historicalReviewEnabled};
    assert.deepEqual(enrollment(parseRollout({...config, enrollmentEnabled: false})), {});
    assert.deepEqual(enrollment(parseRollout(config)), {initialPaymentWriteProtocolVersion: 1});
  }
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../src/bookings/submit-booking-request.ts"), "utf8");
  assert.equal((source.match(/\.\.\.initialPaymentEnrollment\(initialPaymentRollout\)/gu) ?? []).length, 2);
  assert.ok(source.indexOf("if (existingSnapshot.exists)") < source.indexOf("await readInitialPaymentRollout(transaction)"));
  assert.ok(source.indexOf("created: false") < source.indexOf("await readInitialPaymentRollout(transaction)"));
});

test("expiration disabled overrides enrollment and historical review without cursor or financial writes", async () => {
  seed(); records.set(rolloutPath, {...enabledRollout(), expirationEnabled: false});
  records.set("bookingLifecycleCursors/initial_payment_expiration_v1", {lastRequestId: "aaa", generation: 8});
  const before = [...records]; await sweep(NOW);
  assert.equal(await expire(ids[0], NOW), "disabled"); assert.deepEqual([...records], before);
});

test("BK-25394BA446 mock: historical review disabled preserves expired original hold and payment truth", async () => {
  seed(); records.set(rolloutPath, {...enabledRollout(), historicalReviewEnabled: false});
  delete request().initialPaymentWriteProtocolVersion;
  Object.assign(request(), {status: "accepted", expiresAt: null});
  const before = {...request()}, sibling = {...request(ids[1])};
  assert.equal(await expire(ids[0], NOW), "historical_disabled");
  await sweep(NOW); assert.deepEqual(request(), before); assert.deepEqual(request(ids[1]), sibling);
  assert.throws(() => existingAcceptancePlan(request(), NOW), {code: "failed-precondition"});
  assert.equal(notifications().length, 0);
  records.set(rolloutPath, enabledRollout());
  assert.equal(await expire(ids[0], NOW), "review");
  const writes = [...records]; assert.equal(await expire(ids[0], NOW), "skip");
  assert.deepEqual([...records], writes); assert.equal(request().initialPaymentWriteProtocolVersion, undefined);
});

test("activation changes conflict at the transaction authority boundary", async () => {
  seed(); hook = () => records.set(rolloutPath, {...enabledRollout(), expirationEnabled: false});
  assert.equal(await expire(ids[0], NOW), "disabled"); assert.equal(retries, 1);
  assert.equal(request().status, "waiting_for_down_payment"); assert.equal(notifications().length, 0);
  seed(); delete request().initialPaymentWriteProtocolVersion;
  hook = () => records.set(rolloutPath, {...enabledRollout(), historicalReviewEnabled: false});
  assert.equal(await expire(ids[0], NOW), "historical_disabled"); assert.equal(retries, 1);
  assert.equal(request().initialPaymentReview, undefined);
});

test("budget exhaustion before admission leaves even the cursor untouched", async () => {
  seed(); const before = [...records]; await sweep(NOW, {remaining: () => false});
  assert.equal(await expire(ids[0], NOW, {remaining: () => false}), "budget");
  assert.deepEqual([...records], before);
});

test("partial page budget checkpoints only completed IDs, then resumes unprocessed candidates", async () => {
  seed(); request(ids[1]).status = "waiting_for_down_payment";
  await sweep(NOW, {remaining: () => request().status !== "expired", checkpoint: () => true});
  assert.equal(request().status, "expired"); assert.equal(request(ids[1]).status, "waiting_for_down_payment");
  const cursor = records.get("bookingLifecycleCursors/initial_payment_expiration_v1");
  assert.equal(cursor.lastRequestId, ids[0]); assert.equal(cursor.nextSweepAt, null);
  await sweep(NOW); assert.equal(request(ids[1]).status, "expired");
});

test("exhaustion inside request validation commits no request writes and advances no unprocessed ID", async () => {
  seed(); const before = [...records]; let checks = 0;
  assert.equal(await expire(ids[0], NOW, {remaining: () => ++checks < 4}), "budget");
  assert.deepEqual([...records], before);
});

test("cycle cooldown bounds repeat historical scans and review writes; future cycles revisit candidates", async () => {
  seed(); delete request().initialPaymentWriteProtocolVersion;
  await sweep(NOW); assert.ok(request().initialPaymentReview);
  const before = [...records], cursor = records.get("bookingLifecycleCursors/initial_payment_expiration_v1");
  assert.equal(cursor.nextSweepAt.toMillis(), NOW.getTime() + 300000);
  await sweep(new Date(NOW.getTime() + 60000)); assert.deepEqual([...records], before);
  await sweep(new Date(NOW.getTime() + 300000));
  assert.equal([...records.keys()].filter(path => path.startsWith("adminLogs/")).length, 1);
  assert.equal(records.get("bookingLifecycleCursors/initial_payment_expiration_v1").generation, 2);
});

test("client rules exclude Phase A configuration even from admin client writes", () => {
  const fs = require("node:fs");
  const rules = fs.readFileSync(require("node:path").join(__dirname, "../../firebase/firestore.rules"), "utf8");
  const block = rules.slice(rules.indexOf("match /appSettings/{settingId}"), rules.indexOf("// Temporary legacy collections"));
  assert.match(block, /allow create, update: if isAdmin\(\) &&[\s\S]*settingId != 'initialPaymentExpirationPhaseA'/u);
  assert.match(block, /allow delete: if false/u);
});

test("cursor transaction rechecks disabled settings after candidates complete", async () => {
  seed(); const originalRun = db.runTransaction; let calls = 0;
  db.runTransaction = async (callback, options) => {
    calls++;
    if (calls === 2) records.set(rolloutPath, {...enabledRollout(), expirationEnabled: false});
    return originalRun(callback, options);
  };
  try {
    await sweep(NOW);
    assert.equal(request().status, "expired");
    assert.equal(records.has("bookingLifecycleCursors/initial_payment_expiration_v1"), false);
  } finally {db.runTransaction = originalRun;}
});

test("a failed candidate rotates behind later IDs and retries on the next cycle", async () => {
  seed(); request(ids[1]).status = "waiting_for_down_payment";
  const originalRun = db.runTransaction; let calls = 0;
  db.runTransaction = async (callback, options) => {
    assert.equal(options.maxAttempts, 2);
    if (++calls === 1) throw new Error("injected transient transaction failure");
    return originalRun(callback, options);
  };
  try {await sweep(NOW);} finally {db.runTransaction = originalRun;}
  assert.equal(request().status, "waiting_for_down_payment");
  assert.equal(request(ids[1]).status, "expired");
  await sweep(new Date(NOW.getTime() + 300000));
  assert.equal(request().status, "expired");
  assert.equal(notifications().length, 4);
});

function seedV4() {
  seed();
  const data = request();
  data.acceptedAt = stamp(NOW.getTime() - 6 * 3600000);
  data.financialSnapshotCapturedAt = data.acceptedAt;
  data.initialPaymentEligibility.evaluatedAt = data.acceptedAt;
  data.eventStartAt = data.initialPaymentEligibility.eventStartAt;
  data.initialPaymentDeadlinePolicyVersion = 4;
  // Calculate with the production V4 policy.
  data.initialPaymentDeadlineAt = Timestamp.fromDate(require('../lib/payments/initial-payment-deadline.js')
    .calculateInitialPaymentDeadlineV4({acceptedAt: data.acceptedAt.toDate(), eventStartAt: data.eventStartAt.toDate()}));
  data.expiresAt = data.initialPaymentDeadlineAt;
  return data.expiresAt.toDate();
}

test('V4 transactional worker waits then expires exactly at authoritative deadline', async () => {
  const at = seedV4();
  assert.equal(await expire(ids[0], new Date(+at - 1)), 'waiting');
  assert.equal(await expire(ids[0], at), 'expired');
});
test('V4 acceptance replay preserves deadline and rejects elapsed window', () => {
  const at = seedV4(), original = request().expiresAt;
  const data = {...request(), status: 'accepted'};
  assert.equal(existingAcceptancePlan(data, new Date(+at - 1)).expiresAt.toMillis(), +at);
  assert.equal(existingAcceptancePlan(data, new Date(+at - 1000)).expiresAt.toMillis(), +at);
  assert.throws(() => existingAcceptancePlan(data, at));
  assert.equal(request().expiresAt, original);
});
test('V4 worker preserves ambiguous payment evidence and transactional late attempt', async () => {
  let at = seedV4();
  request().initialPaymentDispatchReservedAt = request().acceptedAt;
  assert.equal(await expire(ids[0], at), 'review');
  at = seedV4();
  hook = () => {request().paymentId = 'concurrent_attempt';};
  assert.equal(await expire(ids[0], at), 'review');
  assert.ok(retries > 0);
  assert.equal(request().status, 'waiting_for_down_payment');
});
test('V4 stale deadline goes to review and retains capacity', async () => {
  const at = seedV4(); request().expiresAt = stamp(+at + 1);
  assert.equal(await expire(ids[0], at), 'review');
  assert.equal(occupies({...request(), now: at}), true);
});

test('V4 real checkout rejects elapsed frozen window before worker or gateway dispatch', async () => {
  const data = seedCheckout();
  const acceptedAt = stamp(Date.now() - 86400000);
  Object.assign(data, {acceptedAt, financialSnapshotCapturedAt: acceptedAt,
    createdAt: stamp(acceptedAt.toMillis() - 1000), initialPaymentDeadlinePolicyVersion: 4,
    eventStartAt: data.initialPaymentEligibility.eventStartAt});
  data.initialPaymentEligibility.evaluatedAt = acceptedAt;
  data.initialPaymentDeadlineAt = Timestamp.fromDate(require('../lib/payments/initial-payment-deadline.js')
    .calculateInitialPaymentDeadlineV4({acceptedAt: acceptedAt.toDate(), eventStartAt: data.eventStartAt.toDate()}));
  data.expiresAt = data.initialPaymentDeadlineAt;
  let dispatches = 0;
  await assert.rejects(createPaymentSessionForCustomer({customerId: data.customerId, providerRequestId: ids[0],
    paymentChoice: 'full', clientKey: 'offline_v4_test', secretKey: 'unused',
    successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel',
    createCheckout: async () => {dispatches++; throw new Error('Must not dispatch');}}), {code: 'failed-precondition'});
  assert.equal(dispatches, 0);
  assert.equal(request().status, 'waiting_for_down_payment');
});
