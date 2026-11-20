const test = require('node:test');
const assert = require('node:assert/strict');
const {initializeApp, getApps} = require('firebase-admin/app');
if (!getApps().length) initializeApp({projectId: 'demo-feasta-cutoff'});
const {Timestamp} = require('firebase-admin/firestore');
const {db} = require('../lib/shared/firestore.js');
const auth = require('../lib/shared/authorization.js');
const rate = require('../lib/shared/rate-limit.js');
const idempotency = require('../lib/shared/idempotency.js');
const reader = require('../lib/payments/provider-request-payment-reader.js');
const {cancellationDeadline} = require('../lib/cancellations/cancellation-deadline.js');
const {automaticCompletionAt} = require('../lib/bookings/booking-completion-policy.js');
const {bookingPolicyV3Evidence} = require('../lib/bookings/booking-policy-v3.js');
const {getProviderRequestCancellationOptions, getProviderRequestCancellationStatus} = require('../lib/cancellations/get-provider-request-cancellation.js');
const {submitProviderRequestCancellation} = require('../lib/cancellations/submit-provider-request-cancellation.js');
const rid = 'request_cutoff', mid = 'event_cutoff', uid = 'customer_cutoff';
const end = Date.parse('2026-10-17T10:14:00Z');
function harness(t, now = end - 1) {
  t.mock.timers.enable({apis: ['Date'], now});
  t.mock.method(require('../lib/shared/timestamps.js'), 'serverTimestamp', () => Timestamp.now());
  t.mock.method(auth, 'requireRole', async () => undefined);
  t.mock.method(rate, 'enforceCallableRateLimit', async () => undefined);
  t.mock.method(idempotency, 'executeIdempotently', async input => ({result: await input.handler(), replayed: false}));
  const schedule = {eventDate: Timestamp.fromDate(new Date('2026-10-16T16:00:00Z')), eventTime: '08:14', eventEndTime: '18:14'};
  const request = {...schedule, providerRequestId: rid, mainEventId: mid, bookingId: mid,
    customerId: uid, providerId: 'provider_cutoff', status: 'in_progress', paymentStatus: 'unpaid', downPaymentAmount: 0};
  const parent = {...schedule, mainEventId: mid, bookingId: mid, customerId: uid, providerRequestIds: [rid], status: 'in_progress'};
  const records = new Map([
    ['providerRequests/' + rid, request], ['mainEvents/' + mid, parent],
    ['users/' + uid, {role: 'customer', accountStatus: 'active'}],
    ['providers/provider_cutoff', {ownerId: 'owner_cutoff'}],
    ['appSettings/cancellationRefundRollout', {schemaVersion: 1, isPublic: false, customerCancellationMode: 'review_only', automaticPolicyRefundApprovalMode: 'off'}],
  ]);
  let sequence = 0, commits = 0, crossDuringRead = false, retryAtDeadline = false;
  const ref = path => ({path, id: path.split('/').at(-1), get: async () => snap(ref(path)),
    collection: name => col(path + '/' + name)});
  const col = path => ({doc: (id = 'generated_' + ++sequence) => ref(path + '/' + id)});
  const snap = reference => ({id: reference.id, ref: reference, exists: records.has(reference.path), data: () => records.get(reference.path)});
  t.mock.method(db, 'collection', col);
  t.mock.method(db, 'runTransaction', async callback => {
    const writes = [];
    const tx = {getAll: async (...refs) => refs.map(snap), get: async reference => snap(reference),
      create: (reference, data) => writes.push([reference.path, data]),
      update: (reference, data) => writes.push([reference.path, {...records.get(reference.path), ...data}]),
      set: (reference, data) => writes.push([reference.path, data])};
    const result = await callback(tx);
    if (retryAtDeadline) {retryAtDeadline = false; t.mock.timers.setTime(end); return db.runTransaction(callback);}
    for (const [path, data] of writes) records.set(path, data);
    if (writes.length) commits++;
    return result;
  });
  t.mock.method(reader, 'readTrustedProviderRequestPaymentSetInTransaction', async () => {
    if (crossDuringRead) t.mock.timers.setTime(end);
    return {mode: 'legacy', currentPaymentId: 'payment_cutoff', currentPaymentReference: null, currentPayment: null};
  });
  const callable = data => ({data, auth: {uid, token: {}}, rawRequest: {headers: {}}});
  return {request, parent, records, get commits() {return commits;},
    retryAtDeadline: () => {retryAtDeadline = true;},
    crossDuringRead: () => {crossDuringRead = true;},
    status: () => getProviderRequestCancellationStatus.run(callable({providerRequestId: rid})),
    options: () => getProviderRequestCancellationOptions.run(callable({providerRequestId: rid})),
    submit: () => submitProviderRequestCancellation.run(callable({providerRequestId: rid, reason: 'Plans have changed', acknowledged: true, idempotencyKey: 'attempt_cutoff'}))};
}
for (const [at, closed] of [[end - 1, false], [end, true], [end + 1, true]]) {
  test('options and submission enforce exact boundary ' + at, async t => {
    const h = harness(t, at);
    const options = await h.options();
    assert.equal(options.cancellationAllowed, !closed);
    assert.equal(options.reasonCode, closed ? 'EVENT_ENDED' : 'LEGACY_MANUAL_REVIEW');
    if (closed) {
      await assert.rejects(h.submit(), e => e.details?.reason === 'EVENT_ENDED');
      assert.equal(h.commits, 0);
    } else assert.equal((await h.submit()).created, true);
    assert.equal(h.request.status, 'in_progress');
  });
}
test('an allowed preview cannot authorize a stale dialog submission', async t => {
  const h = harness(t);
  assert.equal((await h.options()).cancellationAllowed, true);
  t.mock.timers.setTime(end);
  await assert.rejects(h.submit(), e => e.details?.reason === 'EVENT_ENDED');
  assert.equal(h.commits, 0);
});
test('crossing the deadline during transactional reads rejects before writes', async t => {
  const h = harness(t); h.crossDuringRead();
  await assert.rejects(h.submit(), e => e.details?.reason === 'EVENT_ENDED');
  assert.equal(h.commits, 0);
});
test('a pre-cutoff request survives and its same-attempt replay works after cutoff', async t => {
  const h = harness(t); const first = await h.submit();
  const before = [...h.records.entries()].filter(([key]) => key.startsWith('providerRequestCancellationRequests/'));
  t.mock.timers.setTime(end + 1);
  assert.equal((await h.submit()).created, false);
  assert.equal((await h.options()).activeCancellation.status, first.status);
  assert.equal((await h.options()).reasonCode, 'EVENT_ENDED');
  assert.equal((await h.status()).cancellation.status, first.status);
  assert.deepEqual([...h.records.entries()].filter(([key]) => key.startsWith('providerRequestCancellationRequests/')), before);
  assert.equal(h.commits, 1);
});
for (const patch of [{eventEndTime: '25:00'}, {eventDate: null}, {eventTime: 'invalid'}]) {
  test('invalid schedule fails closed ' + JSON.stringify(patch), async t => {
    const h = harness(t); Object.assign(h.request, patch);
    assert.equal((await h.options()).reasonCode, 'SCHEDULE_RECONCILIATION_REQUIRED');
    await assert.rejects(h.submit(), e => e.details?.reason === 'SCHEDULE_RECONCILIATION_REQUIRED');
    assert.equal(h.commits, 0);
  });
}
test('request and parent schedule disagreement fails closed', async t => {
  const h = harness(t); h.parent.eventEndTime = '18:15';
  assert.equal((await h.options()).cancellationAllowed, false);
  await assert.rejects(h.submit(), e => e.details?.reason === 'SCHEDULE_RECONCILIATION_REQUIRED');
});
test('overnight end is the next Manila calendar day', t => {
  const h = harness(t);
  for (const d of [h.request, h.parent]) Object.assign(d, {eventTime: '22:00', eventEndTime: '01:00'});
  const overnightEnd = Date.parse('2026-10-17T17:00:00Z');
  assert.equal(cancellationDeadline(h.request, h.parent, new Date(overnightEnd - 1)).reason, null);
  assert.equal(cancellationDeadline(h.request, h.parent, new Date(overnightEnd)).reason, 'EVENT_ENDED');
});
test('V3 cutoff ignores disbursement enrollment and lifecycle-review flags; fallback stays end plus 24h', t => {
  const h = harness(t);
  Object.assign(h.request, bookingPolicyV3Evidence(new Date('2026-10-17T00:14:00Z'), Timestamp.fromDate),
    {lifecycleReconciliationRequired: true, financialSnapshot: {schemaVersion: 1}});
  assert.equal(cancellationDeadline(h.request, h.parent, new Date(end)).reason, 'EVENT_ENDED');
  assert.equal(automaticCompletionAt(h.request).getTime(), end + 86_400_000);
});

test('transaction retries evaluate the fresh server clock', async t => {
 const h = harness(t); h.retryAtDeadline();
 await assert.rejects(h.submit(), e => e.details?.reason === 'EVENT_ENDED');
 assert.equal(h.commits, 0);
});
