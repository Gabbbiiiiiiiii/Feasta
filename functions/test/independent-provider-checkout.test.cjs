const test = require("node:test");
const assert = require("node:assert/strict");
const {initializeApp} = require("firebase-admin/app");
const {Timestamp} = require("firebase-admin/firestore");
initializeApp({projectId: "demo-feasta-independent-offline"});

// Run the real foundation, durable dispatch, and persistence transactions in memory.
// The supplied gateway is a local stub. No network, emulator, or Firebase data access.
let records, sequence = 0, dispatches, onDispatch, dispatchKeys;
const ref = path => ({path, id: path.split("/").at(-1), collection: name => collection(`${path}/${name}`)});
const collection = path => ({path, doc: id => ref(`${path}/${id ?? `auto_${++sequence}`}`),
  where(...condition) {return query(path, [condition]);}});
const query = (path, conditions) => ({path, conditions,
  where(...condition) {return query(path, [...conditions, condition]);}});
const snapshot = reference => ({id: reference.id, ref: reference, exists: records.has(reference.path),
  data: () => records.get(reference.path)});
const db = {collection, async runTransaction(callback) {
  const writes = [];
  const get = async reference => {
    if (!reference.id) {
      const docs = [...records.keys()].filter(path => path.startsWith(`${reference.path}/`) &&
        !path.slice(reference.path.length + 1).includes("/")).filter(path =>
        (reference.conditions ?? []).every(([field, op, value]) => {
          const saved = records.get(path)[field];
          return op === "==" ? saved === value : op === "in" ? value.includes(saved) :
            op === ">=" ? saved >= value : op === "<" ? saved < value : false;
        })).map(path => snapshot(ref(path)));
      return {docs, size: docs.length, empty: docs.length === 0};
    }
    return snapshot(reference);
  };
  const result = await callback({get, getAll: async (...references) => Promise.all(references.map(get)),
    update: (reference, data) => writes.push([reference, data, true]),
    create: (reference, data) => writes.push([reference, data, false]),
    set: (reference, data) => writes.push([reference, data, false])});
  for (const [reference, data, merge] of writes) records.set(reference.path,
    {...(merge ? records.get(reference.path) : {}), ...data});
  return result;
}};
const firestoreModule = require.resolve("../lib/shared/firestore.js");
require.cache[firestoreModule] = {id: firestoreModule, filename: firestoreModule, loaded: true, exports: {db}};
const {createPaymentSessionForCustomer} = require("../lib/payments/create-payment-session.js");
const {checkoutEligibilityReason, webhookLifecycleConflictReason} = require("../lib/payments/payment-lifecycle.js");
const {providerRequestSettlementUpdateForPaymentOutcome} = require("../lib/payments/payment-settlement.js");
const {providerAcceptancePlan} = require("../lib/provider-requests/provider-acceptance-plan.js");
const {existingAcceptancePlan} = require("../lib/provider-requests/existing-acceptance-plan.js");
const {assertLifecycleTransition} = require("../lib/provider-requests/update-provider-booking-lifecycle.js");
const {paymentIdForProviderRequestChoice} = require("../lib/payments/payment-obligation.js");

const ids = ["request_catering", "request_photography", "request_videography"];
const parent = () => records.get("mainEvents/event_test");
const request = id => records.get(`providerRequests/${id}`);
function seed() {
  records = new Map(); dispatches = 0; onDispatch = () => {}; dispatchKeys = [];
  records.set("mainEvents/event_test", {mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", providerRequestIds: ids, status: "needs_provider_replacement"});
  ids.forEach((id, index) => {
    const providerId = `provider_${index}`;
    records.set(`providerRequests/${id}`, {providerRequestId: id, mainEventId: "event_test", bookingId: "event_test",
      customerId: "customer_test", providerId, providerOwnerId: `owner_${index}`, type: "catering",
      status: index === 1 ? "rejected" : "waiting_for_down_payment", paymentStatus: "unpaid",
      acceptedAt: Timestamp.fromMillis(Date.now() - 1000), expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
      eventDate: Timestamp.fromDate(new Date("2099-10-25T00:00:00+08:00")), eventTime: "10:00", eventEndTime: "14:00",
      guestCount: 50, amount: 1000, downPaymentAmount: 300,
      financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
        requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000}});
    records.set(`providers/${providerId}`, {ownerId: `owner_${index}`, verificationStatus: "approved", isActive: true,
      providerServiceType: "catering", providerCategory: "catering_service", serviceCategories: ["catering_service"],
      operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      bookingLeadTimeDays: 0, minGuestsPerEvent: 1, maxGuestsPerEvent: 100, availableStaffCount: 5,
      availableEquipmentCount: 10, maxEventsPerDay: 1});
    records.set(`users/owner_${index}`, {role: "provider", providerId, accountStatus: "active"});
    records.set(`providerPaymentAccounts/${providerId}`, {providerId, schemaVersion: 1, setupStatus: "ready",
      linkedAccountType: "merchant", payoutReady: true, paymongoAccountId: `org_unit_${index}`});
  });
}
const checkout = (id = ids[0], paymentChoice = "full") => createPaymentSessionForCustomer({customerId: "customer_test",
  providerRequestId: id, paymentChoice, clientKey: "independent_unit_test", secretKey: "unused",
  successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel",
  createCheckout: async input => {dispatches++; dispatchKeys.push(input.idempotencyKey); onDispatch();
    return {id: `cs_unit_${dispatches}`, checkoutUrl: `https://checkout.paymongo.com/unit_${dispatches}`};}});

test("Catering and Videography accept independently with rejected Photography and no charge", () => {
  seed();
  request(ids[1]).status = "pending";
  request(ids[2]).status = "pending";
  for (const id of [ids[0], ids[2]]) {
    if (id === ids[2]) request(ids[1]).status = "rejected";
    request(id).status = "pending";
    const plan = providerAcceptancePlan({mainEventId: "event_test", mainEvent: parent(),
      mainEventStatus: "needs_provider_replacement", providerRequestId: id,
      requests: ids.map(id => snapshot(ref(`providerRequests/${id}`)))});
    assert.deepEqual(plan.overrides, [{providerRequestId: id, status: "waiting_for_down_payment"}]);
    request(id).status = plan.nextStatus;
  }
  assert.equal(request(ids[1]).status, "rejected");
  assert.equal(dispatches, 0);
  assert.equal([...records.keys()].some(key => key.startsWith("payments/")), false);
});

test("actual checkout isolates Catering, survives sibling response during dispatch, then pays Videography separately", async () => {
  seed();
  request(ids[1]).status = "pending";
  const video = {...request(ids[2])};
  onDispatch = () => {request(ids[1]).status = "rejected";};
  const catering = await checkout();
  assert.equal(request(ids[0]).status, "payment_processing");
  assert.deepEqual(request(ids[2]), video);
  assert.equal(request(ids[1]).status, "rejected");
  assert.equal(parent().status, "needs_provider_replacement");
  // Exercise the trusted outcome helper used by verified webhook processing.
  const settle = (id, paymentId) => {
    assert.equal(webhookLifecycleConflictReason({providerRequestStatus: request(id).status,
      mainEventStatus: parent().status, nextPaymentStatus: "paid", paymentChoice: "full"}), null);
    Object.assign(request(id), providerRequestSettlementUpdateForPaymentOutcome({providerRequestId: id,
      providerRequest: request(id), paymentId, paymentStatus: "paid", timestamp: Timestamp.now()}),
    {status: "confirmed", paymentStatus: "paid"});
    Object.assign(records.get(`payments/${paymentId}`), {status: "paid", paidAt: Timestamp.now()});
  };
  settle(ids[0], catering.paymentId);
  assert.deepEqual(request(ids[2]), video);
  const videography = await checkout(ids[2]);
  assert.notEqual(videography.paymentId, catering.paymentId);
  settle(ids[2], videography.paymentId);
  assert.equal(request(ids[0]).settlementStatus, "fully_settled");
  assert.equal(request(ids[2]).settlementStatus, "fully_settled");
  assert.equal(request(ids[1]).status, "rejected");
  assert.equal(dispatches, 2);
});

test("selected pending, rejected, cancelled and expired requests cannot dispatch", async () => {
  for (const status of ["pending", "rejected", "cancelled", "expired"]) {
    seed(); request(ids[0]).status = status;
    await assert.rejects(checkout(), {code: "failed-precondition"});
    assert.equal(dispatches, 0);
  }
});

test("expired hold, lost capacity and blocked provider date cannot create a checkout", async () => {
  for (const kind of ["expired", "capacity", "blocked"]) {
    seed();
    if (kind === "expired") request(ids[0]).expiresAt = Timestamp.fromMillis(Date.now() - 1);
    if (kind === "capacity") records.set("providerRequests/request_conflict", {...request(ids[0]),
      providerRequestId: "request_conflict", mainEventId: "other_event", bookingId: "other_event", status: "confirmed"});
    if (kind === "blocked") records.get("providers/provider_0").unavailableDates = ["2099-10-25"];
    await assert.rejects(checkout(), {code: "failed-precondition"});
    assert.equal(dispatches, 0);
  }
});

test("real checkout cannot consume capacity protected by an overdue unresolved payment", async () => {
  for (const fields of [
    {status: "payment_processing"},
    {status: "waiting_for_down_payment", initialPaymentId: "existing_identity"},
    {status: "accepted", initialPaymentDispatchReservedAt: Timestamp.now()},
  ]) {
    seed();
    const conflict = {...request(ids[0]), providerRequestId: "request_conflict",
      mainEventId: "other_event", bookingId: "other_event",
      expiresAt: Timestamp.fromMillis(Date.now()-1), ...fields};
    records.set("providerRequests/request_conflict", conflict);
    const before = JSON.stringify([...records]);
    await assert.rejects(checkout(), {code: "failed-precondition"});
    assert.equal(dispatches, 0);
    assert.equal(JSON.stringify([...records]), before, "conflict must not rewrite money, holds or either booking");
  }
});

test("existing in-flight checkout recovers without a new dispatch or renewed hold", async () => {
  seed(); const first = await checkout(); const deadline = request(ids[0]).expiresAt;
  request(ids[0]).expiresAt = Timestamp.fromMillis(Date.now() - 1);
  const retry = await checkout();
  assert.equal(retry.checkoutUrl, first.checkoutUrl);
  assert.equal(dispatches, 1);
  assert.ok(request(ids[0]).expiresAt.toMillis() < deadline.toMillis());
});

test("ambiguous dispatch retries the same durable attempt and gateway key", async () => {
  seed(); onDispatch = () => {throw new Error("simulated ambiguous gateway response");};
  await assert.rejects(checkout());
  const before = [...records.entries()].find(([path]) => path.includes("/checkoutAttempts/"));
  assert.equal(before[1].resolution, "unresolved");
  const originalDispatch = before[1].firstDispatchAt;
  onDispatch = () => {};
  await checkout();
  const attempts = [...records.entries()].filter(([path]) => path.includes("/checkoutAttempts/"));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0][1].firstDispatchAt, originalDispatch);
  assert.equal(dispatchKeys[0], dispatchKeys[1]);
});

test("selected request cancellation during dispatch preserves durable attempt evidence", async () => {
  seed(); onDispatch = () => {request(ids[0]).status = "cancelled";};
  await assert.rejects(checkout());
  assert.equal(request(ids[0]).status, "cancelled");
  const attempts = [...records.entries()].filter(([path]) => path.includes("/checkoutAttempts/"));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0][1].paymongoCheckoutId, "cs_unit_1");
});

test("confirmed deposit pays exact remaining balance with rejected or pending siblings", async () => {
  for (const status of ["needs_provider_replacement", "pending_provider_approval", "waiting_for_down_payment"]) {
    seed(); parent().status = status;
    const initial = await checkout(ids[0], "minimum");
    const data = request(ids[0]);
    Object.assign(data, providerRequestSettlementUpdateForPaymentOutcome({providerRequestId: ids[0],
      providerRequest: data, paymentId: initial.paymentId, paymentStatus: "paid", timestamp: Timestamp.now()}),
    {status: "confirmed", paymentStatus: "paid", remainingBalanceTimingSchemaVersion: 2,
      eventStartAt: Timestamp.fromDate(new Date("2099-10-25T02:00:00Z")), balanceDueHoursBeforeEvent: 24,
      remainingBalanceDueAt: Timestamp.fromDate(new Date("2099-10-24T02:00:00Z")),
      remainingBalanceReminderAt: Timestamp.fromDate(new Date("2099-10-23T02:00:00Z")),
      remainingBalanceGraceEndsAt: Timestamp.fromDate(new Date("2099-10-24T02:00:00Z"))});
    Object.assign(records.get(`payments/${initial.paymentId}`), {status: "paid", paidAt: Timestamp.now()});
    const balance = await checkout(ids[0], "remaining_balance");
    assert.equal(balance.paymentId, paymentIdForProviderRequestChoice(ids[0], "remaining_balance"));
    assert.equal(records.get(`payments/${balance.paymentId}`).amountInCentavos, 70000);
    assert.equal(request(ids[0]).status, "confirmed");
    assert.equal(webhookLifecycleConflictReason({providerRequestStatus: "confirmed", mainEventStatus: status,
      nextPaymentStatus: "paid", paymentChoice: "remaining_balance"}), null);
  }
});

test("historical acceptance reuses its original deadline; missing authority and attempts fail closed", () => {
  seed(); const now = new Date(); const data = request(ids[0]);
  Object.assign(data, {status: "accepted", financialSnapshotCapturedAt: data.acceptedAt,
    initialPaymentEligibilitySchemaVersion: 1, initialPaymentEligibility: {mode: "full_only", depositEligible: false,
      depositAllowed: true, reason: "package_full_payment", evaluatedAt: data.acceptedAt,
      eventStartAt: Timestamp.fromDate(new Date("2099-10-25T02:00:00Z"))}});
  const original = existingAcceptancePlan(data, now);
  assert.equal(original.expiresAt.toMillis(), data.expiresAt.toMillis());
  const noExplicitHold = {...data, expiresAt: null};
  assert.equal(existingAcceptancePlan(noExplicitHold, now).expiresAt.toMillis(), data.acceptedAt.toMillis() + 86400000);
  for (const patch of [{acceptedAt: null}, {financialSnapshot: null}, {financialSnapshotCapturedAt: null},
    {initialPaymentEligibilitySchemaVersion: null}, {reconciliationRequired: true}, {paymentId: "payment_existing"},
    {expiresAt: Timestamp.fromMillis(now.getTime() - 1)}]) {
    assert.throws(() => existingAcceptancePlan({...data, ...patch}, now), {code: "failed-precondition"});
  }
});

test("independent lifecycle allows unresolved parents and rejects terminal parents", () => {
  for (const status of ["pending_provider_approval", "needs_provider_replacement", "waiting_for_down_payment"]) {
    assert.doesNotThrow(() => assertLifecycleTransition("confirmed", status, "in_progress"));
    assert.doesNotThrow(() => assertLifecycleTransition("in_progress", status, "completed"));
  }
  for (const status of ["cancelled", "expired", "completed"]) {
    assert.throws(() => assertLifecycleTransition("confirmed", status, "in_progress"));
    assert.notEqual(checkoutEligibilityReason({providerRequest: {status: "confirmed"},
      mainEvent: {status}, paymentChoice: "remaining_balance"}), null);
  }
});
