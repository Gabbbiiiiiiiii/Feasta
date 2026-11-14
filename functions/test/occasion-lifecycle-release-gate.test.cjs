/** Callable routing regression. Routine transaction security is exercised by
 * occasion-routine-deactivation.test.mjs; no Firebase services are contacted. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const code = readFileSync(resolve(__dirname, '../lib/admin/occasion-lifecycle-actions.js'), 'utf8');
function fixture({failure, denied = false} = {}) {
 const calls = [];
 const result = {state:'completed', operationId:'routine_operation'};
 const preview = {status:'BLOCKED', lifecycleAvailable:false, blockers:['OCCASION_LIVE_BOOKING_DEPENDENCY']};
 const input = {occasionId:'birthday', expectedOccasionRevision:2, expectedCatalogRevision:3,idempotencyKey:'lifecycle_test_key_123',reason:'A complete test reason'};
 const unexpected = () => {throw new Error('UNEXPECTED_LEGACY_PATH');};
 const fail = (reason, code='failed-precondition') => {const error=new Error(reason);error.code=code;error.details={reason};throw error;};
 const mocks = {
  'firebase-functions/v2/https':{onCall:(_options,handler)=>handler},
  'firebase-admin/firestore':{FieldPath:{documentId:()=> '__name__'}},
  '../shared/firestore.js':{db:{runTransaction:unexpected,collection:unexpected}},
  '../shared/function-options.js':{appCheckCallableOptions:{}},
  '../packages/occasion-suggestion-v2-core.js':{fail},
  '../packages/occasion-v2-validation.js':{occasionId:value=>value},
  '../packages/v2-validation.js':{exact:value=>value,mutationKey:value=>value,plainText:value=>value,positiveRevision:value=>value},
  '../packages/occasion-transition-inventory-scan.js':{scanOccasionPackageInventory:unexpected},
  './occasion-package-dependencies.js':{assertNoOccasionPackageDependencies:unexpected},
  './occasion-booking-dependencies.js':{assertNoOccasionBookingDependencies:unexpected},
  './occasion-activation-readiness.js':{
   requireOccasionLifecycleActor:async(request,scope)=>{calls.push(['actor',scope]);if(denied)fail('ADMIN_REQUIRED','permission-denied');return 'admin_123';},
   requireOccasionLifecycleAdmin:unexpected,readOccasionReadiness:unexpected,parseOccasionReadinessInput:value=>value,
  },
  './occasion-routine-transaction.js':{activateRoutineOccasion:unexpected,inspectRoutineOccasionActivation:unexpected},
  './occasion-routine-deactivation.js':{
   deactivateRoutineOccasion:async(uid,value)=>{calls.push(['execute',uid,value]);if(failure)throw failure;return result;},
   inspectRoutineOccasionDeactivation:async(uid,value)=>{calls.push(['preview',uid,value]);return preview;},
  },
  './occasion-lifecycle-atomic.js':{completeAtomicOccasionLifecycle:unexpected,planOccasionGalleryWithdrawal:unexpected,occasionLifecycleOperationId:unexpected},
 };
 const exports={};vm.runInNewContext(code,{exports,Error,require:name=>{assert.ok(Object.hasOwn(mocks,name),'Unexpected import: '+name);return mocks[name];}});
 return {exports,calls,input,result,preview};
}
test('deactivation delegates validated input and authenticated actor to routine transaction',async()=>{
 const f=fixture();assert.equal(await f.exports.deactivateAdminOccasion({data:f.input}),f.result);
 assert.deepEqual(f.calls[0],['actor','adminOccasions.deactivate.execute']);
 assert.equal(f.calls[1][0],'execute');assert.equal(f.calls[1][1],'admin_123');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1][2])),f.input);
});
test('deactivation preview returns routine dependency evidence unchanged',async()=>{
 const f=fixture();const {idempotencyKey,reason,...input}=f.input;
 assert.equal(await f.exports.inspectAdminOccasionAtomicReadiness({data:{...input,action:'deactivate'}}),f.preview);
 assert.deepEqual(f.calls[0],['actor','adminOccasions.atomic.readiness']);
 assert.equal(f.calls[1][0],'preview');assert.equal(f.calls[1][1],'admin_123');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1][2])),input);
});
test('actor denial prevents transaction invocation',async()=>{
 const f=fixture({denied:true});await assert.rejects(f.exports.deactivateAdminOccasion({data:f.input}),{code:'permission-denied'});assert.equal(f.calls.length,1);
});
for(const reason of ['ADMIN_REQUIRED','IDEMPOTENCY_CONFLICT','ROUTINE_DEACTIVATION_AUDIT_MISSING','OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT','OCCASION_LIVE_PACKAGE_DEPENDENCY','OCCASION_PACKAGE_DEPENDENCY_REQUIRES_REVIEW','OCCASION_LIVE_BOOKING_DEPENDENCY','OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED']) {
 test('routine refusal remains actionable: '+reason,async()=>{
  const f=fixture({failure:new Error(reason)});await assert.rejects(f.exports.deactivateAdminOccasion({data:f.input}),error=>error.code===(reason==='ADMIN_REQUIRED'?'permission-denied':'failed-precondition')&&error.details.reason===reason);
 });
}
test('unknown transaction faults are not disguised as successful saves',async()=>{
 const error=new Error('unexpected');const f=fixture({failure:error});await assert.rejects(f.exports.deactivateAdminOccasion({data:f.input}),value=>value===error);
});
