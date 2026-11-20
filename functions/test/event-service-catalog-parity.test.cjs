const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const ts = require('typescript');
let shared;
let records = new Map();
const document = (collection, id) => ({id, exists: records.has(`${collection}/${id}`), data: () => records.get(`${collection}/${id}`)});
const db = {
 collection: (name) => {
  const filters = []; let maximum = Infinity;
  const query = {
   where: (field, op, value) => { assert.equal(op, '=='); filters.push([field, value]); return query; },
   limit: (value) => {maximum = value; return query;},
   doc: (id) => ({collection: name, id}),
   get: async () => ({docs: [...records.keys()].filter(key => key.startsWith(`${name}/`))
    .map(key => document(name, key.split('/')[1])).filter(doc => filters.every(([field, value]) => doc.data()[field] === value)).slice(0, maximum)}),
  }; return query;
 },
 getAll: async (...refs) => refs.map(ref => document(ref.collection, ref.id)),
};
function load(filename) {
 const module = {exports: {}};
 const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 const resolve = (id) => {
  if (id === 'server-only') return {};
  if (id === '@feasta/shared-types') return shared;
  if (id === '@feasta/shared-types/freelance-service-details') return require('../../packages/shared-types/dist/freelance-service-details.cjs');
  if (id.endsWith('/firebase/admin')) return {adminDb: db};
  if (id.endsWith('/shared/firestore.js')) return {db};
  if (id.endsWith('/shared/function-options.js')) return {appCheckCallableOptions: {}};
  if (id.endsWith('/shared/rate-limit.js')) return {enforceCallableRateLimit: async () => {}};
  if (id === 'firebase-functions/v2/https') return {onCall: (_, run) => ({run}), HttpsError: class extends Error {constructor(code, message) {super(message); this.code = code;}}};
  if (id === './public-review-summary') return {publicReviewSummary: () => null};
  if (id.startsWith('@/')) return load(path.resolve(__dirname, '../../apps/web/src', id.slice(2) + '.ts'));
  if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '') + '.ts'));
  throw new Error(`Unexpected dependency ${id}`);
 };
 vm.runInNewContext('(function(require,module,exports){' + code + '\n})', {URL, Map, Set})(resolve, module, module.exports);
 return module.exports;
}
shared = Object.assign({}, ...['enums', 'collections', 'service-category'].map(name => load(path.resolve(__dirname, '../../packages/shared-types/src', name + '.ts'))));
const mobile = load(path.resolve(__dirname, '../src/catalog/list-customer-event-services.ts'));
const web = load(path.resolve(__dirname, '../../apps/web/src/lib/customer/discovery/event-service-discovery-service.ts'));
function seed({addon = {}, provider = {}, owner = {}} = {}) {
 records = new Map([
  ['addons/photo', {providerId: 'studio', ownerId: 'owner', name: 'Portrait session', description: 'Studio portraits', category: 'Photography', price: 845, imageUrl: 'https://example.com/photo.jpg', status: 'published', isPublished: true, isActive: true, isAvailable: true, ...addon}],
  ['providers/studio', {ownerId: 'owner', businessName: 'Test Studio', providerServiceType: 'addon', verificationStatus: 'approved', publiclyVisible: true, isActive: true, bookingLeadTimeDays: 7, ...provider}],
  ['users/owner', {role: 'provider', providerId: 'studio', accountStatus: 'active', ...owner}],
 ]);
}
async function parity() {
 const expected = (await web.getPublicEventServices('caterer')).services;
 const actual = (await mobile.loadPublicEventServices('caterer')).services;
 // Mobile adds lead-time and revision metadata; browsing stays identical to Web.
 assert.deepEqual(JSON.parse(JSON.stringify(actual.map(({bookingLeadTimeDays, revision, ...rest}) => rest))), JSON.parse(JSON.stringify(expected)));
 return actual;
}
test('catalog matches Web without legacy providerType, createdAt or isDeleted fields', async () => {
 seed(); const services = await parity(); assert.equal(services.length, 1);
 assert.equal(services[0].providerName, 'Test Studio'); assert.equal(services[0].price, 845);
 assert.equal(services[0].imageUrl, 'https://example.com/photo.jpg'); assert.equal(services[0].bookingLeadTimeDays, 7);
 assert.equal(services[0].source, 'feasta_addon_provider');
 assert.equal((await mobile.loadPublicEventServices('studio')).services[0].source, 'catering_provider');
});
for (const [name, changes] of Object.entries({
 unpublished: {addon: {isPublished: false}}, draft: {addon: {status: 'draft'}}, deleted: {addon: {isDeleted: true}}, inactive: {addon: {isActive: false}}, unavailable: {addon: {isAvailable: false}},
 'foreign owner': {addon: {ownerId: 'foreign'}}, 'hidden provider': {provider: {publiclyVisible: false}}, unverified: {provider: {verificationStatus: 'pending'}}, suspended: {provider: {isSuspended: true}},
 'blocked owner': {owner: {isBlocked: true}}, 'inactive owner': {owner: {accountStatus: 'disabled'}}, 'owner mismatch': {owner: {providerId: 'foreign'}}, 'missing business name': {provider: {businessName: ''}}, 'invalid service type': {provider: {providerServiceType: 'invalid'}},
})) test(`Web and Mobile both exclude ${name}`, async () => {seed(changes); assert.equal((await parity()).length, 0);});
test('exact-id revalidation repeats owner eligibility and ignores catalog window', async () => {
 seed(); assert.equal((await mobile.loadPublicEventServices('caterer', 'photo')).services.length, 1);
 records.get('users/owner').isBlocked = true;
 assert.equal((await mobile.loadPublicEventServices('caterer', 'photo')).services.length, 0);
 assert.equal((await mobile.loadPublicEventServices('caterer', 'missing')).services.length, 0);
});
test('callable rejects parameter injection and invalid document ids', async () => {
 for (const data of [null, {}, {cateringProviderId: '../private'}, {cateringProviderId: 'caterer', addonId: 'a/b'}, {cateringProviderId: 'caterer', ownerId: 'owner'}]) {
  await assert.rejects(mobile.listCustomerEventServices.run({data}), {code: 'invalid-argument'});
 }
});

for (const revision of [1, 7, Number.MAX_SAFE_INTEGER]) {
 test(`catalog returns authoritative stored revision ${revision}`, async () => {
  seed({addon: {revision}});
  const services = await parity();
  assert.equal(services[0].revision, revision);
  const exact = await mobile.listCustomerEventServices.run({
   data: {cateringProviderId: 'caterer', addonId: 'photo'},
  });
  assert.equal(exact.services[0].id, 'photo');
  assert.equal(exact.services[0].providerId, 'studio');
  assert.equal(exact.services[0].revision, revision);
 });
}

for (const [label, revision] of [
 ['missing', undefined], ['null', null], ['zero', 0], ['negative', -1],
 ['fraction', 1.5], ['string', '7'], ['boolean', true], ['object', {}],
 ['NaN', NaN], ['infinite', Infinity], ['unsafe', Number.MAX_SAFE_INTEGER + 1],
]) {
 test(`${label} revision preserves browsing with explicitly unavailable booking metadata`, async () => {
  seed({addon: {revision}});
  const services = await parity();
  assert.equal(services.length, 1);
  assert.equal(services[0].revision, null);
  const exact = (await mobile.loadPublicEventServices('caterer', 'photo')).services;
  assert.equal(exact.length, 1);
  assert.equal(exact[0].revision, null);
 });
}

test('revisions stay linked to the exact service and verified provider', async () => {
 seed({addon: {revision: 3}});
 records.set('addons/wedding', {...records.get('addons/photo'), name: 'Wedding coverage', revision: 8});
 records.set('addons/music', {...records.get('addons/photo'), providerId: 'musician', ownerId: 'music_owner', name: 'Music', revision: 12});
 records.set('providers/musician', {...records.get('providers/studio'), ownerId: 'music_owner'});
 records.set('users/music_owner', {...records.get('users/owner'), providerId: 'musician'});
 const services = (await mobile.loadPublicEventServices('caterer')).services;
 assert.equal(services.length, 3);
 for (const [id, providerId, revision] of [['photo', 'studio', 3], ['wedding', 'studio', 8], ['music', 'musician', 12]]) {
  const service = services.find(service => service.id === id);
  assert.equal(service.providerId, providerId);
  assert.equal(service.revision, revision);
 }
 records.get('addons/music').ownerId = 'owner';
 assert.equal((await mobile.loadPublicEventServices('caterer', 'music')).services.length, 0);
});

test('a valid revision never bypasses publication or owner visibility', async () => {
 for (const changes of [
  {addon: {revision: 3, isPublished: false}},
  {addon: {revision: 3, isAvailable: false}},
  {addon: {revision: 3, ownerId: 'foreign'}},
  {addon: {revision: 3}, owner: {isBlocked: true}},
 ]) {
  seed(changes);
  assert.equal((await parity()).length, 0);
 }
});

test('callable never accepts a client-supplied revision', async () => {
 seed({addon: {revision: 7}});
 await assert.rejects(mobile.listCustomerEventServices.run({
  data: {cateringProviderId: 'caterer', addonId: 'photo', revision: 1},
 }), {code: 'invalid-argument'});
});
