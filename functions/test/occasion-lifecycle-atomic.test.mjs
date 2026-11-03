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
  ['occasion-package-dependencies','admin/occasion-package-dependencies.ts'],
  ['occasion-booking-dependencies','admin/occasion-booking-dependencies.ts'],
  ['occasion-routine-activation','admin/occasion-routine-activation.ts'],
  ['occasion-transition-inventory-scan','packages/occasion-transition-inventory-scan.ts'],
  ['occasion-withdrawal-batch','packages/occasion-withdrawal-batch.ts'],
]){
  let code=readFileSync(join(sources,path),'utf8');
  code=code.replaceAll('.js"','.ts"').replaceAll('../packages/','./');
  if(name==='occasion-lifecycle-atomic')code=code.replace(
    'import {FieldPath} from "firebase-admin/firestore";',
    'const FieldPath={documentId:()=>"__name__"};');
  if(name==='occasion-booking-dependencies'){
    const statusImport=/import\s*\{\s*parseMainEventStatus,\s*parseProviderRequestStatus,?\s*\}\s*from\s*"\.\.\/shared\/constants\.ts";/u;
    assert.match(code,statusImport,'missing booking status import');
    const compiledStatusURL=pathToFileURL(resolve('functions/lib/shared/constants.js')).href;
    code=code.replace(statusImport,
      `import bookingStatuses from ${JSON.stringify(compiledStatusURL)};\n`+
      'const {parseMainEventStatus,parseProviderRequestStatus}=bookingStatuses;');
  }
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
        const snapshots=rows.map(([path,value])=>({
          id:path.split('/').at(-1),
          ref:ref(path),
          data:()=>value,
        }));
        return {docs:snapshots,size:snapshots.length,empty:snapshots.length===0};
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

test('deactivation refuses live packages without any mutation',async()=>{
  const f=fixture();
  const tx=f.transaction();
  await assert.rejects(commitLifecycle(tx,f.input),
    {message:'OCCASION_LIVE_PACKAGE_DEPENDENCY'});
  assert.equal(tx.writes.length,0);
  assert.equal(f.docs.get('occasions/birthday').active,true);
  assert.equal(f.docs.get('occasionCatalog/current').revision,3);
  assert.equal(f.docs.get('packages/affected').status,'published');
  assert.equal(f.docs.get('providers/p1/catalog/setups').setups[0].isPublished,true);
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
  const f=fixture({packages:[],galleries:Array.from({length:41},(_,i)=>['p'+i,[setup('one','birthday',true)]])});
  await blocked(f,'GALLERY_INVENTORY_TOO_LARGE');
});
test('corrupt gallery prevents both publication withdrawal and catalog writes',async()=>{
  const f=fixture({packages:[],galleries:[['p1',[{id:'s1',isPublished:'yes',eventType:'birthday'}]]]});
  await blocked(f,'GALLERY_INVENTORY_REQUIRES_REVIEW');
});
test('malformed public V2 package blocks deactivation without writes',async()=>{
  const f=fixture({packages:[['mixed',published({occasionSchemaVersion:2,
    occasionScope:'specific',occasionIds:'bad'})]],galleries:[]});
  await blocked(f,'OCCASION_PACKAGE_DEPENDENCY_REQUIRES_REVIEW');
  assert.equal(f.docs.get('packages/mixed').isPublished,true);
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
  const f=fixture({action:'activate',packages,galleries});const tx=f.transaction();
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
test('failed gallery validation cannot mutate occasion or catalog',async()=>{
  const f=fixture({packages:[],galleries:[['p1',[{id:'invalid',isPublished:'yes',eventType:'birthday'}]]]});
  const tx=f.transaction();
  await assert.rejects(commitLifecycle(tx,f.input),{message:'GALLERY_INVENTORY_REQUIRES_REVIEW'});
  assert.equal(tx.writes.length,0);
  assert.equal(f.docs.get('occasions/birthday').active,true);
  assert.equal(f.docs.get('occasionCatalog/current').revision,3);
  assert.equal(f.docs.get('providers/p1/catalog/setups').setups[0].isPublished,'yes');
});
test('tampered operation audit does not allow a false successful replay',async()=>{
  const f=fixture({packages:[],galleries:[]});const tx=f.transaction();
  const result=await commitLifecycle(tx,f.input);tx.commit();
  f.docs.get(`occasionLifecycleAudits/${result.operationId}`).occasionId='wedding';
  await blocked(f,'IDEMPOTENCY_CONFLICT');
});

function addBooking(f,{
  eventId='event_booking_001',
  requestId='request_booking_001',
  eventType='birthday',
  parentStatus='pending_provider_approval',
  requestStatus='pending',
}={}){
  f.docs.set(`mainEvents/${eventId}`,{
    eventType,
    status:parentStatus,
    providerRequestIds:[requestId],
    providerRequestCount:1,
  });
  f.docs.set(`providerRequests/${requestId}`,{
    mainEventId:eventId,
    eventType,
    status:requestStatus,
  });
}

test('live Birthday booking blocks deactivation without writes',async()=>{
  const f=fixture({packages:[],galleries:[]});
  addBooking(f);
  await blocked(f,'OCCASION_LIVE_BOOKING_DEPENDENCY');
  assert.equal(f.docs.get('occasions/birthday').active,true);
  assert.equal(f.docs.get('occasionCatalog/current').revision,3);
});

test('terminal Birthday booking histories remain unchanged',async()=>{
  for(const terminal of ['completed','cancelled','expired']){
    const f=fixture({packages:[],galleries:[]});
    addBooking(f,{parentStatus:terminal,requestStatus:terminal});
    const beforeEvent=structuredClone(f.docs.get('mainEvents/event_booking_001'));
    const beforeRequest=structuredClone(f.docs.get('providerRequests/request_booking_001'));
    const tx=f.transaction();
    const result=await commitLifecycle(tx,f.input);
    assert.equal(result.active,false);
    assert.equal(tx.writes.some(w=>w.path.startsWith('mainEvents/')),false);
    assert.equal(tx.writes.some(w=>w.path.startsWith('providerRequests/')),false);
    tx.commit();
    assert.equal(f.docs.get('occasions/birthday').active,false);
    assert.deepEqual(f.docs.get('mainEvents/event_booking_001'),beforeEvent);
    assert.deepEqual(f.docs.get('providerRequests/request_booking_001'),beforeRequest);
  }
});

test('terminal parent with active child blocks deactivation',async()=>{
  const f=fixture({packages:[],galleries:[]});
  addBooking(f,{parentStatus:'completed',requestStatus:'confirmed'});
  await blocked(f,'OCCASION_LIVE_BOOKING_DEPENDENCY');
});

test('missing linked request fails closed without writes',async()=>{
  const f=fixture({packages:[],galleries:[]});
  addBooking(f,{parentStatus:'completed',requestStatus:'completed'});
  f.docs.delete('providerRequests/request_booking_001');
  await blocked(f,'OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED');
});

test('mismatched request occasion fails closed without writes',async()=>{
  const f=fixture({packages:[],galleries:[]});
  addBooking(f,{parentStatus:'completed',requestStatus:'completed'});
  f.docs.get('providerRequests/request_booking_001').eventType='wedding';
  await blocked(f,'OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED');
});

test('41 booking records block bounded deactivation',async()=>{
  const f=fixture({packages:[],galleries:[]});
  for(let i=0;i<41;i++){
    addBooking(f,{
      eventId:`event_booking_${String(i).padStart(3,'0')}`,
      requestId:`request_booking_${String(i).padStart(3,'0')}`,
      parentStatus:'completed',
      requestStatus:'completed',
    });
  }
  await blocked(f,'OCCASION_BOOKING_INVENTORY_TOO_LARGE');
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
