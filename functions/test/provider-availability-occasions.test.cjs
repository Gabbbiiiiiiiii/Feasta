// Executes real compiled callables in a transactional memory store. No network or emulators.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const https = require('firebase-functions/v2/https');
function fixture() {
  const provider = {ownerId: 'owner', verificationStatus: 'approved', isActive: true,
    serviceCategories: ['catering_service'], operatingDays: ['monday'], bookingLeadTimeDays: 3,
    minGuestsPerEvent: 10, maxGuestsPerEvent: 100, availableStaffCount: 5, availableEquipmentCount: 8,
    unavailableDates: ['2099-09-10'], unrelated: 'preserved'};
  const occasion = (id, extra = {}) => ({id, label: id, active: true, moderationState: 'approved',
    revision: 1, sortOrder: 0, applicableServiceCategoryCodes: ['catering_service'], ...extra});
  const records = new Map([
    ['providers/provider', provider], ['occasionCatalog/current', {revision: 7, activationState: 'stable'}],
    ['serviceCategories/catering_service', {code: 'catering_service', status: 'active', serviceType: 'catering'}],
    ['occasions/birthday', occasion('birthday')], ['occasions/wedding', occasion('wedding')],
    ['occasions/inactive', occasion('inactive', {active: false})],
    ['occasions/rejected', occasion('rejected', {moderationState: 'rejected'})],
    ['occasions/other_category', occasion('other_category', {applicableServiceCategoryCodes: ['photography']})],
  ]);
  const ref = p => ({path: p, id: p.split('/').at(-1)});
  const snap = r => ({id: r.id, ref: r, exists: records.has(r.path), data: () => records.get(r.path)});
  function collection(p) {
    return {path: p, filters: [], maximum: Infinity, doc: id => ref(p + '/' + id),
      where(k, op, value) {return {...this, filters: [...this.filters, [k, value]]};},
      limit(n) {return {...this, maximum: n};}, async get() {return query(this);}};
  }
  function query(r) {
    const docs = [...records].filter(([p, d]) => p.startsWith(r.path + '/') &&
      !p.slice(r.path.length + 1).includes('/') && r.filters.every(([k, v]) => d[k] === v))
      .slice(0, r.maximum).map(([p]) => snap(ref(p)));
    return {docs, size: docs.length, empty: docs.length === 0};
  }
  const writes = [];
  const db = {collection, async runTransaction(fn) {
    const pending = []; let writing = false;
    const transaction = {async get(r) {assert.equal(writing, false, 'all reads precede writes'); return r.id ? snap(r) : query(r);},
      update(r, data) {writing = true; pending.push([r, data]);}};
    const result = await fn(transaction);
    pending.forEach(([r, data]) => {records.set(r.path, {...records.get(r.path), ...data}); writes.push(r.path);});
    return result;
  }};
  let policyEnabled = true;
  const filename = path.resolve(__dirname, '../lib/providers/update-provider-availability.js');
  const real = createRequire(filename); const exports = {};
  const mocks = {
    'firebase-functions/v2/https': {...https, onCall: (options, handler) => {assert.ok(options.enforceAppCheck); return handler;}},
    '../shared/firestore.js': {db},
    '../shared/auth.js': {requireAuth(r) {if (!r.auth) throw new https.HttpsError('unauthenticated', 'Sign in'); return r.auth;}},
    '../shared/authorization.js': {async requireRole(uid) {if (uid !== 'owner') throw new https.HttpsError('permission-denied', 'Provider only');}},
    '../shared/rate-limit.js': {enforceCallableRateLimit: async () => {}},
    '../shared/audit.js': {writeAuditLogInTransaction: () => {}},
    '../shared/timestamps.js': {serverTimestamp: () => 'server-time'},
    '../packages/provider-package-v2-policy-read.js': {async loadOccasionCatalogReadPolicy() {
      if (!policyEnabled) throw new https.HttpsError('failed-precondition', 'Catalog disabled');
    }},
  };
  vm.runInThisContext('(function(exports,require){' + fs.readFileSync(filename, 'utf8') + '\n})', {filename})(exports,
    name => Object.hasOwn(mocks, name) ? mocks[name] : real(name));
  const input = {operatingDays: ['monday'], bookingLeadTimeDays: 3, acceptsMultipleEventsPerDay: false,
    maxEventsPerDay: 1, minGuestsPerEvent: 10, maxGuestsPerEvent: 100, availableStaffCount: 5,
    availableEquipmentCount: 8, supportedOccasionIds: ['birthday'], expectedSettingsRevision: 0, occasionCatalogRevision: 7};
  return {records, writes, input, disablePolicy: () => {policyEnabled = false;},
    read: auth => exports.getProviderAvailabilityOccasions({auth: auth === undefined ? {uid: 'owner'} : auth, data: {}}),
    save: (extra = {}, auth = {uid: 'owner'}) => exports.updateProviderAvailabilitySettings({auth, data: {...input, ...extra}})};
}
test('catalog uses only active approved applicable occasions and reflects activation', async () => {
  const f = fixture(); assert.deepEqual((await f.read()).items.map(i => i.id), ['birthday', 'wedding']);
  f.records.get('occasions/inactive').active = true;
  assert.ok((await f.read()).items.some(i => i.id === 'inactive'));
  f.records.get('serviceCategories/catering_service').status = 'inactive';
  assert.deepEqual((await f.read()).items, []);
});
test('save and readback preserve schedule, capacities, dates and unrelated provider fields', async () => {
  const f = fixture(); const before = {...f.records.get('providers/provider')};
  const result = await f.save(); const saved = f.records.get('providers/provider');
  assert.deepEqual(saved.supportedOccasionIds, ['birthday']);
  assert.equal(result.settings.availabilitySettingsRevision, 1);
  for (const key of Object.keys(before)) assert.deepEqual(saved[key], before[key]);
  assert.deepEqual(f.writes, ['providers/provider']);
  assert.deepEqual((await f.read()).items.map(i => i.id), ['birthday', 'wedding']);
  await f.save({supportedOccasionIds: [], expectedSettingsRevision: 1});
  assert.deepEqual(f.records.get('providers/provider').supportedOccasionIds, []);
});
test('rejects invalid, duplicate, inactive, rejected and category-ineligible IDs without writing', async () => {
  for (const ids of [['unknown'], ['birthday', 'birthday'], ['inactive'], ['rejected'], ['other_category'], ['../birthday']]) {
    const f = fixture(); await assert.rejects(f.save({supportedOccasionIds: ids}), {code: 'invalid-argument'});
    assert.equal(f.writes.length, 0);
  }
});
test('rejects stale settings and catalog generations without overwriting saved data', async () => {
  const f = fixture(); await f.save();
  await assert.rejects(f.save({supportedOccasionIds: ['wedding']}), {code: 'aborted'});
  assert.deepEqual(f.records.get('providers/provider').supportedOccasionIds, ['birthday']);
  f.records.get('occasionCatalog/current').revision = 8;
  await assert.rejects(f.save({expectedSettingsRevision: 1}), {code: 'aborted'});
  assert.equal(f.writes.length, 1);
});
test('validates lifecycle changes at save time and rejects unstable catalog', async () => {
  const f = fixture(); await f.read(); f.records.get('occasions/birthday').active = false;
  await assert.rejects(f.save(), {code: 'invalid-argument'});
  f.records.get('occasionCatalog/current').activationState = 'transitioning';
  await assert.rejects(f.read(), {code: 'failed-precondition'});
  await assert.rejects(f.save(), {code: 'failed-precondition'});
  assert.equal(f.writes.length, 0);
});
test('requires authentication, provider role, ownership, approval and enabled read policy', async () => {
  const f = fixture();
  await assert.rejects(f.read(null), {code: 'unauthenticated'});
  await assert.rejects(f.save({}, null), {code: 'unauthenticated'});
  await assert.rejects(f.read({uid: 'customer'}), {code: 'permission-denied'});
  await assert.rejects(f.save({}, {uid: 'customer'}), {code: 'permission-denied'});
  f.records.get('providers/provider').ownerId = 'another-owner';
  await assert.rejects(f.save(), {code: 'not-found'});
  f.records.get('providers/provider').ownerId = 'owner';
  f.records.get('providers/provider').isBlocked = true;
  await assert.rejects(f.read(), {code: 'failed-precondition'});
  await assert.rejects(f.save(), {code: 'failed-precondition'});
  f.records.get('providers/provider').isBlocked = false; f.disablePolicy();
  await assert.rejects(f.read(), {code: 'failed-precondition'});
  await assert.rejects(f.save(), {code: 'failed-precondition'});
  assert.equal(f.writes.length, 0);
});
test('schedule-only saves preserve event preferences when catalog policy is disabled', async () => {
  const f = fixture(); f.records.get('providers/provider').supportedOccasionIds = ['birthday']; f.disablePolicy();
  const result = await f.save({supportedOccasionIds: undefined, occasionCatalogRevision: undefined, bookingLeadTimeDays: 5});
  assert.deepEqual(result.settings.supportedOccasionIds, ['birthday']);
  assert.equal(f.records.get('providers/provider').bookingLeadTimeDays, 5);
  assert.deepEqual(f.records.get('providers/provider').supportedOccasionIds, ['birthday']);
});
