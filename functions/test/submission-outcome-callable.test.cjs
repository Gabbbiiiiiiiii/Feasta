const {test} = require('node:test');
const assert = require('node:assert/strict');
const {HttpsError} = require('firebase-functions/v2/https');
const {Timestamp} = require('firebase-admin/firestore');
const {bookingOutcomeId} = require('../lib/bookings/submission-outcome.js');
const uid = 'customer_original', requestId = 'mobile_original';
let records = new Map(), reads = [], failure;
function stub(path, exports) {
  const filename = require.resolve(path);
  require.cache[filename] = {id: filename, filename, loaded: true, exports};
}
stub('../lib/shared/firestore.js', {db: {
  collection: name => ({doc: id => ({path: `${name}/${id}`})}),
  runTransaction: async callback => {
    if (failure) throw failure;
    return callback({get: async ref => {reads.push(ref.path); return {
      exists: records.has(ref.path), data: () => records.get(ref.path),
    };}});
  },
}});
stub('../lib/shared/authorization.js', {requireRole: async (owner, roles) => {
  assert.deepEqual(roles, ['customer']);
  if (owner === 'provider_original') throw new HttpsError('permission-denied', 'Customer required');
}});
stub('../lib/shared/rate-limit.js', {enforceCallableRateLimit: async () => {}});
const {reconcileBookingSubmission: callable} = require('../lib/bookings/reconcile-booking-submission.js');
const request = (data = {clientRequestId: requestId}, owner = uid) => ({
  auth: owner ? {uid: owner, token: {}} : undefined, data, rawRequest: {headers: {}},
});
test('callable authenticates and rejects identity, policy and error injection', async () => {
  await assert.rejects(callable.run(request(undefined, null)), {code: 'unauthenticated'});
  await assert.rejects(callable.run(request(undefined, 'provider_original')), {code: 'permission-denied'});
  for (const extra of [{uid: 'foreign'}, {errorCode: 'failed-precondition'}, {rejectedAt: 1}, {policy: 'secret'}]) {
    await assert.rejects(callable.run(request({clientRequestId: requestId, ...extra})), {code: 'invalid-argument'});
  }
});
test('callable derives owner scope and returns unresolved for missing historical evidence', async () => {
  reads = []; records.clear();
  assert.deepEqual(await callable.run(request()), {clientRequestId: requestId, outcome: 'unresolved'});
  const id = bookingOutcomeId(uid, requestId);
  assert.deepEqual(reads, [`mainEvents/${id}`, `bookingSubmissionOutcomes/${id}`]);
});
test('callable recovers durable rejection and creation; another account cannot access either', async () => {
  const id = bookingOutcomeId(uid, requestId);
  records.set(`bookingSubmissionOutcomes/${id}`, {schemaVersion: 1, customerId: uid,
    clientRequestId: requestId, submissionFingerprint: 'a'.repeat(64), outcome: 'confirmed_rejected',
    reason: 'acknowledgement_rejected', rejectedAt: Timestamp.now()});
  assert.equal((await callable.run(request())).outcome, 'confirmed_rejected');
  assert.equal((await callable.run(request(undefined, 'customer_other'))).outcome, 'unresolved');
  records.clear();
  records.set(`mainEvents/${id}`, {customerId: uid, clientRequestId: requestId,
    mainEventId: id, providerRequestIds: ['request_original']});
  assert.equal((await callable.run(request())).booking.bookingId, id);
  assert.equal((await callable.run(request(undefined, 'customer_other'))).outcome, 'unresolved');
});
test('transaction read interruption propagates; it cannot return a rejection', async () => {
  failure = new Error('read timeout');
  await assert.rejects(callable.run(request()), /read timeout/);
  failure = undefined;
});

test('real submission handler preserves owned replay and fingerprint conflict before new-booking validation', async () => {
  stub('firebase-admin/auth', {getAuth: () => ({getUser: async () => ({phoneNumber: '+639171234567'})})});
  const {submitBookingRequest} = require('../lib/bookings/submit-booking-request.js');
  const id = bookingOutcomeId(uid, requestId);
  const data = {clientRequestId: requestId, cateringSelectionType: 'package',
    providerId: 'provider_original', packageId: 'package_original', eventType: 'birthday',
    eventDate: '2030-01-02', eventTime: '14:00', eventEndTime: '18:00',
    eventLocation: 'Ormoc City', eventAddress: 'Example Street', guestCount: 50,
    selectedFoods: [], selectedDecorations: [], selectedFurniture: [], addonIds: []};
  records.clear();
  records.set(`mainEvents/${id}`, {customerId: uid, clientRequestId: requestId,
    mainEventId: id, providerRequestIds: ['request_original']});
  const responses = await Promise.all([submitBookingRequest.run(request(data)), submitBookingRequest.run(request(data))]);
  assert.ok(responses.every(r => r.bookingId === id && r.created === false));
  records.set(`mainEvents/${id}`, {...records.get(`mainEvents/${id}`), submissionFingerprint: 'b'.repeat(64)});
  await assert.rejects(submitBookingRequest.run(request(data)), {code: 'already-exists'});
  records.set(`mainEvents/${id}`, {...records.get(`mainEvents/${id}`), customerId: 'foreign'});
  await assert.rejects(submitBookingRequest.run(request(data)), {code: 'permission-denied'});
});
