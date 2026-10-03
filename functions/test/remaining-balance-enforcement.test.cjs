const test = require("node:test");
const assert = require("node:assert/strict");
const {initializeApp} = require("firebase-admin/app");
const {Timestamp, FieldValue} = require("firebase-admin/firestore");
initializeApp({projectId: "demo-feasta-balance-enforcement"});
let records, writes, sequence = 0, queue = Promise.resolve();
const now = new Date("2026-10-24T02:00:00Z");
const ref = (path) => ({path, id: path.split("/").at(-1), collection: (name) => collection(`${path}/${name}`)});
const collection = (path) => ({path, doc: (id) => ref(`${path}/${id ?? `auto_${++sequence}`}`),
  where: (field, op, value) => ({queryCollection: path, field, value})});
const snapshot = (reference) => ({id: reference.id, ref: reference, exists: records.has(reference.path),
  data: () => records.get(reference.path)});
const read = (reference) => {
  const query = reference.queryCollection ?? (reference.doc ? reference.path : null);
  if (!query) return snapshot(reference);
  const docs = [...records.keys()].filter((key) => key.startsWith(`${query}/`) &&
    key.split("/").length === query.split("/").length + 1 &&
    (!reference.field || records.get(key)[reference.field] === reference.value)).map((key) => snapshot(ref(key)));
  return {docs, size: docs.length, empty: !docs.length};
};
function resolveValues(value) {
  if (value instanceof FieldValue) return Timestamp.fromDate(now);
  if (value instanceof Timestamp || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(resolveValues);
  return Object.fromEntries(Object.entries(value).map(([key, data]) => [key, resolveValues(data)]));
}
const db = {collection, runTransaction(callback) {
  const run = queue.then(async () => {
    const pending = [];
    const get = async (reference) => {assert.equal(pending.length, 0, "reads must precede writes"); return read(reference);};
    const result = await callback({get, getAll: async (...references) => Promise.all(references.map(get)),
      update: (reference, data) => pending.push({kind: "update", path: reference.path, data}),
      create: (reference, data) => pending.push({kind: "create", path: reference.path, data}),
      set: (reference, data) => pending.push({kind: "set", path: reference.path, data})});
    for (const write of pending) {
      if (write.kind === "create") assert.ok(!records.has(write.path), "duplicate create");
      writes.push(write);
      records.set(write.path, {...(write.kind === "update" ? records.get(write.path) : {}), ...resolveValues(write.data)});
    }
    return result;
  });
  queue = run.catch(() => {});
  return run;
}};
const modulePath = require.resolve("../lib/shared/firestore.js");
require.cache[modulePath] = {id: modulePath, filename: modulePath, loaded: true, exports: {db}};
const {evaluateRemainingBalanceEnforcement} = require("../lib/payments/remaining-balance-enforcement.js");
const {classifyBalanceDeadlineAttempt, balanceDeadlineCancellationId, balanceEnforcementPaymentOutcomeUpdate,
  assertBalanceEnforcementAllowsProgress} = require("../lib/payments/remaining-balance-enforcement-domain.js");
const {prepareRefundExecution, reconcileGatewayRefund} = require("../lib/refunds/refund-execution.js");
const {createPaymentSessionForCustomer} = require("../lib/payments/create-payment-session.js");
const {createDurableCheckout} = require("../lib/payments/checkout-attempts.js");
const {paymentIdForProviderRequestChoice: idFor, providerPaymentObligationForChoice: obligationFor} = require("../lib/payments/payment-obligation.js");
const {checkoutAttemptKey} = require("../lib/payments/checkout-attempt-domain.js");
const requestId = "request_test", initialId = idFor(requestId, "minimum"), balanceId = idFor(requestId, "remaining_balance");
function seed() {
  records = new Map(); writes = [];
  const financial = {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
    requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000, packagePaymentTerms: {
      schemaVersion: 2, source: "canonical_package", paymentPolicy: "deposit_then_balance", depositRateBps: 3000,
      balanceDueDaysBeforeEvent: null, balanceDueHoursBeforeEvent: 24, usesLegacyPaymentTerms: false}};
  const request = {providerRequestId: requestId, mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", providerId: "provider_test", providerOwnerId: "owner_test", status: "confirmed",
    amount: 1000, downPaymentAmount: 300, remainingBalance: 700,
    paymentStatus: "paid", initialPaymentChoice: "minimum", initialPaymentId: initialId,
    remainingBalancePaymentId: null, paymentId: initialId, financialSnapshot: financial,
    settlementSchemaVersion: 1, settlementStatus: "deposit_settled", grossSettledAmountInCentavos: 30000,
    outstandingAmountInCentavos: 70000, remainingBalanceTimingSchemaVersion: 2, balanceDueHoursBeforeEvent: 24,
    remainingBalanceStatus: "due", remainingBalanceDueAt: Timestamp.fromDate(now),
    remainingBalanceReminderAt: Timestamp.fromMillis(now.getTime() - 86400000),
    eventStartAt: Timestamp.fromMillis(now.getTime() + 86400000)};
  records.set(`providerRequests/${requestId}`, request);
  records.set("mainEvents/event_test", {mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test",
    providerRequestIds: [requestId], status: "confirmed"});
  records.set("providers/provider_test", {ownerId: "owner_test", verificationStatus: "approved", isActive: true});
  records.set("users/owner_test", {role: "provider", providerId: "provider_test", accountStatus: "active"});
  records.set("providerPaymentAccounts/provider_test", {providerId: "provider_test", schemaVersion: 1,
    setupStatus: "ready", linkedAccountType: "merchant", payoutReady: true, paymongoAccountId: "org_unit_test"});
  records.set(`payments/${initialId}`, payment("minimum", "paid"));
  return request;
}
function payment(choice, status) {
  const financialSnapshot = records.get(`providerRequests/${requestId}`).financialSnapshot;
  const obligation = obligationFor({financialSnapshot, paymentChoice: choice});
  return {paymentId: idFor(requestId, choice), providerRequestId: requestId, mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", providerId: "provider_test", amount: obligation.amountInCentavos / 100,
    amountInCentavos: obligation.amountInCentavos, currency: "PHP", paymentType: obligation.paymentType,
    paymentChoice: choice, obligationKey: obligation.obligationKey, obligationKind: obligation.obligationKind,
    obligationSchemaVersion: obligation.schemaVersion, paidAt: Timestamp.fromMillis(now.getTime() - 172800000),
    status, gateway: "paymongo", paymongoResourceId: choice === "minimum" ? "pay_deposit_test" : "pay_balance_test"};
}
function addAttempt(status = "processing", offset = -60000) {
  const request = records.get(`providerRequests/${requestId}`);
  Object.assign(request, {remainingBalancePaymentId: balanceId, paymentId: balanceId, paymentStatus: status,
    settlementStatus: ["pending", "processing"].includes(status) ? "balance_payment_processing" : "deposit_settled"});
  records.set(`payments/${balanceId}`, {...payment("remaining_balance", status), attemptSchemaVersion: 1,
    attemptCount: 1, currentCheckoutAttemptId: "attempt_test", paymongoCheckoutId: "cs_balance_test",
    checkoutUrl: "https://checkout.paymongo.com/balance", checkoutCreationStatus: "created"});
  records.set(`payments/${balanceId}/checkoutAttempts/attempt_test`, {attemptId: "attempt_test", paymentId: balanceId,
    idempotencyKey: checkoutAttemptKey(balanceId, "attempt_test"),
    fingerprint: require("node:crypto")
      .createHash("sha256")
      .update(JSON.stringify({
        paymentId: balanceId,
        bookingId: "event_test",
        providerRequestId: requestId,
        customerId: "customer_test",
        amountInCentavos: 70000,
        currency: "PHP",
        description: "FEASTA provider remaining balance",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
      }))
      .digest("hex"),
    firstDispatchAt: Timestamp.fromMillis(now.getTime() + offset),
    resolution: "outstanding", paymongoCheckoutId: "cs_balance_test", checkoutUrl: "https://checkout.paymongo.com/balance"});
}
const request = () => records.get(`providerRequests/${requestId}`);
const state = () => request().remainingBalanceEnforcement;
const evaluate = () => evaluateRemainingBalanceEnforcement(requestId, now);
const classify = () => classifyBalanceDeadlineAttempt({providerRequestId: requestId, providerRequest: request(),
  mainEvent: records.get("mainEvents/event_test"), payment: records.get(`payments/${balanceId}`) ?? null,
  attempts: read(collection(`payments/${balanceId}/checkoutAttempts`)).docs.map((doc) => ({id: doc.id, data: doc.data()})),
  gatewaySuccessCount: read(collection(`payments/${balanceId}/gatewayPayments`)).size});

test("no-attempt deadline reserves 100% settled deposit, never gross or unpaid balance, with deterministic IDs", async () => {
  seed();
  const cancellationId = await evaluate();
  assert.equal(cancellationId, balanceDeadlineCancellationId(requestId, now));
  assert.equal(request().status, "cancelled");
  assert.equal(state().status, "cancellation_pending");
  const cancellation = records.get(`providerRequestCancellationRequests/${cancellationId}`);
  assert.equal(cancellation.source, "system_balance_deadline_refund");
  assert.equal(cancellation.refundCalculation.refundBasisPoints, 10000);
  assert.equal(cancellation.refundCalculation.eligibleRefundAmountInCentavos, 30000);
  assert.equal(records.get(`payments/${initialId}/refunds/${state().refundId}`).amountInCentavos, 30000);
  const firstRefundId = state().refundId, count = writes.length;
  await Promise.all([evaluate(), evaluate()]);
  assert.equal(writes.length, count);
  assert.equal(state().refundId, firstRefundId);
});

test("multi-provider event recalculates without cancelling the healthy request", async () => {
  seed();
  records.set("providerRequests/request_healthy", {...request(), providerRequestId: "request_healthy", providerId: "provider_healthy"});
  records.get("mainEvents/event_test").providerRequestIds.push("request_healthy");
  await evaluate();
  assert.equal(records.get("providerRequests/request_healthy").status, "confirmed");
  assert.notEqual(records.get("mainEvents/event_test").status, "cancelled");
});

test("pre-deadline attempt holds with one customer and provider notification; success clears hold", async () => {
  seed(); addAttempt();
  assert.equal(classify().kind, "existing");
  await evaluate(); await evaluate();
  assert.equal(state().status, "on_hold");
  assert.equal(request().status, "confirmed");
  assert.equal([...records.keys()].filter((key) => key.startsWith("notifications/")).length, 2);
  assert.equal(writes.filter((write) => write.path.startsWith("notifications/")).length, 2);
  const settlementUpdate = {settlementStatus: "fully_settled", grossSettledAmountInCentavos: 100000, outstandingAmountInCentavos: 0};
  const update = balanceEnforcementPaymentOutcomeUpdate({request: request(), settlementUpdate, status: "paid",
    timestamp: Timestamp.fromDate(now), now});
  assert.equal(update.remainingBalanceEnforcement.status, "clear");
  Object.assign(request(), settlementUpdate);
  records.get(`payments/${balanceId}`).status = "paid";
  await evaluate();
  assert.equal(state().status, "clear");
  assert.equal(state().reason, "payment_settled_after_hold");
  assert.equal(request().status, "confirmed");
  assert.equal([...records.keys()].filter((key) => key.startsWith("providerRequestCancellationRequests/")).length, 0);
});

for (const status of ["failed", "expired"]) test(`${status} observation requires reconciliation, never cancellation/refund`, async () => {
  seed(); addAttempt(status);
  await evaluate();
  assert.equal(state().status, "reconciliation_required");
  assert.equal(request().status, "confirmed");
  assert.equal([...records.keys()].filter((key) => key.includes("/refunds/")).length, 0);
  assert.equal(state().reason, "gateway_terminal_outcome_unproven");
});

test("fully settled at deadline stays clear and never refunds", async () => {
  seed(); addAttempt("paid");
  Object.assign(request(), {settlementStatus: "fully_settled", grossSettledAmountInCentavos: 100000, outstandingAmountInCentavos: 0});
  await evaluate();
  assert.equal(state().status, "clear");
  assert.equal(request().status, "confirmed");
});

test("inconsistent money, orphaned history, post-deadline attempts and un-applied gateway success fail closed", async () => {
  for (const mutate of [
    () => records.get(`payments/${initialId}`).amountInCentavos++,
    () => request().grossSettledAmountInCentavos++,
    () => {addAttempt(); records.get(`payments/${balanceId}`).amountInCentavos++;},
    () => addAttempt("pending", 1),
    () => {records.set(`payments/${balanceId}/gatewayPayments/pay_unknown`, {status: "paid"});},
    () => {addAttempt(); records.delete(`payments/${balanceId}`);},
  ]) {
    seed(); mutate(); await evaluate();
    assert.equal(state().status, "reconciliation_required");
    assert.equal(request().status, "confirmed");
    assert.equal([...records.keys()].filter((key) => key.includes("/refunds/")).length, 0);
  }
});

test("v1 and pre-deadline bookings are untouched", async () => {
  seed(); request().remainingBalanceTimingSchemaVersion = 1;
  await evaluate(); assert.equal(writes.length, 0);
  seed(); await evaluateRemainingBalanceEnforcement(requestId, new Date(now.getTime() - 1));
  assert.equal(writes.length, 0);
});

test("preparation is blocked on hold and at unpaid deadline before scheduler", async () => {
  seed();
  await withClock(now, async () => assert.throws(() => assertBalanceEnforcementAllowsProgress(request()), {code: "failed-precondition"}));
  request().remainingBalanceTimingSchemaVersion = 1;
  assert.doesNotThrow(() => assertBalanceEnforcementAllowsProgress(request()));
});

test("existing refund executor processes the system reservation; successful refund replay is idempotent", async () => {
  seed(); const cancellationRequestId = await evaluate();
  const prepared = await prepareRefundExecution({cancellationRequestId, actorId: "feasta"});
  assert.equal(prepared.amountInCentavos, 30000);
  assert.equal(state().status, "refund_processing");
  const firstProcessingNotifications = writes.filter((write) => write.path.startsWith("notifications/")).length;
  await prepareRefundExecution({cancellationRequestId, actorId: "feasta"});
  assert.equal(writes.filter((write) => write.path.startsWith("notifications/")).length, firstProcessingNotifications);
  const input = {paymentId: initialId, refundOperationId: state().refundId, actorId: "paymongo", source: "paymongo_webhook",
    webhookEventId: "evt_refund_test", webhookEventType: "refund.succeeded", refund: {id: "refund_gateway_test",
      amountInCentavos: 30000, currency: "PHP", gatewayPaymentId: "pay_deposit_test", status: "succeeded",
      metadata: {feasta_payment_id: initialId, feasta_refund_operation_id: state().refundId}}};
  await reconcileGatewayRefund(input);
  assert.equal(state().status, "refunded");
  assert.equal(records.get(`payments/${initialId}`).refundedAmountInCentavos, 30000);
  const count = writes.length;
  await reconcileGatewayRefund(input);
  await reconcileGatewayRefund({...input, webhookEventId: "evt_refund_test_second"});
  assert.equal(records.get(`payments/${initialId}`).refundedAmountInCentavos, 30000);
  assert.equal(writes.filter((write) => write.path.startsWith("notifications/")).length, firstProcessingNotifications + 1);
  assert.ok(writes.length >= count);
});

async function withClock(date, callback) {
  const actualNow = Date.now;
  Date.now = () => date.getTime();
  try {return await callback();} finally {Date.now = actualNow;}
}
const checkout = () => createPaymentSessionForCustomer({customerId: "customer_test", providerRequestId: requestId,
  paymentChoice: "remaining_balance", clientKey: "deadline_unit_test", secretKey: "unused",
  successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel",
  createCheckout: async () => {throw new Error("dispatch not expected");}});

for (const offset of [0, 60000]) test(`actual checkout blocks a NEW payment at deadline + ${offset}ms`, async () => {
  seed();
  await withClock(new Date(now.getTime() + offset), async () => {
    await assert.rejects(checkout(), (error) => error.code === "failed-precondition" && error.details?.reason === "remaining_balance_deadline_passed");
  });
  assert.equal(writes.length, 0);
});

test("existing pre-deadline checkout resumes without creating a second attempt", async () => {
  seed(); addAttempt("pending");
  await withClock(new Date(now.getTime() + 60000), async () => {
    const result = await checkout();
    assert.equal(result.checkoutUrl, "https://checkout.paymongo.com/balance");
  });
  assert.equal(
    read(collection(`payments/${balanceId}/checkoutAttempts`)).size,
    1,
  );
  assert.equal(
    records.get(`payments/${balanceId}`).currentCheckoutAttemptId,
    "attempt_test",
  );
  assert.equal(
    records.get(`payments/${balanceId}`).attemptCount,
    1,
  );
  assert.equal(
    writes.filter(
      (write) =>
        write.path.startsWith(
          `payments/${balanceId}/checkoutAttempts/`,
        ),
    ).length,
    0,
  );
});

test("a paused invocation cannot create its first durable attempt after deadline", async () => {
  seed();
  Object.assign(request(), {paymentId: balanceId, remainingBalancePaymentId: balanceId, paymentStatus: "pending", settlementStatus: "balance_payment_processing"});
  records.set(`payments/${balanceId}`, {...payment("remaining_balance", "pending"), paymongoCheckoutId: null,
    attemptSchemaVersion: 1, attemptCount: 0, currentCheckoutAttemptId: null});
  await withClock(now, async () => assert.rejects(createDurableCheckout({paymentId: balanceId}, async () => {
    throw new Error("gateway must not be dispatched");
  }), (error) => error.details?.reason === "remaining_balance_deadline_passed"));
  assert.equal(writes.length, 0);
});
