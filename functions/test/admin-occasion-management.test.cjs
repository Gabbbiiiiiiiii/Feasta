const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const {Timestamp} = require('firebase-admin/firestore');
let store, failCommit, role, authDisabled, rateCalls, writes;
class Ref {constructor(path) {this.path=path; this.id=path.split('/').at(-1);}}
class Query {
  constructor(path, cap=Infinity) {this.path=path; this.cap=cap;}
  doc(id) {return new Ref(`${this.path}/${id}`);}
  limit(cap) {return new Query(this.path,cap);}
}
const snapshot = (p,v) => ({id:p.split('/').at(-1), exists:v!==undefined, data:()=>v});
const db = {collection:p=>new Query(p), runTransaction:async fn=>{
  const staged=[]; let writing=false;
  const tx={get:async q=>{
    assert.equal(writing,false,'All reads must precede writes');
    if(q instanceof Ref)return snapshot(q.path,store.get(q.path));
    return {docs:[...store].filter(([p])=>p.startsWith(q.path+'/') && p.split('/').length===q.path.split('/').length+1)
      .slice(0,q.cap).map(([p,v])=>snapshot(p,v))};
  },create:(r,v)=>{writing=true;staged.push(['create',r,v]);},
  update:(r,v)=>{writing=true;staged.push(['update',r,v]);}};
  const result=await fn(tx);
  if(failCommit) throw Error('injected atomic commit failure');
  const next=new Map(store);
  for(const [kind,r,v] of staged){
    if(kind==='create')assert.equal(next.has(r.path),false);
    else assert.equal(next.has(r.path),true);
    next.set(r.path,kind==='update'?{...next.get(r.path),...v}:v);
  }
  store=next; writes+=staged.length; return result;
}};
const original=Module._load;
Module._load=function(id,parent,...rest){
  let resolved='';try{resolved=Module._resolveFilename(id,parent).replaceAll('\\','/');}catch{}
  if(resolved.endsWith('/lib/shared/firestore.js'))return {db};
  if(resolved.endsWith('/lib/shared/authorization.js'))return {requireRole:async(uid,allowed)=>{
    if(authDisabled||!allowed.includes(role))throw Object.assign(Error('denied'),{code:'permission-denied'});
  }};
  if(resolved.endsWith('/lib/shared/rate-limit.js'))return {enforceCallableRateLimit:async()=>{rateCalls++;}};
  if(id==='firebase-functions/v2/https'){
    const real=original.call(this,id,parent,...rest);
    return {...real,onCall:(options,handler)=>Object.assign(real.onCall(options,handler),{testOptions:options})};
  }
  return original.call(this,id,parent,...rest);
};
const api=require('../lib/admin/occasion-management.js');
Module._load=original;
const now=Timestamp.now();
const occasion=(id='birthday',active=true)=>({id,label:id==='birthday'?'Birthday':'Garden Party',normalizedName:id==='birthday'?'birthday':'garden party',
  aliases:[],active,moderationState:'approved',applicableServiceCategoryCodes:['catering_service'],sortOrder:1,revision:1,
  createdBy:'admin',createdAt:now,updatedAt:now,setupGalleryLegacyEventType:'birthday',futureCompatibility:{preserve:true}});
const call=(name,data={},uid='admin')=>api[name].run({data,auth:uid?{uid,token:{}}:undefined,rawRequest:{headers:{}}});
const input=(extra={})=>({occasion:{id:'garden_party',label:'Garden Party',aliases:['Garden Gathering'],sortOrder:5,
  applicableServiceCategoryCodes:['catering_service']},expectedCatalogRevision:1,reason:'Administrator maintenance',
  idempotencyKey:'occasion_mutation_0001',...extra});
const edit=(extra={})=>input({occasion:{id:'birthday',label:'Birthday Celebration',aliases:['Birthday Party'],sortOrder:2,
  applicableServiceCategoryCodes:['catering_service']},expectedOccasionRevision:1,...extra});
const impact=(extra={})=>({occasionId:'birthday',expectedOccasionRevision:1,expectedCatalogRevision:1,operation:'deactivate',...extra});
const reason=r=>e=>e.details?.reason===r;
beforeEach(()=>{role='admin';authDisabled=false;rateCalls=0;writes=0;failCommit=false;store=new Map([
  ['users/admin',{role:'admin',accountStatus:'active',isActive:true,isBlocked:false}],
  ['occasionCatalog/current',{revision:1,activationState:'stable',keep:'yes'}],
  ['serviceCategories/catering_service',{code:'catering_service',status:'active',serviceType:'catering'}],
  ['occasions/birthday',occasion()],['occasions/garden_party',occasion('garden_party',false)],
]);});
test('administrator lists active and inactive with explicit metadata projection',async()=>{
  const result=await call('listAdminOccasions');assert.equal(result.revision,1);
  assert.deepEqual(result.items.map(o=>o.active),[true,false]);assert.equal(result.lifecycleAvailable,false);
  assert.equal(result.items[0].futureCompatibility,undefined);assert.equal(rateCalls,1);assert.equal(writes,0);
});
test('authentication, non-admin, disabled Auth and inactive profile are denied on every operation',async()=>{
  for(const name of ['listAdminOccasions','createAdminOccasion','updateAdminOccasion','previewAdminOccasionImpact']){
    await assert.rejects(call(name,{},null),{code:'unauthenticated'});
    role='provider';await assert.rejects(call(name),{code:'permission-denied'});
    role='admin';authDisabled=true;await assert.rejects(call(name),{code:'permission-denied'});authDisabled=false;
  }
  for(const patch of [{isActive:false},{isBlocked:true},{role:'provider'},{accountStatus:'deactivated'}]){
    const old=store.get('users/admin');store.set('users/admin',{...old,...patch});
    await assert.rejects(call('listAdminOccasions'),reason('ADMIN_REQUIRED'));store.set('users/admin',old);
  }
  assert.equal(writes,0);
});
test('all four callables retain App Check and asia-southeast1 region',()=>{
  for(const name of ['listAdminOccasions','createAdminOccasion','updateAdminOccasion','previewAdminOccasionImpact']){
    assert.equal(api[name].testOptions.enforceAppCheck,true);assert.equal(api[name].testOptions.region,'asia-southeast1');
  }
});
test('creation is inactive approved canonical identity and atomically advances catalog',async()=>{
  store.delete('occasions/garden_party');const result=await call('createAdminOccasion',input());
  const item=store.get('occasions/garden_party');assert.equal(item.active,false);assert.equal(item.moderationState,'approved');
  assert.equal(item.createdBy,'admin');assert.equal(item.revision,1);assert.equal(item.normalizedName,'garden party');
  assert.equal(result.catalogRevision,2);assert.equal(store.get('occasionCatalog/current').revision,2);
  assert.equal(store.get('occasionCatalog/current').keep,'yes');
  assert.equal([...store.keys()].filter(p=>p.startsWith('occasionMaintenanceAudits/')).length,1);
  assert.equal([...store.keys()].filter(p=>p.startsWith('occasionNameReservations/')).length,2);
});
test('canonical IDs cannot be reused or changed through request fields',async()=>{
  await assert.rejects(call('createAdminOccasion',input()),reason('OCCASION_ID_EXISTS'));
  for(const extra of [{id:'other'},{newId:'other'},{active:true},{moderationState:'pending'},{createdBy:'attacker'}]){
    const value=edit();value.occasion={...value.occasion,...extra};
    await assert.rejects(call('updateAdminOccasion',value));
  }
  assert.equal(writes,0);assert.equal(store.get('occasions/birthday').id,'birthday');
});
test('normalized names and aliases collide with active and inactive records',async()=>{
  for(const label of ['Ｂｉｒｔｈｄａｙ',' Birthday ','Garden Party']){
    const value=input();value.occasion={...value.occasion,id:'new_party',label};
    await assert.rejects(call('createAdminOccasion',value),reason('CATALOG_NAME_CONFLICT'));
  }
  const value=input();value.occasion={...value.occasion,id:'new_party',aliases:['birthday']};
  await assert.rejects(call('createAdminOccasion',value),reason('CATALOG_NAME_CONFLICT'));assert.equal(writes,0);
});
test('duplicate aliases and unknown request fields fail strict validation',async()=>{
  for(const patch of [{aliases:['Garden Party']},{aliases:['A party','Ａ party']},{active:false}]){
    const value=input();value.occasion={...value.occasion,...patch};await assert.rejects(call('createAdminOccasion',value));
  }
  await assert.rejects(call('listAdminOccasions',{includePrivate:true}));
  await assert.rejects(call('createAdminOccasion',input({active:true})));assert.equal(writes,0);
});
test('invalid, missing, mismatched, inactive and unsupported category records are rejected',async()=>{
  store.delete('occasions/garden_party');
  for(const category of [undefined,{code:'wrong',status:'active',serviceType:'catering'},
    {code:'catering_service',status:'discontinued',serviceType:'catering'},
    {code:'catering_service',status:'active',serviceType:'both'}]){
    if(category)store.set('serviceCategories/catering_service',category);else store.delete('serviceCategories/catering_service');
    await assert.rejects(call('createAdminOccasion',input()),reason('INVALID_SERVICE_CATEGORY'));
  }
  assert.equal(writes,0);
});
test('revision conflicts and transaction failures leave every document unchanged',async()=>{
  const before=new Map(store);
  await assert.rejects(call('updateAdminOccasion',edit({expectedCatalogRevision:2})),reason('REVISION_CONFLICT'));
  await assert.rejects(call('updateAdminOccasion',edit({expectedOccasionRevision:2})),reason('REVISION_CONFLICT'));
  failCommit=true;await assert.rejects(call('updateAdminOccasion',edit()),/atomic commit failure/);
  assert.deepEqual(store,before);assert.equal(writes,0);
});
test('idempotent retries return exact saved result even after catalog changes; conflicting payload denied',async()=>{
  const result=await call('updateAdminOccasion',edit());const count=writes;
  store.set('occasionCatalog/current',{revision:10,activationState:'stable'});
  assert.deepEqual(await call('updateAdminOccasion',edit()),result);assert.equal(writes,count);
  await assert.rejects(call('updateAdminOccasion',edit({reason:'Different administrative reason'})),reason('IDEMPOTENCY_CONFLICT'));
  store.set('users/admin',{role:'provider',accountStatus:'active',isActive:true,isBlocked:false});
  await assert.rejects(call('updateAdminOccasion',edit()),reason('ADMIN_REQUIRED'));
});
test('metadata edits preserve active state, unknown compatibility fields and package/booking/eligibility data',async()=>{
  store.set('packages/p1',{eventType:'birthday',isPublished:true});
  store.set('bookings/b1',{snapshot:{eventType:'birthday'},price:100});
  store.set('providers/p1',{eventTypesSupported:['birthday']});
  const frozen=['packages/p1','bookings/b1','providers/p1'].map(p=>[p,store.get(p)]);
  await call('updateAdminOccasion',edit());const item=store.get('occasions/birthday');
  assert.equal(item.active,true);assert.equal(item.setupGalleryLegacyEventType,'birthday');
  assert.deepEqual(item.futureCompatibility,{preserve:true});assert.equal(item.createdAt,now);assert.equal(item.revision,2);
  for(const [p,v]of frozen)assert.deepEqual(store.get(p),v);
});
test('active and inactive applicability cannot bypass lifecycle barriers',async()=>{
  for(const id of ['birthday','garden_party']){
    const value=edit();value.occasion={...value.occasion,id,applicableServiceCategoryCodes:['photographer']};
    await assert.rejects(call('updateAdminOccasion',value),reason('OCCASION_LIFECYCLE_UNAVAILABLE'));
  }
  assert.equal(writes,0);
});
test('lifecycle previews return counts only, include universal packages, and cannot authorize writes',async()=>{
  store.set('packages/private',{occasionScope:'all',private:'secret'});
  store.set('bookings/private',{snapshot:{eventType:'birthday'},private:'secret'});
  store.set('providerEligibilityAuthorities/p1',{approvedOccasionIds:['birthday']});
  for(const operation of ['activate','deactivate','applicability']){
    const result=await call('previewAdminOccasionImpact',impact({operation,
      ...(operation==='applicability'?{applicableServiceCategoryCodes:['catering_service','missing']}: {})}));
    assert.equal(result.allowed,false);assert.equal(result.usage.find(u=>u.collection==='packages').potentialReferences,1);
    assert.equal(result.usage.find(u=>u.collection==='bookings').potentialReferences,1);
    assert.equal(JSON.stringify(result).includes('secret'),false);
    if(operation==='applicability')assert.deepEqual(result.mappings.map(m=>m.valid),[true,false]);
  }
  assert.equal(writes,0);assert.equal(api.activateAdminOccasion,undefined);assert.equal(api.deactivateAdminOccasion,undefined);
});
test('preview validates revisions and exact operation shape',async()=>{
  await assert.rejects(call('previewAdminOccasionImpact',impact({expectedCatalogRevision:2})),reason('REVISION_CONFLICT'));
  for(const patch of [{operation:'publish'},{active:true},{operation:'applicability',applicableServiceCategoryCodes:[]},
    {applicableServiceCategoryCodes:['catering_service']},{expectedOccasionRevision:0}]){
    await assert.rejects(call('previewAdminOccasionImpact',impact(patch)));
  }
  assert.equal(writes,0);
});
test('bounded scans report truncation and oversized catalogs fail closed',async()=>{
  for(let i=0;i<501;i++)store.set('packages/p'+i,{eventType:'birthday'});
  const result=await call('previewAdminOccasionImpact',impact());
  assert.deepEqual(result.usage[0],{collection:'packages',scanned:500,potentialReferences:500,truncated:true});
  for(let i=0;i<501;i++)store.set('occasions/item_'+i,{...occasion(),id:'item_'+i});
  await assert.rejects(call('listAdminOccasions'),reason('CATALOG_CAPACITY_EXCEEDED'));
  await assert.rejects(call('updateAdminOccasion',edit()),reason('CATALOG_CAPACITY_EXCEEDED'));assert.equal(writes,0);
});
test('transitional/missing catalogs and revision overflow cannot mutate',async()=>{
  for(const data of [undefined,{revision:1,activationState:'staging'},
    {revision:Number.MAX_SAFE_INTEGER,activationState:'stable'}]){
    if(data)store.set('occasionCatalog/current',data);else store.delete('occasionCatalog/current');
    await assert.rejects(call('updateAdminOccasion',edit({expectedCatalogRevision:data?.revision??1})),reason('CONFIG_UNAVAILABLE'));
  }
  assert.equal(writes,0);
});
test('name reservations prevent reuse and foreign reservation conflicts',async()=>{
  await call('updateAdminOccasion',edit());
  const reservation=[...store].find(([p,v])=>p.startsWith('occasionNameReservations/')&&v.normalizedName==='birthday party');
  assert.ok(reservation);
  const value=input({expectedCatalogRevision:2});value.occasion={...value.occasion,id:'new_party',label:'New Party',aliases:['Birthday Party']};
  await assert.rejects(call('createAdminOccasion',value),reason('CATALOG_NAME_CONFLICT'));
});
test('private maintenance collections remain default-denied and suggestion/public APIs are reused',()=>{
  const rules=fs.readFileSync(path.resolve(__dirname,'../../firebase/firestore.rules'),'utf8');
  assert.match(rules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  for(const collection of ['occasions','occasionCatalog','occasionMaintenanceOperations','occasionMaintenanceAudits']){
    assert.equal(rules.includes(`match /${collection}/`),false);
  }
  const source=fs.readFileSync(path.resolve(__dirname,'../src/admin/occasion-management.ts'),'utf8');
  assert.equal(source.includes('providerOccasionSuggestions'),false);
  assert.equal(source.includes('eventTypesSupported'),false);
  const index=fs.readFileSync(path.resolve(__dirname,'../src/index.ts'),'utf8');
  assert.equal((index.match(/from "\.\/packages\/provider-occasion-suggestions-v2.js"/g)||[]).length,1);
});
test('offline migration preview is deterministic, reports missing IDs/collisions/mappings/nested references',()=>{
  const {previewOccasionMigration}=require('../scripts/preview-occasion-migration.cjs');
  const inventory={documents:Object.fromEntries(store)};
  inventory.documents['occasions/garden_party']={...occasion('garden_party',true),aliases:['Birthday'],applicableServiceCategoryCodes:['missing']};
  inventory.documents['bookings/b1/snapshots/package']={eventType:'birthday'};
  inventory.documents['packages/p1']={occasionScope:'all'};
  const result=previewOccasionMigration(inventory);
  assert.deepEqual(result,previewOccasionMigration(inventory));assert.equal(result.writes,0);
  assert.deepEqual(result.existing,['birthday']);assert.ok(result.missing.includes('wedding'));
  assert.ok(result.collisions.length);assert.equal(result.incompatibleMappings.length,1);
  assert.equal(result.references.bookings[0].potentialReferenceCount,1);
  assert.equal(result.references.packages[1].potentialReferenceCount,1);assert.equal(result.lifecycleAllowed,false);
});
