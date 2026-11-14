const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const {HttpsError} = require('firebase-functions/v2/https');
const {Timestamp} = require('firebase-admin/firestore');
const {bookingOutcomeId, rejectAcknowledgementInTransaction: reject,
  assertNoRejectedSubmission: fence, reconcileSubmissionOutcome: reconcile} =
  require('../lib/bookings/submission-outcome.js');
const identity = {customerId: 'customer_original', clientRequestId: 'mobile_original', submissionFingerprint: 'a'.repeat(64)};
const id = bookingOutcomeId(identity.customerId, identity.clientRequestId);
const booking = {customerId: identity.customerId, clientRequestId: identity.clientRequestId,
  mainEventId: id, providerRequestIds: ['provider_request']};
const receipt = {...identity, schemaVersion: 1, outcome: 'confirmed_rejected',
  reason: 'acknowledgement_rejected', rejectedAt: Timestamp.now()};
const lookup = (b, r, uid = identity.customerId) => reconcile(uid, identity.clientRequestId, id, b, r);

test('deterministic ID remains exactly the existing SHA256 contract', () => {
  assert.equal(id, createHash('sha256').update(`${identity.customerId}:${identity.clientRequestId}`).digest('hex').slice(0, 40));
  assert.notEqual(id, bookingOutcomeId('another_customer', identity.clientRequestId));
});
test('created lookup returns only owned canonical result', () => {
  assert.deepEqual(lookup(booking), {outcome: 'confirmed_created', booking: {
    bookingId: id, mainEventId: id, providerRequestIds: ['provider_request'], created: false}});
  for (const patch of [{customerId: 'foreign'}, {clientRequestId: 'other'}, {mainEventId: 'foreign'}, {providerRequestIds: []}]) {
    assert.deepEqual(lookup({...booking, ...patch}), {outcome: 'unresolved'});
  }
  assert.deepEqual(lookup(booking, undefined, 'foreign'), {outcome: 'unresolved'});
});
test('missing, historical, malformed and contradictory evidence never establishes rejection', () => {
  for (const r of [undefined, {}, {...receipt, customerId: 'foreign'}, {...receipt, schemaVersion: 2},
    {...receipt, rejectedAt: null}, {...receipt, submissionFingerprint: 'invalid'}]) {
    assert.deepEqual(lookup(undefined, r), {outcome: 'unresolved'});
  }
  assert.deepEqual(lookup(booking, receipt), {outcome: 'unresolved'});
  assert.deepEqual(lookup(undefined, receipt), {outcome: 'confirmed_rejected'});
});
test('terminal replay stays fenced and changed fingerprint conflicts', () => {
  assert.throws(() => fence(receipt, identity.customerId, identity.clientRequestId, identity.submissionFingerprint),
    e => e.details.reason === 'SUBMISSION_TERMINALLY_REJECTED');
  assert.throws(() => fence(receipt, identity.customerId, identity.clientRequestId, 'b'.repeat(64)), {code: 'already-exists'});
  assert.throws(() => fence({}, identity.customerId, identity.clientRequestId, identity.submissionFingerprint));
});
test('only definitive server acknowledgement validation can queue a receipt', () => {
  for (const reason of ['REFUND_POLICY_CHANGED', 'REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED',
    'BOOKING_PAYMENT_AGREEMENT_REQUIRED', 'BOOKING_PAYMENT_AGREEMENT_CHANGED']) {
    const writes = [];
    const error = new HttpsError('failed-precondition', 'Review terms', {reason});
    assert.equal(reject({create: (ref, data) => writes.push(data)}, {}, identity, () => {throw error;}), error);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].customerId, identity.customerId);
    assert.equal(writes[0].outcome, 'confirmed_rejected');
  }
  for (const error of [new Error('timeout'), new HttpsError('unavailable', 'retry'),
    new HttpsError('failed-precondition', 'other'), {code: 'failed-precondition', details: {reason: 'REFUND_POLICY_CHANGED'}}]) {
    assert.throws(() => reject({create: () => assert.fail('must not write')}, {}, identity, () => {throw error;}));
  }
});

// Optimistic transaction model: callbacks run concurrently; stale read versions
// retry and staged writes become visible only at successful commit.
function database() {
  let version = 0;
  let b, r;
  return {
    lookup: () => lookup(b, r),
    async submit({rejectIt = false, fingerprint = identity.submissionFingerprint, interrupt = false} = {}) {
      for (;;) {
        const readVersion = version, existing = b, rejected = r;
        await Promise.resolve();
        if (existing) {
          if (fingerprint !== identity.submissionFingerprint) throw new HttpsError('already-exists', 'Conflict');
          return {created: false};
        }
        fence(rejected, identity.customerId, identity.clientRequestId, fingerprint);
        let staged;
        const error = reject({create: (_, data) => {staged = data;}}, {}, {...identity, submissionFingerprint: fingerprint}, () => {
          if (rejectIt) throw new HttpsError('failed-precondition', 'Changed', {reason: 'REFUND_POLICY_CHANGED'});
        });
        await Promise.resolve();
        if (interrupt) throw new Error('commit interrupted');
        if (version !== readVersion) continue;
        version++;
        if (staged) r = {...staged, rejectedAt: Timestamp.now()};
        else b = booking;
        if (error) throw error;
        return {created: true};
      }
    },
  };
}
test('concurrent identical creation and replay create exactly once', async () => {
  const db = database();
  const results = await Promise.all(Array.from({length: 8}, () => db.submit()));
  assert.equal(results.filter(r => r.created).length, 1);
  assert.equal(db.lookup().outcome, 'confirmed_created');
  assert.equal((await db.submit()).created, false);
  await assert.rejects(db.submit({fingerprint: 'b'.repeat(64)}), {code: 'already-exists'});
});
test('concurrent rejection and creation serialize to one terminal outcome', async () => {
  for (const rejectionFirst of [true, false]) {
    const db = database();
    await Promise.allSettled([db.submit({rejectIt: rejectionFirst}), db.submit({rejectIt: !rejectionFirst})]);
    assert.equal(db.lookup().outcome, rejectionFirst ? 'confirmed_rejected' : 'confirmed_created');
    if (rejectionFirst) await assert.rejects(db.submit(), {code: 'failed-precondition'});
  }
});
test('precommit interruption has no evidence; lost response after commit is recoverable', async () => {
  const db = database();
  await assert.rejects(db.submit({rejectIt: true, interrupt: true}));
  assert.equal(db.lookup().outcome, 'unresolved');
  await assert.rejects(db.submit({rejectIt: true})); // response discarded
  assert.equal(db.lookup().outcome, 'confirmed_rejected');
});
test('production wiring reads fence before validation, commits before throwing, never receipts disclosure', () => {
  const source = readFileSync(require.resolve('../src/bookings/submit-booking-request.ts'), 'utf8');
  assert.ok(source.indexOf('assertNoRejectedSubmission(') < source.indexOf('const rejection = rejectAcknowledgementInTransaction('));
  assert.ok(source.indexOf('if ("rejection" in result)') > source.indexOf('created: true,'));
  assert.match(source, /if \(!disclosureOnly\) \{\s*const rejection = rejectAcknowledgementInTransaction/);
  assert.ok(source.lastIndexOf('if (rejection) return {rejection};') < source.indexOf('transaction.create('));
  const callable = readFileSync(require.resolve('../src/bookings/reconcile-booking-submission.ts'), 'utf8');
  assert.match(callable, /requireRole\(actor.uid, \["customer"\]\)/);
  assert.match(callable, /bookingOutcomeId\(actor.uid, requestId\)/);
  assert.doesNotMatch(callable, /tx\.(create|set|update|delete)\(/);
});
