import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const functionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromFunctions = createRequire(path.join(functionsRoot, 'package.json'));
const ts = requireFromFunctions('typescript');
const source = (p) => readFileSync(path.join(functionsRoot, p), 'utf8');

function executeTypeScript(text, globals, filename) {
  const {outputText} = ts.transpileModule(text, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  const exports = {};
  vm.runInNewContext(outputText, {...globals, exports, URL}, {filename, timeout: 1000});
  return exports;
}

class CallableError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const policySource = source('src/shared/function-options.ts').replace(/^import .*?;\r?\n/gm, '');
const policy = executeTypeScript(policySource, {
  FUNCTION_REGION: 'asia-southeast1',
  process: {env: {}},
}, 'function-options.ts');

const catalogSource = source('src/catalog/list-public-service-categories.ts');
const categorySourceWithoutImports = catalogSource.replace(/^import .*?;\r?\n/gm, '');
const indexSource = source('src/index.ts');
const mapFragment = indexSource.match(/^export const reverseGeocodePublic = onCall\(guestMapsCallableOptions, async \(request\) => \{[\s\S]*?^\}\);/m)?.[0];
assert.ok(mapFragment, 'reverseGeocodePublic must exist exactly as a callable');
assert.ok(!/requireAuth\(|requireActiveUser\(/.test(mapFragment), 'guest geocoding must not require sign-in');

function categoryHarness(rows, {rateLimitError} = {}) {
  const observed = {policies: [], options: null, reads: 0};
  const db = {
    collection(name) {
      assert.equal(name, 'serviceCategories');
      let selected = rows.slice();
      return {
        where(field, operator, value) {
          assert.deepEqual([field, operator, value], ['status', '==', 'active']);
          selected = selected.filter((row) => row.data.status === value);
          return this;
        },
        limit(maximum) {
          assert.equal(maximum, 201);
          selected = selected.slice(0, maximum);
          return this;
        },
        async get() {
          observed.reads += 1;
          return {
            size: selected.length,
            docs: selected.map((row) => ({id: row.id, data: () => row.data})),
          };
        },
      };
    },
  };
  const {listPublicServiceCategories} = executeTypeScript(
    categorySourceWithoutImports,
    {
      onCall(options, handler) {
        observed.options = options;
        return handler;
      },
      HttpsError: CallableError,
      db,
      appCheckCallableOptions: policy.appCheckCallableOptions,
      async enforceCallableRateLimit(_request, config) {
        observed.policies.push(config);
        if (rateLimitError) throw rateLimitError;
      },
    },
    'list-public-service-categories.ts',
  );
  return {call: listPublicServiceCategories, observed};
}

function mapHarness({response, rateLimitError} = {}) {
  const observed = {policies: [], options: null, fetched: 0, regionalChecks: 0};
  const {reverseGeocodePublic} = executeTypeScript(mapFragment, {
    onCall(options, handler) {
      observed.options = options;
      return handler;
    },
    guestMapsCallableOptions: policy.appCheckCallableOptions,
    HttpsError: CallableError,
    async enforceCallableRateLimit(_request, config) {
      observed.policies.push(config);
      if (rateLimitError) throw rateLimitError;
    },
    asRecord(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new CallableError('invalid-argument', 'Expected object');
      }
      return input;
    },
    requireCoordinate(data, key, minimum, maximum) {
      const value = data[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw new CallableError('invalid-argument', `Invalid ${key}`);
      }
      return value;
    },
    requirePhilippinesLocation(latitude, longitude) {
      observed.regionalChecks += 1;
      // Test-double boundary only: the production validator must be tested separately.
      if (latitude < 4 || latitude > 22 || longitude < 116 || longitude > 127) {
        throw new CallableError('invalid-argument', 'Outside Philippines');
      }
    },
    getGoogleMapsApiKey() {
      return 'SYNTHETIC_TEST_KEY';
    },
    async fetchCachedGoogleJson(uri, _options, ttlSeconds) {
      observed.fetched += 1;
      const url = new URL(uri);
      assert.equal(url.hostname, 'maps.googleapis.com');
      assert.equal(url.pathname, '/maps/api/geocode/json');
      assert.equal(url.searchParams.get('region'), 'ph');
      assert.equal(url.searchParams.get('latlng'), '11.0064,124.6075');
      assert.equal(ttlSeconds, 86400);
      return response ?? {
        status: 'OK',
        results: [{
          formatted_address: 'Example Street, Philippines',
          address_components: [],
          geometry: {location: {lat: 11.0064, lng: 124.6075}},
        }],
      };
    },
    buildStructuredAddress(input) {
      return {
        fullAddress: input.fullAddress,
        latitude: input.latitude,
        longitude: input.longitude,
      };
    },
    logger: {warn() {}},
    toHttpsError(error) {
      return error;
    },
  }, 'reverse-geocode-public.ts');
  return {call: reverseGeocodePublic, observed};
}

const item = (id, name, serviceType = 'addon', status = 'active', extra = {}) => ({
  id,
  data: {name, serviceType, status, ...extra},
});
const guest = (data = {}) => ({data, rawRequest: {ip: '192.0.2.3'}});
const validPosition = {latitude: 11.0064, longitude: 124.6075};

test('production callable policy requires App Check and permits unauthenticated invocation', () => {
  assert.equal(policy.shouldEnforceAppCheck({}), true);
  assert.equal(policy.shouldEnforceAppCheck({FUNCTIONS_EMULATOR: 'true'}), false);
  assert.equal(policy.appCheckCallableOptions.enforceAppCheck, true);
  assert.equal(policy.appCheckCallableOptions.invoker, 'public');
  assert.equal(policy.appCheckCallableOptions.region, 'asia-southeast1');
});

test('catalog returns sorted active public fields to unsigned guest', async () => {
  const h = categoryHarness([
    item('photo', 'Photography', 'addon', 'active', {privateNote: 'NOT_PUBLIC'}),
    item('buffet', 'Buffet Catering', 'catering'),
    item('retired', 'Retired', 'addon', 'discontinued'),
    item('broken', '', 'addon'),
  ]);
  const response = await h.call(guest());
  assert.deepEqual(JSON.parse(JSON.stringify(response)), {items: [
    {code: 'buffet', name: 'Buffet Catering', serviceType: 'catering', status: 'active'},
    {code: 'photo', name: 'Photography', serviceType: 'addon', status: 'active'},
  ]});
  assert.equal(h.observed.options.enforceAppCheck, true);
  assert.equal(h.observed.policies[0].scope, 'listPublicServiceCategories');
  assert.equal(h.observed.policies[0].limit, 60);
  assert.equal(h.observed.reads, 1);
});

test('catalog rejects parameters and oversized results', async () => {
  const h = categoryHarness([item('buffet', 'Buffet')]);
  await assert.rejects(h.call(guest({unexpected: true})), {code: 'invalid-argument'});
  assert.equal(h.observed.reads, 0);
  const many = categoryHarness(Array.from({length: 201}, (_, i) => item(`service_${i}`, 'Service')));
  await assert.rejects(many.call(guest()), {code: 'failed-precondition'});
});

test('catalog propagates rate limit rejection without querying Firestore', async () => {
  const h = categoryHarness([item('buffet', 'Buffet')], {
    rateLimitError: new CallableError('resource-exhausted', 'Too many requests'),
  });
  await assert.rejects(h.call(guest()), {code: 'resource-exhausted'});
  assert.equal(h.observed.reads, 0);
});

test('public reverse geocoding accepts guest, checks Philippines, and returns structured address', async () => {
  const h = mapHarness();
  const response = await h.call(guest(validPosition));
  assert.equal(response.fullAddress, 'Example Street, Philippines');
  assert.equal(h.observed.regionalChecks, 1);
  assert.equal(h.observed.fetched, 1);
  assert.equal(h.observed.options.enforceAppCheck, true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.observed.policies[0])), {
    scope: 'maps.reverseGeocodePublic', limit: 12, windowSeconds: 60,
  });
});

test('public geocoding rejects invalid and out-of-country coordinates before Google API', async () => {
  for (const input of [
    {latitude: '11', longitude: 124.6075},
    {latitude: 91, longitude: 124.6075},
    {latitude: 11.0064, longitude: 200},
    {latitude: 40.7128, longitude: -74.006},
  ]) {
    const h = mapHarness();
    await assert.rejects(h.call(guest(input)), {code: 'invalid-argument'});
    assert.equal(h.observed.fetched, 0);
  }
});

test('public geocoding returns defined failures for empty or rejected Google results', async () => {
  const none = mapHarness({response: {status: 'ZERO_RESULTS'}});
  await assert.rejects(none.call(guest(validPosition)), {code: 'not-found'});
  const denied = mapHarness({response: {status: 'REQUEST_DENIED', error_message: 'test failure'}});
  await assert.rejects(denied.call(guest(validPosition)), {code: 'unavailable'});
});

test('public geocoding enforces rate limit before external API request', async () => {
  const h = mapHarness({rateLimitError: new CallableError('resource-exhausted', 'Limited')});
  await assert.rejects(h.call(guest(validPosition)), {code: 'resource-exhausted'});
  assert.equal(h.observed.fetched, 0);
});
