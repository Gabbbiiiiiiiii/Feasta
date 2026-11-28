import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// No Firebase/emulator/network. Stage exact local TS sources in a temp folder;
// rewrite only the .js -> .ts testing imports and FieldPath runtime shim.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stage = mkdtempSync(join(tmpdir(), 'feasta-coordinator-atomic-'));
const folder = join(root, 'functions/src/packages');
for (const name of ['occasion-withdrawal-batch', 'occasion-transition-inventory-scan',
  'occasion-transition-coordinator-atomic']) {
  const source = readFileSync(join(folder, `${name}.ts`), 'utf8');
  const staged = source.replaceAll('.js"', '.ts"')
    .replace('import {FieldPath} from "firebase-admin/firestore";',
      'const FieldPath = {documentId: () => "__name__"};');
  writeFileSync(join(stage, `${name}.ts`), staged);
}
const {coordinateBoundedOccasionWithdrawalInTransaction: coordinate,
  atomicOccasionTransitionId} = await import(pathToFileURL(join(stage,
  'occasion-transition-coordinator-atomic.ts')).href);

function fixture({packages=[['p001', published()], ['p002', published({eventType:'wedding'})]],
  action='activate'} = {}) {
  const docs = new Map();
  const firestore = {
    collection(collection) {
      return {
        doc(id) {return {path:`${collection}/${id}`,id,firestore};},
        orderBy(field) {
          assert.equal(collection,'packages');assert.equal(field,'__name__');
          return {limit(n){return {queryCollection:collection,limitCount:n};}};
        },
      };
    },
  };
  const ref = (collection,id) => firestore.collection(collection).doc(id);
  const fields = {actorUid:'admin_123',action,occasionId:'birthday',
    expectedCatalogRevision:2,expectedOccasionRevision:1,
    idempotencyKey:'safe_internal_key_1234',
    reason:'Coordinated withdrawal of published affected packages'};
  const opId=atomicOccasionTransitionId(fields);
  const input={...fields,catalogRef:ref('occasionCatalog','current'),
    occasionRef:ref('occasions','birthday'),adminRef:ref('users','admin_123'),
    transitionRef:ref('occasionAtomicWithdrawalTransitions',opId),
    transitionAuditRef:ref('occasionAtomicWithdrawalAudits',opId)};
  docs.set(input.catalogRef.path,{revision:2,activationState:'stable'});
  docs.set(input.occasionRef.path,{id:'birthday',revision:1,
    moderationState:'approved',active:action==='deactivate',
    applicableServiceCategoryCodes:['catering_service']});
  docs.set(input.adminRef.path,{role:'admin',accountStatus:'active',
    isActive:true,isBlocked:false});
  for(const [id,data] of packages)docs.set(`packages/${id}`,data);
  function transaction(){
    const writes=[];let writing=false;
    return {
      writes,
      async get(request){
        assert.equal(writing,false,'all reads precede writes');
        if(request.queryCollection){
          const matches=[...docs.entries()]
            .filter(([p])=>p.startsWith(`${request.queryCollection}/`))
            .sort(([a],[b])=>a.localeCompare(b)).slice(0,request.limitCount);
          return {docs:matches.map(([path,data])=>({id:path.split('/').at(-1),
            ref:ref(request.queryCollection,path.split('/').at(-1)),data:()=>data}))};
        }
        const data=docs.get(request.path);
        return {exists:data!==undefined,data:()=>data};
      },
      update(reference,data){writing=true;assert.ok(docs.has(reference.path));
        writes.push({kind:'update',path:reference.path,data});},
      create(reference,data){writing=true;assert.equal(docs.has(reference.path),false);
        writes.push({kind:'create',path:reference.path,data});},
      commit(){for (const w of writes) docs.set(w.path,w.kind==='create'?w.data:
        {...docs.get(w.path),...w.data});},
    };
  }
  return {input,docs,transaction};
}
function published(patch={}) {
  return {providerId:'provider_one',serviceCategoryCode:'catering_service',
    eventType:'birthday',status:'published',isActive:true,isPublished:true,
    providerPubliclyVisible:true,publishedAt:'some-time',...patch};
}
async function blocked(f,code){const tx=f.transaction();await assert.rejects(
  coordinate(tx,f.input),(e)=>e.message===code);assert.equal(tx.writes.length,0);}

test('single transaction withdraws affected package and freezes catalog atomically',async()=>{
  const f=fixture();const tx=f.transaction();const result=await coordinate(tx,f.input);
  assert.deepEqual(result.candidatePackageIds,['p001']);
  assert.equal(result.state,'withdrawn_locked');
  assert.equal(result.canActivate,false);assert.equal(result.canRestore,false);
  assert.equal(tx.writes.filter(w=>w.path==='packages/p001').length,1);
  assert.equal(tx.writes.filter(w=>w.path==='packages/p002').length,0);
  assert.equal(tx.writes.find(w=>w.path==='packages/p001').data.isPublished,false);
  assert.equal(tx.writes.find(w=>w.path==='occasionCatalog/current').data.activationState,'transitioning');
  assert.equal(tx.writes.filter(w=>w.path==='occasions/birthday').length,0);
  assert.equal(tx.writes.filter(w=>w.path.startsWith('providerEligibilityAuthorities/')).length,0);
  assert.ok(tx.writes.some(w=>w.path.startsWith('occasionWithdrawalBatchAudits/')));
  assert.ok(tx.writes.some(w=>w.path.startsWith('occasionAtomicWithdrawalAudits/')));
  assert.equal(f.docs.get('occasionCatalog/current').activationState,'stable',
    'Nothing commits before Firestore transaction success');
  tx.commit();
  assert.equal(f.docs.get('occasionCatalog/current').activationState,'transitioning');
  assert.equal(f.docs.get('packages/p001').isPublished,false);
});

test('replay verifies frozen projection and writes nothing twice',async()=>{
  const f=fixture();const t=f.transaction();const one=await coordinate(t,f.input);t.commit();
  const retry=f.transaction();const two=await coordinate(retry,f.input);
  assert.deepEqual(two,one);assert.equal(retry.writes.length,0);
});

test('replay detects a newly published affected package from an unfenced writer',async()=>{
  const f=fixture();const t=f.transaction();await coordinate(t,f.input);t.commit();
  f.docs.set('packages/p003',published());
  await blocked(f,'COORDINATOR_REPLAY_REVALIDATION_REQUIRED');
});

test('replay refuses resurrection of withdrawn package',async()=>{
  const f=fixture();const t=f.transaction();await coordinate(t,f.input);t.commit();
  f.docs.set('packages/p001',published());
  await blocked(f,'COORDINATOR_REPLAY_REVALIDATION_REQUIRED');
});

test('41 total packages refuse, even when only one affects occasion',async()=>{
  const items=[['p001',published()]];
  for(let i=2;i<=41;i++)items.push([`p${String(i).padStart(3,'0')}`,
    published({eventType:'wedding'})]);
  await blocked(fixture({packages:items}),'COORDINATOR_INVENTORY_TOO_LARGE');
});

for (const packages of [[], [['p001',published({eventType:'wedding'})]]]) {
  test(`complete zero-impact inventory (${packages.length} records) locks without a fake batch`,async()=>{
    const f=fixture({packages}); const tx=f.transaction();
    const result=await coordinate(tx,f.input);
    assert.deepEqual(result.candidatePackageIds,[]);
    assert.equal(result.batchOperationId,null);
    assert.equal(result.canActivate,false);
    assert.equal(tx.writes.length,3);
    assert.ok(tx.writes.every(w=>!w.path.startsWith('occasionWithdrawalBatch')));
    tx.commit();
    const replay=f.transaction();
    assert.deepEqual(await coordinate(replay,f.input),result);
    assert.equal(replay.writes.length,0);
    f.docs.set('packages/newly_published',published());
    await blocked(f,'COORDINATOR_REPLAY_REVALIDATION_REQUIRED');
  });
}

test('malformed V2 public record is quarantined and withdrawn conservatively',async()=>{
  const f=fixture({packages:[['p001',published({occasionSchemaVersion:2,
    occasionScope:'specific',occasionIds:'invalid'})]]});
  const tx=f.transaction();const result=await coordinate(tx,f.input);
  assert.deepEqual(result.ambiguousPackageIds,['p001']);
  assert.equal(tx.writes.find(w=>w.path==='packages/p001').data.providerPubliclyVisible,false);
});

test('catalog already transitioning rejects a new operation',async()=>{
  const f=fixture();f.docs.get('occasionCatalog/current').activationState='transitioning';
  await blocked(f,'COORDINATOR_CATALOG_NOT_STABLE');
});

test('stale catalog and occasion revisions block all writes',async()=>{
  let f=fixture();f.docs.get('occasionCatalog/current').revision=3;
  await blocked(f,'COORDINATOR_REVISION_CONFLICT');
  f=fixture();f.docs.get('occasions/birthday').revision=2;
  await blocked(f,'COORDINATOR_REVISION_CONFLICT');
});

test('inactive or unauthorized administrator cannot coordinate',async()=>{
  for(const admin of [{role:'customer',accountStatus:'active',isActive:true,isBlocked:false},
    {role:'admin',accountStatus:'disabled',isActive:true,isBlocked:false},
    {role:'admin',accountStatus:'active',isActive:false,isBlocked:false}]){
    const f=fixture();f.docs.set('users/admin_123',admin);
    await blocked(f,'ACTIVE_ADMIN_REQUIRED');
  }
});

test('input cannot substitute unrelated audit and transition references',async()=>{
  const f=fixture();f.input.transitionRef={...f.input.transitionRef,id:'foreign'};
  await blocked(f,'INVALID_COORDINATOR_REFERENCES');
});

test('incomplete or corrupted audit ledger cannot produce replay success',async()=>{
  const f=fixture();const t=f.transaction();await coordinate(t,f.input);t.commit();
  f.docs.delete(f.input.transitionAuditRef.path);
  await blocked(f,'COORDINATOR_LEDGER_CORRUPTED');
});

test('wrong occasion active state blocks before inventory enumeration',async()=>{
  const f=fixture();f.docs.get('occasions/birthday').active=true;
  await blocked(f,'COORDINATOR_REVISION_CONFLICT');
});

test('source adapter never publicly enables execution or activation',async()=>{
  const source=readFileSync(join(folder,'occasion-transition-coordinator-server.ts'),'utf8');
  assert.match(source,/OCCASION_COORDINATOR_RELEASE_VERIFIED: boolean = false/u);
  assert.match(source,/if \(!OCCASION_COORDINATOR_RELEASE_VERIFIED\)/u);
  assert.doesNotMatch(source,/onCall\s*\(/u);
  assert.doesNotMatch(source,/\.update\([^,]+,\s*\{active: true/u);
  const atomic=readFileSync(join(folder,'occasion-transition-coordinator-atomic.ts'),'utf8');
  assert.match(atomic,/\.limit\(MAX_PACKAGE_DOCUMENTS \+ 1\)/u);
  assert.match(atomic,/withdrawOccasionPackageBatchInTransaction\(tx/u);
});

test.after(()=>{rmSync(stage,{recursive:true,force:true});});
