/** Regression for the missing lifecycle release authorization gate.
 * Uses the compiled callable with mocked Firebase dependencies. These checks
 * do not claim live App Check, IAM, Firestore or old-client E2E evidence.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');

const srcRoot = resolve(__dirname, '../src');
const code = readFileSync(resolve(__dirname, '../lib/admin/occasion-lifecycle-actions.js'), 'utf8');
const readinessSource = readFileSync(resolve(srcRoot, 'admin/occasion-activation-readiness.ts'), 'utf8');
const actionsSource = readFileSync(resolve(srcRoot, 'admin/occasion-lifecycle-actions.ts'), 'utf8');

const requiredSafeguards = [
  'RELEASE_AUTHORIZATION_UNVERIFIED',
  'ELIGIBILITY_WRITER_COVERAGE_UNVERIFIED',
  'AFFECTED_INVENTORY_UNVERIFIED',
  'PUBLICATION_WITHDRAWAL_UNAVAILABLE',
  'BOOKING_COMPATIBILITY_UNVERIFIED',
  'CUSTOMER_WEB_COMPATIBILITY_UNVERIFIED',
  'FLUTTER_COMPATIBILITY_UNVERIFIED',
  'INDEX_QUERY_READINESS_UNVERIFIED',
  'GENERATION_COORDINATION_UNAVAILABLE',
  'DEPLOYMENT_SECURITY_GATES_UNVERIFIED',
];

function fixture({completed = false, packages = [], events = [], requests = []} = {}) {
  let atomicCalls = 0;
  let txWrites = 0;
  let transactionCalls = 0;
  let readinessCalls = 0;
  const checks = Array.from({length: 7}, (_, i) => ({
    code: `BASE_${i}`, status: 'SATISFIED', message: 'Validated basic catalog state',
  })).concat(requiredSafeguards.map(code => ({code, status: 'BLOCKED', message: 'Not independently verified'})));
  const expected = {occasionId: 'birthday', expectedOccasionRevision: 2,
    expectedCatalogRevision: 3};
  const tx = {
    get: async ref => {
      if (ref.kind === 'query') {
         const records = ref.name === 'packages' ? packages :
           ref.name === 'mainEvents' ? events :
           ref.name === 'providerRequests' ? requests : [];
         const docs = records.slice(0, ref.limit).map(([id, data]) => ({
           id, data: () => data,
         }));
         return {docs, size: docs.length, empty: docs.length === 0};
       }
      if (ref.path.startsWith('occasionLifecycleOperations/')) {
        return {data: () => completed ? {state: 'completed'} : undefined};
      }
      return {data: () => ref.path === 'occasions/birthday' ?
        {applicableServiceCategoryCodes: ['catering_service']} : undefined};
    },
    create() {txWrites++;}, update() {txWrites++;}, set() {txWrites++;}, delete() {txWrites++;},
  };
  const ref = (name, id) => ({path: `${name}/${id}`, id});
  const db = {
    collection(name) {return {
      doc(id) {return ref(name,id);},
      orderBy() {return {limit(n){return {kind:'query',name,limit:n};}}},
    };},
    collectionGroup() {return {limit(){return {kind:'query'};}}},
    async runTransaction(fn) { transactionCalls++; return fn(tx); },
  };
  const fail = (reason, code='failed-precondition') => {
    const error = new Error(reason); error.code=code; error.details={reason}; throw error;
  };
  const packageChecks = require('../lib/admin/occasion-package-dependencies.js');
  const bookingChecks = require('../lib/admin/occasion-booking-dependencies.js');
  const mocks = {
    './occasion-package-dependencies.js': packageChecks,
    './occasion-booking-dependencies.js': bookingChecks,
    'firebase-functions/v2/https': {onCall: (_opts, handler) => handler},
    'firebase-admin/firestore': {FieldPath:{documentId:()=> '__name__'}},
    '../shared/firestore.js': {db},
    '../shared/function-options.js': {appCheckCallableOptions: {}},
    '../packages/occasion-suggestion-v2-core.js': {fail},
    '../packages/occasion-v2-validation.js': {occasionId: value => value},
    '../packages/occasion-transition-inventory-scan.js': {
      scanOccasionPackageInventory: async () => ({candidatePackageIds: []}),
    },
    '../packages/v2-validation.js': {
      exact: value => value,
      mutationKey: value => value,
      plainText: value => value,
      positiveRevision: value => value,
    },
    './occasion-activation-readiness.js': {
      requireOccasionLifecycleActor: async () => 'admin_123',
      requireOccasionLifecycleAdmin: async () => {},
      parseOccasionReadinessInput: value => value,
      readOccasionReadiness: async (_transaction, _request, _action) => {
        readinessCalls++;
        return {...expected, status: 'BLOCKED', lifecycleAvailable: false,
          checks, blockers: requiredSafeguards, occasionRevision: 2, catalogRevision: 3};
      },
    },
    './occasion-routine-transaction.js': {
      activateRoutineOccasion: async () => {
        throw new Error('UNEXPECTED_ROUTINE_ACTIVATION');
      },
      inspectRoutineOccasionActivation: async () => {
        throw new Error('UNEXPECTED_ROUTINE_PREVIEW');
      },
    },
    './occasion-lifecycle-atomic.js': {
      completeAtomicOccasionLifecycle: async () => {atomicCalls++; return {state:'completed'};},
      planOccasionGalleryWithdrawal: () => [],
      occasionLifecycleOperationId: () => 'known_test_operation',
    },
  };
  const exports={};
  vm.runInNewContext(code, {exports, Error, require:(name)=>{
    assert.ok(Object.prototype.hasOwnProperty.call(mocks,name), `Unexpected import: ${name}`);
    return mocks[name];
  }});
  const request = {data:{...expected, idempotencyKey:'lifecycle_test_key_123',
    reason:'A complete test reason'}};
  return {exports, request, checks, counters:()=>({atomicCalls,txWrites,transactionCalls,readinessCalls})};
}

test('every originally required safeguard is retained in the backend readiness contract',()=>{
  for(const code of requiredSafeguards) {
    assert.ok(readinessSource.includes(`"${code}"`), code);
  }
  assert.match(actionsSource,/const checks = basic\.checks;/u);
  assert.match(actionsSource,/const blockers = \[\.\.\.basic\.blockers\];/u);
});

test('Deactivate refuses missing release evidence before atomic writes',async()=>{
  for(const action of ['deactivateAdminOccasion']){
    const f=fixture();
    await assert.rejects(f.exports[action](f.request), error=>
      error.code === 'failed-precondition' &&
      error.details.reason === 'OCCASION_LIFECYCLE_RELEASE_UNVERIFIED');
    assert.deepEqual(f.counters(), {atomicCalls:0,txWrites:0,transactionCalls:1,readinessCalls:1});
  }
});

test('Admin preview includes ten unresolved release safeguards even with zero inventory',async()=>{
  const f=fixture();
  const preview=await f.exports.inspectAdminOccasionAtomicReadiness({data:{
    occasionId:'birthday',action:'deactivate',expectedOccasionRevision:2,expectedCatalogRevision:3,
  }});
  assert.equal(preview.status,'BLOCKED');
  assert.equal(preview.lifecycleAvailable,false);
  assert.equal(preview.checks.length,17);
  assert.equal(preview.blockers.length,12);
  assert.equal(preview.packageCount,0);
  assert.equal(preview.galleryCount,0);
  for(const code of requiredSafeguards) assert.ok(preview.blockers.includes(code));
  assert.equal(f.counters().txWrites,0);
});

 test('preview reports a live private package dependency', async () => {
  const f = fixture({packages: [['private_draft', {
    occasionSchemaVersion: 2,
    occasionScope: 'specific',
    occasionIds: ['birthday'],
    occasionMatchIds: ['birthday'],
    serviceCategoryCode: 'catering_service',
    status: 'draft',
    isDeleted: false,
  }]]});

  const preview = await f.exports.inspectAdminOccasionAtomicReadiness({
    data: {
      occasionId: 'birthday',
      action: 'deactivate',
      expectedOccasionRevision: 2,
      expectedCatalogRevision: 3,
    },
  });

  assert.ok(preview.blockers.includes('OCCASION_LIVE_PACKAGE_DEPENDENCY'));
  assert.equal(preview.status, 'BLOCKED');
  assert.equal(f.counters().txWrites, 0);
});

test('preview reports a live booking dependency', async () => {
  const f = fixture({
    events: [['event_001', {
      eventType: 'birthday',
      status: 'confirmed',
      providerRequestIds: ['request_001'],
      providerRequestCount: 1,
    }]],
    requests: [['request_001', {
      mainEventId: 'event_001',
      eventType: 'birthday',
      status: 'confirmed',
    }]],
  });

  const preview = await f.exports.inspectAdminOccasionAtomicReadiness({
    data: {
      occasionId: 'birthday',
      action: 'deactivate',
      expectedOccasionRevision: 2,
      expectedCatalogRevision: 3,
    },
  });

  assert.ok(preview.blockers.includes('OCCASION_LIVE_BOOKING_DEPENDENCY'));
  assert.equal(preview.status, 'BLOCKED');
  assert.equal(f.counters().txWrites, 0);
});

test('terminal booking history creates no live dependency blocker', async () => {
  const f = fixture({
    events: [['event_001', {
      eventType: 'birthday',
      status: 'completed',
      providerRequestIds: ['request_001'],
      providerRequestCount: 1,
    }]],
    requests: [['request_001', {
      mainEventId: 'event_001',
      eventType: 'birthday',
      status: 'completed',
    }]],
  });

  const preview = await f.exports.inspectAdminOccasionAtomicReadiness({
    data: {
      occasionId: 'birthday',
      action: 'deactivate',
      expectedOccasionRevision: 2,
      expectedCatalogRevision: 3,
    },
  });

  assert.ok(!preview.blockers.includes('OCCASION_LIVE_BOOKING_DEPENDENCY'));
  assert.ok(preview.blockers.includes('OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED'));
  assert.equal(preview.status, 'BLOCKED');
  assert.equal(f.counters().txWrites, 0);
});

test('missing booking relationship fails closed in preview', async () => {
  const f = fixture({
    events: [['event_001', {
      eventType: 'birthday',
      status: 'completed',
      providerRequestIds: ['request_missing'],
      providerRequestCount: 1,
    }]],
  });

  const preview = await f.exports.inspectAdminOccasionAtomicReadiness({
    data: {
      occasionId: 'birthday',
      action: 'deactivate',
      expectedOccasionRevision: 2,
      expectedCatalogRevision: 3,
    },
  });

  assert.ok(preview.blockers.includes('OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED'));
  assert.equal(preview.status, 'BLOCKED');
  assert.equal(f.counters().txWrites, 0);
});

test('oversized booking inventory blocks preview', async () => {
  const events = Array.from({length: 41}, (_, i) => [
    `event_${String(i).padStart(3, '0')}`,
    {
      eventType: 'wedding',
      status: 'completed',
      providerRequestIds: [],
      providerRequestCount: 0,
    },
  ]);

  const f = fixture({events});

  const preview = await f.exports.inspectAdminOccasionAtomicReadiness({
    data: {
      occasionId: 'birthday',
      action: 'deactivate',
      expectedOccasionRevision: 2,
      expectedCatalogRevision: 3,
    },
  });

  assert.ok(preview.blockers.includes('OCCASION_BOOKING_INVENTORY_TOO_LARGE'));
  assert.equal(preview.status, 'BLOCKED');
  assert.equal(f.counters().txWrites, 0);
});
test('completed callable retries reach atomic actor, fingerprint and audit validation without stale readiness', async () => {
  for (const action of ['deactivateAdminOccasion']) {
    const f = fixture({completed: true});
    const result = await f.exports[action](f.request);
    assert.equal(result.state, 'completed');
    assert.deepEqual(f.counters(), {atomicCalls: 1, txWrites: 0, transactionCalls: 1, readinessCalls: 0});
  }
});
