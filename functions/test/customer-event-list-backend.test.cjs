const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {initializeApp} = require('firebase-admin/app');
initializeApp({projectId:'demo-feasta-event-list-backend-test'});
const {db} = require('../lib/shared/firestore.js');
const {mutateAuthorizedEventList: mutate} = require('../lib/customer-event-lists/mutate-event-list.js');
const {envelopeFingerprint,submittedEnvelope} = require('../lib/customer-event-lists/submission-proof.js');
const {bookingOutcomeId} = require('../lib/bookings/submission-outcome.js');
const corpus = require('../../contracts/customer-event-list/fixtures.json');
const copy = value => structuredClone(value);
const uid = 'customer_A', path = 'customerEventLists/'+uid;
const active = {role:'customer',accountStatus:'active',isActive:true,isBlocked:false};
const document = () => copy(corpus.document);
function command(action, extras={}, revision=0, requestId='request_0000000001') {
  return {version:1,requestId,action,expectedRevision:action==='import'?null:revision,...extras};
}
// Real Admin references, entirely in-memory reads and optimistic commits.
// This is not a Firestore emulator or an assertion about Rules enforcement.
class MemoryFirestore {
  constructor(cloud=document()) {
    this.records=new Map(); this.versions=new Map(); this.commits=[]; this.attempts=0;
    this.put('users/'+uid,active); if(cloud!==null)this.put(path,cloud);
  }
  put(key,value) { this.records.set(key,copy(value)); this.versions.set(key,(this.versions.get(key)||0)+1); }
  collection(name) { return db.collection(name); }
  async runTransaction(work) {
    for(let attempt=0;attempt<5;attempt++) {
      this.attempts++; const reads=new Map(), writes=[];
      const tx={
        get:async ref=>{
          assert.equal(writes.length,0,'all reads precede all writes');
          const data=copy(this.records.get(ref.path)); reads.set(ref.path,this.versions.get(ref.path)||0);
          return {id:ref.id,exists:data!==undefined,data:()=>copy(data)};
        },
        create:(ref,data)=>writes.push({type:'create',path:ref.path,data:copy(data)}),
        set:(ref,data)=>writes.push({type:'set',path:ref.path,data:copy(data)}),
      };
      const result=await work(tx);
      if(this.beforeCommit) { const hook=this.beforeCommit; this.beforeCommit=null; await hook(this); }
      if([...reads].some(([p,v])=>(this.versions.get(p)||0)!==v)) continue;
      if(this.failCommit) { this.failCommit=false; throw Error('simulated unavailable'); }
      for(const w of writes) {
        assert.match(w.path,/^customerEventLists\/customer_A(?:\/(?:operations|submissionCleanups)\/[A-Za-z0-9_-]+)?$/);
        if(w.type==='create') assert.equal(this.records.has(w.path),false);
      }
      writes.forEach(w=>this.put(w.path,w.data)); this.commits.push(writes); return result;
    }
    throw Error('transaction retry exhausted');
  }
}
function submissionFixture() {
  const d=document();
  const a=copy(d.entries[1]), b=copy(a);
  b.providerId='provider_456'; b.selectionId='package_second';
  b.identity='catering_package:provider_456:package_second';
  d.entries=[a,b,d.entries[3]];
  const envelope={schemaVersion:1,clientRequestId:'booking_request_001',
    event:copy(a.configuration.event),
    selections:[a,b].map(e=>({providerId:e.providerId,packageId:e.selectionId,configuration:copy(e.configuration)}))};
  const parsed=submittedEnvelope(envelope), id=bookingOutcomeId(uid,envelope.clientRequestId);
  const ids=[a,b].map(e=>createHash('sha256').update(`${id}:catering:${e.providerId}`).digest('hex').slice(0,40));
  const f=new MemoryFirestore(d);
  f.put('mainEvents/'+id,{customerId:uid,bookingId:id,mainEventId:id,clientRequestId:envelope.clientRequestId,
    submissionFingerprint:envelopeFingerprint(uid,parsed),providerRequestIds:ids,
    status:'pending_provider_approval',recoveryStatus:'none'});
  [a,b].forEach((e,i)=>f.put('providerRequests/'+ids[i],{customerId:uid,bookingId:id,mainEventId:id,
    providerRequestId:ids[i],providerId:e.providerId,packageId:e.selectionId}));
  return {f,envelope,snapshots:[a,b],bookingPath:'mainEvents/'+id,requestPath:'providerRequests/'+ids[0],id};
}
test('unauthenticated and reserved guest owner cannot transact',async()=>{
  for(const id of [null,'feasta_guest_device_v1','bad/uid']) {
    const f=new MemoryFirestore(); await assert.rejects(mutate(f,id,command('clear')));
    assert.equal(f.attempts,0);
  }
});
for(const user of [null,{...active,role:'provider'},{...active,role:'admin'},
  {...active,accountStatus:'inactive'},{...active,isActive:false},{...active,isBlocked:true}]) {
  test('trusted account authorization rejects '+JSON.stringify(user),async()=>{
    const f=new MemoryFirestore(); if(user)f.put('users/'+uid,user);else f.records.delete('users/'+uid);
    await assert.rejects(mutate(f,uid,command('clear')),e=>e.code==='permission-denied');
    assert.equal(f.commits.length,0);
  });
}
test('ignores no client UID: owner/UID fields are rejected',async()=>{
  for(const field of ['uid','ownerUid','customerUid','customerId']) {
    const f=new MemoryFirestore(); await assert.rejects(mutate(f,uid,command('clear',{[field]:'customer_B'})),e=>e.code==='invalid-argument');
    assert.equal(f.attempts,0);
  }
});
test('same UID operations do not touch another account or guest data',async()=>{
  const f=new MemoryFirestore(); f.put('customerEventLists/customer_B',{...document(),ownerUid:'customer_B'});
  const other=copy(f.records.get('customerEventLists/customer_B'));
  await mutate(f,uid,command('clear')); assert.deepEqual(f.records.get('customerEventLists/customer_B'),other);
});
test('initialize imports the exact Phase 2A envelope with revision zero',async()=>{
  const f=new MemoryFirestore(null); const result=await mutate(f,uid,command('import',{local:document()}));
  assert.deepEqual(f.records.get(path),document()); assert.equal(result.revision,0); assert.equal(result.changed,true);
});
test('existing newer and empty cloud always win old imports and replay',async()=>{
  for(const empty of [false,true]) {
    const d=document(); d.revision=7; if(empty)d.entries=[];
    const f=new MemoryFirestore(d); const input=command('import',{local:document()});
    const result=await mutate(f,uid,input);
    assert.equal(result.migrationReviewRequired,true); assert.equal(result.changed,false);
    assert.deepEqual(f.records.get(path),d);
    assert.equal((await mutate(f,uid,input)).replayed,true);
    await mutate(f,uid,{...input,requestId:'different_device_01'}); assert.deepEqual(f.records.get(path),d);
  }
});
test('import rejects foreign local, guest, nonzero revision and oversized snapshots',async()=>{
  for(const local of [{...document(),ownerUid:'customer_B'},{...document(),ownerUid:'feasta_guest_device_v1'},
    {...document(),revision:1},corpus.invalid.find(x=>x.name==='oversized document').document]) {
    const f=new MemoryFirestore(null); await assert.rejects(mutate(f,uid,command('import',{local})));
    assert.equal(f.commits.length,0);
  }
});
test('explicit add/update/remove/schedule preserve unrelated opaque canonical fields',async()=>{
  const d=document(), extra=copy(d.entries[0]); extra.selectionId='new_package'; extra.identity='catering_package:provider_123:new_package';
  const f=new MemoryFirestore(); const unsupported=copy(d.entries[1]);
  await mutate(f,uid,command('add',{entry:extra}));
  extra.name='Edited'; await mutate(f,uid,command('update',{entry:extra},1,'request_0000000002'));
  await mutate(f,uid,command('schedule',{schedule:document().schedule},2,'request_0000000003'));
  await mutate(f,uid,command('remove',{identity:extra.identity},3,'request_0000000004'));
  assert.deepEqual(f.records.get(path).entries.find(e=>e.identity===unsupported.identity),unsupported);
  assert.equal(f.records.get(path).revision,4);
});
test('add cannot overwrite, update cannot create or restore deleted identity',async()=>{
  const f=new MemoryFirestore(), entry=document().entries[0];
  await assert.rejects(mutate(f,uid,command('add',{entry})),e=>e.details.reason==='IDENTITY_EXISTS');
  await mutate(f,uid,command('remove',{identity:entry.identity}));
  await assert.rejects(mutate(f,uid,command('update',{entry},1,'request_0000000002')),e=>e.details.reason==='ENTRY_REMOVED');
});
test('24 entry capacity rejects distinct 25th without evicting',async()=>{
  const d=document(); d.entries=Array.from({length:24},(_,i)=>({...d.entries[0],selectionId:'package_'+i,identity:'catering_package:provider_123:package_'+i}));
  const f=new MemoryFirestore(d); await assert.rejects(mutate(f,uid,command('add',{entry:document().entries[0]})),e=>e.code==='resource-exhausted');
  assert.deepEqual(f.records.get(path),d); assert.equal(f.commits.length,0);
});
test('malformed requests cannot choose action, receipts, revisions or authority',async()=>{
  for(const input of [null,[],{},command('replace'),command('constructor'),command('clear',{},-1),
    command('clear',{},0.5),command('clear',{},0,'../unsafe_request_path'),
    command('clear',{document:document()}),command('import',{local:document()},0,'tiny')]) {
    const f=new MemoryFirestore(); await assert.rejects(mutate(f,uid,input),e=>e.code==='invalid-argument'); assert.equal(f.attempts,0);
  }
});
for(const fixture of corpus.invalid) test('schema invariant: '+fixture.name,async()=>{
  const f=new MemoryFirestore(null); await assert.rejects(mutate(f,uid,command('import',{local:fixture.document})));
  assert.equal(f.commits.length,0);
});
test('stored malformed cloud is never silently repaired or replaced',async()=>{
  const f=new MemoryFirestore({...document(),bookingToken:'forbidden'});
  await assert.rejects(mutate(f,uid,command('clear')),e=>e.code==='invalid-argument'); assert.equal(f.commits.length,0);
});
test('duplicate request replays after later changes and never executes twice',async()=>{
  const f=new MemoryFirestore(), input=command('clear'); const first=await mutate(f,uid,input);
  const entry=document().entries[0]; await mutate(f,uid,command('add',{entry},1,'request_0000000002'));
  const later=copy(f.records.get(path)); const replay=await mutate(f,uid,input);
  assert.equal(replay.revision,first.revision); assert.equal(replay.replayed,true); assert.deepEqual(f.records.get(path),later);
  assert.equal(f.commits[2].length,0);
});
test('reusing request ID for different action or body rejects before writes',async()=>{
  const f=new MemoryFirestore(); await mutate(f,uid,command('clear'));
  await assert.rejects(mutate(f,uid,command('add',{entry:document().entries[0]},1)),e=>e.code==='already-exists');
  assert.equal(f.records.get(path).revision,1);
});
test('replay rechecks active account state',async()=>{
  const f=new MemoryFirestore(), input=command('clear'); await mutate(f,uid,input); f.put('users/'+uid,{...active,isBlocked:true});
  await assert.rejects(mutate(f,uid,input),e=>e.code==='permission-denied');
});
test('simultaneous device edits: one succeeds and stale loser cannot overwrite',async()=>{
  const f=new MemoryFirestore(); const results=await Promise.allSettled([
    mutate(f,uid,command('remove',{identity:document().entries[0].identity})),
    mutate(f,uid,command('remove',{identity:document().entries[1].identity},0,'request_0000000002')),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected')[0].reason.code,'aborted');
  assert.equal(f.records.get(path).revision,1); assert.equal(f.records.get(path).entries.length,3);
});
test('simultaneous identical requests replay one durable receipt',async()=>{
  const f=new MemoryFirestore(); const results=await Promise.all([mutate(f,uid,command('clear')),mutate(f,uid,command('clear'))]);
  assert.equal(f.records.get(path).revision,1); assert.equal(results.filter(r=>r.replayed).length,1);
});
test('transaction retry reauthorizes and rejects account suspension',async()=>{
  const f=new MemoryFirestore(); f.beforeCommit=x=>x.put('users/'+uid,{...active,isActive:false});
  await assert.rejects(mutate(f,uid,command('clear')),e=>e.code==='permission-denied'); assert.equal(f.commits.length,0);
});
test('transaction retries unrelated contention without duplicated effects',async()=>{
  const f=new MemoryFirestore(); f.beforeCommit=x=>x.put('users/'+uid,active);
  await mutate(f,uid,command('clear')); assert.equal(f.attempts,2); assert.equal(f.commits.length,1);
});
test('commit failure writes neither list nor receipt; identical retry recovers',async()=>{
  const f=new MemoryFirestore(); f.failCommit=true;
  await assert.rejects(mutate(f,uid,command('clear')),/unavailable/);
  assert.deepEqual(f.records.get(path),document()); assert.equal(f.records.has(path+'/operations/request_0000000001'),false);
  const result=await mutate(f,uid,command('clear')); assert.equal(result.revision,1);
});
test('clear retains migration marker; stale writes and old local imports cannot resurrect',async()=>{
  const f=new MemoryFirestore(); await mutate(f,uid,command('clear'));
  await assert.rejects(mutate(f,uid,command('update',{entry:document().entries[0]},0,'request_0000000002')),e=>e.code==='aborted');
  await mutate(f,uid,command('import',{local:document()},null,'request_0000000003'));
  assert.deepEqual(f.records.get(path).entries,[]); assert.deepEqual(f.records.get(path).migration,{version:1,completed:true});
});
test('successful server-proven cleanup removes only unchanged submitted snapshots',async()=>{
  const {f,envelope,snapshots,bookingPath}=submissionFixture(); const booking=copy(f.records.get(bookingPath));
  const result=await mutate(f,uid,command('cleanup',{submission:envelope,snapshots}));
  assert.deepEqual(result.removedIdentities,snapshots.map(e=>e.identity));
  assert.equal(f.records.get(path).entries.length,1); assert.equal(f.records.get(path).entries[0].kind,'custom_menu');
  assert.deepEqual(f.records.get(bookingPath),booking);
});
test('cleanup preserves newer config and metadata edits, unrelated entries and schedule',async()=>{
  const {f,envelope,snapshots}=submissionFixture(); const d=copy(f.records.get(path));
  d.revision=3; d.entries[0].configuration.customTheme='Edited later'; d.entries[1].name='New display name'; f.put(path,d);
  const result=await mutate(f,uid,command('cleanup',{submission:envelope,snapshots},3));
  assert.deepEqual(result.removedIdentities,[]); assert.equal(result.preservedIdentities.length,2);
  assert.deepEqual(f.records.get(path).entries,d.entries); assert.deepEqual(f.records.get(path).schedule,d.schedule);
});
test('cleanup receipt retry cannot remove a subsequently re-added entry',async()=>{
  const {f,envelope,snapshots}=submissionFixture(); const input=command('cleanup',{submission:envelope,snapshots});
  await mutate(f,uid,input); await mutate(f,uid,command('add',{entry:snapshots[0]},1,'request_0000000002'));
  await mutate(f,uid,input); assert.equal(f.records.get(path).entries.length,2);
});
test('same booking cleanup with a new request ID cannot consume re-added entries',async()=>{
  const {f,envelope,snapshots}=submissionFixture();
  await mutate(f,uid,command('cleanup',{submission:envelope,snapshots}));
  await mutate(f,uid,command('add',{entry:snapshots[0]},1,'request_0000000002'));
  const result=await mutate(f,uid,command('cleanup',{submission:envelope,snapshots},2,'request_0000000003'));
  assert.deepEqual(result.removedIdentities,[]); assert.equal(f.records.get(path).entries.length,2);
});
for(const kind of ['missing','foreign','rejected','fingerprint','reconciliation','request-missing','request-foreign','request-package']) {
  test('cleanup fails closed for '+kind+' proof',async()=>{
    const {f,envelope,snapshots,bookingPath,requestPath,id}=submissionFixture();
    if(kind==='missing')f.records.delete(bookingPath);
    if(kind==='foreign')f.put(bookingPath,{...f.records.get(bookingPath),customerId:'customer_B'});
    if(kind==='rejected')f.put('bookingSubmissionOutcomes/'+id,{outcome:'confirmed_rejected'});
    if(kind==='fingerprint')f.put(bookingPath,{...f.records.get(bookingPath),submissionFingerprint:'0'.repeat(64)});
    if(kind==='reconciliation')f.put(bookingPath,{...f.records.get(bookingPath),recoveryStatus:'required'});
    if(kind==='request-missing')f.records.delete(requestPath);
    if(kind==='request-foreign')f.put(requestPath,{...f.records.get(requestPath),customerId:'customer_B'});
    if(kind==='request-package')f.put(requestPath,{...f.records.get(requestPath),packageId:'another_package'});
    const before=copy(f.records.get(path));
    await assert.rejects(mutate(f,uid,command('cleanup',{submission:envelope,snapshots})),e=>e.code==='failed-precondition');
    assert.deepEqual(f.records.get(path),before); assert.equal(f.commits.length,0);
  });
}
test('client success claim, changed snapshot configuration, unrelated identity cannot authorize cleanup',async()=>{
  for(const variation of ['success','configuration','identity']) {
    const {f,envelope,snapshots}=submissionFixture();
    const extra={submission:envelope,snapshots};
    if(variation==='success')extra.success=true;
    if(variation==='configuration')snapshots[0].configuration.customTheme='Not booked';
    if(variation==='identity'){snapshots[0].selectionId='unrelated';snapshots[0].identity='catering_package:provider_123:unrelated';}
    await assert.rejects(mutate(f,uid,command('cleanup',extra))); assert.equal(f.commits.length,0);
  }
});
test('callable transport rejects unauthenticated requests before backend access',async()=>{
  const {handleCustomerEventListMutation}=require('../lib/customer-event-lists/customer-event-list-callable.js');
  await assert.rejects(handleCustomerEventListMutation({data:command('clear'),rawRequest:{headers:{}}}),e=>e.code==='unauthenticated');
});
test('callable rejects disabled, revoked, malformed auth sessions without transactions',async()=>{
  const {getAuth}=require('firebase-admin/auth');
  const auth=getAuth(), original=auth.getUser;
  const {handleCustomerEventListMutation: handle}=require('../lib/customer-event-lists/customer-event-list-callable.js');
  try {
    for(const variation of ['disabled','revoked','missing-time','missing-valid-after']) {
      auth.getUser=async()=>({disabled:variation==='disabled',tokensValidAfterTime:variation==='missing-valid-after'?undefined:new Date(2000).toISOString()});
      const request={auth:{uid,token:{auth_time:variation==='missing-time'?undefined:variation==='revoked'?1:3}},
        data:command('clear'),rawRequest:{headers:{}}};
      await assert.rejects(handle(request),e=>e.code==='permission-denied');
    }
  } finally { auth.getUser=original; }
});
test('callable uses authenticated UID, existing App Check options and fresh account lookup',async()=>{
  const {getAuth}=require('firebase-admin/auth'); const auth=getAuth(), originalUser=auth.getUser;
  const originalTx=db.runTransaction; const rateLimit=require('../lib/shared/rate-limit.js');
  const originalLimit=rateLimit.enforceCallableRateLimit;
  const {handleCustomerEventListMutation:handle,mutateCustomerEventList:callable}=require('../lib/customer-event-lists/customer-event-list-callable.js');
  const f=new MemoryFirestore(); let lookups=0,limited=0;
  try {
    auth.getUser=async actual=>{assert.equal(actual,uid);lookups++;return {disabled:false,tokensValidAfterTime:new Date(0).toISOString()};};
    rateLimit.enforceCallableRateLimit=async(request,policy)=>{assert.equal(request.auth.uid,uid);assert.equal(policy.scope,'customer-event-list-mutation');limited++;};
    db.runTransaction=f.runTransaction.bind(f);
    const result=await handle({auth:{uid,token:{auth_time:3}},data:command('clear'),rawRequest:{headers:{}}});
    assert.equal(result.revision,1);assert.equal(lookups,1);assert.equal(limited,1);
    assert.equal(require('../lib/shared/function-options.js').appCheckCallableOptions.enforceAppCheck,true);
    assert.deepEqual(callable.__endpoint.callableTrigger,{});
  } finally {auth.getUser=originalUser;db.runTransaction=originalTx;rateLimit.enforceCallableRateLimit=originalLimit;}
});
test('mixed marketplace submission projection is bound to accepted fingerprint',async()=>{
  const {f,envelope,snapshots,bookingPath,requestPath}=submissionFixture();
  const service=copy(document().entries[2]); service.providerId=snapshots[1].providerId;
  service.identity='marketplace_service:'+service.providerId+':'+service.selectionId;
  service.configuration={event:copy(envelope.event),specialRequest:'Service instructions',customTheme:'',
    selectedFoods:[],selectedDecorations:[],selectedFurniture:[],foodChoiceSelections:[],selectedAddOns:[],
    willArrangeOwnAddOns:false,customerArrangedAddOnsNote:'',estimatedTotal:null};
  const d=copy(f.records.get(path)); d.entries[1]=service; f.put(path,d);
  envelope.schemaVersion=2; envelope.selections[0].kind='catering_package';
  envelope.selections[1]={kind:'marketplace_service',providerId:service.providerId,serviceId:service.selectionId,
    expectedRevision:service.expectedRevision,configuration:{event:service.configuration.event,specialRequest:'Service instructions'}};
  const booking=copy(f.records.get(bookingPath));booking.submissionFingerprint=envelopeFingerprint(uid,submittedEnvelope(envelope));f.put(bookingPath,booking);
  const secondRequestPath='providerRequests/'+booking.providerRequestIds[1];
  f.put(secondRequestPath,{...f.records.get(secondRequestPath),packageId:null,serviceId:service.selectionId});
  const result=await mutate(f,uid,command('cleanup',{submission:envelope,snapshots:[snapshots[0],service]}));
  assert.equal(result.removedIdentities.length,2); assert.equal(f.records.get(path).entries.length,1);
  assert.equal(f.records.get(requestPath).packageId,snapshots[0].selectionId);
});
test('unsupported single booking and custom menu cleanup reject with no writes',async()=>{
  const f=new MemoryFirestore();
  await assert.rejects(mutate(f,uid,command('cleanup',{submission:{clientRequestId:'single_request_001'},snapshots:[document().entries[3]]})),e=>e.code==='invalid-argument');
  assert.equal(f.commits.length,0);
});
test('input and result size limits apply to add/update, not only import',async()=>{
  const entry=corpus.invalid.find(x=>x.name==='oversized entry').document.entries[0];
  const f=new MemoryFirestore(); await assert.rejects(mutate(f,uid,command('add',{entry})),e=>e.code==='invalid-argument');
  const changed=copy(document().entries[0]);changed.configuration.themeInspiration.notes='x'.repeat(300001);
  await assert.rejects(mutate(f,uid,command('update',{entry:changed})),e=>e.code==='invalid-argument');
  assert.equal(f.commits.length,0);
});
test('safe-integer revision exhaustion fails closed',async()=>{
  const d=document();d.revision=Number.MAX_SAFE_INTEGER;const f=new MemoryFirestore(d);
  await assert.rejects(mutate(f,uid,command('clear',{},d.revision)),e=>e.code==='failed-precondition');
  assert.equal(f.commits.length,0);
});
