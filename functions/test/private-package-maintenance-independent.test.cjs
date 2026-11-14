const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const https = require('firebase-functions/v2/https');

const input = {
  name: 'Busog Na Set - Bilao Package', description: 'Eight dishes for a birthday gathering.',
  offerStructure: 'fixed', packageStyle: 'Bilao Package', pricingModel: 'per_bundle',
  eventType: 'birthday', serviceCategoryCode: 'catering_service', price: 1850,
  minimumGuests: 8, maximumGuests: 10, paymentPolicy: 'full_payment', depositPercentage: 100,
  serviceOptions: {drop_off: {price: 1850, includedServices: ['Delivery']}}, themeOptions: [],
  imageUrl: '', foodInclusions: ['Pasta/Noodles: Bam-e', 'Pork: Porkchop', 'Fish/Seafood: Calamari',
    'Fish/Seafood: Bangus', 'Appetizers: Shanghai', 'Chicken: Wings', 'Chicken: Buttered chicken', 'Desserts: Tapioca'],
  decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
};

// Execute compiled callables and real domain/occasion guards with an in-memory
// transaction. No Firebase service, emulator or network access is used.
function fixture() {
  const records = new Map([
    ['users/owner', {role: 'provider', providerId: 'provider'}],
    ['providers/provider', {ownerId: 'owner', verificationStatus: 'approved', isActive: true,
      providerServiceType: 'catering', serviceCategories: ['catering_service'],
      eventTypesSupported: ['birthday', 'wedding'], minGuestsPerEvent: 1, maxGuestsPerEvent: 100}],
    ['occasionCatalog/current', {activationState: 'stable', revision: 1}],
    ...['birthday', 'wedding'].map(id => ['occasions/' + id, {id, active: true,
      moderationState: 'approved', revision: 1, applicableServiceCategoryCodes: ['catering_service']}]),
  ]);
  const reads = []; let serial = 0;
  const ref = p => ({path: p, id: p.split('/').at(-1)});
  const db = {doc: ref, collection: p => ({doc: id => ref(p + '/' + (id ?? 'generated_' + ++serial))}),
    async runTransaction(fn) {
      const writes = []; let writing = false;
      const tx = {async get(r) {
        assert.equal(writing, false, 'all reads precede writes'); reads.push(r.path);
        assert.equal(r.path.startsWith('maintenance'), false, 'no maintenance dependency');
        return {id: r.id, exists: records.has(r.path), data: () => records.get(r.path)};
      }};
      for (const mode of ['create', 'update', 'delete']) tx[mode] = (r, data) => {
        writing = true; assert.equal(r.path.startsWith('maintenance'), false); writes.push([mode, r, data]);
      };
      const result = await fn(tx);
      for (const [mode, r, data] of writes) {
        if (mode === 'delete') records.delete(r.path);
        else records.set(r.path, mode === 'update' ? {...records.get(r.path), ...data} : data);
      }
      return result;
    }};
  function load(name) {
    const filename = path.resolve(__dirname, '../lib/packages/' + name + '.js');
    const real = createRequire(filename); const exports = {};
    const mocks = {
      'firebase-functions/v2/https': {...https, onCall: (_options, handler) => handler},
      '../shared/firestore.js': {db}, '../shared/cloudinary.js': {cloudinarySecrets: []},
      './package-payment-policy.js': {...real('./package-payment-policy.js'),
        packagePaymentPolicySettingsReference: () => db.doc('appSettings/platform')},
      '../shared/auth.js': {requireAuth: r => {if (!r.auth) throw new https.HttpsError('unauthenticated', 'required'); return r.auth;}},
      '../shared/authorization.js': {requireRole: async uid => {
        if (records.get('users/' + uid)?.role !== 'provider') throw new https.HttpsError('permission-denied', 'provider required');
      }},
      '../shared/rate-limit.js': {enforceCallableRateLimit: async () => {}},
      '../shared/service-category-policy.js': {requireActiveServiceCategoryInTransaction: async () => {}},
      './legacy-package-occasion-authority.js': {requireLegacyPackageOccasionAuthority: (...args) => load('legacy-package-occasion-authority').requireLegacyPackageOccasionAuthority(...args)},
    };
    vm.runInThisContext('(function(exports,require){' + fs.readFileSync(filename, 'utf8') + '\n})', {filename})(
      exports, name => Object.hasOwn(mocks, name) ? mocks[name] : real(name));
    return exports;
  }
  const create = load('create-provider-package').createProviderPackage;
  const update = load('update-provider-package').updateProviderPackage;
  const req = (data, uid = 'owner') => ({auth: {uid}, data});
  return {records, reads, create: (data = input, uid) => create(req(data, uid)),
    update: (id, data = input) => update(req({...data, packageId: id}))};
}

test('private create and edit need no maintenance document and retain exact Bilao data and registry', async () => {
  const f = fixture(); const {packageId} = await f.create();
  await f.update(packageId);
  const saved = f.records.get('packages/' + packageId);
  for (const key of ['price', 'pricingModel', 'minimumGuests', 'maximumGuests', 'foodInclusions', 'offerStructure', 'packageStyle']) {
    assert.deepEqual(saved[key], input[key]);
  }
  assert.equal(saved.status, 'draft');
  for (const key of ['isActive', 'isPublished', 'providerPubliclyVisible']) assert.equal(saved[key], false);
  const entry = id => `occasionDependencies/${id}/entries/package_${packageId}`;
  assert.equal(f.records.get(entry('birthday')).sourcePath, 'packages/' + packageId);
  await f.update(packageId, {...input, eventType: 'wedding'});
  assert.equal(f.records.has(entry('birthday')), false);
  assert.equal(f.records.get(entry('wedding')).occasionId, 'wedding');
  assert.ok(f.reads.includes('occasionCatalog/current'));
  assert.ok(f.reads.includes('occasions/wedding'));
});

test('provider authorization, ownership, draft status and invalid input still block', async () => {
  const f = fixture();
  await assert.rejects(f.create(input, 'stranger'), e => e.code === 'permission-denied');
  const {packageId} = await f.create(); const key = 'packages/' + packageId;
  const saved = f.records.get(key);
  for (const [recordKey, patch] of [
    ['providers/provider', {ownerId: 'other'}], [key, {providerId: 'other'}], [key, {status: 'published'}],
  ]) {
    const before = f.records.get(recordKey); f.records.set(recordKey, {...before, ...patch});
    await assert.rejects(f.update(packageId), e => ['permission-denied', 'failed-precondition'].includes(e.code));
    f.records.set(recordKey, before);
  }
  for (const patch of [{price: -1}, {minimumGuests: 11}, {status: 'published'}, {isPublished: true}]) {
    await assert.rejects(f.create({...input, ...patch}), e => e.code === 'invalid-argument');
    await assert.rejects(f.update(packageId, {...input, ...patch}), e => e.code === 'invalid-argument');
  }
  assert.equal(f.records.get(key), saved);
});

test('active occasion transitions and inactive occasions still block both writers atomically', async () => {
  const f = fixture(); const {packageId} = await f.create();
  for (const [key, patch, reason] of [
    ['occasionCatalog/current', {activationState: 'transitioning'}, 'OCCASION_CATALOG_UNAVAILABLE'],
    ['occasions/birthday', {active: false}, 'OCCASION_UNAVAILABLE'],
    ['occasions/birthday', {applicableServiceCategoryCodes: ['photography']}, 'OCCASION_UNAVAILABLE'],
  ]) {
    const before = f.records.get(key); f.records.set(key, {...before, ...patch});
    const snapshot = [...f.records];
    await assert.rejects(f.create(), e => e.details?.reason === reason);
    await assert.rejects(f.update(packageId), e => e.details?.reason === reason);
    assert.deepEqual([...f.records], snapshot);
    f.records.set(key, before);
  }
});
