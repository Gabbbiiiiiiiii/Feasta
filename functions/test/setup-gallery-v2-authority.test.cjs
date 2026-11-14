const {test} = require('node:test');
const assert = require('node:assert/strict');
const a = require('../lib/packages/setup-gallery-v2-authority.js');

const policy = (changes = {}) => ({revision: 1, effectiveEnvironment: 'feasta-test',
  validFromMillis: 1, validUntilMillis: 100, privateWrites: false, publicReads: false,
  maxSpecificOccasions: 10, maxApplicableOccasions: 20, maxCatalogRecords: 30,
  pageSize: 2, maxPages: 20, requireCurrentRevisions: true, requireValidEligibility: true,
  ...changes});
const parse = (p) => a.parseSetupGalleryPolicy(p, 'feasta-test', 50);

test('revision initialization is distinct from valid current authority', () => {
  assert.equal(a.nextEligibilityRevision(undefined), 1);
  assert.throws(() => a.authorityRevision(undefined));
  for (const v of [null, 0, -1, 1.2, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => a.authorityRevision(v));
    assert.throws(() => a.nextEligibilityRevision(v));
  }
  assert.throws(() => a.nextEligibilityRevision(Number.MAX_SAFE_INTEGER));
});
test('capability/category generations invalidate previous comparisons', () => {
  const initial = a.nextEligibilityRevision(undefined);
  const capabilityChange = a.nextEligibilityRevision(initial);
  const categoryChange = a.nextEligibilityRevision(capabilityChange);
  assert.throws(() => a.assertAuthorityRevisions([initial], [capabilityChange]), /CONFLICT/);
  assert.throws(() => a.assertAuthorityRevisions([capabilityChange], [categoryChange]), /CONFLICT/);
});
test('policy and catalog stale or malformed revisions reject', () => {
  a.assertAuthorityRevisions([1, 2, 3], [1, 2, 3]);
  for (const current of [[1, 3, 3], [1, 2, 4], [undefined, 2, 3], [1]]) {
    assert.throws(() => a.assertAuthorityRevisions([1, 2, 3], current));
  }
});
test('both gates default disabled and configuration cannot override incomplete coverage', () => {
  assert.equal(a.SETUP_GALLERY_WRITER_COVERAGE_VERIFIED, false);
  for (const p of [undefined, null, {}, policy(), policy({privateWrites: true, publicReads: true})]) {
    for (const gate of ['privateWrites', 'publicReads']) {
      assert.equal(a.setupGalleryGate(p, 'feasta-test', 50, gate), false);
    }
  }
});
test('strict policy rejects stale, foreign, incomplete and weakened configuration', () => {
  assert.equal(parse(policy()).maxSpecificOccasions, 10);
  for (const changes of [{revision: 0}, {effectiveEnvironment: 'production'},
    {validFromMillis: 51}, {validUntilMillis: 50}, {publicReads: undefined},
    {requireValidEligibility: false}, {requireCurrentRevisions: false},
    {maxSpecificOccasions: 11}, {maxPages: 101}, {pageSize: 101},
    {maxApplicableOccasions: 31}, {developerOverride: true}]) {
    assert.throws(() => parse(policy(changes)));
  }
});
test('complete catalog enumeration includes all pages, beyond ten occasions', async () => {
  const records = Array.from({length: 13}, (_, n) => ({id: `occasion_${String(n).padStart(2, '0')}`}));
  const cursors = [];
  const result = await a.enumerateSetupGalleryCatalog(parse(policy()), async (after, size) => {
    cursors.push(after);
    return records.filter((r) => after === null || r.id > after).slice(0, size);
  });
  assert.deepEqual(result, records);
  assert.equal(cursors.length, 8);
});
test('enumeration fails closed at document/page budgets and invalid cursor progress', async () => {
  await assert.rejects(a.enumerateSetupGalleryCatalog(parse(policy({maxPages: 1})),
    async () => [{id: 'a'}]));
  await assert.rejects(a.enumerateSetupGalleryCatalog(parse(policy({maxSpecificOccasions: 1,
    maxApplicableOccasions: 1, maxCatalogRecords: 1})), async () => [{id: 'a'}, {id: 'b'}]));
  await assert.rejects(a.enumerateSetupGalleryCatalog(parse(policy()), async () => [{id: 'a'}]));
  await assert.rejects(a.enumerateSetupGalleryCatalog(parse(policy()),
    async () => [{id: 'b'}, {id: 'a'}]));
});
