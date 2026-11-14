const assert = require('node:assert/strict');
const {test} = require('node:test');

const policy = require('../lib/packages/provider-package-v2-policy-read.js');
const core = require('../lib/packages/provider-package-v2-public-occasion-contract.js');

const validPolicy = {
  revision: 1, effectiveEnvironment: 'feasta-catering-system',
  featureGates: {occasionCatalogReads: true},
  maxSpecificOccasions: 10, maxPendingSuggestionsPerProvider: 3, maxThemeImages: 4,
};
const key = Buffer.alloc(32, 7);
const request = core.parseListApprovedOccasionsInput({pageSize: 5,
  serviceCategoryCode: 'catering_service'});

test('missing and disabled policy fail closed', () => {
  assert.throws(() => policy.parseOccasionCatalogReadPolicy(null, 'feasta-catering-system'),
    {code: 'failed-precondition'});
  assert.throws(() => policy.parseOccasionCatalogReadPolicy({
    ...validPolicy, featureGates: {occasionCatalogReads: false},
  }, 'feasta-catering-system'), {code: 'failed-precondition'});
});
test('policy validates environment and configured limits', () => {
  assert.equal(policy.parseOccasionCatalogReadPolicy(validPolicy,
    'feasta-catering-system').maxThemeImages, 4);
  assert.throws(() => policy.parseOccasionCatalogReadPolicy(validPolicy, 'wrong-env'),
    {code: 'failed-precondition'});
  assert.throws(() => policy.parseOccasionCatalogReadPolicy({...validPolicy,
    maxThemeImages: 'unlimited'}, 'feasta-catering-system'), {code: 'failed-precondition'});
});
test('request parser rejects unknown fields and malformed category', () => {
  assert.equal(core.parseListApprovedOccasionsInput({}).pageSize, 50);
  assert.throws(() => core.parseListApprovedOccasionsInput({active: true}),
    {code: 'invalid-argument'});
  assert.throws(() => core.parseListApprovedOccasionsInput({serviceCategoryCode: 'Catering'}),
    {code: 'invalid-argument'});
});
test('public projection strips private fields', () => {
  const item = core.projectPublicOccasionV2('birthday', {
    id: 'birthday', label: 'Birthday', active: true, moderationState: 'approved',
    applicableServiceCategoryCodes: ['catering_service'], sortOrder: 10, revision: 2,
    createdBy: 'secret-user', normalizedName: 'private', aliases: ['hidden'],
  });
  assert.deepEqual(Object.keys(item).sort(), [
    'applicableServiceCategoryCodes', 'id', 'label', 'revision', 'sortOrder']);
  assert.equal(JSON.stringify(item).includes('secret-user'), false);
});
test('HMAC cursor detects tampering and filter mismatch', () => {
  const token = core.encodeOccasionCursor(12, request, {sortOrder: 10, id: 'birthday'}, key);
  assert.deepEqual(core.decodeOccasionCursor(12, {...request, cursor: token}, key),
    {sortOrder: 10, id: 'birthday'});
  assert.throws(() => core.decodeOccasionCursor(12,
    {...request, pageSize: 6, cursor: token}, key), {code: 'invalid-argument'});
  assert.throws(() => core.decodeOccasionCursor(12,
    {...request, cursor: token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')}, key),
    {code: 'invalid-argument'});
});
test('stale catalog generation requires refresh', () => {
  const cursor = core.encodeOccasionCursor(12, request, {sortOrder: 10, id: 'birthday'}, key);
  assert.throws(() => core.decodeOccasionCursor(13, {...request, cursor}, key),
    {code: 'aborted'});
});
test('inactive or unapproved records never project publicly', () => {
  const active = {id: 'birthday', label: 'Birthday', active: true,
    moderationState: 'approved', applicableServiceCategoryCodes: ['catering_service'],
    sortOrder: 10, revision: 1};
  assert.throws(() => core.projectPublicOccasionV2('birthday',
    {...active, active: false}), {code: 'failed-precondition'});
  assert.throws(() => core.projectPublicOccasionV2('birthday',
    {...active, moderationState: 'pending'}), {code: 'failed-precondition'});
});
function occasion(id, sortOrder, applicableServiceCategoryCodes = ['catering_service']) {
  return {id, data: {id, label: id.toUpperCase(), active: true,
    moderationState: 'approved', applicableServiceCategoryCodes,
    sortOrder, revision: 1}};
}
test('bounded gateway filters categories without exposing other occasions', () => {
  const candidates = [
    occasion('birthday', 10, ['catering_service']),
    occasion('corporate', 20, ['photographer']),
    occasion('debut', 30, ['catering_service']),
    occasion('graduation', 40, ['catering_service']),
  ];
  const page1 = core.consumeOccasionCatalogCandidates(candidates, request);
  assert.deepEqual(page1.items.map((item) => item.id),
    ['birthday', 'debut', 'graduation']);
  assert.equal(page1.nextPosition, null);
  const small = {...request, pageSize: 1};
  const first = core.consumeOccasionCatalogCandidates(candidates, small);
  assert.deepEqual(first.items.map((item) => item.id), ['birthday']);
  assert.deepEqual(first.nextPosition, {id: 'birthday', sortOrder: 10});
  const second = core.consumeOccasionCatalogCandidates(candidates.slice(1), small);
  assert.deepEqual(second.items.map((item) => item.id), ['debut']);
  assert.deepEqual(second.nextPosition, {id: 'debut', sortOrder: 30});
});
test('sparse filtered pages advance without returning irrelevant records', () => {
  const candidates = Array.from({length: 201}, (_, index) =>
    occasion(`occ_${String(index).padStart(3, '0')}`, index,
      index === 200 ? ['catering_service'] : ['photographer']));
  const page = core.consumeOccasionCatalogCandidates(candidates, request);
  assert.deepEqual(page.items, []);
  assert.deepEqual(page.nextPosition, {id: 'occ_199', sortOrder: 199});
  const following = core.consumeOccasionCatalogCandidates(candidates.slice(200), request);
  assert.equal(following.items[0].id, 'occ_200');
  assert.equal(following.nextPosition, null);
});
test('bounded gateway rejects inconsistent or unapproved candidate rows', () => {
  const valid = occasion('birthday', 10);
  assert.throws(() => core.consumeOccasionCatalogCandidates(
    [valid, {...valid, id: 'anniversary', data: {...valid.data, id: 'anniversary'}}],
    request), {code: 'failed-precondition'});
  assert.throws(() => core.consumeOccasionCatalogCandidates(
    [occasion('birthday', 10), {...occasion('wedding', 20),
      data: {...occasion('wedding', 20).data, moderationState: 'pending'}}],
    request), {code: 'failed-precondition'});
  assert.throws(() => core.consumeOccasionCatalogCandidates(
    Array.from({length: 202}, (_, index) => occasion(`occ_${index}`, index)),
    request), {code: 'failed-precondition'});
});
