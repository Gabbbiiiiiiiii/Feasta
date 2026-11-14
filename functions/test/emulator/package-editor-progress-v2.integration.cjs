'use strict';

/**
 * FEASTA Phase 1C Stage B: run ONLY against Firebase Auth + Firestore emulators.
 * Exercises the real unexported callable handlers and real Firestore transactions.
 * There is no Functions deployment or production operation.
 *
 *   firebase emulators:exec --project demo-feasta-phase1c \
 *     --config firebase.json --only auth,firestore \
 *     "node functions/test/emulator/package-editor-progress-v2.integration.cjs"
 */
const assert = require('node:assert/strict');
const {test, before} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');

// Fail before importing any Admin SDK module if environment is not isolated.
const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_CONFIG &&
    (() => {try {return JSON.parse(process.env.FIREBASE_CONFIG).projectId;} catch {return null;}})();
if (!projectId || !/^demo-[a-z0-9-]+$/.test(projectId) ||
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    /https?:\/\//i.test(process.env.FIRESTORE_EMULATOR_HOST) ||
    /https?:\/\//i.test(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  throw new Error('EMULATOR_ONLY: require demo-* project, Firestore and Auth emulator hosts.');
}
// Recheck project identity for all Admin SDK reads/writes.
process.env.GCLOUD_PROJECT = projectId;
process.env.GCP_PROJECT = projectId;
process.env.FUNCTIONS_EMULATOR = 'true';

const {initializeApp, getApps} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');
if (getApps().length !== 0) throw new Error('Unexpected previously initialized Admin app.');
initializeApp({projectId});
const db = getFirestore();

// Load ONLY the two isolated callables. onCall is replaced with its raw handler
// for test invocation; every other dependency is real (Auth, role, rate limiting,
// maintenance, Firestore, authorization, and the parser).
const filename = path.resolve(__dirname, '../../lib/packages/provider-package-editor-progress.js');
if (!fs.existsSync(filename)) {
  throw new Error('Compile Functions directly with tsc before emulator test.');
}
const realRequire = createRequire(filename);
const callables = {};
function testRequire(name) {
  if (name === 'firebase-functions/v2/https') {
    return {...realRequire(name), onCall: (_options, handler) => handler};
  }
  return realRequire(name);
}
const loadCallable = vm.runInThisContext(
  '(function (exports, require, module, __filename, __dirname) {\n' +
  fs.readFileSync(filename, 'utf8') + '\n})',
  {filename},
);
loadCallable(callables, testRequire, {exports: callables}, filename, path.dirname(filename));
const save = callables.saveProviderPackageEditorDraft;
const read = callables.getProviderPackageEditorDraft;
const list = callables.listProviderPackageEditorDrafts;
const discard = callables.discardProviderPackageEditorDraft;
if (typeof save !== 'function' || typeof read !== 'function' ||
    typeof list !== 'function' || typeof discard !== 'function') {
  throw new Error('Expected Stage A callable handlers not found.');
}

const seed = `phase1c_${process.pid}_${Date.now()}`;
const actorA = `${seed}_user_a`;
const actorB = `${seed}_user_b`;
const providerA = `${seed}_provider_a`;
const providerB = `${seed}_provider_b`;
const makeRequest = (uid, data) => ({
  auth: {uid, token: {email: `${uid}@example.invalid`}},
  app: {appId: '1:000000000000:web:phase1c-emulator'},
  rawRequest: {headers: {'x-request-id': 'phase1c_emulator_1234'}, ip: '127.0.0.1'},
  data,
});
let serial = 0;
const key = () => `phase1c_key_${seed}_${++serial}`;
const specific = {occasion: {occasionSchemaVersion: 2, occasionScope: 'specific',
  occasionIds: ['birthday', 'wedding']}};
const all = {occasion: {occasionSchemaVersion: 2, occasionScope: 'all', occasionIds: []}};
function saveInput(progress, overrides = {}) {
  return {editorDraftId: null, expectedRevision: 0, packageId: null,
    expectedPackageRevision: null, editorSchemaVersion: 2, currentStep: 1,
    progress, idempotencyKey: key(), ...overrides};
}
const invokeSave = (uid, data) => save(makeRequest(uid, data));
const invokeRead = (uid, id) => read(makeRequest(uid, {editorDraftId: id}));
async function rejectsReason(promise, reason) {
  await assert.rejects(promise, (e) => {
    assert.equal(e?.details?.reason, reason, `Unexpected rejection: ${String(e?.message)}`);
    return true;
  });
}

before(async () => {
  for (const [uid, providerId] of [[actorA, providerA], [actorB, providerB]]) {
    await getAuth().createUser({uid, email: `${uid}@example.invalid`, disabled: false});
    await db.collection('users').doc(uid).set({
      role: 'provider', providerId, accountStatus: 'active', isActive: true, isBlocked: false,
    });
    await db.collection('providers').doc(providerId).set({
      ownerId: uid, verificationStatus: 'approved', isActive: true,
      isSuspended: false, isDeleted: false,
    });
  }
  await db.doc('contractPolicies/providerPackageV2').set({
    effectiveEnvironment: projectId, revision: 1, maxSpecificOccasions: 10,
    maxThemeImages: 4, featureGates: {packageEditorProgressWrites: true},
  });
  await db.doc('maintenanceControls/intake').set({
    schemaVersion: 1, revision: 1, intake: false, publication: false,
  });
});

test('real Firestore save and reload retain private multi-occasion and Fits All progress', async () => {
  const first = (await invokeSave(actorA, saveInput(specific))).draft;
  assert.equal(first.revision, 1);
  assert.equal(first.state, 'incomplete');
  assert.equal(first.packageId, null);
  assert.deepEqual(JSON.parse(JSON.stringify(first.progress)), specific);
  const loaded = (await invokeRead(actorA, first.editorDraftId)).draft;
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.progress)), specific);
  const fitsAll = (await invokeSave(actorA, saveInput(all))).draft;
  assert.deepEqual(JSON.parse(JSON.stringify((await invokeRead(actorA, fitsAll.editorDraftId)).draft.progress)), all);
  assert.equal((await db.collection('providerPackageEditorDrafts').doc(first.editorDraftId).get()).data().ownerUid, actorA);
});

test('idempotent replay keeps one draft; changed payload with same key fails', async () => {
  const input = saveInput(specific);
  const first = (await invokeSave(actorA, input)).draft;
  const replay = (await invokeSave(actorA, input)).draft;
  assert.equal(first.editorDraftId, replay.editorDraftId);
  assert.equal(first.revision, replay.revision);
  await rejectsReason(invokeSave(actorA, {...input, progress: all}), 'IDEMPOTENCY_CONFLICT');
});

test('revision-checked updates and stale writes are rejected', async () => {
  const first = (await invokeSave(actorA, saveInput(specific))).draft;
  const updated = (await invokeSave(actorA, saveInput(all, {
    editorDraftId: first.editorDraftId, expectedRevision: first.revision,
  }))).draft;
  assert.equal(updated.revision, 2);
  assert.deepEqual(JSON.parse(JSON.stringify((await invokeRead(actorA, first.editorDraftId)).draft.progress)), all);
  await rejectsReason(invokeSave(actorA, saveInput(specific, {
    editorDraftId: first.editorDraftId, expectedRevision: 1,
  })), 'REVISION_CONFLICT');
});

test('another approved provider cannot read or mutate a private draft', async () => {
  const first = (await invokeSave(actorA, saveInput(specific))).draft;
  await rejectsReason(invokeRead(actorB, first.editorDraftId), 'RESOURCE_NOT_FOUND');
  await rejectsReason(invokeSave(actorB, saveInput(all, {
    editorDraftId: first.editorDraftId, expectedRevision: 1,
  })), 'RESOURCE_NOT_FOUND');
});

test('concurrent updates to one revision cannot both commit', async () => {
  const first = (await invokeSave(actorA, saveInput(specific))).draft;
  const writes = await Promise.allSettled([
    invokeSave(actorA, saveInput(all, {editorDraftId: first.editorDraftId, expectedRevision: 1})),
    invokeSave(actorA, saveInput({name: 'changed'}, {editorDraftId: first.editorDraftId, expectedRevision: 1})),
  ]);
  assert.equal(writes.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(writes.filter((x) => x.status === 'rejected').length, 1);
  const latest = (await invokeRead(actorA, first.editorDraftId)).draft;
  assert.equal(latest.revision, 2);
});

test('maintenance pause denies writes while allowing owner recovery', async () => {
  const first = (await invokeSave(actorA, saveInput(specific))).draft;
  await db.doc('maintenanceControls/intake').update({revision: 2, intake: true, publication: true});
  try {
    await rejectsReason(invokeSave(actorA, saveInput(all)), 'MAINTENANCE_PAUSED');
    await rejectsReason(invokeSave(actorA, saveInput(all, {
      editorDraftId: first.editorDraftId, expectedRevision: 1,
    })), 'MAINTENANCE_PAUSED');
    assert.equal((await invokeRead(actorA, first.editorDraftId)).draft.revision, 1);
  } finally {
    await db.doc('maintenanceControls/intake').update({revision: 3, intake: false, publication: false});
  }
});

test('missing policy grant fails closed; pre-existing private progress stays recoverable', async () => {
  const first = (await invokeSave(actorA, saveInput(specific))).draft;
  await db.doc('contractPolicies/providerPackageV2').update({
    'featureGates.packageEditorProgressWrites': false, revision: 2,
  });
  try {
    await rejectsReason(invokeSave(actorA, saveInput(all)), 'FEATURE_DISABLED');
    assert.equal((await invokeRead(actorA, first.editorDraftId)).draft.revision, 1);
  } finally {
    await db.doc('contractPolicies/providerPackageV2').update({
      'featureGates.packageEditorProgressWrites': true, revision: 3,
    });
  }
});

test('unauthenticated and inactive providers cannot read private drafts', async () => {
  const first = (await invokeSave(actorA, saveInput(specific))).draft;
  await assert.rejects(read({...makeRequest(actorA, {editorDraftId: first.editorDraftId}), auth: null}), (e) => {
    assert.ok(String(e?.code).includes('unauthenticated'));
    return true;
  });
  await db.collection('providers').doc(providerB).update({isActive: false});
  try {
    await assert.rejects(invokeRead(actorB, first.editorDraftId), (e) => {
      assert.ok(String(e?.code).includes('failed-precondition'));
      return true;
    });
  } finally {
    await db.collection('providers').doc(providerB).update({isActive: true});
  }
});

test('forged server authority and unverified assets do not create drafts', async () => {
  await rejectsReason(invokeSave(actorA, saveInput({occasion: {
    ...specific.occasion, occasionMatchIds: ['birthday'],
  }})), 'INVALID_EDITOR_PROGRESS');
  await rejectsReason(invokeSave(actorA, saveInput({marketingAssetIds: ['unverified_asset']})),
    'CLIENT_UPGRADE_REQUIRED');
});


test('owner-only listing never leaks another provider drafts', async () => {
  const mine = (await invokeSave(actorA, saveInput({name: 'owner_only'}))).draft;
  const theirs = (await invokeSave(actorB, saveInput({name: 'other_owner'}))).draft;
  const a = (await list(makeRequest(actorA, {}))).drafts;
  assert.ok(a.some((item) => item.editorDraftId === mine.editorDraftId));
  assert.ok(!a.some((item) => item.editorDraftId === theirs.editorDraftId));
  const b = (await list(makeRequest(actorB, {}))).drafts;
  assert.ok(b.some((item) => item.editorDraftId === theirs.editorDraftId));
  assert.ok(!b.some((item) => item.editorDraftId === mine.editorDraftId));
});

test('discard is revision-checked, private, idempotent, and frees quota', async () => {
  const mine = (await invokeSave(actorA, saveInput({name: 'discard_me'}))).draft;
  const quotaRef = db.collection('providerPackageEditorQuotas').doc(providerA);
  const before = (await quotaRef.get()).data().count;
  const input = {editorDraftId: mine.editorDraftId, expectedRevision: mine.revision,
    idempotencyKey: key()};
  await rejectsReason(discard(makeRequest(actorB, input)), 'RESOURCE_NOT_FOUND');
  await rejectsReason(discard(makeRequest(actorA, {...input, expectedRevision: mine.revision + 1})),
    'REVISION_CONFLICT');
  const result = await discard(makeRequest(actorA, input));
  assert.deepEqual(JSON.parse(JSON.stringify(result)),
    {discarded: true, editorDraftId: mine.editorDraftId});
  const replay = await discard(makeRequest(actorA, input));
  assert.deepEqual(replay, result);
  await rejectsReason(discard(makeRequest(actorA, {...input, expectedRevision: mine.revision + 1})),
    'IDEMPOTENCY_CONFLICT');
  await rejectsReason(invokeRead(actorA, mine.editorDraftId), 'RESOURCE_NOT_FOUND');
  assert.equal((await quotaRef.get()).data().count, before - 1);
});

test('maintenance pause permits private listing and discard, never save', async () => {
  const mine = (await invokeSave(actorA, saveInput({name: 'maintenance_cleanup'}))).draft;
  await db.doc('maintenanceControls/intake').update({revision: 8, intake: true, publication: true});
  try {
    await rejectsReason(invokeSave(actorA, saveInput({name: 'forbidden'})),
      'MAINTENANCE_PAUSED');
    assert.ok((await list(makeRequest(actorA, {}))).drafts.some((d) =>
      d.editorDraftId === mine.editorDraftId));
    await discard(makeRequest(actorA, {
      editorDraftId: mine.editorDraftId, expectedRevision: mine.revision,
      idempotencyKey: key(),
    }));
    await rejectsReason(invokeRead(actorA, mine.editorDraftId), 'RESOURCE_NOT_FOUND');
  } finally {
    await db.doc('maintenanceControls/intake').update({revision: 9, intake: false,
      publication: false});
  }
});
