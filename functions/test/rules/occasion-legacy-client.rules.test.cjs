const {before, after, beforeEach, test} = require('node:test');
const assert = require('node:assert/strict');
const {assertFails, assertSucceeds} = require('@firebase/rules-unit-testing');
const {doc, getDoc, getDocs, collection, query, where} = require('firebase/firestore');
const {createRulesTestEnvironment, seedDocuments, userData, authenticated} = require('./rules-test-helpers.cjs');

let env;
before(async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT ?? '', /^demo-/);
  env = await createRulesTestEnvironment();
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seed(published) {
  await seedDocuments(env, {
    'users/owner': userData('owner', 'provider', {providerId: 'provider'}),
    'users/customer': userData('customer', 'customer'),
    'providers/provider': {ownerId: 'owner', businessName: 'Business', description: 'Description',
      address: '123 Street', city: 'Ormoc', province: 'Leyte', providerServiceType: 'catering',
      verificationStatus: 'approved', publiclyVisible: true, isActive: true,
      isSuspended: false, isDeleted: false},
    'packages/v2': {providerId: 'provider', occasionSchemaVersion: 2,
      status: published ? 'published' : 'draft', isPublished: published, isActive: published,
      providerPubliclyVisible: true, isDeleted: false, publishedAt: new Date()},
    'occasions/birthday': {id: 'birthday', active: false, moderationState: 'approved', revision: 1},
    'mainEvents/history': {customerId: 'customer', packageId: 'v2', packageName: 'Historical snapshot',
      status: 'confirmed', createdAt: new Date()},
  });
}

const oldQuery = (db) => query(collection(db, 'packages'), where('status', '==', 'published'),
  where('isActive', '==', true), where('isPublished', '==', true),
  where('providerPubliclyVisible', '==', true), where('isDeleted', '==', false));

test('withdrawal blocks legacy direct reads and excludes discovery without blocking history', async () => {
  await seed(false);
  const guest = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(guest, 'packages/v2')));
  assert.equal((await assertSucceeds(getDocs(oldQuery(guest)))).size, 0);
  const customer = authenticated(env, 'customer', 'customer').firestore();
  const history = await assertSucceeds(getDoc(doc(customer, 'mainEvents/history')));
  assert.equal(history.data().packageName, 'Historical snapshot');
  await assertFails(getDoc(doc(guest, 'mainEvents/history')));
});

// Characterization of an unresolved release blocker, NOT proof of V2 readiness.
// Rules are not filters: adding a schema condition would also reject old queries.
test('rollout blocker: current public rules expose V2 if any Admin writer publishes it', async () => {
  await seed(true);
  const guest = env.unauthenticatedContext().firestore();
  assert.equal((await assertSucceeds(getDoc(doc(guest, 'packages/v2')))).data().occasionSchemaVersion, 2);
  assert.equal((await assertSucceeds(getDocs(oldQuery(guest)))).size, 1);
});
