import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sources=resolve('functions/src');
const stage=mkdtempSync(join(tmpdir(),'feasta-occasion-lifecycle-'));
const target=join(stage,'index');
const {mkdirSync}=await import('node:fs');mkdirSync(target);
for(const [name,path] of [
  ['occasion-lifecycle-atomic','admin/occasion-lifecycle-atomic.ts'],
  ['occasion-transition-inventory-scan','packages/occasion-transition-inventory-scan.ts'],
  ['occasion-withdrawal-batch','packages/occasion-withdrawal-batch.ts'],
]){
  let code=readFileSync(join(sources,path),'utf8');
  code=code.replaceAll('.js"','.ts"').replaceAll('../packages/','./');
  if(name==='occasion-lifecycle-atomic')code=code.replace(
    'import {FieldPath} from "firebase-admin/firestore";',
    'const FieldPath={documentId:()=>"__name__"};');
  writeFileSync(join(target,`${name}.ts`),code);
}
const mod=await import(pathToFileURL(join(target,'occasion-lifecycle-atomic.ts')).href);
const {completeAtomicOccasionLifecycle:commitLifecycle,
  occasionLifecycleOperationId:opId, planOccasionGalleryWithdrawal}=mod;

function fixture({action='deactivate',packages=undefined,galleries=undefined}={}){
  const docs=new Map();
  const firestore={
    collection(name){return {
      doc(id){return ref(`${name}/${id}`);},
      orderBy(column){assert.equal(column,'__name__');return {limit(n){return {kind:'query',name,limit:n};}};},
    };},
    collectionGroup(name){return {limit(n){return {kind:'group',name,limit:n};}};},
  };
  function ref(path){return {path,id:path.split('/').at(-1),firestore};}
  const input={action,actorUid:'admin_123',occasionId:'birthday',
    expectedCatalogRevision:3,expectedOccasionRevision:2,
    idempotencyKey:'atomic_lifecycle_key_1234',reason:'Approved atomic occasion transition'};
  const oid=opId(input);
  Object.assign(input,{catalogRef:ref('occasionCatalog/current'),
    occasionRef:ref('occasions/birthday'),adminRef:ref('users/admin_123'),
    operationRef:ref(`occasionLifecycleOperations/${oid}`),
    auditRef:ref(`occasionLifecycleAudits/${oid}`)});
  docs.set('occasionCatalog/current',{revision:3,activationState:'stable'});
  docs.set('occasions/birthday',{id:'birthday',revision:2,
    moderationState:'approved',active:action==='deactivate',
    applicableServiceCategoryCodes:['catering_service']});
  docs.set('users/admin_123',{role:'admin',accountStatus:'active',isActive:true,isBlocked:false});
  docs.set('serviceCategories/catering_service',{code:'catering_service',status:'active',serviceType:'catering'});
  for(const [name,data] of packages??[['affected',published()],['other',published({eventType:'wedding'})]]){
    docs.set(`packages/${name}`,data);
  }
  for(const [name,entries] of galleries??[['p1',[setup('s1','birthday',true),setup('s2','wedding',true)]]]){
    docs.set(`providers/${name}/catalog/setups`,{revision:1,setups:entries});
  }
  function transaction(){
    const writes=[];let writing=false;
    return {writes,async get(reference){
      assert.equal(writing,false,'all reads must precede writes');
      if(reference.kind){
        const rows=[...docs.entries()].filter(([path])=>reference.kind==='query'?path.startsWith(`${reference.name}/`)&&path.split('/').length===2:path.split('/').at(-2)===reference.name)
          .sort(([a],[b])=>a.localeCompare(b)).slice(0,reference.limit);
        return {docs:rows.map(([path,value])=>({id:path.split('/').at(-1),ref:ref(path),data:()=>value}))};
      }
      const data=docs.get(reference.path);return {exists:data!==undefined,data:()=>data};
    },create(reference,data){writing=true;writes.push({kind:'create',path:reference.path,data});},
    update(reference,data){writing=true;writes.push({kind:'update',path:reference.path,data});},
    commit(){for(const {kind,path,data} of writes){
      if(kind==='create')assert.equal(docs.has(path),false);
      if(kind==='update')assert.equal(docs.has(path),true);
      docs.set(path,kind==='create'?data:{...docs.get(path),...data});
    }},};
  }
  return {docs,input,transaction};
}
function published(patch={}){return {providerId:'p1',serviceCategoryCode:'catering_service',
  eventType:'birthday',status:'published',isActive:true,isPublished:true,
  providerPubliclyVisible:true,publishedAt:'timestamp',...patch};}
function setup(id,eventType,isPublished){return {id,eventType,isPublished,title:'Sample setup'};}
async function blocked(f,code){const tx=f.transaction();await assert.rejects(
  commitLifecycle(tx,f.input),(e)=>e.message===code);assert.equal(tx.writes.length,0);}

test('deactivation atomically withdraws the relevant package and gallery entry',async()=>{
  const f=fixture();const tx=f.transaction();const result=await commitLifecycle(tx,f.input);
  assert.equal(result.state,'completed');assert.equal(result.active,false);
  assert.deepEqual(result.withdrawnPackageIds,['affected']);
  assert.deepEqual(result.withdrawnGallerySetupIds,['s1']);
  assert.equal(f.docs.get('occasions/birthday').active,true,'not committed yet');
  tx.commit();
  assert.equal(f.docs.get('occasions/birthday').active,false);
  assert.equal(f.docs.get('occasionCatalog/current').revision,4);
  assert.equal(f.docs.get('packages/affected').status,'draft');
  assert.equal(f.docs.get('packages/other').isPublished,true);
  assert.equal(f.docs.get('providers/p1/catalog/setups').setups[0].isPublished,false);
  assert.equal(f.docs.get('providers/p1/catalog/setups').setups[1].isPublished,true);
  assert.equal(f.docs.get('occasionLifecycleAudits/'+result.operationId).restorationPerformed,false);
  assert.equal(f.docs.get('bookings/historical'),undefined);
});
test('activation with no package or gallery references completes without phantom batches',async()=>{
  const f=fixture({action:'activate',packages:[],galleries:[]});const tx=f.transaction();
  const result=await commitLifecycle(tx,f.input);tx.commit();
  assert.equal(result.active,true);assert.equal(result.withdrawnPackageIds.length,0);
  assert.equal([...f.docs.keys()].filter(s=>s.startsWith('occasionWithdrawalBatchOperations/')).length,0);
  const retry=f.transaction();const replay=await commitLifecycle(retry,f.input);
  assert.equal(replay.idempotentReplay,true);assert.equal(retry.writes.length,0);
});
test('stale revisions cannot change any record',async()=>{
  const f=fixture();f.docs.get('occasionCatalog/current').revision=4;
  await blocked(f,'OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT');
});
test('41 packages rejects atomically',async()=>{
  const f=fixture({packages:Array.from({length:41},(_,i)=>['p'+i,published()])});
  await blocked(f,'PACKAGE_INVENTORY_TOO_LARGE');
});
test('41 galleries rejects atomically',async()=>{
  const f=fixture({galleries:Array.from({length:41},(_,i)=>['p'+i,[setup('one','birthday',true)]])});
  await blocked(f,'GALLERY_INVENTORY_TOO_LARGE');
});
test('corrupt gallery prevents both publication withdrawal and catalog writes',async()=>{
  const f=fixture({galleries:[['p1',[{id:'s1',isPublished:'yes',eventType:'birthday'}]]]});
  await blocked(f,'GALLERY_INVENTORY_REQUIRES_REVIEW');
});
test('malformed public V2 package is withdrawn conservatively',async()=>{
  const f=fixture({packages:[['mixed',published({occasionSchemaVersion:2,
    occasionScope:'specific',occasionIds:'bad'})]],galleries:[]});
  const tx=f.transaction();const r=await commitLifecycle(tx,f.input);tx.commit();
  assert.deepEqual(r.withdrawnPackageIds,['mixed']);
  assert.equal(f.docs.get('packages/mixed').isPublished,false);
});
test('replayed idempotency identity with altered reason is rejected',async()=>{
  const f=fixture({packages:[],galleries:[]});const tx=f.transaction();
  await commitLifecycle(tx,f.input);tx.commit();
  f.input.reason='A different and conflicting reason';
  await blocked(f,'IDEMPOTENCY_CONFLICT');
});
test('invalid, unrelated gallery records do not remove unrelated published setups',()=>{
  const f=fixture({galleries:[]});
  const gallery={ref:{path:'providers/p1/catalog/setups'},data:{revision:1,
    setups:[setup('other','wedding',true),setup('target','birthday',true)]}};
  const changes=planOccasionGalleryWithdrawal({action:'deactivate',occasionId:'birthday',docs:[gallery]});
  assert.deepEqual(changes[0].withdrawnIds,['target']);
  assert.equal(changes[0].nextSetups[0].isPublished,true);
});

test('40 packages and 40 galleries are within the explicit atomic bound',async()=>{
  const packages=Array.from({length:40},(_,i)=>['p'+String(i).padStart(3,'0'),published()]);
  const galleries=Array.from({length:40},(_,i)=>['p'+String(i).padStart(3,'0'),
    [setup('g'+String(i).padStart(3,'0'),'birthday',true)]]);
  const f=fixture({packages,galleries});const tx=f.transaction();
  const result=await commitLifecycle(tx,f.input);
  assert.equal(result.withdrawnPackageIds.length,40);
  assert.equal(result.withdrawnGallerySetupIds.length,40);
  tx.commit();
  assert.equal(f.docs.get('occasionCatalog/current').revision,4);
  assert.equal(f.docs.get('providers/p000/catalog/setups').setups[0].isPublished,false);
  assert.equal(f.docs.get('packages/p039').isPublished,false);
});
test('unknown gallery contract fields are conservatively withdrawn',async()=>{
  const f=fixture({packages:[],galleries:[['p1',[
    {...setup('opaque','wedding',true),occasionMatchIds:['birthday']}]] ]});
  const tx=f.transaction();const response=await commitLifecycle(tx,f.input);
  assert.deepEqual(response.withdrawnGallerySetupIds,['opaque']);
  tx.commit();
  assert.equal(f.docs.get('providers/p1/catalog/setups').setups[0].isPublished,false);
});
test('inactive admin is denied without reads after mutations',async()=>{
  const f=fixture();f.docs.get('users/admin_123').isBlocked=true;
  await blocked(f,'ADMIN_REQUIRED');
});
test('non-stable catalog refuses without creating a transition lock',async()=>{
  const f=fixture();f.docs.get('occasionCatalog/current').activationState='transitioning';
  await blocked(f,'OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT');
});
test('failed gallery validation cannot partially withdraw a package',async()=>{
  const f=fixture({galleries:[['p1',[{id:'invalid',isPublished:'yes',eventType:'birthday'}]]]});
  const tx=f.transaction();
  await assert.rejects(commitLifecycle(tx,f.input),{message:'GALLERY_INVENTORY_REQUIRES_REVIEW'});
  assert.equal(tx.writes.length,0);
  assert.equal(f.docs.get('packages/affected').isPublished,true);
});
test('tampered operation audit does not allow a false successful replay',async()=>{
  const f=fixture({packages:[],galleries:[]});const tx=f.transaction();
  const result=await commitLifecycle(tx,f.input);tx.commit();
  f.docs.get(`occasionLifecycleAudits/${result.operationId}`).occasionId='wedding';
  await blocked(f,'IDEMPOTENCY_CONFLICT');
});

test.after(()=>rmSync(stage,{recursive:true,force:true}));

test('Birthday activation withdraws both legacy offers and preserves financial history', async () => {
  const f = fixture({action: 'activate', packages: [
    ['birthday_one', published()], ['birthday_two', published()],
    ['unrelated', published({eventType: 'wedding'})],
  ], galleries: []});
  const historical = [
    ['mainEvents/historical', {customerId: 'customer_1', packageSnapshot: {id: 'birthday_one', price: 5000}}],
    ['providerRequests/historical', {packageId: 'birthday_two', status: 'confirmed'}],
    ['paymentAgreements/historical', {amount: 5000, termsVersion: 'frozen'}],
    ['paymentSessions/historical', {status: 'pending', amount: 5000}],
  ];
  for (const [path, value] of historical) f.docs.set(path, structuredClone(value));
  const tx = f.transaction();
  const result = await commitLifecycle(tx, f.input);
  assert.deepEqual(result.withdrawnPackageIds, ['birthday_one', 'birthday_two']);
  assert.equal(f.docs.get('occasions/birthday').active, false);
  tx.commit();
  assert.equal(f.docs.get('occasions/birthday').active, true);
  for (const id of ['birthday_one', 'birthday_two']) {
    const pkg = f.docs.get(`packages/${id}`);
    assert.equal(pkg.status, 'draft');
    assert.equal(pkg.isPublished, false);
    assert.equal(pkg.isActive, false);
    assert.equal(pkg.providerPubliclyVisible, false);
    assert.equal(pkg.publishedAt, null);
    assert.equal(pkg.eventType, 'birthday');
  }
  assert.equal(f.docs.get('packages/unrelated').isPublished, true);
  for (const [path, value] of historical) assert.deepEqual(f.docs.get(path), value);
  const retry = f.transaction();
  assert.equal((await commitLifecycle(retry, f.input)).idempotentReplay, true);
  assert.equal(retry.writes.length, 0);
  assert.equal(f.docs.get('packages/birthday_one').isPublished, false);
});
