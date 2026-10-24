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
const db = {collectionGroup:path=>new Query('@group/'+path),collection:path=>new Query(path),runTransaction: async fn => {
  for(let attempt=0;attempt<30;attempt++){
    const base=new Map(store), reads=new Set();
    const writes=[]; let writing=false;
    const tx={get:async q=>{
      assert.equal(writing,false,'Firestore reads precede writes');
      if(q instanceof Ref) {reads.add(q.path);return snap(q.path,base.get(q.path));}
      let rows=[...base].filter(([p,v])=>(q.path.startsWith('@group/') ? p.split('/').at(-2)===q.path.slice(7) : p.split('/').length===q.path.split('/').length+1 && p.startsWith(q.path+'/')) && q.filters.every(([f,x])=>v[f]===x));
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
const api={...require('../lib/packages/update-setup-gallery-legacy-mapping.js'),...require('../lib/packages/provider-occasion-suggestions-v2.js')};
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

const update=(extra={},uid='admin')=>call('updateSetupGalleryLegacyMapping',{
 occasionId:'birthday',setupGalleryLegacyEventType:'birthday',expectedOccasionRevision:1,
 expectedCatalogRevision:1,reason:'Approved explicit mapping',idempotencyKey:'mapping_key_00001',...extra},uid);
beforeEach(()=>{activeRole='admin';store.set('occasions/birthday',{...occasion(),custom:{retained:true}});});
test('assignment atomically preserves fields and records audit and operation',async()=>{
 const before={...store.get('occasions/birthday')};const r=await update();
 assert.deepEqual(r,{extensionVersion:1,occasionId:'birthday',setupGalleryLegacyEventType:'birthday',occasionRevision:2,catalogRevision:2,operationId:r.operationId});
 assert.deepEqual(store.get('occasions/birthday'),{...before,setupGalleryLegacyEventType:'birthday',revision:2,updatedAt:store.get('occasions/birthday').updatedAt});
 assert.equal(store.get('occasionCatalog/current').activationState,'stable');
 assert.equal(store.get('occasionCatalog/current').revision,2);
 const audit=store.get('setupGalleryLegacyMappingAudits/'+r.operationId);
 assert.equal(audit.beforeMapping,null);assert.equal(audit.afterMapping,'birthday');
 assert.equal(audit.actorUid,'admin');assert.equal(audit.beforeCatalogRevision,1);assert.equal(audit.afterCatalogRevision,2);
 assert.equal(audit.beforeOccasionRevision,1);assert.equal(audit.afterOccasionRevision,2);
 assert.deepEqual(store.get('setupGalleryLegacyMappingOperations/'+r.operationId).result,r);
});
test('explicit null removes mapping and other is accepted only explicitly',async()=>{
 store.get('occasions/birthday').setupGalleryLegacyEventType='wedding';
 assert.equal((await update({setupGalleryLegacyEventType:null})).setupGalleryLegacyEventType,null);
 assert.equal(store.get('occasions/birthday').setupGalleryLegacyEventType,null);
 assert.equal((await update({setupGalleryLegacyEventType:'other',expectedOccasionRevision:2,expectedCatalogRevision:2,idempotencyKey:'mapping_key_00002'})).setupGalleryLegacyEventType,'other');
});
test('same legacy target may be shared by distinct occasion identities',async()=>{
 store.set('occasions/garden_party',{...occasion(),id:'garden_party'});await update();
 await update({occasionId:'garden_party',expectedCatalogRevision:2,idempotencyKey:'mapping_key_00002'});
 assert.equal(store.get('occasions/garden_party').setupGalleryLegacyEventType,'birthday');
});
test('unknown, absent mapping, invalid identities/revisions and extra fields reject',async()=>{
 for(const extra of [{setupGalleryLegacyEventType:'unknown'},{setupGalleryLegacyEventType:undefined},{occasionId:'../bad'},{expectedOccasionRevision:0},{expectedCatalogRevision:1.5},{expectedCatalogRevision:Number.MAX_SAFE_INTEGER+1},{providerId:'p1'}]){
 const before=new Map(store);await assert.rejects(update(extra),{code:'invalid-argument'});assert.deepEqual(store,before);
 }
});
test('reason uses trimmed Unicode code points and rejects unsafe text',async()=>{
 for(const reason of ['short','x'.repeat(501),'valid reason\u200b','valid reason\n','valid reason\ud800'])await assert.rejects(update({reason}),{code:'invalid-argument'});
 const r=await update({reason:'  '+ '??'.repeat(10)+'  '});
 assert.equal(store.get('setupGalleryLegacyMappingAudits/'+r.operationId).reason,'??'.repeat(10));
});
test('authentication, provider and non-admin access reject',async()=>{
 await assert.rejects(update({},null),{code:'unauthenticated'});
 for(const role of ['provider','customer']){activeRole=role;await assert.rejects(update({},'owner'),{code:'permission-denied'});}
});
test('current admin profile required on mutation and replay',async()=>{
 const r=await update();store.get('users/admin').isActive=false;
 await assert.rejects(update(),{code:'permission-denied'});assert.equal(store.get('occasions/birthday').revision,2);
 assert.ok(store.has('setupGalleryLegacyMappingAudits/'+r.operationId));
});
test('App Check uses enforced callable middleware',()=>assert.equal(api.updateSetupGalleryLegacyMapping.testOptions.enforceAppCheck,true));
test('stale occasion or global revision leaves no partial writes',async()=>{
 for(const extra of [{expectedOccasionRevision:2},{expectedCatalogRevision:2}]){
 const before=new Map(store);await assert.rejects(update(extra),e=>e.details.reason==='REVISION_CONFLICT');assert.deepEqual(store,before);
 }
});
test('missing, corrupt, transitional and overflowing authority fails closed',async()=>{
 const original=store.get('occasions/birthday');store.delete('occasions/birthday');await assert.rejects(update(),{code:'not-found'});store.set('occasions/birthday',original);
 for(const change of [{id:'wedding'},{revision:0},{revision:Number.MAX_SAFE_INTEGER},{moderationState:'pending'}]){
 store.set('occasions/birthday',{...original,...change});await assert.rejects(update(),{code:'failed-precondition'});
 }
 store.set('occasions/birthday',original);store.get('occasionCatalog/current').activationState='updating';await assert.rejects(update(),{code:'failed-precondition'});
});
test('identical replay returns original snapshot without duplicate mutation or audit',async()=>{
 const r=await update();const before=new Map(store);assert.deepEqual(await update(),r);assert.deepEqual(store,before);
 await assert.rejects(update({reason:'A changed administrator reason'}),e=>e.details.reason==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(update({setupGalleryLegacyEventType:'other'}),e=>e.details.reason==='IDEMPOTENCY_CONFLICT');
});
test('concurrent identical operations mutate once',async()=>{
 const results=await Promise.all(Array.from({length:5},()=>update()));assert.ok(results.every(r=>r.operationId===results[0].operationId));
 assert.equal(store.get('occasionCatalog/current').revision,2);assert.equal([...store.keys()].filter(p=>p.startsWith('setupGalleryLegacyMappingAudits/')).length,1);
});
test('commit failure rolls back catalog, occasion, audit and idempotency',async()=>{
 const before=new Map(store);failCommit=true;await assert.rejects(update(),/injected/);assert.deepEqual(store,before);
});
test('published or private V2 and unsupported records require unavailable withdrawal barrier',async()=>{
 for(const setup of [{setupOccasionSchemaVersion:2,eventType:'birthday',isPublished:true},{setupOccasionSchemaVersion:2,eventType:null,isPublished:false},{occasionIds:['birthday'],eventType:'birthday',isPublished:true},{eventType:'birthday',isPublished:true,unknown:true}]){
 store.set('providers/p1/catalog/setups',{setups:[setup]});const before=new Map(store);
 await assert.rejects(update(),e=>e.details.reason==='GALLERY_REVALIDATION_REQUIRED');assert.deepEqual(store,before);
 }
});
test('verified V1 gallery allows mapping without gallery/publication/policy mutations',async()=>{
 store.set('providers/p1/catalog/setups',{revision:3,setups:[{eventType:'birthday',isPublished:true}]});
 const gallery=store.get('providers/p1/catalog/setups'),policy=store.get('contractPolicies/providerPackageV2');
 await update();assert.equal(store.get('providers/p1/catalog/setups'),gallery);assert.equal(store.get('contractPolicies/providerPackageV2'),policy);
});
test('bounded compatibility scan fails closed',async()=>{
 for(let i=0;i<501;i++)store.set(`providers/provider_${i}/catalog/setups`,{setups:[]});
 await assert.rejects(update(),e=>e.details.reason==='GALLERY_REVALIDATION_REQUIRED');
});
test('local implementation is not activated in Functions entry point',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(root,'../src/index.ts'),'utf8');
 assert.equal(source.includes('update-setup-gallery-legacy-mapping'),false);
});

test('suggestion approval never infers or accepts legacy mapping authority',async()=>{
 activeRole='provider';const s=await submit('Garden Party');activeRole='admin';
 const newOccasion={id:'garden_party',label:'Garden Party',aliases:[],applicableServiceCategoryCodes:['catering_service'],sortOrder:9};
 await assert.rejects(review(s.suggestion.suggestionId,{decision:'approve_new',newOccasion:{...newOccasion,setupGalleryLegacyEventType:'other'}}),{code:'invalid-argument'});
 await review(s.suggestion.suggestionId,{decision:'approve_new',newOccasion});
 assert.equal(Object.hasOwn(store.get('occasions/garden_party'),'setupGalleryLegacyEventType'),false);
 assert.equal(store.get('occasions/garden_party').active,false);
});
