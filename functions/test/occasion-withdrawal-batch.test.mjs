import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, dirname} from 'node:path';

// Node 22: run with --experimental-strip-types. No Firebase or emulator used.
const moduleFile = resolve(dirname(fileURLToPath(import.meta.url)),
  '../src/packages/occasion-withdrawal-batch.ts');
const {withdrawOccasionPackageBatchInTransaction: withdraw,
  withdrawalBatchOperationId} = await import(pathToFileURL(moduleFile).href);

const doc = (path) => ({path, id: path.split('/').at(-1)});
const publicPackage = (more = {}) => ({providerId:'provider_one',
  eventType:'birthday', isActive:true, isPublished:true,
  providerPubliclyVisible:true, publishedAt:'yesterday',status:'published',...more});
function fixture({packages=[['p001', publicPackage()]], action='activate'} = {}) {
  const actorUid='admin_123'; const occasionId='birthday';
  const idempotencyKey='testing_key_123456';
  const input={action, occasionId, actorUid, idempotencyKey,
    expectedCatalogRevision:2, expectedOccasionRevision:1,
    applicableCategoryCodes:['catering_service'],
    packageRefs:packages.map(([id])=>doc(`packages/${id}`)),
    catalogRef:doc('occasionCatalog/current'),
    occasionRef:doc('occasions/birthday'),
    adminRef:doc('users/admin_123'),
    operationRef: null, auditRef:null,
    reason:'Production package withdrawal before catalog transition'};
  const opId=withdrawalBatchOperationId(input);
  input.operationRef=doc(`occasionWithdrawalBatchOperations/${opId}`);
  input.auditRef=doc(`occasionWithdrawalBatchAudits/${opId}`);
  const docs=new Map([
    [input.catalogRef.path, {revision:2, activationState:'stable'}],
    [input.occasionRef.path, {id:'birthday', revision:1, active:action==='deactivate',
      moderationState:'approved', applicableServiceCategoryCodes:['catering_service']}],
    [input.adminRef.path, {role:'admin',accountStatus:'active',isActive:true,isBlocked:false}],
    ...packages.map(([id,v])=>[`packages/${id}`,v]),
  ]);
  return {input,docs};
}
function tx(docs) {
  let startedWriting=false;
  const writes=[];
  return {writes,
    async get(ref){
      assert.equal(startedWriting,false,'all reads must occur before writes');
      const v=docs.get(ref.path);
      return {exists:v!==undefined,data:()=>v};
    },
    create(ref,value){
      startedWriting=true;
      assert.equal(docs.has(ref.path),false,`create must be immutable: ${ref.path}`);
      writes.push({kind:'create',path:ref.path,value});
    },
    update(ref,value){
      startedWriting=true;
      assert.equal(docs.has(ref.path),true,`missing update: ${ref.path}`);
      writes.push({kind:'update',path:ref.path,value});
    },
    commit(){
      for(const w of writes) docs.set(w.path,
        w.kind==='create'?w.value:{...docs.get(w.path),...w.value});
    },
  };
}
async function reject(f, code) {
  const t=tx(f.docs);
  await assert.rejects(withdraw(t,f.input),e=>e.message===code);
  assert.equal(t.writes.length,0,'rejected transaction must perform no writes');
}

test('withdraws published target atomically with immutable operation and audit',async()=>{
  const f=fixture(); const t=tx(f.docs);
  const r=await withdraw(t,f.input);
  assert.deepEqual(r.withdrawnPackageIds,['p001']);
  assert.equal(r.canCommitCatalog,false); assert.equal(r.canRestorePackages,false);
  assert.deepEqual(t.writes.map(w=>w.kind),['update','create','create']);
  const update=t.writes[0].value;
  assert.equal(update.isPublished,false);assert.equal(update.isActive,false);
  assert.equal(update.providerPubliclyVisible,false);assert.equal(update.status,'draft');
  assert.equal(update.publishedAt,null);
  assert.equal(t.writes[2].value.previousProjections[0].publishedAt,'yesterday');
  assert.equal(t.writes.filter(w=>w.path==='occasionCatalog/current').length,0);
  assert.equal(t.writes.filter(w=>w.path==='occasions/birthday').length,0);
});
test('private target records do not mutate but are audited as already-private',async()=>{
  const f=fixture({packages:[['p001',publicPackage({status:'draft',isActive:false,
    isPublished:false,providerPubliclyVisible:false,publishedAt:null})]]});
  const t=tx(f.docs); const r=await withdraw(t,f.input);
  assert.deepEqual(r.alreadyPrivatePackageIds,['p001']);
  assert.deepEqual(r.withdrawnPackageIds,[]);
  assert.equal(t.writes.length,2);
});
test('replay rechecks private state and performs no second write',async()=>{
  const f=fixture();const t=tx(f.docs);
  const result=await withdraw(t,f.input);t.commit();
  const retry=tx(f.docs);
  assert.deepEqual(await withdraw(retry,f.input),result);
  assert.equal(retry.writes.length,0);
});
test('replay rejects if withdrawn package became publicly visible again',async()=>{
  const f=fixture();const t=tx(f.docs); await withdraw(t,f.input);t.commit();
  f.docs.set('packages/p001',publicPackage());
  await reject(f,'WITHDRAWAL_REPLAY_NEEDS_REVALIDATION');
});
test('same idempotency key with changed reason is refused without writes',async()=>{
  const f=fixture();const t=tx(f.docs);await withdraw(t,f.input);t.commit();
  f.input.reason='A different legitimate but conflicting withdrawal request';
  await reject(f,'WITHDRAWAL_IDEMPOTENCY_CONFLICT');
});
test('missing audit alongside operation refuses replay',async()=>{
  const f=fixture();const t=tx(f.docs);await withdraw(t,f.input);t.commit();
  f.docs.delete(f.input.auditRef.path);
  await reject(f,'WITHDRAWAL_LEDGER_CORRUPTED');
});
test('stale catalog revision refuses withdrawal',async()=>{
  const f=fixture();f.docs.get('occasionCatalog/current').revision=3;
  await reject(f,'WITHDRAWAL_REVISION_CONFLICT');
});
test('catalog transition generation other than stable is refused',async()=>{
  const f=fixture();f.docs.get('occasionCatalog/current').activationState='withdrawing';
  await reject(f,'WITHDRAWAL_AUTHORITY_UNAVAILABLE');
});
test('wrong action versus current occasion active state fails',async()=>{
  const f=fixture();f.docs.get('occasions/birthday').active=true;
  await reject(f,'WITHDRAWAL_REVISION_CONFLICT');
});
test('category applicability differs from occasion snapshot fails',async()=>{
  const f=fixture();f.docs.get('occasions/birthday').applicableServiceCategoryCodes=['addon_service'];
  await reject(f,'WITHDRAWAL_AUTHORITY_UNAVAILABLE');
});
test('unapproved or disabled administrator never reaches writes',async()=>{
  for(const admin of [{role:'customer'},{role:'admin',isActive:false},
    {role:'admin',isBlocked:true},{role:'admin',accountStatus:'suspended'},
    {role:'admin',isActive:true,isBlocked:false}]){
    const f=fixture();f.docs.set('users/admin_123',admin);
    await reject(f,'ACTIVE_ADMIN_REQUIRED');
  }
});
test('unrelated V1 wedding is not accidentally withdrawn',async()=>{
  const f=fixture({packages:[['p001',publicPackage({eventType:'wedding'})]]});
  await reject(f,'UNRELATED_WITHDRAWAL_PACKAGE');
});
test('universal V2 and explicit V2 references are both withdrawn',async()=>{
  const packages=[
    ['p001',publicPackage({occasionSchemaVersion:2,occasionScope:'all',occasionIds:[],
      occasionMatchIds:['wedding'],serviceCategoryCode:'catering_service'})],
    ['p002',publicPackage({occasionSchemaVersion:2,occasionScope:'specific',
      occasionIds:['birthday'],occasionMatchIds:['birthday'],serviceCategoryCode:'catering_service'})],
  ];
  const f=fixture({packages});const t=tx(f.docs);
  assert.deepEqual((await withdraw(t,f.input)).withdrawnPackageIds,['p001','p002']);
  assert.equal(t.writes.length,4);
});
test('universal V2 package with unrelated valid category must not be touched',async()=>{
  const f=fixture({packages:[['p001',publicPackage({occasionSchemaVersion:2,
    occasionScope:'all',occasionIds:[],occasionMatchIds:['wedding'],
    serviceCategoryCode:'addon_service'})]]});
  await reject(f,'UNRELATED_WITHDRAWAL_PACKAGE');
});
test('malformed public V2 schema withdraws conservatively',async()=>{
  const f=fixture({packages:[['p001',publicPackage({occasionSchemaVersion:2,
    occasionScope:'specific',occasionIds:'fake'})]]});
  const t=tx(f.docs);assert.deepEqual((await withdraw(t,f.input)).withdrawnPackageIds,['p001']);
});
test('missing package snapshot blocks all writes, including valid earlier records',async()=>{
  const f=fixture({packages:[['p001',publicPackage()],['p002',publicPackage()]]});
  f.docs.delete('packages/p002');
  await reject(f,'WITHDRAWAL_PACKAGE_CHANGED');
});
test('ambiguous private projection blocks, never creates false withdrawal evidence',async()=>{
  const f=fixture({packages:[['p001',publicPackage({isPublished:false,isActive:false,
    providerPubliclyVisible:false,status:'archived',publishedAt:null})]]});
  await reject(f,'AMBIGUOUS_PRIVATE_PROJECTION');
});
test('rejects noncanonical ordering, duplicate, wrong refs and out-of-bound batch',async()=>{
  for(const patch of [
    {packageRefs:[doc('packages/p002'),doc('packages/p001')]},
    {packageRefs:[doc('packages/p001'),doc('packages/p001')]},
    {packageRefs:[doc('users/p001')]},
    {applicableCategoryCodes:['catering_service','catering_service']},
    {packageRefs:[]},
    {packageRefs:Array.from({length:41},(_,i)=>doc(`packages/p${String(i).padStart(3,'0')}`))},
  ]){
    const f=fixture();Object.assign(f.input,patch);
    const err=patch.packageRefs?.length===2&&patch.packageRefs?.[0].id==='p002'
      ? 'UNSORTED_PACKAGE_BATCH': patch.packageRefs?.length===2&&patch.packageRefs?.[0].id==='p001'
      ? 'INVALID_PACKAGE_REFERENCES': patch.packageRefs?.[0]?.path==='users/p001'
      ? 'INVALID_PACKAGE_REFERENCES':'INVALID_WITHDRAWAL_BATCH';
    await reject(f,err);
  }
});
test('no catalog mutation, grant, restore, booking or public callable exported',async()=>{
  const fs=await import('node:fs');
  const source=fs.readFileSync(moduleFile,'utf8');
  assert.doesNotMatch(source,/\.update\(input\.(?:catalogRef|occasionRef|adminRef)/u);
  assert.doesNotMatch(source,/\.create\(input\.(?:catalogRef|occasionRef|adminRef)/u);
  assert.doesNotMatch(source,/export\s+(?:const|function)\s+activate/u);
});
