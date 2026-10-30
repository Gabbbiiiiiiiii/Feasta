const assert = require('node:assert/strict');
const {test} = require('node:test');
const {readFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {advanceProviderEligibilityInTransaction: advance} =
  require('../lib/shared/provider-eligibility-revision.js');

const webFilename = path.resolve(__dirname, '../../apps/web/src/lib/admin/provider-eligibility-revision.ts');
const webExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(webFilename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports: webExports, require: (name) => name === 'server-only' ? {} : require(name)});

const profile = {ownerId: 'owner', verificationStatus: 'approved', isActive: true,
  providerServiceType: 'addon', businessName: 'Business', description: 'Original description',
  address: 'Original Street', city: 'Ormoc City', province: 'Leyte', publiclyVisible: true};

function harness(authority, provider = profile) {
  const records = {'maintenanceControls/intake': {schemaVersion:1,revision:1,intake:false,publication:false}, 'providers/provider': structuredClone(provider),
    'users/owner': {role: 'provider', providerId: 'provider', accountStatus: 'active'},
    ...(authority === undefined ? {} : {'providerEligibilityAuthorities/provider': structuredClone(authority)})};
  const events = [];
  const snapshot = (ref) => ({exists: ref.path in records, data: () => structuredClone(records[ref.path])});
  const db = {doc: (path) => ({path}), collection: (name) => ({doc: (id) => ({id, path: `${name}/${id}`, firestore: db,
    get: async () => snapshot({path: `${name}/${id}`})})}),
  async runTransaction(work) {
    const pending = [];
    const tx = {
      async get(ref) {
        assert.equal(pending.length, 0, 'Firestore reads must precede every write');
        events.push(`read:${ref.path}`);
        return snapshot(ref);
      },
      async getAll(...refs) { return Promise.all(refs.map((ref) => tx.get(ref))); },
      update(ref, patch) {
        assert.ok(ref.path in records);
        events.push(`write:${ref.path}`);
        pending.push(() => { records[ref.path] = {...records[ref.path], ...structuredClone(patch)}; });
      },
      create(ref, data) {
        assert.equal(ref.path in records, false);
        events.push(`write:${ref.path}`);
        pending.push(() => { records[ref.path] = structuredClone(data); });
      },
    };
    const result = await work(tx);
    pending.forEach((write) => write());
    return result;
  }};
  const filename = path.resolve(__dirname, '../lib/providers/update-provider-business-profile.js');
  const realRequire = createRequire(filename);
  const stubs = {
    'firebase-functions/v2/https': {...realRequire('firebase-functions/v2/https'), onCall: (_, handler) => handler},
    '../shared/firestore.js': {db},
    '../shared/auth.js': {requireAuth: () => ({uid: 'owner'})},
    '../shared/authorization.js': {requireRole: async () => {}},
    '../shared/rate-limit.js': {enforceCallableRateLimit: async () => {}},
    '../shared/function-options.js': {appCheckCallableOptions: {}},
    '../shared/cloudinary.js': {cloudinarySecrets: []},
    '../shared/timestamps.js': {serverTimestamp: () => 'timestamp'},
    '../shared/audit.js': {writeAuditLogInTransaction: (tx, data) => tx.create(db.collection('audit').doc('entry'), data)},
  };
  const exports = {};
  vm.runInNewContext(readFileSync(filename, 'utf8'), {exports, require: (name) => stubs[name] ?? realRequire(name)}, {filename});
  return {records, events, db, ref: db.collection('providers').doc('provider'),
    update: (data) => exports.updateProviderBusinessProfile({data})};
}

for (const adapter of ['Functions', 'Web Admin']) {
  async function change(h, before, after) {
    await h.db.runTransaction(async (tx) => {
      if (adapter === 'Functions') await advance(tx, h.ref, before, after);
      else {
        const write = await webExports.prepareProviderEligibilityAdvance(tx, h.ref, before, after);
        assert.ok(h.events.every((event) => event.startsWith('read:')), 'prepare must defer writes');
        await tx.get(h.ref);
        write();
      }
    });
  }
  test(`${adapter}: visibility transitions preserve approval evidence and increment once`, async () => {
    for (const [before, after] of [[false, true], [true, false], [undefined, true]]) {
      const h = harness({revision: 7, approvedOccasionIds: ['wedding'], approvalEvidence: {reviewer: 'admin'}});
      await change(h, {...profile, publiclyVisible: before}, {...profile, publiclyVisible: after});
      assert.deepEqual(h.records['providerEligibilityAuthorities/provider'], {
        revision: 8, approvedOccasionIds: ['wedding'], approvalEvidence: {reviewer: 'admin'},
      });
    }
  });
  test(`${adapter}: unchanged visibility and unrelated edits do not initialize or increment`, async () => {
    for (const initial of [undefined, {revision: 7}]) {
      const h = harness(initial);
      await change(h, profile, {...profile, description: 'New description', address: 'New Street'});
      assert.deepEqual(h.records['providerEligibilityAuthorities/provider'], initial);
    }
  });
  test(`${adapter}: missing authority initializes only a counter on visibility change`, async () => {
    const h = harness();
    await change(h, profile, {...profile, publiclyVisible: false});
    assert.deepEqual(h.records['providerEligibilityAuthorities/provider'], {revision: 1});
  });
  test(`${adapter}: malformed authority fails closed on visibility change`, async () => {
    for (const initial of [{}, {revision: null}, {revision: '1'}, {revision: 0},
      {revision: -1}, {revision: 1.5}, {revision: Number.MAX_SAFE_INTEGER}]) {
      const h = harness(initial);
      await assert.rejects(change(h, profile, {...profile, publiclyVisible: false}), /AUTHORITY_UNAVAILABLE/);
      assert.deepEqual(h.records['providerEligibilityAuthorities/provider'], initial);
      assert.ok(h.events.every((event) => event.startsWith('read:')));
    }
  });
}

test('profile visibility recalculation reads authority before provider and audit writes', async () => {
  for (const initial of [undefined, {revision: 4, approvedOccasionIds: ['wedding']}]) {
    const h = harness(initial, {...profile, description: '', publiclyVisible: false});
    const result = await h.update({description: 'A complete public provider description.'});
    assert.equal(result.updated, true);
    assert.equal(h.records['providers/provider'].publiclyVisible, true);
    assert.deepEqual(h.records['providerEligibilityAuthorities/provider'], initial ?
      {...initial, revision: 5} : {revision: 1});
    assert.deepEqual(h.events, ['read:users/owner', 'read:providers/provider',
      'read:providerPaymentAccounts/provider', 'read:maintenanceControls/intake', 'read:providerEligibilityAuthorities/provider',
      'write:providerEligibilityAuthorities/provider', 'write:maintenanceControls/intake', 'write:providers/provider', 'write:audit/entry']);
  }
});

test('ordinary profile edits preserve revision, visibility, location, search and audit behavior', async () => {
  for (const initial of [undefined, {revision: 4}]) {
    for (const data of [{description: 'A new complete provider description.'}, {address: 'Updated Street'}]) {
      const h = harness(initial);
      await h.update(data);
      const updated = h.records['providers/provider'];
      assert.equal(updated.publiclyVisible, true);
      for (const [key, value] of Object.entries(data)) assert.equal(updated[key], value);
      assert.equal(updated.verificationStatus, 'approved');
      assert.ok(updated.searchTokens.includes('business'));
      if (data.address) assert.equal(updated.location, 'Ormoc City, Leyte');
      assert.deepEqual(h.records['providerEligibilityAuthorities/provider'], initial);
      assert.equal(h.records['audit/entry'].action, 'provider.business_profile_updated');
      const replay = await h.update(data);
      assert.equal(replay.updated, false);
    }
  }
});

test('malformed authority aborts profile visibility update without profile or audit writes', async () => {
  const before = {...profile, publiclyVisible: false};
  const h = harness({revision: 'bad'}, before);
  await assert.rejects(h.update({address: 'Updated Street'}), /AUTHORITY_UNAVAILABLE/);
  assert.deepEqual(h.records['providers/provider'], before);
  assert.deepEqual(h.records['providerEligibilityAuthorities/provider'], {revision: 'bad'});
  assert.equal(h.records['audit/entry'], undefined);
  assert.ok(h.events.every((event) => event.startsWith('read:')));
});
