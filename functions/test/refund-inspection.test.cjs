const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {Timestamp} = require('firebase-admin/firestore');
const {paymentIdForProviderRequest} = require('../lib/payments/payment-lifecycle.js');
const {paymentIdForProviderRequestChoice} = require('../lib/payments/payment-obligation.js');

function harness({legacy = false, patch = () => {}} = {}) {
  const requestId = 'provider_request_inspection';
  const eventId = 'main_event_inspection';
  const cancellationId = 'cancellation_inspection';
  const operationId = 'refund_' + 'b'.repeat(40);
  const paymentId = legacy ? paymentIdForProviderRequest(requestId) : paymentIdForProviderRequestChoice(requestId, 'full');
  const ids = {providerRequestId: requestId, mainEventId: eventId, customerId: 'customer_inspection', providerId: 'provider_inspection'};
  const records = {
    [`providerRequestCancellationRequests/${cancellationId}`]: {...ids, status: 'refund_completed', refundOperationId: operationId,
      refundOperationIds: [operationId], ...(legacy ? {} : {refundOperationPlanSchemaVersion: 1,
        refundOperationBindings: [{paymentId, refundOperationId: operationId, amountInCentavos: 500000}]}), updatedAt: Timestamp.now()},
    [`providerRequests/${requestId}`]: {...ids, bookingId: eventId, downPaymentAmount: 5000,
      ...(legacy ? {} : {paymentId, initialPaymentChoice: 'full', initialPaymentId: paymentId, remainingBalancePaymentId: null,
        settlementSchemaVersion: 1, financialSnapshot: {schemaVersion: 1, currency: 'PHP', grossAmountInCentavos: 500000,
          requiredUpfrontAmountInCentavos: 500000, remainingBalanceInCentavos: 0}})},
    [`mainEvents/${eventId}`]: {mainEventId: eventId, bookingId: eventId, customerId: ids.customerId, providerRequestIds: [requestId]},
    [`payments/${paymentId}`]: {...ids, paymentId, bookingId: eventId, amount: 5000, amountInCentavos: 500000,
      currency: 'PHP', paymentType: 'provider_down_payment', gateway: 'paymongo', status: 'refunded',
      ...(legacy ? {} : {paymentChoice: 'full', obligationKey: 'initial_full', obligationKind: 'initial'})},
    [`payments/${paymentId}/refunds/${operationId}`]: {cancellationRequestId: cancellationId, providerRequestId: requestId,
      amountInCentavos: 500000, status: 'completed', gatewayStatus: 'succeeded'},
  };
  patch(records, {requestId, eventId, cancellationId, paymentId, operationId});
  const reads = [];
  const ref = (p) => ({path: p, get: async () => {reads.push(p); return {exists: Boolean(records[p]), data: () => records[p]};},
    collection: name => ({doc: id => ref(`${p}/${name}/${id}`)})});
  const db = {collection: name => ({doc: id => ref(`${name}/${id}`)})};
  const filename = path.resolve(__dirname, '../lib/refunds/inspect-refund-reconciliation.js');
  const realRequire = createRequire(filename);
  const stubs = {'firebase-functions/v2/https': {...realRequire('firebase-functions/v2/https'), onCall: (_o, fn) => fn},
    '../shared/auth.js': {requireAuth: () => ({uid: 'admin'})}, '../shared/authorization.js': {requireRole: async () => {}},
    '../shared/firestore.js': {db}, '../shared/function-options.js': {appCheckCallableOptions: {}},
    '../shared/rate-limit.js': {enforceCallableRateLimit: async () => {}}};
  const exports = {};
  vm.runInNewContext(readFileSync(filename, 'utf8'), {exports, require: name => stubs[name] ?? realRequire(name)}, {filename});
  return {inspect: () => exports.inspectProviderRequestRefundReconciliation({data: {cancellationRequestId: cancellationId}}), reads, paymentId};
}

test('completed 5000-peso P5 refund inspection uses its bound payment rather than the legacy ID', async () => {
  const h = harness(); const result = await h.inspect();
  assert.equal(result.paymentId, h.paymentId);
  assert.equal(result.refundAmountInCentavos, 500000);
  assert.equal(result.operationStatus, 'completed'); assert.equal(result.gatewayStatus, 'succeeded');
  assert.equal(result.reconciliationRequired, false);
});
test('legacy payment inspection remains supported', async () => {
  const h = harness({legacy: true}); const result = await h.inspect(); assert.equal(result.paymentId, h.paymentId);
});
for (const [name, patch] of [
  ['missing operation', (r, i) => {delete r[`payments/${i.paymentId}/refunds/${i.operationId}`];}],
  ['wrong customer', (r, i) => {r[`payments/${i.paymentId}`].customerId = 'another_customer';}],
  ['wrong operation owner', (r, i) => {r[`payments/${i.paymentId}/refunds/${i.operationId}`].providerRequestId = 'another_request';}],
  ['amount mismatch', (r, i) => {r[`payments/${i.paymentId}/refunds/${i.operationId}`].amountInCentavos = 1;}],
  ['unbound payment', (r, i) => {r[`providerRequestCancellationRequests/${i.cancellationId}`].refundOperationBindings[0].paymentId = 'payment_' + 'a'.repeat(32);}],
]) test(`inspection rejects ${name}`, async () => {
  await assert.rejects(harness({patch}).inspect(), error => error.code === 'failed-precondition');
});
test('pending inspection remains pending and does not fabricate confirmation', async () => {
  const h = harness({patch: (r, i) => {r[`providerRequestCancellationRequests/${i.cancellationId}`].status = 'refund_processing';
    Object.assign(r[`payments/${i.paymentId}/refunds/${i.operationId}`], {status: 'processing', gatewayStatus: 'pending'});}});
  const result = await h.inspect(); assert.equal(result.operationStatus, 'processing'); assert.equal(result.gatewayStatus, 'pending');
});

test('multiple bound operations remain a review case for the single-operation inspector', async () => {
  const h = harness({patch: (r, i) => {
    const c = r[`providerRequestCancellationRequests/${i.cancellationId}`];
    const secondId = 'refund_' + 'c'.repeat(40);
    c.refundOperationIds.push(secondId);
    c.refundOperationBindings.push({paymentId: 'payment_' + 'c'.repeat(32), refundOperationId: secondId, amountInCentavos: 100});
  }});
  await assert.rejects(h.inspect(), error => error.code === 'failed-precondition');
});
test('historical inspection does not invent missing completion evidence', async () => {
  const h = harness({legacy: true, patch: (r, i) => {delete r[`payments/${i.paymentId}/refunds/${i.operationId}`].gatewayStatus;}});
  const result = await h.inspect(); assert.equal(result.gatewayStatus, null);
});
