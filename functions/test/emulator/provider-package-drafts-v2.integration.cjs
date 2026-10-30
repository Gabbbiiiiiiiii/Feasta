'use strict';
const assert = require('node:assert/strict');
const {test, before, beforeEach} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const projectId = process.env.GCLOUD_PROJECT;
if (!/^demo-[a-z0-9-]+$/.test(projectId || '') ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '')) {
  throw new Error('EMULATOR_ONLY: demo project and loopback Auth/Firestore required');
}
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.FEASTA_V2_DRAFT_DEMO_ENABLED = 'true';
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');
initializeApp({projectId});
const db = getFirestore();
function load(file, overrides = {}) {
  const filename = path.resolve(__dirname, '../../lib/packages/' + file + '.js');
  const realRequire = createRequire(filename);
  const exports = {};
  vm.runInThisContext('(function(exports,require,module){' + fs.readFileSync(filename, 'utf8') + '\n})', {filename})(
    exports, (name) => Object.hasOwn(overrides, name) ? overrides[name] : name === 'firebase-functions/v2/https' ?
      {...realRequire(name), onCall: (_opts, handler) => handler} : realRequire(name), {exports});
  return exports;
}
const api = load('provider-package-drafts-v2');
const progressApi = load('provider-package-editor-progress');
const legacyUpdate = load('update-provider-package').updateProviderPackage;
const legacyPublish = load('publish-provider-package').publishProviderPackage;
const seed = `stage_d_${Date.now()}`;
const uid = seed + '_owner', other = seed + '_other';
const providerId = seed + '_provider';
let serial = 0;
const key = () => seed + '_key_' + (++serial);
const req = (data, actor = uid) => ({auth: {uid: actor, token: {}}, app: {appId: 'emulator'},
  rawRequest: {headers: {}, ip: '127.0.0.1'}, data});
const input = (extra = {}) => ({sharedContractVersion: 2, idempotencyKey: key(),
  name: 'Catering draft', description: 'A complete catering description.', serviceCategoryCode: 'catering_service',
  occasionSchemaVersion: 2, occasionScope: 'specific', occasionIds: ['birthday', 'wedding'],
  offerSchemaVersion: 2, pricingModel: 'per_pax', price: 100.25,
  serviceOptions: {drop_off: {price: 100.25, includedServices: ['Delivery'], equipmentInclusions: ['Warmers']}},
  themeOptions: [], paymentPolicy: 'full_payment', depositPercentage: 100,
  minimumGuests: 10, maximumGuests: 50, imageUrl: '', imageUrls: [],
  foodInclusions: ['Main course'], serviceInclusions: [], decorInclusions: [], furnitureInclusions: [], ...extra});
const create = (data) => api.createProviderPackageV2(req(data));
const update = (data, actor) => api.updateProviderPackageV2(req(data, actor));
const reason = (promise, expected) => assert.rejects(promise, e => e.details?.reason === expected);
const code = (promise, expected) => assert.rejects(promise, e => e.code === expected);
let first;
before(async () => {
  for (const actor of [uid, other]) {
    const pid = actor === uid ? providerId : seed + '_other_provider';
    await getAuth().createUser({uid: actor});
    await db.doc('users/' + actor).set({role: 'provider', providerId: pid, accountStatus: 'active', isActive: true, isBlocked: false});
    await db.doc('providers/' + pid).set({ownerId: actor, verificationStatus: 'approved', isActive: true,
      eventTypesSupported: ['birthday'], providerServiceType: 'catering', serviceCategories: ['catering_service'], minGuestsPerEvent: 1, maxGuestsPerEvent: 100});
  }
  await db.doc('contractPolicies/providerPackageV2').set({revision: 1, effectiveEnvironment: projectId,
    maxSpecificOccasions: 10, maxThemeImages: 4,
    featureGates: {packageDraftWrites: true, packageEditorProgressWrites: true}});
  await db.doc('maintenanceControls/intake').set({schemaVersion: 1, revision: 1, intake: false, publication: false});
  await db.doc('serviceCategories/catering_service').set({code: 'catering_service', name: 'Catering', serviceType: 'catering', status: 'active'});
  await db.doc('occasionCatalog/current').set({revision: 7, activationState: 'stable'});
  await db.doc('providerEligibilityAuthorities/' + providerId).set({revision: 3,
    approvedOccasionIds: ['birthday', 'wedding'], approvedCategoryCodes: ['catering_service']});
  for (const [index, id] of ['birthday', 'wedding'].entries()) {
    await db.doc('occasions/' + id).set({id, label: id, active: true, moderationState: 'approved',
      sortOrder: index, revision: 1, applicableServiceCategoryCodes: ['catering_service']});
  }
});
// Each independent scenario receives its own request budget. This cleanup is
// guarded above and deletes only this test actor's emulator rate bucket.
beforeEach(async () => {
  const subjectHash = require('node:crypto').createHash('sha256').update('user:' + uid).digest('hex');
  const buckets = await db.collection('rateLimits').where('subjectHash', '==', subjectHash).get();
  for (const doc of buckets.docs) if (['packages.v2Draft.create', 'packages.v2Draft.publish'].includes(doc.data().scope)) {
    await doc.ref.delete();
  }
});
test('create/replay writes one actual private package with authoritative V2 fields', async () => {
  const data = input(); first = await create(data);
  assert.deepEqual(await create(data), first);
  const stored = (await db.doc('packages/' + first.packageId).get()).data();
  assert.equal(stored.revision, 1); assert.equal(stored.status, 'draft');
  for (const field of ['isActive', 'isPublished', 'providerPubliclyVisible']) assert.equal(stored[field], false);
  assert.equal(stored.publishedAt, null); assert.equal(stored.providerId, providerId);
  assert.deepEqual(stored.occasionMatchIds, ['birthday', 'wedding']);
  assert.equal(stored.occasionCatalogRevision, 7); assert.equal(stored.providerEligibilityRevision, 3);
  assert.deepEqual(stored.serviceOptions.drop_off.equipmentInclusions, ['Warmers']);
  await reason(create({...data, name: 'changed'}), 'IDEMPOTENCY_CONFLICT');
});
test('private food-choice groups are validated, persisted and cleared on explicit update', async () => {
  const groups = [{id: 'main', title: 'Main dish', selectionCount: 1, options: [
    {id: 'chicken', name: 'Chicken Afritada'}, {id: 'pork', name: 'Pork Menudo'},
    {id: 'fish', name: 'Sweet and Sour Fish'}]}];
  const created = await create(input({foodChoiceGroups: groups}));
  const ref = db.doc('packages/' + created.packageId);
  assert.deepEqual((await ref.get()).data().foodChoiceGroups, groups);
  for (const invalid of [[{...groups[0], selectionCount: 4}],
    [{...groups[0], options: [{id: 'a', name: 'Same'}, {id: 'b', name: 'same'}]}],
    [{...groups[0], title: ''}]]) {
    await reason(create(input({foodChoiceGroups: invalid})), 'INVALID_FOOD_CHOICE_GROUP');
  }
  const updated = await update(input({packageId: created.packageId, expectedRevision: 1,
    foodChoiceGroups: groups}));
  assert.equal(updated.packageRevision, 2);
  await update(input({packageId: created.packageId, expectedRevision: 2}));
  assert.equal(Object.hasOwn((await ref.get()).data(), 'foodChoiceGroups'), false);
});
test('update Fixed Bundle/Fits All, replay, stale revision and concurrent writes', async () => {
  const data = input({packageId: first.packageId, expectedRevision: 1, pricingModel: 'per_bundle',
    occasionScope: 'all', occasionIds: []});
  const result = await update(data); assert.equal(result.packageRevision, 2);
  assert.deepEqual(await update(data), result);
  await reason(update({...data, idempotencyKey: key()}), 'REVISION_CONFLICT');
  const concurrent = await Promise.allSettled([1, 2].map(() => update(input({packageId: first.packageId, expectedRevision: 2}))));
  assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1);
});
test('reject invalid pricing, selection, authority and server-owned claims without writing', async () => {
  const before = (await db.collection('packages').get()).size;
  for (const extra of [{price: 0}, {price: 100.251}, {price: 999}, {serviceOptions: {}},
    {pricingModel: 'bad'}, {minimumGuests: 51, maximumGuests: 50}]) await code(create(input(extra)), 'invalid-argument');
  for (const extra of [{occasionIds: []}, {occasionIds: ['birthday', 'birthday']},
    {occasionScope: 'all', occasionIds: ['birthday']}, {occasionIds: ['missing']}]) await code(create(input(extra)), 'invalid-argument');
  await code(create(input({providerId: 'forged'})), 'invalid-argument');
  await code(create(input({revision: 99})), 'invalid-argument');
  await db.doc('providerEligibilityAuthorities/' + providerId).update({approvedOccasionIds: ['birthday']});
  await reason(create(input()), 'PROVIDER_OCCASION_INELIGIBLE');
  await reason(create(input({occasionScope: 'all', occasionIds: []})), 'UNIVERSAL_REVALIDATION_REQUIRED');
  await db.doc('providerEligibilityAuthorities/' + providerId).update({approvedOccasionIds: ['birthday', 'wedding']});
  await db.doc('occasionCatalog/current').update({activationState: 'transitioning'});
  await reason(create(input()), 'CONFIG_UNAVAILABLE');
  await db.doc('occasionCatalog/current').update({activationState: 'stable'});
  assert.equal((await db.collection('packages').get()).size, before);
});
test('ownership, account, gate, maintenance and media checks fail closed', async () => {
  await code(update(input({packageId: first.packageId, expectedRevision: 3}), other), 'permission-denied');
  await code(create(input({imageUrl: 'https://example.invalid/foreign.jpg', imageUrls: ['https://example.invalid/foreign.jpg']})), 'permission-denied');
  await db.doc('users/' + uid).update({isBlocked: true});
  await code(create(input()), 'permission-denied');
  await db.doc('users/' + uid).update({isBlocked: false});
  await db.doc('contractPolicies/providerPackageV2').update({'featureGates.packageDraftWrites': false});
  await reason(create(input()), 'FEATURE_DISABLED');
  await db.doc('contractPolicies/providerPackageV2').update({'featureGates.packageDraftWrites': true});
  await db.doc('maintenanceControls/intake').update({intake: true, publication: true});
  await reason(create(input()), 'MAINTENANCE_PAUSED');
  await db.doc('maintenanceControls/intake').update({intake: false, publication: false});
});
test('atomic completion preserves progress, releases quota, and cannot create duplicates', async () => {
  const progress = {name: 'Progress package', description: 'Completed catering progress.', serviceCategoryCode: 'catering_service',
    occasion: {occasionSchemaVersion: 2, occasionScope: 'all', occasionIds: []}, pricingModel: 'per_bundle',
    minimumGuestsText: '10', maximumGuestsText: '50', paymentPolicy: 'full_payment', depositPercentageText: '100',
    tiers: {drop_off: {enabled: true, priceText: '100.25', includedServices: ['Delivery'],
      decorInclusions: [], furnitureInclusions: [], equipmentInclusions: []}},
    foodChoiceGroups: [{id: 'main', title: 'Main dish', selectionCount: 1,
      options: [{id: 'a', name: 'Chicken'}, {id: 'b', name: 'Pork'}, {id: 'c', name: 'Fish'}]}]};
  const saved = (await progressApi.saveProviderPackageEditorDraft(req({editorDraftId: null, expectedRevision: 0,
    packageId: null, expectedPackageRevision: null, editorSchemaVersion: 2, currentStep: 4, progress, idempotencyKey: key()}))).draft;
  const data = {editorDraftId: saved.editorDraftId, expectedRevision: 1, expectedPackageRevision: null, idempotencyKey: key()};
  const calls = await Promise.allSettled([1,2].map(() => api.completeProviderPackageEditorDraft(req(data))));
  assert.equal(calls.filter(x => x.status === 'fulfilled').length, 2);
  const result = calls[0].value; assert.deepEqual(calls[1].value, result);
  const completed = (await progressApi.getProviderPackageEditorDraft(req({editorDraftId: saved.editorDraftId}))).draft;
  assert.deepEqual(completed.progress, progress); assert.equal(completed.state, 'completed');
  assert.equal(completed.completedPackageId, result.packageId);
  assert.deepEqual((await db.doc('packages/' + result.packageId).get()).data().foodChoiceGroups, progress.foodChoiceGroups);
  assert.equal((await db.doc('providerPackageEditorQuotas/' + providerId).get()).data().count, 0);
  assert.equal((await progressApi.listProviderPackageEditorDrafts(req({}))).drafts.length, 0);
  await reason(api.completeProviderPackageEditorDraft(req({...data, idempotencyKey: key()})), 'EDITOR_DRAFT_COMPLETED');
});
test('legacy writer and publisher reject V2; V2 writer refuses legacy migration', async () => {
  const data = input(); const {sharedContractVersion, idempotencyKey, occasionSchemaVersion, occasionScope, occasionIds,
    offerSchemaVersion, ...legacy} = data;
  legacy.serviceOptions = {drop_off: {price: 100.25, includedServices: ['Delivery']}};
  legacy.eventType = 'birthday'; legacy.packageId = first.packageId;
  await reason(legacyUpdate(req(legacy)), 'CLIENT_UPGRADE_REQUIRED');
  await code(legacyPublish(req({packageId: first.packageId})), 'failed-precondition');
  const id = seed + '_legacy';
  await db.doc('packages/' + id).set({providerId, status: 'draft', name: 'Legacy', eventType: 'birthday'});
  await reason(update(input({packageId: id, expectedRevision: 1})), 'CLIENT_UPGRADE_REQUIRED');
  assert.equal((await db.doc('packages/' + id).get()).data().name, 'Legacy');
});

test('failed completion leaves recoverable progress and quota unchanged', async () => {
  const saved = (await progressApi.saveProviderPackageEditorDraft(req({editorDraftId: null, expectedRevision: 0,
    packageId: null, expectedPackageRevision: null, editorSchemaVersion: 2, currentStep: 0,
    progress: {name: 'Unfinished'}, idempotencyKey: key()}))).draft;
  const count = (await db.collection('packages').get()).size;
  await code(api.completeProviderPackageEditorDraft(req({editorDraftId: saved.editorDraftId,
    expectedRevision: 1, expectedPackageRevision: null, idempotencyKey: key()})), 'invalid-argument');
  const loaded = (await progressApi.getProviderPackageEditorDraft(req({editorDraftId: saved.editorDraftId}))).draft;
  assert.equal(loaded.state, 'incomplete'); assert.equal(loaded.revision, 1);
  assert.deepEqual(loaded.progress, {name: 'Unfinished'});
  assert.equal((await db.collection('packages').get()).size, count);
  assert.equal((await db.doc('providerPackageEditorQuotas/' + providerId).get()).data().count, 1);
});
test('legacy creation and editing still work; all existing tiers persist in V2', async () => {
  const {sharedContractVersion, idempotencyKey, occasionSchemaVersion, occasionScope,
    occasionIds, offerSchemaVersion, pricingModel, ...legacy} = input();
  legacy.eventType = 'birthday';
  legacy.serviceOptions = {drop_off: {price: 100.25, includedServices: ['Delivery']}};
  const result = await load('create-provider-package').createProviderPackage(req(legacy));
  await legacyUpdate(req({...legacy, packageId: result.packageId, name: 'Edited legacy'}));
  const stored = (await db.doc('packages/' + result.packageId).get()).data();
  assert.equal(stored.name, 'Edited legacy'); assert.equal(stored.occasionSchemaVersion, undefined);
  const options = Object.fromEntries(['drop_off', 'buffet_setup', 'full_service'].map((tier, i) =>
    [tier, {price: 100.25 + i, includedServices: [tier], decorInclusions: ['Table decor']} ]));
  const v2 = await create(input({serviceOptions: options}));
  assert.deepEqual((await db.doc('packages/' + v2.packageId).get()).data().serviceOptions, options);
  await api.createProviderPackageV2({...req(input()), app: undefined});
  await getAuth().updateUser(uid, {disabled: true});
  await code(create(input()), 'permission-denied');
  await getAuth().updateUser(uid, {disabled: false});
});

test('V2 full replacement clears omitted optional fields without changing creation metadata', async () => {
  const original = await create(input({equipmentInclusions: ['Old shared equipment']}));
  const before = (await db.doc('packages/' + original.packageId).get()).data();
  const data = input({packageId: original.packageId, expectedRevision: 1});
  delete data.pricingModel; delete data.imageUrls;
  await update(data);
  const stored = (await db.doc('packages/' + original.packageId).get()).data();
  for (const field of ['pricingModel', 'equipmentInclusions', 'imageUrls']) assert.equal(Object.hasOwn(stored, field), false);
  assert.deepEqual(stored.createdAt, before.createdAt); assert.equal(stored.createdBy, uid);
});

test('creation and completion share the existing 20-per-hour creation budget', async () => {
  for (let i = 0; i < 20; i++) await code(create(input({price: 0})), 'invalid-argument');
  await code(create(input()), 'resource-exhausted');
  await code(api.completeProviderPackageEditorDraft(req({editorDraftId: 'missing', expectedRevision: 1,
    expectedPackageRevision: null, idempotencyKey: key()})), 'resource-exhausted');
});


// Exercise real parsers, authorization, media URL ownership checks and Firestore
// transactions. Only the external Cloudinary resource-verification boundary is
// stubbed. A wrapper also counts verifier entry, even for URLs with no API call.
function mediaHarness(onCloud = async () => {}) {
  const calls = {verifier: 0, cloud: 0};
  const domain = load('package-domain', {'../shared/cloudinary.js': {
    verifyProviderServiceImage: async (args) => {
      calls.cloud++;
      assert.equal(args.ownerId, uid);
      assert.equal(args.publicId, `feasta/providers/${uid}/services/security_media/image`);
      await onCloud(args);
    },
  }});
  const secured = load('provider-package-drafts-v2', {'./package-domain.js': {
    ...domain, verifyPackageImages: async (...args) => {
      calls.verifier++;
      return domain.verifyPackageImages(...args);
    },
  }});
  return {calls, api: secured};
}
const ownedMedia = () => `https://res.cloudinary.com/test/image/upload/feasta/providers/${uid}/services/security_media/image.jpg`;
async function securityTarget() {
  const ref = db.collection('packages').doc();
  const stored = (await db.doc('packages/' + first.packageId).get()).data();
  await ref.set({...stored, revision: 1});
  return ref.id;
}
async function withDocumentChange(path, patch, action) {
  const ref = db.doc(path);
  const previous = (await ref.get()).data();
  await ref.update(patch);
  try { await action(); } finally { await ref.set(previous); }
}
for (const mode of ['create', 'update']) {
  test(`${mode}: admission failures never enter media verification or Cloudinary`, async (t) => {
    const target = mode === 'update' ? await securityTarget() : null;
    const make = (extra = {}) => input({imageUrl: ownedMedia(), imageUrls: [ownedMedia()],
      ...(target ? {packageId: target, expectedRevision: 1} : {}), ...extra});
    const scenarios = [
      {name: 'disabled feature', path: 'contractPolicies/providerPackageV2', patch: {'featureGates.packageDraftWrites': false}},
      {name: 'wrong policy environment', path: 'contractPolicies/providerPackageV2', patch: {effectiveEnvironment: 'another-project'}},
      {name: 'unauthenticated', code: 'unauthenticated', request: {auth: undefined}},

      {name: 'invalid provider ownership', code: 'permission-denied', path: 'providers/' + providerId, patch: {ownerId: other}},
      {name: 'ineligible provider', path: 'providers/' + providerId, patch: {verificationStatus: 'pending'}},
      {name: 'inactive account', code: 'permission-denied', path: 'users/' + uid, patch: {isBlocked: true}},
      {name: 'maintenance', code: 'unavailable', path: 'maintenanceControls/intake', patch: {intake: true, publication: true}},
      {name: 'invalid price', code: 'invalid-argument', data: {price: 0}},
      {name: 'forged provider identity', code: 'invalid-argument', data: {providerId: 'forged_provider'}},
      {name: 'invalid occasion shape', code: 'invalid-argument', data: {occasionScope: 'all', occasionIds: ['birthday']}},
      {name: 'unapproved occasion', path: 'providerEligibilityAuthorities/' + providerId, patch: {approvedOccasionIds: ['birthday']}},
      {name: 'unapproved category', path: 'providerEligibilityAuthorities/' + providerId, patch: {approvedCategoryCodes: []}},
      {name: 'inactive category', path: 'serviceCategories/catering_service', patch: {status: 'discontinued'}},
      {name: 'provider category mismatch', path: 'providers/' + providerId, patch: {serviceCategories: []}},
      {name: 'provider capacity mismatch', data: {minimumGuests: 1, maximumGuests: 101}},
      {name: 'transitioning catalog', path: 'occasionCatalog/current', patch: {activationState: 'transitioning'}},
      {name: 'inactive occasion', code: 'invalid-argument', path: 'occasions/wedding', patch: {active: false}},
      {name: 'invalid payment policy', code: 'invalid-argument', data: {paymentPolicy: 'deposit_then_balance', depositPercentage: 1}},
    ];
    if (target) scenarios.push(
      {name: 'unowned package', code: 'permission-denied', path: 'packages/' + target, patch: {providerId: 'another_provider'}},
      {name: 'stale revision', code: 'aborted', data: {expectedRevision: 99}},
      {name: 'published package', path: 'packages/' + target, patch: {status: 'published'}},
    );
    for (const scenario of scenarios) await t.test(scenario.name, async () => {
      // Isolate each scenario's applicable request budget, without mocking it.
      const subjectHash = require('node:crypto').createHash('sha256').update('user:' + uid).digest('hex');
      const buckets = await db.collection('rateLimits').where('subjectHash', '==', subjectHash).get();
      for (const doc of buckets.docs) if (doc.data().scope === `packages.v2Draft.${mode}`) await doc.ref.delete();
      const harness = mediaHarness();
      const count = (await db.collection('packages').get()).size;
      const run = async () => {
        const request = {...req(make(scenario.data)), ...scenario.request};
        await assert.rejects(harness.api[mode === 'create' ? 'createProviderPackageV2' : 'updateProviderPackageV2'](request),
          e => e.code === (scenario.code ?? 'failed-precondition'));
        assert.deepEqual(harness.calls, {verifier: 0, cloud: 0});
        assert.equal((await db.collection('packages').get()).size, count);
        if (target) assert.equal((await db.doc('packages/' + target).get()).data().revision, 1);
      };
      if (scenario.path) await withDocumentChange(scenario.path, scenario.patch, run);
      else await run();
    });
  });
}

test('authorized media create/update verify URLs, replay and concurrent retries never duplicate packages', async () => {
  const harness = mediaHarness();
  const data = input({imageUrl: ownedMedia(), imageUrls: [ownedMedia()]});
  const count = (await db.collection('packages').get()).size;
  const results = await Promise.all([1, 2].map(() => harness.api.createProviderPackageV2(req(data))));
  assert.deepEqual(results[0], results[1]);
  assert.equal((await db.collection('packages').get()).size, count + 1);
  assert.ok(harness.calls.cloud >= 1 && harness.calls.cloud <= 2);
  const after = {...harness.calls};
  assert.deepEqual(await harness.api.createProviderPackageV2(req(data)), results[0]);
  assert.deepEqual(harness.calls, after);
  await reason(harness.api.createProviderPackageV2(req({...data, name: 'changed payload'})), 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(harness.calls, after);
  const updateData = input({packageId: results[0].packageId, expectedRevision: 1,
    imageUrl: ownedMedia(), imageUrls: [ownedMedia()]});
  await harness.api.updateProviderPackageV2(req(updateData));
  assert.equal(harness.calls.cloud, after.cloud + 1); // Retained URLs are reverified.
  assert.equal((await db.doc('packages/' + results[0].packageId).get()).data().revision, 2);
});

test('authorized invalid or unowned media fails closed without a package write', async () => {
  const {HttpsError} = require('firebase-functions/v2/https');
  for (const mode of ['create', 'update']) {
    const target = mode === 'update' ? await securityTarget() : null;
    const data = input({imageUrl: ownedMedia(), imageUrls: [ownedMedia()],
      ...(target ? {packageId: target, expectedRevision: 1} : {})});
    const harness = mediaHarness(async () => {throw new HttpsError('failed-precondition', 'Mock invalid resource');});
    const invoke = value => harness.api[mode === 'create' ? 'createProviderPackageV2' : 'updateProviderPackageV2'](req(value));
    const count = (await db.collection('packages').get()).size;
    await code(invoke(data), 'failed-precondition');
    assert.deepEqual(harness.calls, {verifier: 1, cloud: 1});
    const foreign = ownedMedia().replace('/' + uid + '/', '/' + other + '/');
    await code(invoke({...data, idempotencyKey: key(), imageUrl: foreign, imageUrls: [foreign]}), 'permission-denied');
    assert.deepEqual(harness.calls, {verifier: 2, cloud: 1});
    assert.equal((await db.collection('packages').get()).size, count);
    if (target) assert.equal((await db.doc('packages/' + target).get()).data().revision, 1);
  }
});

for (const mode of ['create', 'update']) {
  test(`${mode}: mutable conditions revoked during media verification block the final transaction`, async (t) => {
    const target = mode === 'update' ? await securityTarget() : null;
    const scenarios = [
      ['feature gate', 'contractPolicies/providerPackageV2', {'featureGates.packageDraftWrites': false}],
      ['ownership', 'providers/' + providerId, {ownerId: other}],
      ['provider eligibility', 'providers/' + providerId, {isActive: false}],
      ['account eligibility', 'users/' + uid, {isBlocked: true}],
      ['maintenance', 'maintenanceControls/intake', {intake: true, publication: true}],
      ['occasion grants', 'providerEligibilityAuthorities/' + providerId, {approvedOccasionIds: []}],
      ['category', 'serviceCategories/catering_service', {status: 'discontinued'}],
    ];
    if (target) scenarios.push(['package revision', 'packages/' + target, {revision: 2}]);
    for (const [name, path, patch] of scenarios) await t.test(name, async () => {
      const ref = db.doc(path), previous = (await ref.get()).data();
      const harness = mediaHarness(async () => {await ref.update(patch);});
      const count = (await db.collection('packages').get()).size;
      try {
        await assert.rejects(harness.api[mode === 'create' ? 'createProviderPackageV2' : 'updateProviderPackageV2'](req(
          input({imageUrl: ownedMedia(), imageUrls: [ownedMedia()], ...(target ? {packageId: target, expectedRevision: 1} : {})}))));
        assert.deepEqual(harness.calls, {verifier: 1, cloud: 1});
        assert.equal((await db.collection('packages').get()).size, count);
        if (target && name !== 'package revision') assert.equal((await db.doc('packages/' + target).get()).data().revision, 1);
      } finally {await ref.set(previous);}
    });
  });
}

test('completion cannot invoke media verification, including unverified editor asset references', async () => {
  const harness = mediaHarness();
  const progress = {name: 'Security completion', description: 'A completed private draft.', serviceCategoryCode: 'catering_service',
    occasion: {occasionSchemaVersion: 2, occasionScope: 'all', occasionIds: []}, pricingModel: 'per_pax',
    minimumGuestsText: '10', maximumGuestsText: '50', paymentPolicy: 'full_payment',
    tiers: {drop_off: {enabled: true, priceText: '100.25', includedServices: ['Delivery'],
      decorInclusions: [], furnitureInclusions: [], equipmentInclusions: []}}};
  const saved = (await progressApi.saveProviderPackageEditorDraft(req({editorDraftId: null, expectedRevision: 0,
    packageId: null, expectedPackageRevision: null, editorSchemaVersion: 2, currentStep: 4, progress, idempotencyKey: key()}))).draft;
  const data = {editorDraftId: saved.editorDraftId, expectedRevision: 1, expectedPackageRevision: null, idempotencyKey: key()};
  const ref = db.doc('providerPackageEditorDrafts/' + saved.editorDraftId);
  await withDocumentChange(ref.path, {'progress.marketingAssetIds': ['unverified_asset']}, async () => {
    await assert.rejects(harness.api.completeProviderPackageEditorDraft(req(data)));
    assert.deepEqual(harness.calls, {verifier: 0, cloud: 0});
  });
  const result = await harness.api.completeProviderPackageEditorDraft(req(data));
  assert.deepEqual(await harness.api.completeProviderPackageEditorDraft(req(data)), result);
  assert.deepEqual(harness.calls, {verifier: 0, cloud: 0});
});


test('disabled Auth accounts cannot verify media, including disablement during verification', async () => {
  for (const mode of ['create', 'update']) {
    const target = mode === 'update' ? await securityTarget() : null;
    const data = input({imageUrl: ownedMedia(), imageUrls: [ownedMedia()],
      ...(target ? {packageId: target, expectedRevision: 1} : {})});
    const count = (await db.collection('packages').get()).size;
    const before = mediaHarness();
    await getAuth().updateUser(uid, {disabled: true});
    try {
      await code(before.api[mode === 'create' ? 'createProviderPackageV2' : 'updateProviderPackageV2'](req(data)), 'permission-denied');
      assert.deepEqual(before.calls, {verifier: 0, cloud: 0});
    } finally {await getAuth().updateUser(uid, {disabled: false});}
    const during = mediaHarness(async () => {await getAuth().updateUser(uid, {disabled: true});});
    try {
      await code(during.api[mode === 'create' ? 'createProviderPackageV2' : 'updateProviderPackageV2'](req(data)), 'permission-denied');
      assert.deepEqual(during.calls, {verifier: 1, cloud: 1});
      assert.equal((await db.collection('packages').get()).size, count);
      if (target) assert.equal((await db.doc('packages/' + target).get()).data().revision, 1);
    } finally {await getAuth().updateUser(uid, {disabled: false});}
  }
});

test('V2 production-shaped and non-opted-in calls stay disabled with App Check required', async () => {
  const previous = process.env.FEASTA_V2_DRAFT_DEMO_ENABLED;
  delete process.env.FEASTA_V2_DRAFT_DEMO_ENABLED;
  try {
    await code(api.createProviderPackageV2({...req(input()), app: undefined}), 'unauthenticated');
    await reason(api.createProviderPackageV2(req(input())), 'FEATURE_DISABLED');
  } finally {process.env.FEASTA_V2_DRAFT_DEMO_ENABLED = previous;}
});

const foodGroups = () => [{id:'main',title:'Main dish',selectionCount:1,options:[
  {id:'chicken',name:'Chicken Afritada'},{id:'pork',name:'Pork Menudo'},{id:'fish',name:'Sweet and Sour Fish'}]}];
test('F2: choices round-trip, update and removal retain legacy food inclusions', async () => {
 const created=await create(input({foodChoiceGroups:foodGroups()}));
 const ref=db.doc('packages/'+created.packageId);
 assert.deepEqual((await ref.get()).data().foodChoiceGroups,foodGroups());
 const changed=foodGroups();changed[0].selectionCount=2;
 await update(input({packageId:created.packageId,expectedRevision:1,foodChoiceGroups:changed}));
 assert.deepEqual((await ref.get()).data().foodChoiceGroups,changed);
 await update(input({packageId:created.packageId,expectedRevision:2}));
 const removed=(await ref.get()).data();
 assert.equal(Object.hasOwn(removed,'foodChoiceGroups'),false);
 assert.deepEqual(removed.foodInclusions,['Main course']);
});
test('F2: incomplete editor choices reopen privately but cannot complete until valid', async () => {
 const progress={name:'Food choice progress',description:'Private incomplete food choices.',serviceCategoryCode:'catering_service',
 occasion:{occasionSchemaVersion:2,occasionScope:'all',occasionIds:[]},pricingModel:'per_pax',
 minimumGuestsText:'10',maximumGuestsText:'50',paymentPolicy:'full_payment',
 tiers:{drop_off:{enabled:true,priceText:'100.25',includedServices:['Delivery'],decorInclusions:[],furnitureInclusions:[],equipmentInclusions:[]}},
 foodChoiceGroups:foodGroups()};
 progress.foodChoiceGroups[0].options[1].name='';
 const save=(extra={})=>progressApi.saveProviderPackageEditorDraft(req({editorDraftId:null,expectedRevision:0,
 packageId:null,expectedPackageRevision:null,editorSchemaVersion:2,currentStep:2,progress,idempotencyKey:key(),...extra}));
 const saved=(await save()).draft;
 const reopened=await progressApi.getProviderPackageEditorDraft(req({editorDraftId:saved.editorDraftId}));
 assert.deepEqual(reopened.draft.progress.foodChoiceGroups,progress.foodChoiceGroups);
 await reason(api.completeProviderPackageEditorDraft(req({editorDraftId:saved.editorDraftId,expectedRevision:1,
 expectedPackageRevision:null,idempotencyKey:key()})),'INVALID_FOOD_CHOICE_GROUP');
 progress.foodChoiceGroups=foodGroups();
 await save({editorDraftId:saved.editorDraftId,expectedRevision:1});
 const completed=await api.completeProviderPackageEditorDraft(req({editorDraftId:saved.editorDraftId,expectedRevision:2,
 expectedPackageRevision:null,idempotencyKey:key()}));
 assert.deepEqual((await db.doc('packages/'+completed.packageId).get()).data().foodChoiceGroups,foodGroups());
});
test('F2: malformed choice metadata cannot create or update a private package', async () => {
 for(const mutate of [g=>{g[0].selectionCount=4;},g=>{g[0].options[1].name=' chicken afritada ';},
 g=>{g[0].rule='optional';},g=>{g[0].options[0].price=1;},g=>{g[0].options=null;}]) {
  const groups=foodGroups();mutate(groups);
  await reason(create(input({foodChoiceGroups:groups})),'INVALID_FOOD_CHOICE_GROUP');
 }
});

test('F2: stripping schema markers cannot publish food choices through the legacy publisher', async () => {
 const ref=db.doc('packages/'+seed+'_food_only');
 for(const groups of [null,[],foodGroups()]) {
  await ref.set({providerId,status:'draft',name:'Legacy-shaped choices',eventType:'birthday',foodChoiceGroups:groups});
  await code(legacyPublish(req({packageId:ref.id})),'failed-precondition');
  assert.equal((await ref.get()).data().status,'draft');
 }
});

// Publication uses the same draft validation and media admission architecture.
const publishV2 = (data, actor = uid) => api.publishProviderPackageV2Internal(req(data, actor));
const publishInput = packageId => ({sharedContractVersion: 2, packageId,
  expectedRevision: 1, idempotencyKey: key()});
async function publicationGates(enabled) {
  process.env.FEASTA_V2_PUBLICATION_DEMO_ENABLED = 'true';
  await db.doc('contractPolicies/providerPackageV2').update({
    'featureGates.packagePublication': enabled, 'featureGates.customerDiscovery': enabled,
    'featureGates.customerBooking': enabled});
  await db.doc('providers/' + providerId).update({businessName: 'Demo Catering',
    description: 'Demo catering provider', address: '123 Demo Street', city: 'Ormoc', province: 'Leyte'});
}
test('V2 publication requires explicit local gates and a complete verified provider', async () => {
  const created = await create(input());
  const data = publishInput(created.packageId);
  await reason(publishV2(data), 'FEATURE_DISABLED');
  await publicationGates(true);
  try {
    await db.doc('providers/' + providerId).update({verificationStatus: 'pending'});
    await code(publishV2(data), 'failed-precondition');
    assert.equal((await db.doc('packages/' + created.packageId).get()).data().status, 'draft');
  } finally {
    await db.doc('providers/' + providerId).update({verificationStatus: 'approved'});
    await publicationGates(false);
  }
});
test('V2 publication revalidates, publishes once and rejects changed idempotency input', async () => {
  await publicationGates(true);
  try {
    const created = await create(input({foodChoiceGroups: foodGroups()}));
    const data = publishInput(created.packageId);
    const published = await publishV2(data);
    assert.equal(published.status, 'published');
    assert.equal(published.packageRevision, 2);
    assert.deepEqual(await publishV2(data), published);
    const stored = (await db.doc('packages/' + created.packageId).get()).data();
    assert.equal(stored.revision, 2);
    for (const field of ['isActive', 'isPublished', 'providerPubliclyVisible']) assert.equal(stored[field], true);
    assert.deepEqual(stored.foodChoiceGroups, foodGroups());
    await reason(publishV2({...data, expectedRevision: 2}), 'IDEMPOTENCY_CONFLICT');
  } finally {await publicationGates(false);}
});
test('V2 publication rejects foreign ownership, stale revisions, and stale discovery generations', async () => {
  await publicationGates(true);
  try {
    const created = await create(input());
    const data = publishInput(created.packageId);
    await code(publishV2(data, other), 'failed-precondition');
    await reason(publishV2({...data, expectedRevision: 2}), 'REVISION_CONFLICT');
    await db.doc('packages/' + created.packageId).update({occasionCatalogRevision: 6});
    await reason(publishV2(data), 'STALE_DISCOVERY_MEMBERSHIP');
    const stored = (await db.doc('packages/' + created.packageId).get()).data();
    assert.equal(stored.status, 'draft'); assert.equal(stored.isPublished, false);
  } finally {await publicationGates(false);}
});
test('V2 publication rejects malformed stored food, tier, pricing and capacity rules', async () => {
  await publicationGates(true);
  try {
    for (const patch of [{foodChoiceGroups: [{id: 'bad'}]}, {price: 99},
      {serviceOptions: {drop_off: {price: -1, includedServices: []}}},
      {minimumGuests: 60}, {pricingModel: 'client_free'}]) {
      const created = await create(input());
      await db.doc('packages/' + created.packageId).update(patch);
      await assert.rejects(publishV2(publishInput(created.packageId)));
      assert.equal((await db.doc('packages/' + created.packageId).get()).data().isPublished, false);
    }
  } finally {await publicationGates(false);}
});

test('V2 publication media admission and final checks reject revoked authority and concurrent edits', async (t) => {
  await publicationGates(true);
  try {
    for (const scenario of [
      {name: 'maintenance', path: 'maintenanceControls/intake', patch: {publication: true}},
      {name: 'publication gate', path: 'contractPolicies/providerPackageV2', patch: {'featureGates.packagePublication': false}},
      {name: 'customer gate', path: 'contractPolicies/providerPackageV2', patch: {'featureGates.customerBooking': false}},
      {name: 'catalog transition', path: 'occasionCatalog/current', patch: {activationState: 'transitioning'}},
      {name: 'provider grant', path: 'providerEligibilityAuthorities/' + providerId, patch: {revision: 4}},
      {name: 'provider eligibility', path: 'providers/' + providerId, patch: {verificationStatus: 'pending'}},
      {name: 'account disable', path: 'users/' + uid, patch: {isBlocked: true}},
      {name: 'package revision', patch: {revision: 2}},
      {name: 'media changed without revision', patch: {imageUrl: '', imageUrls: []}},
    ]) await t.test(scenario.name, async () => {
      const created = await create(input());
      const packagePath = 'packages/' + created.packageId;
      // Set up an owned stored image; the API verifier itself remains mocked.
      await db.doc(packagePath).update({imageUrl: ownedMedia(), imageUrls: [ownedMedia()]});
      const changed = db.doc(scenario.path || packagePath);
      const prior = (await changed.get()).data();
      const harness = mediaHarness(async () => changed.update(scenario.patch));
      try {
        await assert.rejects(harness.api.publishProviderPackageV2Internal(req(publishInput(created.packageId))));
        assert.equal(harness.calls.cloud, 1);
        assert.equal((await db.doc(packagePath).get()).data().isPublished, false);
      } finally {await changed.set(prior);}
    });
    await t.test('disabled admission never verifies media', async () => {
      const created = await create(input());
      await db.doc('packages/' + created.packageId).update({imageUrl: ownedMedia(), imageUrls: [ownedMedia()]});
      await publicationGates(false);
      const harness = mediaHarness();
      await reason(harness.api.publishProviderPackageV2Internal(req(publishInput(created.packageId))), 'FEATURE_DISABLED');
      assert.deepEqual(harness.calls, {verifier: 0, cloud: 0});
    });
  } finally {await publicationGates(false);}
});
test('V2 publication cannot be activated outside isolated emulators', async () => {
  await publicationGates(true);
  const created = await create(input());
  const previous = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = 'false';
  try {await reason(publishV2(publishInput(created.packageId)), 'FEATURE_DISABLED');}
  finally {process.env.FUNCTIONS_EMULATOR = previous; await publicationGates(false);}
});

const customerApi = load('customer-package-v2');
const bookingApi = load('../bookings/submit-booking-request');
async function customerFixture(suffix) {
 const customer = seed + '_customer_' + suffix;
 const phone = suffix === 'bundle' ? '+639171239991' : '+639171239992';
 await getAuth().createUser({uid:customer,email:customer+'@example.invalid',emailVerified:true,phoneNumber:phone});
 await db.doc('users/'+customer).set({role:'customer',accountStatus:'active',isActive:true,isBlocked:false,
  isPhoneVerified:true,phoneNumber:phone});
 await db.doc('customers/'+customer).set({firstName:'Demo',lastName:'Customer'});
 await db.doc('providers/'+providerId).update({operatingDays:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
  bookingLeadTimeDays:0,unavailableDates:[],availableStaffCount:10,availableEquipmentCount:10});
 return customer;
}
async function resetCustomerBudget(customer) {
 const subjectHash=require('node:crypto').createHash('sha256').update('user:'+customer).digest('hex');
 const rows=await db.collection('rateLimits').where('subjectHash','==',subjectHash).get();
 for(const row of rows.docs) await row.ref.delete();
}
const customerReq=(data,customer)=>({...req(data,customer),auth:{uid:customer,token:{email_verified:true}}});
for (const [suffix,model,scope,day,total] of [['pax','per_pax','specific','2099-02-15',2005],
 ['bundle','per_bundle','all','2099-02-16',100.25]]) {
 test('V2 lifecycle: private draft -> published -> verified discovery -> authoritative '+model+' booking',async()=>{
  await publicationGates(true);
  try {
   const customer=await customerFixture(suffix);
   const draft=await create(input({paymentPolicy:model==='per_pax'?'deposit_then_balance':'full_payment',
    depositPercentage:model==='per_pax'?20:100,pricingModel:model,occasionScope:scope,occasionIds:scope==='all'?[]:['birthday','wedding'],
    foodChoiceGroups:foodGroups(),serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],
     decorInclusions:['Tier flowers'],furnitureInclusions:['Tier table'],equipmentInclusions:['Warmer']}}}));
   await assert.rejects(customerApi.getCustomerPackageV2(customerReq({packageId:draft.packageId},customer)));
   await publishV2(publishInput(draft.packageId));
   const legacyRef=db.doc('packages/'+seed+'_legacy_query_'+suffix);
   await legacyRef.set({providerId,name:'Legacy query package',eventType:'wedding',price:100,
    status:'published',isActive:true,isPublished:true,providerPubliclyVisible:true,isDeleted:false,
    createdAt:require('firebase-admin/firestore').Timestamp.now()});
   const Filter=require('firebase-admin/firestore').Filter;
   const matched=await db.collection('packages').where('isActive','==',true).where('isPublished','==',true)
    .where('providerPubliclyVisible','==',true).where('status','==','published').where('isDeleted','==',false)
    .where(Filter.or(Filter.where('eventType','==','wedding'),Filter.where('occasionMatchIds','array-contains','wedding')))
    .orderBy('createdAt','desc').get();
   assert.ok(matched.docs.some(doc=>doc.id===draft.packageId));
   assert.ok(matched.docs.some(doc=>doc.id===legacyRef.id));
   const discovered=await customerApi.getCustomerPackageV2(customerReq({packageId:draft.packageId},customer));
   assert.equal(discovered.package.revision,2);assert.equal(discovered.package.pricingModel,model);
   assert.deepEqual(discovered.package.occasionMatchIds,['birthday','wedding']);
   assert.equal(discovered.package.ownerUid,undefined);assert.equal(discovered.package.createdBy,undefined);
   const choices=foodGroups().map(g=>({groupId:g.id,optionIds:g.options.slice(0,g.selectionCount).map(o=>o.id)}));
   const data={clientRequestId:key(),providerId,packageId:draft.packageId,sharedContractVersion:2,
    expectedPackageRevision:2,eventType:'wedding',eventDate:day,eventTime:'10:00',eventEndTime:'14:00',
    eventLocation:'Ormoc City',eventAddress:'123 Demo Street',guestCount:20,serviceTier:'drop_off',
    foodChoiceSelections:choices,selectedFoods:['Main course'],selectedDecorations:['Tier flowers'],
    selectedFurniture:['Tier table'],addonIds:[],willArrangeOwnAddOns:false};
   for(const patch of [{expectedPackageRevision:1},{guestCount:9},{guestCount:51},{eventType:'debut'},
     {serviceTier:'full_service'},{foodChoiceSelections:[]},{clientPrice:1},{selectedDecorations:['Foreign']}]) {
    await resetCustomerBudget(customer);
    await assert.rejects(bookingApi.getBookingPaymentAgreementDisclosures(customerReq({...data,...patch},customer)));
   }
   await resetCustomerBudget(customer);
   const disclosure=await bookingApi.getBookingPaymentAgreementDisclosures(customerReq(data,customer));
   assert.equal(disclosure.agreements[0].grossAmountInCentavos,Math.round(total*100));
   assert.equal(disclosure.agreements[0].requiredUpfrontAmountInCentavos,
    Math.round(total*100*(model==='per_pax'?0.2:1)));
   const request={...data,agreementAcknowledgements:disclosure.agreements.map(a=>({providerId:a.providerId,agreementKey:a.agreementKey}))};
   const booking=await bookingApi.submitBookingRequest(customerReq(request,customer));
   assert.equal(booking.created,true);
   const saved=(await db.doc('mainEvents/'+booking.mainEventId).get()).data();
   assert.equal(saved.packagePrice,total);assert.equal(saved.packageOfferSnapshotV2.unitCentavos,10025);
   assert.equal(saved.packageOfferSnapshotV2.revision,2);
   assert.deepEqual(saved.packageOfferSnapshotV2.decorInclusions,['Tier flowers']);
   assert.equal(saved.foodChoiceSelections[0].options[0].name,foodGroups()[0].options[0].name);
   const frozen=JSON.stringify(saved.packageOfferSnapshotV2);
   await db.doc('packages/'+draft.packageId).update({revision:3,price:200,occasionEligibilityState:'review_required'});
   assert.equal((await bookingApi.submitBookingRequest(customerReq(request,customer))).created,false);
   assert.equal(JSON.stringify((await db.doc('mainEvents/'+booking.mainEventId).get()).data().packageOfferSnapshotV2),frozen);
   await assert.rejects(customerApi.getCustomerPackageV2(customerReq({packageId:draft.packageId},customer)));
   // Pending requests do not reserve a date. An accepted live hold does, per the existing lifecycle.
   await db.doc('providerRequests/'+booking.providerRequestIds[0]).update({status:'accepted',
    acceptedAt:require('firebase-admin/firestore').Timestamp.now()});
   // A fresh valid package on the same day must still hit existing provider scheduling restrictions.
   const next=await create(input({foodChoiceGroups:foodGroups()}));await publishV2(publishInput(next.packageId));
   const nextData={...data,clientRequestId:key(),packageId:next.packageId,selectedDecorations:[],selectedFurniture:[]};
   const nextDisclosure=await bookingApi.getBookingPaymentAgreementDisclosures(customerReq(nextData,customer));
   await assert.rejects(bookingApi.submitBookingRequest(customerReq({...nextData,
    agreementAcknowledgements:nextDisclosure.agreements.map(a=>({providerId:a.providerId,agreementKey:a.agreementKey}))},customer)));
  } finally {await publicationGates(false);}
 });
}
