const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const {Timestamp} = require('firebase-admin/firestore');
const core = require('../lib/packages/occasion-suggestion-v2-core.js');
const {normalizeSuggestionName} = require('../lib/packages/provider-occasion-suggestion-v2-domain.js');
const root = require('node:path').resolve(__dirname, '../lib');
let store, serial, failCommit, activeRole;
const clone = v => v; // Stored Timestamp instances retain nanosecond precision.
class Ref {
  constructor(path) { this.path=path; this.id=path.split('/').at(-1); }
}
class Query {
  constructor(path, filters=[], orders=[], after=null, cap=Infinity) {
    Object.assign(this,{path,filters,orders,after,cap});
  }
  doc(id = `auto_${++serial}`) { return new Ref(`${this.path}/${id}`); }
  where(f,op,v) { assert.equal(op,'=='); return new Query(this.path,[...this.filters,[f,v]],this.orders,this.after,this.cap); }
  orderBy(f,d) { return new Query(this.path,this.filters,[...this.orders,[typeof f === 'string' ? f : '__name__',d]],this.after,this.cap); }
  startAfter(...a) { return new Query(this.path,this.filters,this.orders,a,this.cap); }
  limit(cap) { return new Query(this.path,this.filters,this.orders,this.after,cap); }
}
function snap(path,data) { return {id:path.split('/').at(-1),exists:data!==undefined,data:()=>clone(data)}; }
function compare(a,b) { if(a instanceof Timestamp) return a.seconds-b.seconds || a.nanoseconds-b.nanoseconds; return a<b?-1:a>b?1:0; }
let tail = Promise.resolve();
let retries = 0;
const db = {collection:path=>new Query(path),runTransaction: async fn => {
  for(let attempt=0;attempt<30;attempt++){
    const base=new Map(store), reads=new Set();
    const writes=[]; let writing=false;
    const tx={get:async q=>{
      assert.equal(writing,false,'Firestore reads precede writes');
      if(q instanceof Ref) {reads.add(q.path);return snap(q.path,base.get(q.path));}
      let rows=[...base].filter(([p,v])=>p.split('/').length===q.path.split('/').length+1 && p.startsWith(q.path+'/') && q.filters.every(([f,x])=>v[f]===x));
      rows.forEach(([p])=>reads.add(p));
      const vals=([p,v])=>q.orders.map(([f])=>f==='__name__'?p.split('/').at(-1):v[f]);
      const cmp=(a,b)=>{for(let i=0;i<q.orders.length;i++){const c=compare(a[i],b[i])*(q.orders[i][1]==='desc'?-1:1);if(c)return c;}return 0;};
      rows.sort((a,b)=>cmp(vals(a),vals(b)));
      if(q.after) rows=rows.filter(r=>cmp(vals(r),q.after)>0);
      return {docs:rows.slice(0,q.cap).map(([p,v])=>snap(p,v))};
    },create:(r,v)=>{writing=true;writes.push(['create',r,v]);},set:(r,v)=>{writing=true;writes.push(['set',r,v]);},update:(r,v)=>{writing=true;writes.push(['update',r,v]);}};
    const result=await fn(tx);
    const commit=tail.then(()=>{
    if([...reads].some(p=>base.get(p)!==store.get(p)))return false;
    if(failCommit) throw Error('injected commit failure');
    const next=new Map(store);
    for(const [kind,r,v] of writes){if(kind==='create')assert.equal(next.has(r.path),false);next.set(r.path,kind==='update'?{...next.get(r.path),...v}:v);}
    store=next;return true;
    });tail=commit.catch(()=>{});if(await commit)return result;retries++;
  }throw Error("retry budget exhausted");
}};
const load=Module._load;
Module._load=function(id,parent,...rest){
  const resolved=(()=>{try{return Module._resolveFilename(id,parent);}catch{return '';}})();
  if(resolved===root+'/shared/firestore.js' || resolved===root+'\\shared\\firestore.js') return {db};
  if(resolved.endsWith('shared\\rate-limit.js')||resolved.endsWith('shared/rate-limit.js')) return {enforceCallableRateLimit:async()=>{}};
  if(resolved.endsWith('shared\\authorization.js')||resolved.endsWith('shared/authorization.js')) return {requireRole:async(uid,roles)=>{if(!roles.includes(activeRole))throw Object.assign(Error(),{code:'permission-denied'});}};
  if(id==='firebase-functions/v2/https') {const real=load.call(this,id,parent,...rest);return {...real,onCall:(options,handler)=>{const callable=real.onCall(options,handler);callable.testOptions=options;return callable;}};}
  if(id==='firebase-functions/params') return {defineSecret:()=>({value:()=>Buffer.alloc(32,7).toString('base64url')})};
  return load.call(this,id,parent,...rest);
};
const api=require('../lib/packages/provider-occasion-suggestions-v2.js');
Module._load=load;
const now=()=>Timestamp.now();
const user=(role,providerId)=>({role,providerId,accountStatus:'active',isActive:true,isBlocked:false});
const occasion=(active=true)=>({id:'birthday',label:'Birthday',aliases:['Birthday party'],active,moderationState:'approved',revision:1,applicableServiceCategoryCodes:['catering_service'],sortOrder:1});
const call=(name,data,uid='owner')=>api[name].run({data,auth:uid?{uid,token:{}}:undefined,rawRequest:{headers:{}}});
const submit=(name='Garden party',idempotencyKey='submission_key_0001')=>call('submitProviderOccasionSuggestion',{name,idempotencyKey});
const review=(suggestionId,extra={decision:'reject'})=>call('reviewOccasionSuggestion',{suggestionId,expectedRevision:1,expectedCatalogRevision:1,idempotencyKey:'review_key_000001',reason:'Reviewed idea',decision:'reject',...extra},'admin');
beforeEach(()=>{serial=0;retries=0;failCommit=false;activeRole='provider';process.env.GCLOUD_PROJECT='demo-feasta';store=new Map([
 ['users/owner',user('provider','p1')],['users/admin',user('admin')],
 ['providers/p1',{ownerId:'owner',verificationStatus:'approved',isActive:true,serviceCategories:['catering_service'],providerServiceType:'catering'}],
 ['contractPolicies/providerPackageV2',{revision:1,effectiveEnvironment:'demo-feasta',featureGates:{occasionSuggestionWrites:true},maxPendingSuggestionsPerProvider:3,maxNewSuggestionsPerProvider24h:5}],
 ['occasionCatalog/current',{revision:1,activationState:'stable'}],
 ['serviceCategories/catering_service',{code:'catering_service',status:'active',serviceType:'catering'}],
 ]);});
test('authentication and role are required',async()=>{await assert.rejects(call('submitProviderOccasionSuggestion',{},null),{code:'unauthenticated'});activeRole='customer';await assert.rejects(submit(),{code:'permission-denied'});});

test('provider cannot use administrator review to write mapping authority',async()=>{
  const a=await submit();
  const before=new Map(store);
  await assert.rejects(review(a.suggestion.suggestionId,{decision:'map',targetOccasionId:'birthday',targetExpectedRevision:1}),{code:'permission-denied'});
  assert.deepEqual(store,before);
});

test('review cannot smuggle an unapproved legacy mapping into catalog creation',async()=>{
  const a=await submit();activeRole='admin';
  const before=new Map(store);
  // These are intentionally unsupported candidate fields, not a storage contract.
  for(const extra of [{eventType:'wedding'},{legacyEventType:'wedding'},{legacyEventType:'invalid'}, {legacyEventTypes:['wedding','wedding']}]){
    await assert.rejects(review(a.suggestion.suggestionId,{decision:'approve_new',newOccasion:{
      id:'garden_party',label:'Garden Party',aliases:[],applicableServiceCategoryCodes:['catering_service'],sortOrder:9,...extra,
    }}),{code:'invalid-argument'});
    assert.deepEqual(store,before);
  }
});

test('suggestion mapping never adds gallery mapping metadata or changes catalog authority',async()=>{
  const a=await submit();store.set('occasions/birthday',occasion());activeRole='admin';
  const target={...store.get('occasions/birthday')};
  const catalog={...store.get('occasionCatalog/current')};
  const input={decision:'map',targetOccasionId:'birthday',targetExpectedRevision:1};
  const result=await review(a.suggestion.suggestionId,input);
  assert.deepEqual(await review(a.suggestion.suggestionId,input),result);
  assert.deepEqual(store.get('occasions/birthday'),target);
  assert.deepEqual(store.get('occasionCatalog/current'),catalog);
  assert.equal([...store.keys()].filter(k=>k.startsWith('occasionSuggestionReviewAudits/')).length,1);
});
test('approved ownership is required',async()=>{store.get('providers/p1').ownerId='someone';await assert.rejects(submit(),{code:'permission-denied'});});
test('suspended provider fails closed',async()=>{store.get('providers/p1').isSuspended=true;await assert.rejects(submit(),{code:'failed-precondition'});});
test('dedicated write gate and environment fail closed',async()=>{const p=store.get('contractPolicies/providerPackageV2');p.featureGates={occasionCatalogReads:true};await assert.rejects(submit(),e=>e.details.reason==='FEATURE_DISABLED');p.featureGates.occasionSuggestionWrites=true;p.effectiveEnvironment='wrong';await assert.rejects(submit(),e=>e.details.reason==='CONFIG_UNAVAILABLE');});
test('normalization and strict input',async()=>{assert.equal(normalizeSuggestionName(' Garden  PARTY '),'garden party');await assert.rejects(call('submitProviderOccasionSuggestion',{name:'Good',idempotencyKey:'submission_key_0001',providerId:'p2'}),{code:'invalid-argument'});await assert.rejects(submit('Bad\u200bname'),{code:'invalid-argument'});});
test('created replay preserves original pending snapshot after moderation',async()=>{const a=await submit();activeRole='admin';await review(a.suggestion.suggestionId);activeRole='provider';const b=await submit();assert.equal(b.outcome,'idempotent_replay');assert.deepEqual(b.result,a);assert.equal(b.result.suggestion.status,'pending');});
test('changed payload conflicts',async()=>{await submit();await assert.rejects(submit('Other party'),e=>e.details.reason==='IDEMPOTENCY_CONFLICT');});
test('inactive canonical alias precedes own duplicate and quotas',async()=>{await submit('Birthday party');store.set('occasions/birthday',occasion(false));const a=await submit('Birthday party','submission_key_0002');assert.equal(a.outcome,'canonical_match');assert.equal(a.match.active,false);assert.equal(a.match.occasionId,'birthday');assert.equal([...store.keys()].filter(k=>k.startsWith('providerOccasionSuggestions/')).length,1);});
test('own duplicate includes terminal status without consuming slots',async()=>{const a=await submit();activeRole='admin';await review(a.suggestion.suggestionId);activeRole='provider';const b=await submit('garden party','submission_key_0002');assert.equal(b.outcome,'own_duplicate');assert.equal(b.suggestion.status,'rejected');});
test('concurrent requests cannot bypass pending quota',async()=>{const r=await Promise.allSettled(Array.from({length:9},(_,i)=>submit(`Party ${i}`,`submission_key_000${i}`)));assert.equal(r.filter(x=>x.status==='fulfilled').length,3);assert.equal(r.filter(x=>x.status==='rejected').length,6);assert.ok(retries>0);});
test('rolling quota includes resolved submissions and excludes older than 24h',async()=>{for(let i=0;i<5;i++){const a=await submit(`Party ${i}`,`submission_key_000${i}`);store.get(`providerOccasionSuggestions/${a.suggestion.suggestionId}`).status='rejected';}await assert.rejects(submit('Sixth','submission_key_0006'),e=>e.details.reason==='RATE_LIMITED');[...store].find(([p])=>p.startsWith('providerOccasionSuggestions/'))[1].createdAt=Timestamp.fromMillis(Date.now()-86400001);assert.equal((await submit('Sixth','submission_key_0006')).outcome,'created');});
test('stricter protected policy is enforced',async()=>{store.get('contractPolicies/providerPackageV2').maxPendingSuggestionsPerProvider=1;await submit();await assert.rejects(submit('Second','submission_key_0002'),{code:'resource-exhausted'});});
test('owner pagination scopes data and rejects cursor tampering',async()=>{await submit('Party one');await submit('Party two','submission_key_0002');const a=await call('listMyOccasionSuggestions',{pageSize:1});assert.equal(a.items.length,1);assert.match(a.items[0].createdAt,/Z$/);const b=await call('listMyOccasionSuggestions',{pageSize:1,cursor:a.nextCursor});assert.notEqual(a.items[0].suggestionId,b.items[0].suggestionId);await assert.rejects(call('listMyOccasionSuggestions',{pageSize:1,cursor:a.nextCursor+'x'}),e=>e.details.reason==='INVALID_CURSOR');await assert.rejects(call('listMyOccasionSuggestions',{pageSize:1,status:'pending',cursor:a.nextCursor}),{code:'invalid-argument'});await assert.rejects(call('listMyOccasionSuggestions',{providerId:'p2'}),{code:'invalid-argument'});await assert.rejects(call('listMyOccasionSuggestions',{pageSize:21}),{code:'invalid-argument'});});
test('admin queue requires active current admin and pending filter',async()=>{await submit();activeRole='admin';assert.equal((await call('listOccasionSuggestionsForReview',{status:'pending'},'admin')).items.length,1);await assert.rejects(call('listOccasionSuggestionsForReview',{status:'rejected'},'admin'),{code:'invalid-argument'});store.get('users/admin').isActive=false;await assert.rejects(call('listOccasionSuggestionsForReview',{status:'pending'},'admin'),{code:'permission-denied'});});
test('reject creates exactly one audit and outbox; replay precedes revisions',async()=>{const a=await submit();activeRole='admin';const r=await review(a.suggestion.suggestionId);store.get('occasionCatalog/current').revision=99;assert.deepEqual(await review(a.suggestion.suggestionId),r);for(const prefix of ['occasionSuggestionReviewAudits/','occasionSuggestionOutbox/'])assert.equal([...store.keys()].filter(k=>k.startsWith(prefix)).length,1);await assert.rejects(review(a.suggestion.suggestionId,{decision:'reject',reason:'Changed'}),e=>e.details.reason==='IDEMPOTENCY_CONFLICT');});
test('catalog and suggestion revision conflicts abort with no audit',async()=>{const a=await submit();activeRole='admin';await assert.rejects(review(a.suggestion.suggestionId,{expectedCatalogRevision:2}),e=>e.details.reason==='REVISION_CONFLICT');await assert.rejects(review(a.suggestion.suggestionId,{expectedRevision:2}),e=>e.details.reason==='REVISION_CONFLICT');assert.equal([...store.keys()].filter(k=>k.startsWith('occasionSuggestionReviewAudits/')).length,0);});
test('approve new creates inactive identity and atomic name reservations',async()=>{const a=await submit();activeRole='admin';const r=await review(a.suggestion.suggestionId,{decision:'approve_new',newOccasion:{id:'garden_party',label:'Garden Party',aliases:[],applicableServiceCategoryCodes:['catering_service'],sortOrder:9}});assert.equal(r.targetActive,false);assert.equal(r.catalogRevision,2);assert.equal(store.get('occasions/garden_party').active,false);assert.equal([...store.keys()].filter(k=>k.startsWith('occasionNameReservations/')).length,1);assert.equal(store.get('providers/p1').eventTypesSupported,undefined);});
test('approve existing inactive requires matching identity and revision',async()=>{const a=await submit('Birthday party');store.set('occasions/birthday',occasion(false));activeRole='admin';await assert.rejects(review(a.suggestion.suggestionId,{decision:'approve_existing_inactive',targetOccasionId:'birthday',targetExpectedRevision:2}),e=>e.details.reason==='REVISION_CONFLICT');const r=await review(a.suggestion.suggestionId,{decision:'approve_existing_inactive',targetOccasionId:'birthday',targetExpectedRevision:1});assert.equal(r.status,'approved');assert.equal(r.catalogRevision,1);assert.equal(store.get('occasions/birthday').revision,1);});
test('map requires active applicable target',async()=>{const a=await submit();store.set('occasions/birthday',occasion());activeRole='admin';const r=await review(a.suggestion.suggestionId,{decision:'map',targetOccasionId:'birthday',targetExpectedRevision:1});assert.equal(r.status,'mapped');assert.equal(r.targetActive,true);});
test('invalid map applicability and approval identity fail',async()=>{const a=await submit();store.set('occasions/birthday',occasion(false));activeRole='admin';await assert.rejects(review(a.suggestion.suggestionId,{decision:'approve_existing_inactive',targetOccasionId:'birthday',targetExpectedRevision:1}),e=>e.details.reason==='INVALID_REVIEW_TARGET');store.get('occasions/birthday').active=true;store.get('occasions/birthday').applicableServiceCategoryCodes=['photography'];await assert.rejects(review(a.suggestion.suggestionId,{decision:'map',targetOccasionId:'birthday',targetExpectedRevision:1}),e=>e.details.reason==='INVALID_REVIEW_TARGET');});
test('commit failure rolls back suggestion, catalog, audit, outbox and operation',async()=>{const a=await submit();activeRole='admin';const before=new Map(store);failCommit=true;await assert.rejects(review(a.suggestion.suggestionId),/injected/);assert.deepEqual(store,before);});
test('HMAC binds actor and preserves nanoseconds',()=>{const k=Buffer.alloc(32,4),p={seconds:10,nanoseconds:123,id:'one'};const c=core.signSuggestionCursor('owner',p,k);assert.deepEqual(core.readSuggestionCursor('owner',c,k),p);assert.throws(()=>core.readSuggestionCursor('other',c,k),e=>e.details.reason==='INVALID_CURSOR');});

test('concurrent same-key submissions create exactly one suggestion',async()=>{const results=await Promise.all(Array.from({length:8},()=>submit()));assert.equal(results.filter(r=>r.outcome==='created').length,1);assert.equal(results.filter(r=>r.outcome==='idempotent_replay').length,7);assert.ok(retries>0);});
test('concurrent canonical approvals cannot reserve the same identity twice',async()=>{const a=await submit('Garden party');const b=await submit('Garden gathering','submission_key_0002');activeRole='admin';const newOccasion={id:'garden_party',label:'Garden Party',aliases:[],applicableServiceCategoryCodes:['catering_service'],sortOrder:9};const results=await Promise.allSettled([review(a.suggestion.suggestionId,{decision:'approve_new',newOccasion}),review(b.suggestion.suggestionId,{decision:'approve_new',newOccasion,idempotencyKey:'review_key_000002'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.ok(retries>0);assert.equal([...store.keys()].filter(k=>k.startsWith('occasionSuggestionReviewAudits/')).length,1);});
test('review validates reason and exact branch fields',async()=>{const a=await submit();activeRole='admin';for(const reason of ['', 'x'.repeat(501),'bad\u200breason'])await assert.rejects(review(a.suggestion.suggestionId,{reason}),e=>e.details.reason==='INVALID_REVIEW_REASON');await assert.rejects(review(a.suggestion.suggestionId,{decision:'reject',targetOccasionId:'birthday'}),e=>e.details.reason==='INVALID_REVIEW_TARGET');});
test('terminal suggestion under a new review key cannot be changed',async()=>{const a=await submit();activeRole='admin';await review(a.suggestion.suggestionId);await assert.rejects(review(a.suggestion.suggestionId,{idempotencyKey:'review_key_000002'}),e=>e.details.reason==='SUGGESTION_NOT_PENDING');});
test('catalog reservation conflicts and invalid category abort approval',async()=>{const a=await submit();activeRole='admin';const newOccasion={id:'garden_party',label:'Garden Party',aliases:[],applicableServiceCategoryCodes:['catering_service'],sortOrder:1};store.set('occasionNameReservations/'+core.digest('garden party'),{occasionId:'other'});await assert.rejects(review(a.suggestion.suggestionId,{decision:'approve_new',newOccasion}),e=>e.details.reason==='CATALOG_NAME_CONFLICT');store.delete('occasionNameReservations/'+core.digest('garden party'));store.get('serviceCategories/catering_service').status='discontinued';await assert.rejects(review(a.suggestion.suggestionId,{decision:'approve_new',newOccasion}),e=>e.details.reason==='INVALID_SERVICE_CATEGORY');});
test('App Check is enforced by all four callable endpoints',()=>{for(const callable of Object.values(api)){assert.equal(callable.testOptions.enforceAppCheck,true);}});
test('owner listing excludes other providers and accepts exact status filters',async()=>{const a=await submit();const stored=store.get('providerOccasionSuggestions/'+a.suggestion.suggestionId);store.set('providerOccasionSuggestions/foreign',{...stored,providerId:'p2'});assert.equal((await call('listMyOccasionSuggestions',{})).items.length,1);for(const status of ['approved','mapped','rejected'])assert.equal((await call('listMyOccasionSuggestions',{status})).items.length,0);});
test('queue pagination is ascending and rejects owner cursors',async()=>{const a=await submit();const b=await submit('Second party','submission_key_0002');store.get('providerOccasionSuggestions/'+a.suggestion.suggestionId).createdAt=new Timestamp(100,1);store.get('providerOccasionSuggestions/'+b.suggestion.suggestionId).createdAt=new Timestamp(100,2);const own=await call('listMyOccasionSuggestions',{pageSize:1});activeRole='admin';const first=await call('listOccasionSuggestionsForReview',{status:'pending',pageSize:1},'admin');assert.equal(first.items[0].suggestionId,a.suggestion.suggestionId);const second=await call('listOccasionSuggestionsForReview',{status:'pending',pageSize:1,cursor:first.nextCursor},'admin');assert.equal(second.items[0].suggestionId,b.suggestion.suggestionId);await assert.rejects(call('listOccasionSuggestionsForReview',{status:'pending',pageSize:1,cursor:own.nextCursor},'admin'),e=>e.details.reason==='INVALID_CURSOR');});
test('new approval failure atomically rolls back every record',async()=>{const a=await submit();activeRole='admin';const before=new Map(store);failCommit=true;await assert.rejects(review(a.suggestion.suggestionId,{decision:'approve_new',newOccasion:{id:'garden_party',label:'Garden party',aliases:[],applicableServiceCategoryCodes:['catering_service'],sortOrder:1}}),/injected/);assert.deepEqual(store,before);});
test('same-key review requires current active administrator authority',async()=>{const a=await submit();activeRole='admin';await review(a.suggestion.suggestionId);store.get('users/admin').role='customer';await assert.rejects(review(a.suggestion.suggestionId),e=>e.details.reason==='ADMIN_REQUIRED');});
test('canonical and duplicate replay preserve original results',async()=>{store.set('occasions/birthday',occasion(false));const canonical=await submit('Birthday');store.get('occasions/birthday').active=true;assert.deepEqual((await submit('Birthday')).result,canonical);const created=await submit('Garden party','submission_key_0002');const duplicate=await submit('Garden party','submission_key_0003');store.get('providerOccasionSuggestions/'+created.suggestion.suggestionId).status='rejected';assert.deepEqual((await submit('Garden party','submission_key_0003')).result,duplicate);});
test('private collections remain denied and required index tuples exist',()=>{const fs=require('node:fs'),path=require('node:path');const rules=fs.readFileSync(path.resolve(__dirname,'../../firebase/firestore.rules'),'utf8');assert.match(rules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);for(const name of ['providerOccasionSuggestions','occasionSuggestionOperations','occasionSuggestionReviewAudits','occasionSuggestionOutbox'])assert.equal(rules.includes('match /'+name),false);const indexes=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../firebase/firestore.indexes.json'),'utf8')).indexes.filter(i=>i.collectionGroup==='providerOccasionSuggestions');assert.deepEqual(indexes.map(i=>i.fields.map(f=>f.fieldPath+':'+f.order).join(',')).sort(),['providerId:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING','providerId:ASCENDING,status:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING','status:ASCENDING,createdAt:ASCENDING,__name__:ASCENDING'].sort());});
