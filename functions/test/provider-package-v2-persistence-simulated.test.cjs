/** In-memory transaction simulation of the compiled callable, not an emulator
 * or deployed persistence evidence. Firebase Auth and external services are injected. */
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module');
const https=require('firebase-functions/v2/https');const {Timestamp,FieldValue}=require('firebase-admin/firestore');
const choices=[{id:'main',title:'Main dishes',selectionCount:1,options:[{id:'chicken',name:'Chicken'},{id:'fish',name:'Fish'}]}];
const input=(extra={})=>({sharedContractVersion:2,idempotencyKey:'simulated_request_key_001',name:'Catering draft',description:'A complete catering description.',serviceCategoryCode:'catering_service',occasionSchemaVersion:2,occasionScope:'specific',occasionIds:['birthday'],offerSchemaVersion:2,offerStructure:'customizable',packageStyle:'Buffet Catering',pricingModel:'per_pax',price:100.25,serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],equipmentInclusions:['Warmers']}},themeOptions:[],paymentPolicy:'full_payment',depositPercentage:100,minimumGuests:10,maximumGuests:50,imageUrl:'',imageUrls:[],foodInclusions:['Rice | Steamed rice'],foodChoiceGroups:choices,serviceInclusions:[],decorInclusions:[],furnitureInclusions:[],...extra});
function fixture({draftGate=true}={}) {
 const records=new Map();let serial=0;let commits=0;let external=0;
 function ref(p){return {path:p,id:p.split('/').at(-1),collection:name=>collection(p+'/'+name)};}
 function collection(p){const query={path:p,filters:[],maximum:Infinity,where(k,op,v){return {...this,filters:[...this.filters,[k,v]]};},limit(n){return {...this,maximum:n};},doc(id){return ref(p+'/'+(id??'generated_'+(++serial)));}};return query;}
 const snapshot=(r)=>({id:r.id,ref:r,exists:records.has(r.path),data:()=>records.get(r.path)});
 const db={doc:ref,collection,async runTransaction(fn){
  const writes=[];let writing=false;
  const tx={async get(r){assert.equal(writing,false,'Firestore reads must precede writes');assert.equal(r.path.startsWith('maintenance'),false,'private drafts must not read maintenance');if(r.id)return snapshot(r);
   const docs=[...records].filter(([p,data])=>p.startsWith(r.path+'/')&&!p.slice(r.path.length+1).includes('/')&&r.filters.every(([k,v])=>data[k]===v)).slice(0,r.maximum).map(([p])=>snapshot(ref(p)));return {docs,size:docs.length,empty:!docs.length};},
   create(r,data){writing=true;writes.push(['create',r,data]);},update(r,data){writing=true;writes.push(['update',r,data]);},set(r,data){writing=true;writes.push(['set',r,data]);},delete(r){writing=true;writes.push(['delete',r]);}};
  const result=await fn(tx);for(const [mode,r]of writes){assert.equal(r.path.startsWith('maintenance'),false,'private drafts must not write maintenance');if(mode==='create')assert.equal(records.has(r.path),false);if(mode==='update')assert.equal(records.has(r.path),true);}
  for(const [mode,r,data]of writes){if(mode==='delete')records.delete(r.path);else records.set(r.path,mode==='update'?{...records.get(r.path),...data}:data);}if(writes.length)commits++;return result;
 }};
 records.set('users/owner',{role:'provider',providerId:'provider',accountStatus:'active',isActive:true,isBlocked:false});
 records.set('providers/provider',{ownerId:'owner',verificationStatus:'approved',isActive:true,eventTypesSupported:['birthday'],providerServiceType:'catering',serviceCategories:['catering_service'],minGuestsPerEvent:1,maxGuestsPerEvent:100});
 records.set('contractPolicies/providerPackageV2',{revision:1,effectiveEnvironment:'production',maxSpecificOccasions:10,maxThemeImages:4,featureGates:{packageDraftWrites:draftGate,packageEditorProgressWrites:true}});
 records.set('occasionCatalog/current',{revision:7,activationState:'stable'});
 records.set('providerEligibilityAuthorities/provider',{revision:3,approvedOccasionIds:['birthday'],approvedCategoryCodes:['catering_service']});
 records.set('occasions/birthday',{id:'birthday',label:'Birthday',active:true,moderationState:'approved',sortOrder:0,revision:1,applicableServiceCategoryCodes:['catering_service']});
 const env={GCLOUD_PROJECT:'production'};
 function load(file,overrides={}){const filename=path.resolve(__dirname,'../lib/packages/'+file+'.js');const real=createRequire(filename);const exports={};
  const execute=vm.runInThisContext('(function(exports,require,process){'+fs.readFileSync(filename,'utf8')+'\n})',{filename});
  execute(exports,name=>Object.hasOwn(overrides,name)?overrides[name]:real(name),{env});return exports;}
 const domain=load('package-domain',{'../shared/cloudinary.js':{verifyProviderServiceImage:async()=>{external++;throw Error('NETWORK_FORBIDDEN');}}});
 const mocks={
  'firebase-functions/v2/https':{...https,onCall:(_opts,handler)=>handler},
  'firebase-admin/firestore':{Timestamp,FieldValue},'../shared/firestore.js':{db},
  '../shared/cloudinary.js':{cloudinarySecrets:[]},'../shared/auth.js':{requireAuth:r=>{if(!r.auth)throw new https.HttpsError('unauthenticated','required');return r.auth;}},
  '../shared/authorization.js':{requireRole:async uid=>{if(records.get('users/'+uid)?.role!=='provider')throw new https.HttpsError('permission-denied','provider required');}},
  '../shared/rate-limit.js':{enforceCallableRateLimit:async()=>{}},
  '../shared/service-category-policy.js':{requireActiveServiceCategoryInTransaction:async(_tx,code)=>{assert.equal(code,'catering_service');}},
  '../shared/maintenance.js':{requireMaintenanceOpen:async()=>{throw Error('MAINTENANCE_ADMISSION_FORBIDDEN');},recordMaintenanceAdmission:()=>{throw Error('MAINTENANCE_WRITE_FORBIDDEN');}},
  './package-domain.js':domain,
  './editor-draft-media-cleanup-v1.js':{beginEditorDraftMediaDiscardV1:()=>{throw Error('UNEXPECTED_CLEANUP');},reconcileEditorDraftMediaDiscardV1:()=>{throw Error('UNEXPECTED_CLEANUP');}},
 };
 const api=load('provider-package-drafts-v2',mocks);
 const req=(data,uid='owner')=>({auth:{uid,token:{}},app:{appId:'simulated-app'},data});
 const readOwned=id=>domain.authorizeOwnedPackage({providerId:'provider',packageSnapshot:snapshot(ref('packages/'+id))}).packageData;
 return {api,progressApi:load('provider-package-editor-progress',mocks),records,req,readOwned,counters:()=>({commits,external})};
}
for(const pricingModel of ['per_pax','per_bundle'])test('compiled V2 '+pricingModel+' create commits and owner-domain read retains menu data',async()=>{
 const f=fixture();const request=input({pricingModel});const result=await f.api.createProviderPackageV2(f.req(request));
 assert.equal(result.status,'draft');assert.equal(result.packageRevision,1);const saved=f.readOwned(result.packageId);
 for(const key of ['pricingModel','foodChoiceGroups','foodInclusions','serviceOptions','offerStructure','packageStyle'])assert.deepEqual(saved[key],request[key]);
 assert.equal(saved.isPublished,false);assert.equal(saved.providerPubliclyVisible,false);assert.equal(f.counters().commits,1);
 assert.deepEqual(await f.api.createProviderPackageV2(f.req(request)),result);assert.equal(f.counters().commits,1);
});
test('compiled editor completion creates one package and decrements quota atomically',async()=>{
 const f=fixture();f.records.delete('providerEligibilityAuthorities/provider');f.records.set('providerPackageEditorDrafts/editor',{editorSchemaVersion:2,ownerUid:'owner',providerId:'provider',state:'incomplete',revision:3,packageId:null,basePackageRevision:null,progress:{name:'Catering draft',description:'A complete catering description.',offerStructure:'customizable',packageStyle:'Buffet Catering',serviceCategoryCode:'catering_service',occasion:{occasionSchemaVersion:2,occasionScope:'specific',occasionIds:['birthday']},pricingModel:'per_bundle',minimumGuestsText:'10',maximumGuestsText:'50',paymentPolicy:'full_payment',tiers:{drop_off:{enabled:true,priceText:'100.25',includedServices:['Delivery'],decorInclusions:[],furnitureInclusions:[],equipmentInclusions:['Warmers']}},foodInclusions:['Rice | Steamed rice'],foodChoiceGroups:choices}});
 f.records.set('providerPackageEditorQuotas/provider',{count:1});const request={editorDraftId:'editor',expectedRevision:3,expectedPackageRevision:null,idempotencyKey:'completion_simulated_key_001'};
 const result=await f.api.completeProviderPackageEditorDraft(f.req(request));assert.equal(result.status,'draft');assert.deepEqual(f.readOwned(result.packageId).foodChoiceGroups,choices);
 assert.equal(f.readOwned(result.packageId).pricingModel,'per_bundle');assert.equal(f.records.get('providerPackageEditorDrafts/editor').state,'completed');assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,0);
 assert.deepEqual(await f.api.completeProviderPackageEditorDraft(f.req(request)),result);assert.equal(f.counters().commits,1);
});
test('disabled policy gate rejects before transactions commit',async()=>{
 for(const options of [{draftGate:false}]){const f=fixture(options);await assert.rejects(f.api.createProviderPackageV2(f.req(input())),e=>e.details.reason==='FEATURE_DISABLED');assert.deepEqual(f.counters(),{commits:0,external:0});}
});
test('ownership and stale revision denials never overwrite a saved draft',async()=>{
 const f=fixture();const created=await f.api.createProviderPackageV2(f.req(input()));const before=f.readOwned(created.packageId);
 await assert.rejects(f.api.updateProviderPackageV2(f.req(input({packageId:created.packageId,expectedRevision:2,idempotencyKey:'stale_revision_key_001'}))),e=>e.details.reason==='REVISION_CONFLICT');
 f.records.set('providers/provider',{...f.records.get('providers/provider'),ownerId:'other'});
 await assert.rejects(f.api.updateProviderPackageV2(f.req(input({packageId:created.packageId,expectedRevision:1,idempotencyKey:'wrong_owner_key_001'}))),e=>e.code==='permission-denied');
 assert.equal(f.records.get('packages/'+created.packageId),before);assert.equal(f.counters().commits,1);
});

test('individual-food canonical writes and lossy progress conversion are refused',()=>{
 const f=fixture();
 assert.throws(()=>f.api.parseV2DraftWrite(input({offerStructure:'individual'}),false),e=>e.details.reason==='INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED');
 assert.throws(()=>f.api.packageWriteFromProgress({offerStructure:'fixed',individualFoodDraft:{id:'food',name:'Pancit',servingOptions:[]}}),e=>e.details.reason==='INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED');
  assert.throws(()=>f.api.packageWriteFromProgress({offerStructure:'fixed',individualFoodItems:[{id:'food',name:'Pancit',servingOptions:[{id:'family',name:'Family',minimumServings:8,maximumServings:10,priceCentavos:185000,minimumQuantity:1,maximumQuantity:3}]}]}),e=>e.details.reason==='INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED');
 assert.equal(f.counters().commits,0);
});
test('unverified package and theme assets cannot complete or mutate editor progress',async()=>{
 for(const progress of [{marketingAssetIds:['asset']},{themes:[{editorThemeId:'garden',name:'Garden',description:'',assetIds:['asset']}]}]){
  const f=fixture();const editor={editorSchemaVersion:2,ownerUid:'owner',providerId:'provider',state:'incomplete',revision:3,packageId:null,basePackageRevision:null,progress:{offerStructure:'customizable',...progress}};
  f.records.set('providerPackageEditorDrafts/editor',editor);f.records.set('providerPackageEditorQuotas/provider',{count:1});
  await assert.rejects(f.api.completeProviderPackageEditorDraft(f.req({editorDraftId:'editor',expectedRevision:3,expectedPackageRevision:null,idempotencyKey:'media_completion_key_001'})),e=>e.code==='failed-precondition'&&e.details.reason==='CLIENT_UPGRADE_REQUIRED'&&e.details.field==='media'&&e.details.step===4);
  assert.equal(f.records.get('providerPackageEditorDrafts/editor'),editor);assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,1);assert.equal(f.counters().commits,0);
 }
});

test('editor completion cannot race pending cleanup or promotion',async()=>{
 for(const flags of [{mediaCleanupPendingCount:1},{mediaPromotionOperationId:'pending_promotion'}]) {
  const f=fixture();const editor={editorSchemaVersion:2,ownerUid:'owner',providerId:'provider',state:'incomplete',revision:3,packageId:null,basePackageRevision:null,progress:{offerStructure:'customizable'},...flags};
  f.records.set('providerPackageEditorDrafts/editor',editor);f.records.set('providerPackageEditorQuotas/provider',{count:1});
  await assert.rejects(f.api.completeProviderPackageEditorDraft(f.req({editorDraftId:'editor',expectedRevision:3,expectedPackageRevision:null,idempotencyKey:'pending_media_key_001'})),e=>e.details.reason==='EDITOR_DRAFT_MEDIA_BUSY');
  assert.equal(f.records.get('providerPackageEditorDrafts/editor'),editor);assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,1);assert.equal(f.counters().commits,0);
 }
});

// Production admission is exercised with no emulator or demo flags.
test('production customizable bundle draft round-trips exact menu and edits with CAS',async()=>{
 const f=fixture();f.records.delete('providerEligibilityAuthorities/provider');
 const groups=[{id:'mains',title:'Choose exactly 2 dishes',selectionCount:2,options:[
  {id:'adobo',name:'Chicken adobo'},{id:'buttered',name:'Buttered chicken'},
  {id:'menudo',name:'Pork menudo'},{id:'shanghai',name:'Shanghai rolls'}]}];
 const request=input({pricingModel:'per_bundle',price:3500,serviceOptions:{drop_off:{price:3500,includedServices:[]}},minimumGuests:10,maximumGuests:15,foodInclusions:['Steamed rice'],foodChoiceGroups:groups});
 const created=await f.api.createProviderPackageV2(f.req(request));
 const saved=f.readOwned(created.packageId);
 for(const key of Object.keys(request).filter(k=>!['idempotencyKey'].includes(k)))assert.deepEqual(saved[key],request[key],key);
 assert.equal(saved.status,'draft');assert.equal(saved.isActive,false);assert.equal(saved.publishedAt,null);
 const changed=[{...groups[0],selectionCount:1,options:groups[0].options.slice(0,3)}];
 const update={...request,foodChoiceGroups:changed,packageId:created.packageId,expectedRevision:1,idempotencyKey:'production_update_key_001'};
 const result=await f.api.updateProviderPackageV2(f.req(update));assert.equal(result.packageRevision,2);
 assert.deepEqual(f.readOwned(created.packageId).foodChoiceGroups,changed);
 assert.deepEqual(await f.api.updateProviderPackageV2(f.req(update)),result);
 assert.equal(f.counters().external,0);
});
test('production denies App Check omission, public flags, malformed groups and noncustomizable admission',async()=>{
 const f=fixture();const request=input();
 await assert.rejects(f.api.createProviderPackageV2({...f.req(request),app:null}),e=>e.details.reason==='APP_CHECK_REQUIRED');
 for(const field of ['isPublished','isActive','providerPubliclyVisible','status','publishedAt'])
  await assert.rejects(f.api.createProviderPackageV2(f.req({...request,[field]:true})),e=>e.code==='invalid-argument');
 for(const groups of [[],[{...choices[0],selectionCount:3}],[{...choices[0],options:[choices[0].options[0],choices[0].options[0]]}]])
  await assert.rejects(f.api.createProviderPackageV2(f.req({...request,foodChoiceGroups:groups})),e=>e.code==='invalid-argument');
 await assert.rejects(f.api.createProviderPackageV2(f.req({...request,offerStructure:'fixed'})),/MAINTENANCE_ADMISSION_FORBIDDEN/);
 await assert.rejects(f.api.publishProviderPackageV2Internal(f.req({packageId:'pkg',expectedRevision:1,idempotencyKey:'publish_request_key_001',sharedContractVersion:2})),e=>e.details.reason==='FEATURE_DISABLED');
 assert.equal(f.counters().commits,0);
});


test('production customizable progress saves, edits, reads and replays without maintenance',async()=>{
 const f=fixture();f.records.delete('providerEligibilityAuthorities/provider');const request={editorDraftId:null,expectedRevision:0,packageId:null,expectedPackageRevision:null,editorSchemaVersion:2,currentStep:0,progress:{offerStructure:'customizable',name:'Private draft',pricingModel:'per_bundle',foodChoiceGroups:choices},idempotencyKey:'progress_create_key_001'};
 const created=await f.progressApi.saveProviderPackageEditorDraft(f.req(request));
 assert.deepEqual(await f.progressApi.saveProviderPackageEditorDraft(f.req(request)),created);
 const update={...request,editorDraftId:created.draft.editorDraftId,expectedRevision:1,progress:{...request.progress,name:'Edited private draft'},idempotencyKey:'progress_update_key_001'};
 const edited=await f.progressApi.saveProviderPackageEditorDraft(f.req(update));
 assert.equal(edited.draft.revision,2);assert.deepEqual(edited.draft.progress,update.progress);
 assert.deepEqual(await f.progressApi.getProviderPackageEditorDraft(f.req({editorDraftId:created.draft.editorDraftId})),edited);
 await assert.rejects(f.progressApi.saveProviderPackageEditorDraft(f.req({...update,idempotencyKey:'progress_stale_key_001'})),e=>e.details.reason==='REVISION_CONFLICT');
 await assert.rejects(f.progressApi.saveProviderPackageEditorDraft(f.req({...request,progress:{offerStructure:'fixed'}})),/MAINTENANCE_ADMISSION_FORBIDDEN/);
 assert.equal(f.counters().commits,2);
});


test('private draft invalid pricing, selections, lifecycle, revisions and replay conflicts fail atomically',async()=>{
 for(const patch of [{price:-1},{price:100.26},{minimumGuests:51},{sharedContractVersion:3},{occasionIds:['wedding']}]) {
  const f=fixture();await assert.rejects(f.api.createProviderPackageV2(f.req(input(patch))));assert.equal(f.counters().commits,0);
 }
 const f=fixture();const request=input();const created=await f.api.createProviderPackageV2(f.req(request));
 await assert.rejects(f.api.createProviderPackageV2(f.req({...request,name:'Changed request'})),e=>e.details.reason==='IDEMPOTENCY_CONFLICT');
 const before=[...f.records];f.records.set('occasionCatalog/current',{revision:8,activationState:'transitioning'});
 await assert.rejects(f.api.updateProviderPackageV2(f.req(input({packageId:created.packageId,expectedRevision:1,idempotencyKey:'catalog_transition_key_001'}))),e=>e.details.reason==='CONFIG_UNAVAILABLE');
 assert.equal(f.counters().commits,1);assert.equal(f.readOwned(created.packageId),new Map(before).get('packages/'+created.packageId));
});

test('recovery list/get reopens saved customizable progress and edit uses its revision',async()=>{
 const f=fixture();const request={editorDraftId:null,expectedRevision:0,packageId:null,
  expectedPackageRevision:null,editorSchemaVersion:2,currentStep:1,
  progress:{offerStructure:'customizable',name:'Recovery draft',pricingModel:'per_bundle',foodChoiceGroups:choices},
  idempotencyKey:'recovery_create_key_001'};
 const saved=await f.progressApi.saveProviderPackageEditorDraft(f.req(request));
 const listed=await f.progressApi.listProviderPackageEditorDrafts(f.req({}));
 assert.deepEqual(listed.drafts,[saved.draft]);
 const reopened=await f.progressApi.getProviderPackageEditorDraft(f.req({editorDraftId:saved.draft.editorDraftId}));
 assert.deepEqual(reopened,saved);
 const edited=await f.progressApi.saveProviderPackageEditorDraft(f.req({...request,
  editorDraftId:reopened.draft.editorDraftId,expectedRevision:reopened.draft.revision,
  progress:{...reopened.draft.progress,name:'Recovered and edited'},idempotencyKey:'recovery_edit_key_001'}));
 assert.equal(edited.draft.revision,2);assert.equal(edited.draft.progress.name,'Recovered and edited');
 assert.equal(f.counters().commits,2);
});

test('recovery endpoints retain App Check and owner authorization without public mutations',async()=>{
 const f=fixture();
 for(const [method,data] of [['getProviderPackageEditorDraft',{editorDraftId:'editor'}],
  ['listProviderPackageEditorDrafts',{}]]) {
  await assert.rejects(f.progressApi[method]({...f.req(data),app:null}),e=>e.details?.reason==='APP_CHECK_REQUIRED');
 }
 f.records.set('providerPackageEditorDrafts/editor',{editorSchemaVersion:2,ownerUid:'other',providerId:'other',
  packageId:null,basePackageRevision:null,state:'incomplete',revision:1,progress:{offerStructure:'customizable'}});
 await assert.rejects(f.progressApi.getProviderPackageEditorDraft(f.req({editorDraftId:'editor'})));
 assert.deepEqual(await f.progressApi.listProviderPackageEditorDrafts(f.req({})),{drafts:[]});
 assert.equal(f.counters().commits,0);
});

for(const evidence of [undefined,{revision:4},{revision:8,approvedOccasionIds:[],approvedCategoryCodes:[]},{revision:'bad',approvedOccasionIds:null}])test('private drafts ignore sidecar grants '+JSON.stringify(evidence),async()=>{
 const f=fixture();if(evidence===undefined)f.records.delete('providerEligibilityAuthorities/provider');else f.records.set('providerEligibilityAuthorities/provider',evidence);
 f.records.get('providers/provider').eventTypesSupported=[];
 const result=await f.api.createProviderPackageV2(f.req(input()));assert.equal(result.status,'draft');
 assert.deepEqual(f.records.get('providerEligibilityAuthorities/provider'),evidence);
 await assert.rejects(f.api.publishProviderPackageV2Internal(f.req({packageId:result.packageId,expectedRevision:1,idempotencyKey:'private_publish_key_001',sharedContractVersion:2})),e=>e.details.reason==='FEATURE_DISABLED');
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('packages/')).length,1);
});
for(const patch of [{verificationStatus:'pending'},{isActive:false},{isBlocked:true},{isSuspended:true},{isDeleted:true},{serviceCategories:[]},{providerServiceType:'addon'}])test('private draft rejects provider '+JSON.stringify(patch),async()=>{
 const f=fixture();f.records.delete('providerEligibilityAuthorities/provider');Object.assign(f.records.get('providers/provider'),patch);await assert.rejects(f.api.createProviderPackageV2(f.req(input())));assert.equal(f.counters().commits,0);
});
for(const patch of [null,{active:false},{moderationState:'pending'},{applicableServiceCategoryCodes:['food_delivery']}])test('private draft rejects occasion '+JSON.stringify(patch),async()=>{
 const f=fixture();f.records.delete('providerEligibilityAuthorities/provider');if(patch===null)f.records.delete('occasions/birthday');else Object.assign(f.records.get('occasions/birthday'),patch);await assert.rejects(f.api.createProviderPackageV2(f.req(input())));assert.equal(f.counters().commits,0);
});
