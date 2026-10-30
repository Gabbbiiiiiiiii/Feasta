const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('firebase-admin/app').initializeApp({projectId: 'demo-isolated-expiration-offline'});
let observed;
const target = require.resolve('../lib/payments/initial-payment-expiration.js');
require.cache[target] = {id: target, filename: target, loaded: true, exports: {
  sweepInitialPaymentExpiration: async (now, budget) => {observed = {now, budget};},
}};
const {reconcileInitialPaymentExpiration: worker} = require('../lib/payments/initial-payment-expiration-worker.js');
test('isolated worker is private scheduled work with bounded resource settings and no gateway secret', async () => {
  const e = JSON.parse(JSON.stringify(worker.__endpoint));
  assert.equal(e.platform, 'gcfv2');
  assert.deepEqual(e.region, ['asia-southeast1']);
  assert.equal(e.maxInstances, 1); assert.equal(e.concurrency, 1);
  assert.equal(e.timeoutSeconds, 120); assert.equal(e.availableMemoryMb, 256);
  assert.equal(e.callableTrigger, undefined); assert.equal(e.httpsTrigger, undefined);
  assert.deepEqual(e.secretEnvironmentVariables ?? [], []);
  assert.deepEqual(e.scheduleTrigger, {schedule: 'every 1 minutes', timeZone: 'Asia/Manila', retryConfig: {retryCount: 0}});
  await worker.run({});
  assert.ok(observed.now instanceof Date);
  assert.equal(observed.budget.pageLimit, 5);
  assert.equal(observed.budget.maxEventRequests, 50);
});
test('worker stops admission after budget without detaching transactions', async t => {
  let tick = 0;
  t.mock.method(performance, 'now', () => tick);
  await worker.run({});
  assert.equal(observed.budget.remaining(), true);
  tick = 59000; assert.equal(observed.budget.remaining(), false);
  assert.equal(observed.budget.checkpoint(), true);
  tick = 60000; assert.equal(observed.budget.checkpoint(), false);
});
test('shared lifecycle worker has no expiration execution path, even when flags are enabled', () => {
  const source = fs.readFileSync(require.resolve('../src/bookings/booking-lifecycle-v3.ts'), 'utf8');
  assert.ok(!source.includes('sweepInitialPaymentExpiration'));
  assert.ok(!source.includes('initial-payment-expiration'));
});
