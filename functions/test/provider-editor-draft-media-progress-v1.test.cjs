/** Real compiled handlers, optimistic in-memory transactions; no emulator/network. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {AsyncLocalStorage} = require('node:async_hooks');
const {createRequire} = require('node:module');
const https = require('firebase-functions/v2/https');
const {Timestamp} = require('firebase-admin/firestore');

const root = 'providerPackageEditorDrafts/draft';
const saveInput = (progress = {}, extra = {}) => ({
  editorSchemaVersion: 2, editorDraftId: 'draft', expectedRevision: 3,
  packageId: null, expectedPackageRevision: null, currentStep: 4,
  idempotencyKey: 'media_progress_request_001', progress, ...extra,
});
const progress = {name: 'Private draft', marketingAssetIds: ['b', 'a'], themes: [
  {editorThemeId: 'garden', name: 'Garden', description: '', assetIds: ['d', 'c']},
  {editorThemeId: 'classic', name: 'Classic', description: '', assetIds: ['e']},
]};

function fixture(options = {}) {
  const resources = new Map(); const deletionCalls = []; const faults = {};
  const records = new Map(); let serial = 0; let epoch = 0; let commits = 0;
  let hook; let lookups = 0;
  const transactionContext = new AsyncLocalStorage();
  const put = (p, value) => { records.set(p, value); epoch++; };
  function ref(p) { return {path: p, id: p.split('/').at(-1),
    collection: name => collection(p + '/' + name)}; }
  function collection(p, filters = [], max = Infinity, cursor = null, group = false) {
    return {path: p, filters, max, cursor, group,
      orderBy: () => collection(p,filters,max,cursor,group),
      startAfter: (...values) => collection(p,filters,max,values.length > 1 ?
        {expiry:values[0],path:values[1].path} : values[0],group),
      doc: id => ref(p + '/' + (id ?? 'allocated_' + ++serial)),
      where: (key, op, value) => collection(p, [...filters, [key, op, value]], max,cursor,group),
      limit: count => collection(p, filters, count,cursor,group)};
  }
  const snapshot = r => { const value = records.get(r.path); return {
    id: r.id, ref: r, exists: value !== undefined, data: () => value,
  }; };
  const db = {doc: ref, collection, collectionGroup: p => collection(p,[],Infinity,null,true), async runTransaction(fn) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const start = epoch; const writes = []; let writing = false;
      const tx = {async get(r) {
        assert.equal(writing, false, 'all Firestore reads precede writes');
        if (r.id) return snapshot(r);
        const docs = [...records].filter(([p, v]) =>
          (r.group ? p.split('/').at(-2) === r.path : p.startsWith(r.path + '/') && !p.slice(r.path.length + 1).includes('/')) &&
          (!r.cursor || (typeof r.cursor === 'object' ? v.expiresAtMs > r.cursor.expiry || v.expiresAtMs === r.cursor.expiry && p > r.cursor.path : p.slice(r.path.length+1) > r.cursor)) &&
          r.filters.every(([key, op, value]) => op === '==' ? v[key] === value :
            op === '>' ? v[key] > value : op === '!=' ? v[key] !== undefined && v[key] !== value :
            op === 'in' ? value.includes(v[key]) : v[key] <= value))
          .sort(([a,av],[b,bv])=>r.group ? av.expiresAtMs-bv.expiresAtMs || a.localeCompare(b) : a.localeCompare(b)).slice(0, r.max).map(([p]) => snapshot(ref(p)));
        return {docs, size: docs.length, empty: !docs.length};
      }};
      for (const mode of ['create', 'update', 'set', 'delete']) {
        tx[mode] = (r, data) => { writing = true; writes.push([mode, r, data]); };
      }
      let result;
      result = await transactionContext.run(true, () => fn(tx));
      if (hook && writes.length) { const run = hook; hook = undefined; await run(writes); }
      if (epoch !== start) continue;
      for (const [mode, r] of writes) {
        if (mode === 'create') assert.equal(records.has(r.path), false);
        if (mode === 'update') assert.equal(records.has(r.path), true);
      }
      for (const [mode, r, data] of writes) {
        if (mode === 'delete') records.delete(r.path);
        else records.set(r.path, mode === 'update' ? {...records.get(r.path), ...data} : data);
      }
      if (writes.length) { commits++; epoch++; }
      return result;
    }
    throw new Error('transaction retry limit');
  }};
  put('users/owner', {role: 'provider', providerId: 'provider', accountStatus: 'active',
    isActive: true, isBlocked: false});
  put('providers/provider', {ownerId: 'owner', verificationStatus: 'approved', isActive: true});
  put('contractPolicies/providerPackageV2', {revision: 1, effectiveEnvironment: 'demo-media',
    maxSpecificOccasions: 10, maxThemeImages: 4,
    featureGates: {packageEditorProgressWrites: true, packageEditorMediaWrites: true,
      packageEditorMediaCleanupWrites: options.cleanup === true, packageEditorMediaPromotionWrites: options.promotion === true}});
  put(root, {editorSchemaVersion: 2, ownerUid: 'owner', providerId: 'provider',
    mediaLifecycleVersion: 1, mediaCleanupPendingCount: 0,
    packageId: null, basePackageRevision: null, state: 'incomplete', revision: 3,
    progress: {themes: progress.themes.map(t => ({...t, assetIds: []}))}, currentStep: 4,
    completedPackageId: null, completedPackageRevision: null,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now()});
  put('providerPackageEditorQuotas/provider', {count: 1});
  function seed(id, kind = 'package', themeId = null, state = 'registered') {
    const publicId = `feasta/providers/owner/editor-drafts/draft/` +
      (kind === 'package' ? `package/${id}` : `themes/${themeId}/${id}`);
    const asset = {assetId: id, ownerUid: 'owner', providerId: 'provider', editorDraftId: 'draft',
      kind, themeId, cloudinaryPublicId: publicId, state: 'verified',
      cloudinaryAssetId: 'immutable_' + id, cloudinaryVersion: 123,
      url: `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.webp`};
    put(root + '/mediaUploadReservations/' + id, {...asset, state, registeredUrl: asset.url,
      canonicalProtection: {version:1,state:'draft_only',packageId:null,operationId:null},
      draftRevision: 3, issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000});
    if (state === 'registered') put(root + '/mediaAssets/' + id, asset);
    resources.set(publicId,{publicId,assetId:asset.cloudinaryAssetId,version:asset.cloudinaryVersion});
    return asset;
  }
  for (const id of ['a', 'b']) seed(id);
  for (const id of ['c', 'd']) seed(id, 'theme', 'garden');
  seed('e', 'theme', 'classic');
  function load(file, overrides = {}) {
    const filename = path.resolve(__dirname, '../lib/packages/' + file + '.js');
    const real = createRequire(filename); const module = {exports: {}};
    vm.runInThisContext('(function(module,exports,require,process){' +
      fs.readFileSync(filename, 'utf8') + '\n})', {filename})(module, module.exports,
      id => Object.hasOwn(overrides, id) ? overrides[id] : real(id),
      {env: {GCLOUD_PROJECT: 'demo-media'}});
    return module.exports;
  }
  const mocks = {
    'firebase-functions/v2/https': {...https, onCall: (_, handler) => handler},
    '../shared/firestore.js': {db},
    '../shared/auth.js': {requireAuth: r => r.auth},
    '../shared/authorization.js': {requireRole: async uid => {
      if (records.get('users/' + uid)?.role !== 'provider') throw Error('provider required');
    }},
    '../shared/rate-limit.js': {enforceCallableRateLimit: async () => {}},
    '../shared/maintenance.js': {requireMaintenanceOpen: async () => {}, recordMaintenanceAdmission: () => {}},
    '../shared/cloudinary.js': {cloudinarySecrets: [],
      lookupEditorDraftCleanupResourceV1: async publicId => {
        assert.equal(transactionContext.getStore(),undefined);
        if(faults.lookup) throw Error('LOOKUP_FAILED');
        return resources.get(publicId) ?? null;
      },
      deleteEditorDraftCleanupResourceV1: async (assetId,publicId) => {
        assert.equal(transactionContext.getStore(),undefined);
        if(faults.beforeDelete) await faults.beforeDelete();
        if(faults.deletion) throw Error('DELETE_FAILED');
        deletionCalls.push({assetId,publicId});
        if(resources.get(publicId)?.assetId === assetId) resources.delete(publicId);
        if(faults.afterDelete) await faults.afterDelete();
      },
      createEditorDraftUploadSignatureV1: scope => {
        assert.equal(transactionContext.getStore(), undefined); return {signature: 'mock', scope};
      },
      verifyEditorDraftCloudinaryAssetV1: async scope => {
        assert.equal(transactionContext.getStore(), undefined); lookups++;
        const asset = seedProof(scope);
        return {record: asset, url: asset.url,
          cloudinaryAssetId: asset.cloudinaryAssetId, cloudinaryVersion: asset.cloudinaryVersion};
      }},
  };
  function seedProof(scope) {
    const reservation = records.get(root + '/mediaUploadReservations/' + scope.assetId);
    return {...reservation, state: 'verified', url:
      `https://res.cloudinary.com/demo/image/upload/v123/${reservation.cloudinaryPublicId}.webp`};
  }
  const registration = load('provider-editor-draft-media-registration-v1', mocks);
  mocks['./provider-editor-draft-media-registration-v1.js'] = registration;
  const cleanup = load('editor-draft-media-cleanup-v1',mocks);
  mocks['./editor-draft-media-cleanup-v1.js'] = cleanup;
  const promotion = load('editor-draft-media-promotion-v1',mocks);
  const api = load('provider-package-editor-progress', mocks);
  const upload = load('provider-editor-draft-upload-v1', {...mocks,
    './provider-editor-draft-media-registration-v1.js': registration});
  const req = (data, uid = 'owner') => ({data, auth: {uid}, app: {appId: 'test'}});
  return {records, put, seed, db, req, api, upload, registration, cleanup, promotion, resources, deletionCalls, faults,
    hook: fn => { hook = fn; }, commits: () => commits, lookups: () => lookups,
    save: (p = progress, extra) => api.saveProviderPackageEditorDraft(req(saveInput(p, extra))),
    get: () => api.getProviderPackageEditorDraft(req({editorDraftId: 'draft'})),
    reserve: () => upload.prepareProviderEditorDraftUploadV1(req({editorDraftId: 'draft',
      expectedRevision: records.get(root).revision, kind: 'package', themeId: null})),
  };
}

test('verified references persist and recover in package and theme order', async () => {
  const f = fixture(); const saved = (await f.save()).draft;
  assert.deepEqual(saved.progress, progress); assert.equal(saved.revision, 4);
  const restored = (await f.get()).draft;
  assert.deepEqual(restored, saved);
  assert.deepEqual(restored.media.packageAssets.map(a => a.assetId), ['b', 'a']);
  assert.deepEqual(restored.media.themes.map(t => [t.themeId, t.assets.map(a => a.assetId)]),
    [['garden', ['d', 'c']], ['classic', ['e']]]);
  assert.equal(f.records.get(root).progress.marketingAssetIds[0], 'b');
  assert.equal(f.lookups(), 0);
});

test('media references survive revisions and immutable idempotent retries', async () => {
  const f = fixture(); const first = await f.save();
  assert.deepEqual(await f.save(), first); assert.equal(f.commits(), 1);
  const changed = {...progress, name: 'Updated draft'};
  const second = await f.save(changed, {expectedRevision: 4, idempotencyKey: 'next_media_request_002'});
  assert.equal(second.draft.revision, 5); assert.deepEqual(second.draft.progress, changed);
  assert.deepEqual(await f.save(), first); assert.equal(f.commits(), 2);
  assert.deepEqual((await f.get()).draft.progress, changed);
});

for (const [name, change] of Object.entries({
  'missing registry': f => f.records.delete(root + '/mediaAssets/a'),
  'unverified registry': f => f.put(root + '/mediaAssets/a', {...f.records.get(root + '/mediaAssets/a'), state: 'pending'}),
  'wrong provider': f => f.put(root + '/mediaAssets/a', {...f.records.get(root + '/mediaAssets/a'), providerId: 'other'}),
  'wrong draft': f => f.put(root + '/mediaAssets/a', {...f.records.get(root + '/mediaAssets/a'), editorDraftId: 'other'}),
  'wrong owner': f => f.put(root + '/mediaAssets/a', {...f.records.get(root + '/mediaAssets/a'), ownerUid: 'other'}),
  'missing reservation': f => f.records.delete(root + '/mediaUploadReservations/a'),
  'unconsumed reservation': f => f.put(root + '/mediaUploadReservations/a', {...f.records.get(root + '/mediaUploadReservations/a'), state: 'reserved'}),
  'cleanup pending': f => f.put(root + '/mediaUploadReservations/a', {...f.records.get(root + '/mediaUploadReservations/a'), state: 'cleanup_pending'}),
  'changed identity': f => f.put(root + '/mediaAssets/a', {...f.records.get(root + '/mediaAssets/a'), cloudinaryAssetId: 'replacement'}),
  'wrong URL': f => f.put(root + '/mediaAssets/a', {...f.records.get(root + '/mediaAssets/a'), url: 'https://example.com/private.jpg'}),
})) test(name + ' is rejected on save, recovery, list and operation replay', async () => {
  const f = fixture(); await f.save(); change(f);
  await assert.rejects(f.save(progress, {expectedRevision: 4, idempotencyKey: 'changed_request_key_02'}));
  await assert.rejects(f.get());
  await assert.rejects(f.api.listProviderPackageEditorDrafts(f.req({})));
  await assert.rejects(f.save());
  assert.equal(f.commits(), 1);
});

for (const [name, bad] of [
  ['duplicate package', {...progress, marketingAssetIds: ['a', 'a']}],
  ['cross-theme duplicate', {...progress, themes: [...progress.themes, {editorThemeId: 'new', name: '', description: '', assetIds: ['c']}]}],
  ['package/theme duplicate', {...progress, marketingAssetIds: ['c'], themes: progress.themes}],
  ['package/theme reassignment', {...progress, marketingAssetIds: ['c']}],
  ['wrong theme', {...progress, themes: [{...progress.themes[0], editorThemeId: 'other'}]}],
  ['malformed ID', {...progress, marketingAssetIds: ['../a']}],
  ['raw URL', {...progress, marketingAssetIds: ['https://example.com/a.jpg']}],
  ['client proof', {...progress, verified: true}],
  ['eight package limit', {...progress, marketingAssetIds: Array.from({length: 9}, (_, i) => 'a' + i)}],
  ['four theme limit', {...progress, themes: [{...progress.themes[0], assetIds: ['a', 'b', 'c', 'd', 'e']}]}],
  ['theme count limit', {...progress, themes: Array.from({length: 13}, (_, i) => ({editorThemeId: 't' + i, name: '', description: '', assetIds: []}))}],
]) test('rejects ' + name + ' without writes', async () => {
  const f = fixture(); await assert.rejects(f.save(bad)); assert.equal(f.commits(), 0);
});

test('stale revision and disabled media gate fail without writes', async () => {
  const f = fixture(); await assert.rejects(f.save(progress, {expectedRevision: 2}), e => e.details.reason === 'REVISION_CONFLICT');
  const policy = f.records.get('contractPolicies/providerPackageV2');
  f.put('contractPolicies/providerPackageV2', {...policy, featureGates: {...policy.featureGates, packageEditorMediaWrites: false}});
  await assert.rejects(f.save(), e => e.details.reason === 'FEATURE_DISABLED');
  assert.equal(f.commits(), 0);
});

test('current provider ownership and account state are reauthorized for recovery', async () => {
  const f = fixture(); await f.save();
  const profile = f.records.get('users/owner');
  f.put('users/owner', {...profile, isBlocked: true}); await assert.rejects(f.get());
  f.put('users/owner', profile); f.put('providers/provider', {ownerId: 'other', verificationStatus: 'approved', isActive: true});
  await assert.rejects(f.get()); assert.equal(f.commits(), 1);
});

test('draft owner mismatch and malformed persisted references cannot leak recovery data', async () => {
  const f = fixture();
  f.put(root, {...f.records.get(root), ownerUid: 'other'});
  await assert.rejects(f.get(), e => e.details.reason === 'RESOURCE_NOT_FOUND');
  f.put(root, {...f.records.get(root), ownerUid: 'owner', progress: {imageUrls: ['https://example.com/private.jpg']}});
  await assert.rejects(f.get()); assert.equal(f.commits(), 0);
});

test('non-media draft create/save/read/list behavior is retained', async () => {
  const f = fixture(); const saved = (await f.save({name: 'No images'})).draft;
  assert.equal(saved.media, undefined); assert.deepEqual((await f.get()).draft, saved);
  const listed = await f.api.listProviderPackageEditorDrafts(f.req({})); assert.equal(listed.drafts.length, 1);
  const created = await f.save({}, {editorDraftId: null, expectedRevision: 0, idempotencyKey: 'create_non_media_001'});
  assert.equal(created.draft.revision, 1); assert.equal(f.records.get('providerPackageEditorQuotas/provider').count, 2);
});

test('expired reservations recover capacity, consumed records remain protected audit', async () => {
  const f = fixture();
  for (let i = 0; i < 80; i++) {
    f.seed('expired_' + i, 'package', null, 'reserved');
    const p = root + '/mediaUploadReservations/expired_' + i;
    f.put(p, {...f.records.get(p), expiresAtMs: Date.now() - 1});
  }
  const result = await f.reserve(); assert.match(result.assetId, /^allocated_/);
  assert.equal(f.records.get(root + '/mediaUploadReservations/expired_0').state, 'reserved');
  assert.equal(f.records.get(root + '/mediaAssets/a').state, 'verified');
  assert.equal(f.records.get(root + '/mediaUploadReservations/a').state, 'registered');
  assert.equal(f.records.get(root + '/mediaUploadReservations/' + result.assetId).state, 'reserved');
});

test('concurrent final reservation slots cannot exceed active capacity', async () => {
  const f = fixture(); for (let i = 0; i < 55; i++) f.seed('live_' + i, 'package', null, 'reserved');
  const outcomes = await Promise.allSettled([f.reserve(), f.reserve()]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected')[0].reason.details.reason, 'EDITOR_DRAFT_MEDIA_LIMIT');
});

test('registration then save succeeds; save cannot race ahead of registration', async () => {
  const f = fixture(); f.seed('fresh', 'package', null, 'reserved');
  const input = {actorUid: 'owner', editorDraftId: 'draft', expectedRevision: 3,
    assetId: 'fresh', kind: 'package', themeId: null};
  const results = await Promise.allSettled([
    f.registration.registerEditorDraftMediaV1(input), f.save({marketingAssetIds: ['fresh']}),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  if (results[1].status === 'rejected') await f.save({marketingAssetIds: ['fresh']});
  assert.deepEqual((await f.get()).draft.media.packageAssets.map(a => a.assetId), ['fresh']);
});

test('cleanup/revocation racing admission aborts save on transaction retry', async () => {
  const f = fixture();
  f.hook(() => { const p = root + '/mediaUploadReservations/a';
    f.put(p, {...f.records.get(p), state: 'cleanup_pending'}); });
  await assert.rejects(f.save()); assert.equal(f.commits(), 0);
  assert.equal(f.records.get(root).revision, 3);
});

test('concurrent save and discard preserve registered assets and one saved revision', async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled([f.save(),
    f.api.discardProviderPackageEditorDraft(f.req({editorDraftId: 'draft', expectedRevision: 3,
      idempotencyKey: 'concurrent_discard_001'}))]);
  assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].status, 'rejected');
  assert.equal(f.records.get(root).revision, 4);
  assert.equal(f.records.get(root + '/mediaAssets/a').state, 'verified');
  assert.equal(f.commits(), 1);
});

test('completed draft and canonical records cannot be discarded through media recovery', async () => {
  const f = fixture(); const canonical = {imageUrls: ['protected-canonical-image']};
  f.put('packages/completed', canonical);
  f.put(root, {...f.records.get(root), state: 'completed', completedPackageId: 'completed'});
  await assert.rejects(f.api.discardProviderPackageEditorDraft(f.req({editorDraftId: 'draft', expectedRevision: 3,
    idempotencyKey: 'completed_discard_001'})));
  assert.equal(f.records.get('packages/completed'), canonical);
  assert.equal(f.records.get(root + '/mediaAssets/a').state, 'verified');
  assert.equal(f.commits(), 0);
});

test('discard refuses registered media and expired orphan evidence without deleting assets', async () => {
  for (const registered of [true, false]) {
    const f = fixture();
    if (!registered) {
      for (const p of [...f.records.keys()]) if (p.includes('/mediaAssets/')) f.records.delete(p);
      for (const [p, r] of f.records) if (p.includes('/mediaUploadReservations/')) f.put(p, {...r, state: 'reserved', expiresAtMs: Date.now() - 1});
    }
    await assert.rejects(f.api.discardProviderPackageEditorDraft(f.req({editorDraftId: 'draft', expectedRevision: 3,
      idempotencyKey: 'discard_media_key_001'})), e => e.details.reason === 'EDITOR_DRAFT_MEDIA_CLEANUP_REQUIRED');
    assert.equal(f.commits(), 0); assert.ok(f.records.has(root));
  }
});

test('media handlers remain outside deployment exports', () => {
  const index = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
  assert.doesNotMatch(index, /provider-editor-draft-upload-v1|registerEditorDraftMediaV1/);
});

const cleanupInput = (assetId = 'a', extra = {}) => ({actorUid:'owner',editorDraftId:'draft',expectedRevision:3,assetId,...extra});
const promotionInput = (extra = {}) => ({actorUid:'owner',editorDraftId:'draft',expectedRevision:4,idempotencyKey:'promotion_request_001',...extra});
const discardInput = {editorDraftId:'draft',expectedRevision:3,idempotencyKey:'cleanup_discard_key_001'};
function closeCapability(f,id='a') {
 const p=root+'/mediaUploadReservations/'+id,r=f.records.get(p);
 f.put(p,{...r,issuedAtMs:Date.now()-3*f.cleanup.CLEANUP_GRACE_MS,
  expiresAtMs:Date.now()-f.cleanup.CLEANUP_GRACE_MS-1000});
}
async function executeCleanup(f,id='a') {
 await f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput(id));
 return f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:id});
}
test('cleanup safely reconciles an expired unregistered upload by immutable identity',async()=>{
 const f=fixture({cleanup:true});f.seed('abandoned','package',null,'reserved');closeCapability(f,'abandoned');
 assert.equal((await executeCleanup(f,'abandoned')).state,'reconciled');
 assert.equal(f.records.get(root+'/mediaUploadReservations/abandoned').state,'retired');
 assert.equal(f.deletionCalls.length,1);assert.equal(f.deletionCalls[0].assetId,'immutable_abandoned');
 assert.equal(f.records.get(root).mediaCleanupPendingCount,0);
});
test('missing Cloudinary resource is reconciled only after trusted lookup',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);const r=f.records.get(root+'/mediaUploadReservations/a');
 f.resources.delete(r.cloudinaryPublicId);await executeCleanup(f);
 assert.equal(f.deletionCalls.length,0);assert.equal(f.records.get(root+'/mediaUploadReservations/a').state,'retired');
});
test('expiration alone never deletes media while delayed capability grace is open',async()=>{
 const f=fixture({cleanup:true});const r=f.records.get(root+'/mediaUploadReservations/a');
 f.put(root+'/mediaUploadReservations/a',{...r,expiresAtMs:Date.now()-1});
 assert.equal((await executeCleanup(f)).state,'waiting');assert.equal(f.deletionCalls.length,0);
 assert.equal(f.records.get(root+'/mediaUploadReservations/a').state,'cleanup_pending');
});
test('failed deletion retains durable retry state and succeeds on retry',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);f.faults.deletion=true;
 await assert.rejects(executeCleanup(f),/DELETE_FAILED/);
 const job=[...f.records].find(([p])=>p.startsWith('providerPackageEditorMediaCleanup/'))[1];
 assert.equal(job.state,'retry');assert.equal(f.records.get(root).mediaCleanupPendingCount,1);
 f.faults.deletion=false;assert.equal((await executeCleanup(f)).state,'reconciled');
 assert.equal(f.deletionCalls.length,1);assert.equal(f.records.get(root).mediaCleanupPendingCount,0);
});
test('lost deletion acknowledgement recovers from missing resource without second deletion',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);f.faults.afterDelete=()=>{throw Error('LOST_ACK');};
 await assert.rejects(executeCleanup(f),/LOST_ACK/);f.faults.afterDelete=null;
 await executeCleanup(f);assert.equal(f.deletionCalls.length,1);
 assert.equal(f.records.get(root).mediaCleanupPendingCount,0);
});
test('duplicate and concurrent cleanup requests consume one job and one quota count',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);
 const jobs=await Promise.all([f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput()),f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput())]);
 assert.deepEqual(jobs[0],jobs[1]);assert.equal(f.records.get(root).mediaCleanupPendingCount,1);
 await Promise.all([f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:'a'}),f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:'a'})]);
 assert.equal(f.deletionCalls.length,1);assert.equal(f.records.get(root).mediaCleanupPendingCount,0);
 assert.equal((await executeCleanup(f)).state,'reconciled');assert.equal(f.deletionCalls.length,1);
});
test('expired cleanup lease is recoverable after a process interruption',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);const {jobId}=await f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput());
 const p='providerPackageEditorMediaCleanup/'+jobId;
 f.put(p,{...f.records.get(p),state:'deleting',leaseToken:'old_worker',leaseUntilMs:Date.now()-1});
 await f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:'a'});
 assert.equal(f.records.get(p).state,'reconciled');assert.equal(f.deletionCalls.length,1);
});
test('registered active images cannot be scheduled for cleanup or deletion',async()=>{
 const f=fixture({cleanup:true});await f.save();closeCapability(f);
 await assert.rejects(f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput('a',{expectedRevision:4})),e=>e.details.reason==='EDITOR_DRAFT_MEDIA_IN_USE');
 assert.equal(f.deletionCalls.length,0);assert.deepEqual((await f.get()).draft.progress,progress);
});
for(const where of ['imageUrls','themeOptions']) test('canonical '+where+' prevents cleanup even on an unpublished package',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);const url=f.records.get(root+'/mediaAssets/a').url;
 f.put('packages/canonical',{providerId:'provider',isPublished:false,
  ...(where==='imageUrls'?{imageUrls:[url]}:{themeOptions:[{imageUrls:[url]}]})});
 await assert.rejects(executeCleanup(f));assert.equal(f.deletionCalls.length,0);
 assert.equal(f.records.get(root+'/mediaAssets/a').state,'verified');
});
test('published canonical media added before lease claim stops previously queued cleanup',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);await f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput());
 f.put('packages/published',{providerId:'provider',isPublished:true,imageUrl:f.records.get(root+'/mediaAssets/a').url});
 await assert.rejects(f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:'a'}));assert.equal(f.deletionCalls.length,0);
});
test('removed registered image is retired without disturbing remaining ordered recovery',async()=>{
 const f=fixture({cleanup:true});await f.save();
 await f.save({...progress,marketingAssetIds:['b']},{expectedRevision:4,idempotencyKey:'remove_image_request_01'});
 closeCapability(f);await f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput('a',{expectedRevision:5}));
 await f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:'a'});
 assert.deepEqual((await f.get()).draft.media.packageAssets.map(a=>a.assetId),['b']);
 assert.equal(f.deletionCalls.length,1);
});
test('registration cannot admit a reservation frozen by cleanup',async()=>{
 const f=fixture({cleanup:true});f.seed('unregistered','package',null,'reserved');closeCapability(f,'unregistered');
 await f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput('unregistered'));
 await assert.rejects(f.registration.registerEditorDraftMediaV1({...cleanupInput('unregistered'),kind:'package',themeId:null}));
 assert.equal(f.records.has(root+'/mediaAssets/unregistered'),false);assert.equal(f.lookups(),0);
});
test('saving a frozen cleanup image fails without incrementing revision',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);await f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput());
 await assert.rejects(f.save());assert.equal(f.records.get(root).revision,3);
});
for(const extra of [{actorUid:'other'},{editorDraftId:'other'},{assetId:'other'},{expectedRevision:2}]) test('cleanup rejects wrong scope '+JSON.stringify(extra),async()=>{
 const f=fixture({cleanup:true});closeCapability(f);
 await assert.rejects(f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput('a',extra)));
 assert.equal(f.deletionCalls.length,0);assert.equal(f.records.get(root+'/mediaAssets/a').state,'verified');
});
test('discard reconciles registered media in bounded batches and releases quota exactly once',async()=>{
 const f=fixture({cleanup:true});for(const id of ['a','b','c','d','e'])closeCapability(f,id);
 let result;for(let i=0;i<6;i++){result=await f.api.discardProviderPackageEditorDraft(f.req(discardInput));if(result.discarded)break;assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,1);}
 assert.equal(result.discarded,true);assert.equal(f.records.get(root).state,'discarded');
 assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,0);
 assert.equal(f.deletionCalls.length,5);assert.ok(f.records.has(root+'/mediaUploadReservations/a'));
 assert.equal((await f.api.discardProviderPackageEditorDraft(f.req(discardInput))).discarded,true);
 assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,0);
 await assert.rejects(f.registration.registerEditorDraftMediaV1({...cleanupInput(),kind:'package',themeId:null}));
});
test('discard failure retains quota and pending operation for a successful retry',async()=>{
 const f=fixture({cleanup:true});for(const id of ['a','b','c','d','e'])closeCapability(f,id);
 f.faults.deletion=true;await assert.rejects(f.api.discardProviderPackageEditorDraft(f.req(discardInput)));
 assert.equal(f.records.get(root).state,'discarding');assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,1);
 f.faults.deletion=false;let result;for(let i=0;i<6;i++){result=await f.api.discardProviderPackageEditorDraft(f.req(discardInput));if(result.discarded)break;}
 assert.equal(result.discarded,true);assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,0);
});
for(const change of [
 r=>({...r,canonicalProtection:undefined}),
 r=>({...r,canonicalProtection:{version:1,state:'canonical',packageId:'canonical',operationId:'operation'}}),
 r=>({...r,canonicalProtection:{version:1,state:'promotion_pending',packageId:'canonical',operationId:'operation'}}),
 r=>({...r,cloudinaryPublicId:'feasta/providers/other/editor-drafts/draft/package/a'}),
]) test('ambiguous/protected evidence never authorizes deletion '+change.toString(),async()=>{
 const f=fixture({cleanup:true});closeCapability(f);const p=root+'/mediaUploadReservations/a';f.put(p,change(f.records.get(p)));
 await assert.rejects(executeCleanup(f));assert.equal(f.deletionCalls.length,0);
});
test('canonical inventory overflow fails closed without unbounded scanning',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);for(let i=0;i<101;i++)f.put('packages/p'+i,{providerId:'provider',imageUrls:[]});
 await assert.rejects(executeCleanup(f),e=>e.details.reason==='MEDIA_REFERENCE_RECONCILIATION_REQUIRED');assert.equal(f.deletionCalls.length,0);
});
test('lookup failures and resource replacement never become missing-asset success',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);f.faults.lookup=true;
 await assert.rejects(executeCleanup(f),/LOOKUP_FAILED/);f.faults.lookup=false;
 const r=f.records.get(root+'/mediaUploadReservations/a');f.resources.set(r.cloudinaryPublicId,{publicId:r.cloudinaryPublicId,assetId:'replacement',version:124});
 await assert.rejects(executeCleanup(f));assert.equal(f.deletionCalls.length,0);assert.equal(f.records.get(root).mediaCleanupPendingCount,1);
});
test('promotion plan preserves ordering, immutable identities and operation-scoped target paths',async()=>{
 const f=fixture({cleanup:true,promotion:true});await f.save();const input=promotionInput();
 const result=await f.promotion.prepareEditorDraftMediaPromotionV1(input);
 const op=f.records.get('providerPackageEditorMediaPromotions/'+result.operationId);
 assert.deepEqual(op.media.packageAssets.map(a=>a.assetId),['b','a']);
 assert.deepEqual(op.media.themes.map(t=>[t.themeId,t.assets.map(a=>a.assetId)]),[['garden',['d','c']],['classic',['e']]]);
 assert.ok(op.plan.every(p=>p.overwrite===false&&p.sourceAssetId==='immutable_'+p.assetId&&p.sourceVersion===123));
 assert.ok(op.plan.every(p=>p.targetPublicId.includes('/packages/'+result.packageId+'/promotions/'+result.operationId+'/')));
 assert.deepEqual(await f.promotion.prepareEditorDraftMediaPromotionV1(input),result);
 assert.deepEqual(await f.promotion.prepareEditorDraftMediaPromotionV1({idempotencyKey:input.idempotencyKey,
  expectedRevision:input.expectedRevision,editorDraftId:input.editorDraftId,actorUid:input.actorUid}),result);
 assert.equal(f.records.has('packages/'+result.packageId),false);assert.equal(f.deletionCalls.length,0);
 await assert.rejects(f.promotion.prepareEditorDraftMediaPromotionV1(promotionInput({idempotencyKey:'another_promotion_key_01'})));
 await assert.rejects(f.save(progress,{expectedRevision:4,idempotencyKey:'save_during_promotion_01'}));
 await assert.rejects(f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput('a',{expectedRevision:4})));
});
test('untouched promotion cancellation is recoverable and cannot cancel a copying operation',async()=>{
 const f=fixture({promotion:true});await f.save();const input=promotionInput();const result=await f.promotion.prepareEditorDraftMediaPromotionV1(input);
 assert.equal((await f.promotion.cancelEditorDraftMediaPromotionV1(input)).state,'cancelled');
 assert.equal((await f.promotion.cancelEditorDraftMediaPromotionV1(input)).state,'cancelled');
 assert.deepEqual((await f.get()).draft.progress,progress);assert.equal(f.records.get(root).mediaPromotionOperationId,null);
 const f2=fixture({promotion:true});await f2.save();const second=await f2.promotion.prepareEditorDraftMediaPromotionV1(input);
 const p='providerPackageEditorMediaPromotions/'+second.operationId;f2.put(p,{...f2.records.get(p),state:'copying'});
 await assert.rejects(f2.promotion.cancelEditorDraftMediaPromotionV1(input));
 assert.equal(f2.records.get(root+'/mediaUploadReservations/a').canonicalProtection.state,'promotion_pending');
});
test('promotion idempotency key conflicts across drafts and source identity changes fail closed',async()=>{
 const f=fixture({promotion:true});await f.save();const input=promotionInput();await f.promotion.prepareEditorDraftMediaPromotionV1(input);
 await assert.rejects(f.promotion.prepareEditorDraftMediaPromotionV1({...input,editorDraftId:'other'}));
 const p=root+'/mediaUploadReservations/a';f.put(p,{...f.records.get(p),cloudinaryVersion:999});
 await assert.rejects(f.promotion.prepareEditorDraftMediaPromotionV1(input));assert.equal(f.deletionCalls.length,0);
});
test('cleanup and promotion modules remain absent from deployment exports',()=>{
 const index=fs.readFileSync(path.resolve(__dirname,'../src/index.ts'),'utf8');
 assert.doesNotMatch(index,/editor-draft-media-cleanup-v1|editor-draft-media-promotion-v1/);
});

test('failed final Firestore commit after deletion is recoverable without double accounting',async()=>{
 const f=fixture({cleanup:true});closeCapability(f);
 f.faults.afterDelete=()=>{f.hook(()=>{throw Error('FINAL_COMMIT_FAILED');});};
 await assert.rejects(executeCleanup(f),/FINAL_COMMIT_FAILED/);
 assert.equal(f.records.get(root).mediaCleanupPendingCount,1);
 f.faults.afterDelete=null;await executeCleanup(f);
 assert.equal(f.deletionCalls.length,1);assert.equal(f.records.get(root).mediaCleanupPendingCount,0);
});
test('reconciliation of delayed orphan arrival works after a discarded parent tombstone',async()=>{
 const f=fixture({cleanup:true});for(const id of ['a','b','c','d','e'])closeCapability(f,id);
 f.seed('late','package',null,'reserved');closeCapability(f,'late');
 const r=f.records.get(root+'/mediaUploadReservations/late');f.resources.delete(r.cloudinaryPublicId);
 let result;for(let i=0;i<9;i++){result=await f.api.discardProviderPackageEditorDraft(f.req(discardInput));if(result.discarded)break;}
 assert.equal(result.discarded,true);const jobEntry=[...f.records].find(([p,v])=>p.startsWith('providerPackageEditorMediaCleanup/')&&v.assetId==='late');
 f.put(jobEntry[0],{...jobEntry[1],nextReconcileAtMs:Date.now()-1});
 f.resources.set(r.cloudinaryPublicId,{publicId:r.cloudinaryPublicId,assetId:'delayed_uploaded_asset',version:123});
 const count=f.deletionCalls.length;
 await f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:'late'});
 assert.equal(f.deletionCalls.length,count+1);assert.equal(f.records.get(root).state,'discarded');
 assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,0);
});
test('malformed inventory state is detected during final paginated discard audit',async()=>{
 const f=fixture({cleanup:true});for(const id of ['a','b','c','d','e'])closeCapability(f,id);
 const p=root+'/mediaUploadReservations/unknown';f.put(p,{ownerUid:'owner',providerId:'provider',editorDraftId:'draft',assetId:'unknown'});
 let blocked=false;for(let i=0;i<9;i++){try{const result=await f.api.discardProviderPackageEditorDraft(f.req(discardInput));assert.equal(result.discarded,false);}catch{blocked=true;break;}}
 assert.equal(blocked,true);assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,1);
 assert.equal(f.records.get(root).state,'discarding');assert.ok(f.records.has(p));
});
test('tampered cleanup deadline cannot bypass capability quarantine',async()=>{
 const f=fixture({cleanup:true});const {jobId}=await f.cleanup.scheduleEditorDraftMediaCleanupV1(cleanupInput());
 const p='providerPackageEditorMediaCleanup/'+jobId;f.put(p,{...f.records.get(p),notBeforeMs:Date.now()-1});
 await assert.rejects(f.cleanup.runEditorDraftMediaCleanupV1({editorDraftId:'draft',assetId:'a'}));assert.equal(f.deletionCalls.length,0);
});
test('legacy drafts without an audited lifecycle marker fail closed without starting discard',async()=>{
 const f=fixture({cleanup:true});f.put(root,{...f.records.get(root),mediaLifecycleVersion:undefined});
 await assert.rejects(f.api.discardProviderPackageEditorDraft(f.req(discardInput)));
 assert.equal(f.records.get(root).state,'incomplete');assert.equal(f.deletionCalls.length,0);
 assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,1);
});
test('promotion retry refuses an already occupied canonical package target',async()=>{
 const f=fixture({promotion:true});await f.save();const input=promotionInput();const result=await f.promotion.prepareEditorDraftMediaPromotionV1(input);
 f.put('packages/'+result.packageId,{providerId:'provider',imageUrls:[]});
 await assert.rejects(f.promotion.prepareEditorDraftMediaPromotionV1(input),e=>e.details.reason==='MEDIA_PROMOTION_CONFLICT');
 assert.equal(f.records.get(root+'/mediaUploadReservations/a').canonicalProtection.state,'promotion_pending');
});

test('bounded trusted discovery and outbox drain clean abandoned uploads without browser assistance',async()=>{
 const f=fixture({cleanup:true});for(let i=0;i<7;i++){f.seed('orphan_'+i,'package',null,'reserved');closeCapability(f,'orphan_'+i);}
 const queued=await f.cleanup.reconcileExpiredEditorDraftMediaV1();assert.equal(queued.length,4);assert.ok(queued.every(r=>r.state==='queued'));
 const drained=await f.cleanup.drainEditorDraftMediaCleanupV1();assert.equal(drained.length,4);assert.ok(drained.every(r=>r.state==='reconciled'));
 assert.equal(f.deletionCalls.length,4);
 assert.equal((await f.cleanup.reconcileExpiredEditorDraftMediaV1()).length,3);
 await f.cleanup.drainEditorDraftMediaCleanupV1();assert.equal(f.deletionCalls.length,7);
 assert.equal(f.records.get(root).mediaCleanupPendingCount,0);
});

test('invalid abandoned reservations cannot starve later bounded discovery pages',async()=>{
 const f=fixture({cleanup:true});for(let i=0;i<5;i++){const id='candidate_'+i;f.seed(id,'package',null,'reserved');closeCapability(f,id);if(i<4){const p=root+'/mediaUploadReservations/'+id;f.put(p,{...f.records.get(p),canonicalProtection:undefined});}}
 assert.ok((await f.cleanup.reconcileExpiredEditorDraftMediaV1()).every(r=>r.state==='review_required'));
 assert.deepEqual((await f.cleanup.reconcileExpiredEditorDraftMediaV1()).map(r=>r.state),['queued']);
 await f.cleanup.drainEditorDraftMediaCleanupV1();assert.equal(f.deletionCalls.length,1);
});

test('trusted outbox worker completes discard and quota release after the browser disconnects',async()=>{
 const f=fixture({cleanup:true});for(const id of ['a','b','c','d','e'])closeCapability(f,id);
 const initial=await f.api.discardProviderPackageEditorDraft(f.req(discardInput));assert.equal(initial.cleanupPending,true);
 for(let i=0;i<8&&f.records.get(root).state!=='discarded';i++) {
  f.put(root,{...f.records.get(root),discardNextAuditAtMs:Date.now()-1});
  await f.cleanup.drainEditorDraftMediaCleanupV1();
 }
 assert.equal(f.records.get(root).state,'discarded');assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,0);
 assert.equal(f.deletionCalls.length,5);
});
