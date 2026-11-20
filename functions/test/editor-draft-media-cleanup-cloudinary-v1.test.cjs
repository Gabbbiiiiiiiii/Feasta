const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const publicId = 'feasta/providers/owner/editor-drafts/draft/package/asset';
function fixture(options = {}) {
  const calls = [];
  const filename = path.resolve(__dirname, '../lib/shared/cloudinary.js');
  const actual = createRequire(filename);
  const module = {exports: {}};
  const cloudinary = {config() {}, api: {
    async resource(id, opts) {
      calls.push(['lookup', id, opts]);
      if (options.error) throw options.error;
      return {public_id: publicId, asset_id: 'immutable_asset', version: 123,
        resource_type: 'image', type: 'upload', ...options.resource};
    },
    async delete_resources_by_asset_ids(ids, opts) {
      calls.push(['delete', ids, opts]);
      if (options.error) throw options.error;
      return options.response ?? {deleted: {[publicId]: 'deleted'}, partial: false};
    },
  }};
  const overrides = {
    cloudinary: {v2: cloudinary},
    'firebase-functions/params': {defineSecret: () => ({value: () => 'test_secret_value'})},
  };
  vm.runInThisContext('(function(module,exports,require){' + fs.readFileSync(filename, 'utf8') + '\n})',
    {filename})(module, module.exports, id => Object.hasOwn(overrides, id) ? overrides[id] : actual(id));
  return {...module.exports, calls};
}
test('real cleanup bridge looks up exact image/upload scope and deletes only immutable asset ID', async () => {
  const f = fixture();
  assert.deepEqual(await f.lookupEditorDraftCleanupResourceV1(publicId),
    {publicId, assetId: 'immutable_asset', version: 123});
  await f.deleteEditorDraftCleanupResourceV1('immutable_asset', publicId);
  assert.deepEqual(f.calls[1], ['delete', ['immutable_asset'], {invalidate: true, timeout: 5000}]);
  assert.deepEqual(f.calls[0], ['lookup', publicId, {resource_type: 'image', type: 'upload', timeout: 5000}]);
});
for (const error of [{http_code: 404}, {error: {http_code: 404}}]) {
  test('authenticated Admin lookup 404 is missing ' + JSON.stringify(error), async () => {
    assert.equal(await fixture({error}).lookupEditorDraftCleanupResourceV1(publicId), null);
  });
}
for (const error of [{http_code: 500}, {http_code: 401}, new Error('timeout')]) {
  test('lookup errors cannot become absent-resource proof ' + JSON.stringify(error), async () => {
    await assert.rejects(fixture({error}).lookupEditorDraftCleanupResourceV1(publicId));
  });
}
for (const resource of [{public_id: 'other'}, {asset_id: ''}, {version: 0},
  {resource_type: 'video'}, {type: 'private'}]) {
  test('invalid lookup evidence fails closed ' + JSON.stringify(resource), async () => {
    await assert.rejects(fixture({resource}).lookupEditorDraftCleanupResourceV1(publicId));
  });
}
for (const response of [{deleted: {[publicId]: 'pending'}}, {deleted: {other: 'deleted'}},
  {deleted: {[publicId]: 'deleted'}, partial: true}, {}]) {
  test('ambiguous deletion response stays retryable ' + JSON.stringify(response), async () => {
    await assert.rejects(fixture({response}).deleteEditorDraftCleanupResourceV1('immutable_asset', publicId));
  });
}
test('missing deletion response and invalid scope never authorize wildcard/public-ID deletion', async () => {
  const f = fixture();
  await assert.rejects(f.lookupEditorDraftCleanupResourceV1('feasta/providers/owner/services/asset/image'));
  await assert.rejects(f.deleteEditorDraftCleanupResourceV1('../other', publicId));
  assert.equal(f.calls.length, 0);
});
