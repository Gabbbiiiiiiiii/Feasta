const test = require('node:test');
const assert = require('node:assert/strict');
const {initializeApp, getApps} = require('firebase-admin/app');
if (!getApps().length) initializeApp({projectId: 'demo-feasta-complaints'});
const {db} = require('../lib/shared/firestore.js');
const authorization = require('../lib/shared/authorization.js');
const rateLimit = require('../lib/shared/rate-limit.js');
const {createComplaint} = require('../lib/content/create-complaint.js');
const original = {collection: db.collection, transaction: db.runTransaction,
  active: authorization.requireActiveUser, rate: rateLimit.enforceCallableRateLimit};

function harness(role = 'customer') {
  const request = {providerRequestId: 'request_owned', mainEventId: 'event_owned', bookingId: 'event_owned',
    customerId: 'customer_owned', providerId: 'provider_owned', status: 'in_progress'};
  const parent = {mainEventId: 'event_owned', bookingId: 'event_owned', customerId: 'customer_owned',
    providerRequestIds: ['request_owned'], status: 'in_progress'};
  const records = new Map([['providerRequests/request_owned', request], ['mainEvents/event_owned', parent]]);
  let sequence = 0, version = 0;
  const snapshot = ref => ({id: ref.id, exists: records.has(ref.path), data: () => records.get(ref.path)});
  function reference(path) {return {path, id: path.split('/').at(-1),
    get: async function() {return snapshot(this);}, update: async data => {records.set(path, {...records.get(path), ...data}); version++;}};}
  db.collection = path => ({path, doc: id => reference(path + '/' + (id ?? 'generated_' + (++sequence))),
    where(field, op, value) {return {path, field, value};}});
  db.runTransaction = async callback => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const observed = version, writes = [];
      const result = await callback({get: async ref => {
        assert.equal(writes.length, 0, 'reads precede writes');
        if (!ref.field) return snapshot(ref);
        const docs = [...records.entries()].filter(([key, value]) => key.startsWith(ref.path + '/') && value[ref.field] === ref.value)
          .map(([key]) => snapshot(reference(key)));
        return {docs, size: docs.length};
      }, create: (ref, data) => writes.push([ref, data, true]), set: (ref, data) => writes.push([ref, data, false])});
      if (observed !== version) continue;
      for (const [ref, data, create] of writes) {
        if (create) assert.equal(records.has(ref.path), false);
        records.set(ref.path, data);
      }
      if (writes.length) version++;
      return result;
    }
    throw new Error('retry limit');
  };
  authorization.requireActiveUser = async () => ({role});
  rateLimit.enforceCallableRateLimit = async () => {};
  return {records, request, parent, complaints: () => [...records.entries()].filter(([key]) => key.startsWith('complaints/'))};
}
const input = {providerRequestId: 'request_owned', category: 'service_quality', description: 'The service did not match our agreement.'};
const call = (data = input, uid = 'customer_owned') => createComplaint.run({data, auth: {uid, token: {}}, rawRequest: {headers: {}}});
test.afterEach(() => {db.collection = original.collection; db.runTransaction = original.transaction;
  authorization.requireActiveUser = original.active; rateLimit.enforceCallableRateLimit = original.rate;});

test('stores trusted service/event/parties in the existing admin complaint contract', async () => {
  const h = harness(); const result = await call(); assert.equal(result.created, true);
  const complaint = h.complaints()[0][1];
  assert.deepEqual(['providerRequestId', 'bookingId', 'mainEventId', 'customerId', 'userId', 'providerId'].map(k => complaint[k]),
    ['request_owned', 'event_owned', 'event_owned', 'customer_owned', 'customer_owned', 'provider_owned']);
  assert.equal(complaint.status, 'submitted'); assert.equal(complaint.resolvedAt, null); assert.equal(complaint.resolvedBy, null);
  assert.equal(complaint.priority, 'normal'); assert.deepEqual(complaint.evidenceUrls, []);
});
test('concurrent submissions and retries with new client keys create one complaint and audit', async () => {
  const h = harness(); const results = await Promise.all([call({...input, idempotencyKey: 'one'}), call({...input, idempotencyKey: 'two'})]);
  assert.equal(results.filter(result => result.created).length, 1); assert.equal(h.complaints().length, 1);
  assert.equal((await call()).idempotentReplay, true);
  assert.equal([...h.records.keys()].filter(key => key.startsWith('adminLogs/')).length, 1);
});
test('different content with reused client key cannot replay another report', async () => {
  const h = harness(); await call({...input, idempotencyKey: 'one'});
  assert.equal((await call({...input, description: 'A different issue happened during the service.', idempotencyKey: 'one'})).created, true);
  assert.equal(h.complaints().length, 2);
});
for (const [field, value] of [['bookingId', 'event_forged'], ['mainEventId', 'event_forged'], ['providerId', 'provider_forged'],
  ['customerId', 'customer_forged'], ['userId', 'customer_forged']]) {
  test('rejects forged ' + field + ' even on an existing complaint replay', async () => {
    const h = harness(); await call(); await assert.rejects(call({...input, [field]: value}), error => error.code === 'permission-denied');
    assert.equal(h.complaints().length, 1);
  });
}
test('another customer and noncustomer cannot report booking issues', async () => {
  const h = harness(); await assert.rejects(call(input, 'other_customer'), error => error.code === 'permission-denied');
  authorization.requireActiveUser = async () => ({role: 'provider'});
  await assert.rejects(call(), error => error.code === 'permission-denied'); assert.equal(h.complaints().length, 0);
});
test('authentication and active account remain required', async () => {
  const h = harness(); await assert.rejects(createComplaint.run({data: input, auth: null, rawRequest: {headers: {}}}), error => error.code === 'unauthenticated');
  authorization.requireActiveUser = async () => {throw new Error('inactive account');};
  await assert.rejects(call(), /inactive account/); assert.equal(h.complaints().length, 0);
});
for (const mutate of [h => h.parent.providerRequestIds = ['request_other'], h => h.request.bookingId = 'event_other',
  h => h.parent.customerId = 'customer_other', h => h.request.providerRequestId = 'request_other']) {
  test('rejects invalid trusted membership', async () => {const h = harness(); mutate(h); await assert.rejects(call()); assert.equal(h.complaints().length, 0);});
}
test('validates category, description and service identifier without writing', async () => {
  const h = harness(); for (const data of [{...input, category: 'unsupported'}, {...input, description: 'short'},
    {...input, description: 'x'.repeat(4001)}, {...input, providerRequestId: '../other'}, {bookingId: 'event_owned', category: 'other', description: input.description}]) {
    await assert.rejects(call(data), error => error.code === 'invalid-argument');
  } assert.equal(h.complaints().length, 0);
});
test('legacy unscoped intake retains its existing shape and idempotency', async () => {
  const h = harness('provider'); const data = {providerId: 'legacy_provider', category: 'custom legacy category', description: input.description, idempotencyKey: 'legacy'};
  assert.equal((await call(data)).created, true); assert.equal((await call(data)).idempotentReplay, true);
  const complaint = h.complaints()[0][1]; assert.equal(complaint.providerId, 'legacy_provider');
  assert.equal(complaint.category, data.category); assert.equal(complaint.bookingId, undefined); assert.equal(complaint.providerRequestId, undefined);
});
