const assert = require('node:assert/strict');
const {test} = require('node:test');
const {readFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const {PROVIDER_EVENT_TYPES} = require('../lib/shared/constants.js');

// Execute the actual callable and local dependencies, with no external I/O.
function harness({maintenance = {schemaVersion: 1, revision: 1, intake: false, publication: false}, active = true, packagePatch = {}, existing, catalog = {activationState: 'stable', revision: 1}} = {}) {
  const reads = [];
  const records = {
    'maintenanceControls/intake': maintenance,
    'occasionCatalog/current': catalog,
    'users/customer_1': {role: 'customer', accountStatus: 'active', isActive: true,
      isPhoneVerified: true, phoneNumber: '+639171234567'},
    'customers/customer_1': {},
    'providers/provider_1': {ownerId: 'owner_1', verificationStatus: 'approved', isActive: true},
    'packages/package_1': {providerId: 'provider_1', status: 'published', isActive: true,
      isPublished: true, providerPubliclyVisible: true, eventType: 'birthday',
      minimumGuests: 1, maximumGuests: 100, ...packagePatch},
  };
  for (const id of PROVIDER_EVENT_TYPES) records[`occasions/${id}`] = {
    id, active, moderationState: 'approved', revision: 1, applicableServiceCategoryCodes: ['catering_service'],
  };
  const reference = (name) => ({path: name, doc: (id) => reference(`${name}/${id}`),
    collection: (id) => reference(`${name}/${id}`)});
  const db = {doc: reference, collection: reference, runTransaction: async (work) => work({
    get: async (ref) => {
      reads.push(ref.path);
      const data = ref.path.startsWith('mainEvents/') ? existing : records[ref.path];
      return {exists: data !== undefined, data: () => data};
    },
    create: () => assert.fail('rejection/replay must not write'),
    update: () => assert.fail('rejection/replay must not write'),
    set: () => assert.fail('rejection/replay must not write'),
  })};
  const root = path.resolve(__dirname, '../lib');
  const stubs = {
    'shared/firestore.js': {db},
    'shared/auth.js': {requireAuth: () => ({uid: 'customer_1'})},
    'shared/authorization.js': {requireRole: async () => {}},
    'shared/rate-limit.js': {enforceCallableRateLimit: async () => {}},
    'shared/security-events.js': {logSecurityEvent: async () => {}},
    'shared/logger.js': {logError: (_, error) => { throw error; }},
    'shared/function-options.js': {appCheckCallableOptions: {}},
  };
  const cache = new Map();
  function load(filename) {
    const key = path.relative(root, filename).replaceAll('\\', '/');
    if (stubs[key]) return stubs[key];
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const realRequire = createRequire(filename);
    const customRequire = (name) => {
      if (name === 'firebase-functions/v2/https') return {...realRequire(name), onCall: (_, fn) => fn};
      if (name === 'firebase-admin/auth') return {getAuth: () => ({getUser: async () => ({phoneNumber: '+639171234567'})})};
      if (name.startsWith('.')) return load(realRequire.resolve(name));
      return realRequire(name);
    };
    vm.runInNewContext(readFileSync(filename, 'utf8'), {exports, require: customRequire, process, console, Buffer}, {filename});
    return exports;
  }
  const callable = load(path.join(root, 'bookings/submit-booking-request.js'));
  const data = {clientRequestId: 'request_1', providerId: 'provider_1', packageId: 'package_1',
    eventType: 'birthday', eventDate: '2099-01-15', eventTime: '10:00', eventEndTime: '14:00',
    eventLocation: 'Ormoc', eventAddress: '123 Street', guestCount: 20,
    selectedFoods: [], selectedDecorations: [], selectedFurniture: [], addonIds: []};
  return {reads, call: (patch = {}, disclosure = false) =>
    callable[disclosure ? 'getBookingPaymentAgreementDisclosures' : 'submitBookingRequest']({
      auth: {uid: 'customer_1', token: {email_verified: true}}, data: {...data, ...patch},
    })};
}

test('old mobile request without V2 metadata cannot book incompatible server package', async () => {
  for (const packagePatch of [{occasionSchemaVersion: 2}, {occasionIds: null},
    {offerSchemaVersion: 2}, {offerSchemaVersion: null}, {pricingModel: 'per_pax'}, {foodChoiceGroups: null}, {foodChoiceGroups: []}]) {
    const h = harness({packagePatch});
    await assert.rejects(h.call(), (error) => error.code === 'failed-precondition' &&
      /package/i.test(error.message));
    assert.ok(h.reads.includes('packages/package_1'));
  }
});

test('all nine inactive occasions reject new legacy bookings and preparation disclosures', async () => {
  for (const eventType of PROVIDER_EVENT_TYPES) {
    for (const disclosure of [false, true]) {
      const h = harness({active: false});
      await assert.rejects(h.call({eventType}, disclosure), (error) =>
        error.code === 'failed-precondition' && error.details?.reason === 'OCCASION_UNAVAILABLE');
      assert.ok(h.reads.includes(`occasions/${eventType}`));
    }
  }
});

test('inactive catalog does not prevent an owned historical idempotent replay', async () => {
  const h = harness({active: false, catalog: null, packagePatch: {occasionSchemaVersion: 2},
    existing: {customerId: 'customer_1', providerRequestIds: ['request_existing']}});
  const result = await h.call();
  assert.equal(result.created, false);
  assert.equal(result.providerRequestIds[0], 'request_existing');
  assert.equal(h.reads.includes('occasionCatalog/current'), false);
});

test('idempotent replay still enforces ownership and fingerprint', async () => {
  for (const [existing, code] of [[{customerId: 'other'}, 'permission-denied'],
    [{customerId: 'customer_1', submissionFingerprint: 'different'}, 'already-exists']]) {
    await assert.rejects(harness({active: false, existing}).call(), {code});
  }
});

test('maintenance rejects old Web/mobile callable payloads and agreement preparation before occasion checks', async () => {
  for (const maintenance of [undefined, null, {},
    {schemaVersion: 1, revision: 2, intake: true, publication: true}]) {
    for (const disclosure of [false, true]) {
      const h = harness({maintenance: maintenance ?? null});
      await assert.rejects(h.call({}, disclosure), error => error.code === 'unavailable' &&
        error.details?.reason === 'MAINTENANCE_PAUSED');
      assert.ok(h.reads.includes('maintenanceControls/intake'));
      assert.equal(h.reads.includes('occasionCatalog/current'), false);
    }
  }
});
test('maintenance preserves owned existing booking replay', async () => {
  const h = harness({maintenance: null, existing: {customerId: 'customer_1', providerRequestIds: ['old']}});
  assert.equal((await h.call()).created, false);
  assert.equal(h.reads.includes('maintenanceControls/intake'), false);
});


test('orphan or malformed V2 package revision metadata rejects before transaction reads', async () => {
 for (const patch of [{expectedPackageRevision: 1}, {sharedContractVersion: 2},
   {sharedContractVersion: 2, expectedPackageRevision: 0},
   {sharedContractVersion: 1, expectedPackageRevision: 1}]) {
  const h=harness();await assert.rejects(h.call(patch), e=>e.code==='invalid-argument' && /package version/i.test(e.message));
  assert.equal(h.reads.length,0);
 }
});
test('custom menus cannot use V2 package metadata to widen their occasion contract', async () => {
 const h=harness();await assert.rejects(h.call({cateringSelectionType:'custom_menu',packageId:undefined,
  sharedContractVersion:2,expectedPackageRevision:1,eventType:'company_party',menuSelections:[]}),
  e=>e.code==='invalid-argument' && /only valid for package bookings/i.test(e.message));
 assert.equal(h.reads.length,0);
});
