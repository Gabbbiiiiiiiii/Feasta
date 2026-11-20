const {test} = require('node:test');
const assert = require('node:assert/strict');
const {advanceProviderEligibilityInTransaction: advance} =
  require('../lib/shared/provider-eligibility-revision.js');
const authority = require('../lib/packages/setup-gallery-v2-authority.js');

// Optimistic read-set transaction model. Commits discard pending writes on
// failure and retry on version conflicts, including missing-document creation.
function store(initial) {
  let data = initial === undefined ? undefined : structuredClone(initial);
  let version = 0;
  const provider = {id: 'provider', firestore: {collection(name) {
    assert.equal(name, 'providerEligibilityAuthorities');
    return {doc(id) { assert.equal(id, 'provider'); return {id}; }};
  }}};
  async function run(work) {
    for (;;) {
      const readVersion = version;
      let pending;
      let hasRead = false;
      const tx = {
        async get() {
          assert.equal(pending, undefined, 'all reads precede writes');
          hasRead = true;
          const snapshot = structuredClone(data);
          return {exists: snapshot !== undefined, data: () => snapshot};
        },
        update(_, patch) {
          assert.ok(hasRead);
          assert.notEqual(data, undefined);
          pending = {...data, ...patch};
        },
        create(_, value) {
          assert.ok(hasRead);
          assert.equal(data, undefined);
          pending = value;
        },
      };
      await work(tx, provider);
      if (readVersion !== version) continue;
      if (pending !== undefined) { data = pending; version++; }
      return;
    }
  }
  return {run, value: () => structuredClone(data)};
}
const profile = {ownerId: 'owner', providerServiceType: 'catering',
  serviceCategories: ['food'], eventTypesSupported: ['birthday'],
  verificationStatus: 'draft', isActive: false};

test('legacy initialization never creates approval or inferred capabilities', async () => {
  const db = store();
  await db.run((tx, ref) => advance(tx, ref, null, profile));
  assert.deepEqual(db.value(), {revision: 1});
  assert.throws(() => authority.authorityRevision(undefined));
});

test('new provider creation cannot inherit an orphaned authority', async () => {
  const db = store({revision: 3, approvedOccasionIds: ['wedding']});
  await assert.rejects(db.run((tx, ref) => advance(tx, ref, null, profile)),
    /AUTHORITY_UNAVAILABLE/);
  assert.deepEqual(db.value(), {revision: 3, approvedOccasionIds: ['wedding']});
});

test('legacy no-op does not initialize a missing eligibility revision', async () => {
  const db = store();
  await db.run((tx, ref) => advance(tx, ref, profile, profile));
  assert.equal(db.value(), undefined);
});

test('provider category and event-type changes each invalidate the current generation', async () => {
  const db = store({revision: 4, approvedOccasionIds: ['wedding']});
  for (const patch of [{serviceCategories: ['other_food']},
    {eventTypesSupported: ['wedding']}, {providerServiceType: 'both'}]) {
    await db.run((tx, ref) => advance(tx, ref, profile, {...profile, ...patch}));
  }
  assert.deepEqual(db.value(), {revision: 7, approvedOccasionIds: ['wedding']});
  assert.throws(() => authority.assertAuthorityRevisions([4], [db.value().revision]), /CONFLICT/);
});

test('verification decisions and operational transitions invalidate without granting capabilities', async () => {
  for (const patch of [{verificationStatus: 'submitted'}, {verificationStatus: 'approved'},
    {verificationStatus: 'rejected'}, {verificationStatus: 'suspended'},
    {isActive: true}, {isBlocked: true}, {isSuspended: true}, {isDeleted: true},
    {ownerId: 'new-owner'}]) {
    const db = store({revision: 1});
    await db.run((tx, ref) => advance(tx, ref, profile, {...profile, ...patch}));
    assert.deepEqual(db.value(), {revision: 2});
  }
});

test('owner deactivation fences even an already inactive provider; replay does not increment', async () => {
  const db = store({revision: 1});
  const before = {accountStatus: 'active', isActive: true};
  const after = {accountStatus: 'pending_deletion', isActive: false};
  await db.run((tx, ref) => advance(tx, ref, profile, profile, {before, after}));
  await db.run((tx, ref) => advance(tx, ref, profile, profile, {before: after, after}));
  assert.equal(db.value().revision, 2);
});

test('identical category retry and unrelated V1 profile edits leave revision unchanged', async () => {
  const db = store({revision: 3});
  const changed = {...profile, serviceCategories: ['new']};
  await db.run((tx, ref) => advance(tx, ref, profile, changed));
  await db.run((tx, ref) => advance(tx, ref, changed, structuredClone(changed)));
  await db.run((tx, ref) => advance(tx, ref, changed, {...changed, businessName: 'New name'}));
  assert.deepEqual(db.value(), {revision: 4});
});

test('caller revision and capability fields cannot replace protected sidecar authority', async () => {
  const db = store({revision: 3, approvedOccasionIds: ['wedding']});
  await db.run((tx, ref) => advance(tx, ref, profile,
    {...profile, revision: 999, providerEligibilityRevision: 999, approvedOccasionIds: ['all']}));
  assert.deepEqual(db.value(), {revision: 3, approvedOccasionIds: ['wedding']});
});

test('failed validation or later transaction rejection commits no revision', async () => {
  const db = store({revision: 3});
  await assert.rejects(db.run(async (tx, ref) => {
    await advance(tx, ref, profile, {...profile, isActive: true});
    throw Error('rejected');
  }), /rejected/);
  assert.equal(db.value().revision, 3);
});

test('malformed existing authority and overflow fail closed without replacement', async () => {
  for (const value of [{}, {revision: null}, {revision: 0}, {revision: '1'},
    {revision: 1.5}, {revision: Number.MAX_SAFE_INTEGER}]) {
    const db = store(value);
    await assert.rejects(db.run((tx, ref) => advance(tx, ref, profile,
      {...profile, isActive: true})), /AUTHORITY_UNAVAILABLE/);
    assert.deepEqual(db.value(), value);
  }
});

test('concurrent administrator/provider invalidations retry without a lost increment', async () => {
  for (const initial of [undefined, {revision: 9, approvedOccasionIds: ['wedding']}]) {
    const db = store(initial);
    await Promise.all([
      db.run((tx, ref) => advance(tx, ref, profile, {...profile, isActive: true})),
      db.run((tx, ref) => advance(tx, ref, profile, {...profile, serviceCategories: ['new']})),
    ]);
    assert.equal(db.value().revision, initial ? 11 : 2);
    assert.deepEqual(db.value().approvedOccasionIds, initial?.approvedOccasionIds);
  }
});

test('policy cannot activate V2 while uncovered writers remain', () => {
  assert.equal(authority.SETUP_GALLERY_WRITER_COVERAGE_VERIFIED, false);
  assert.equal(authority.setupGalleryGate(undefined, 'test', 1, 'privateWrites'), false);
  assert.equal(authority.setupGalleryGate(undefined, 'test', 1, 'publicReads'), false);
});

test('eventual gallery compares every revision from the same transaction snapshot', () => {
  // Provider eligibility, occasion catalog, protected policy, and gallery.
  // Capability/category/owner documents must additionally be transaction reads;
  // this comparison alone never certifies them or their writer coverage.
  const expected = [2, 3, 4, 5];
  authority.assertAuthorityRevisions(expected, expected);
  for (let index = 0; index < expected.length; index++) {
    const current = [...expected];
    current[index]++;
    assert.throws(() => authority.assertAuthorityRevisions(expected, current), /CONFLICT/);
    current[index] = undefined;
    assert.throws(() => authority.assertAuthorityRevisions(expected, current), /UNAVAILABLE/);
  }
});
