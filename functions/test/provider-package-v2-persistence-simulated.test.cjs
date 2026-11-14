/** In-memory transaction simulation of the compiled callable, not an emulator
 * or deployed persistence evidence. Firebase Auth and external services are injected. */
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module');
const https=require('firebase-functions/v2/https');const {Timestamp,FieldValue}=require('firebase-admin/firestore');
const choices=[{id:'main',title:'Main dishes',selectionCount:1,options:[{id:'chicken',name:'Chicken'},{id:'fish',name:'Fish'}]}];
const input=(extra={})=>({sharedContractVersion:2,idempotencyKey:'simulated_request_key_001',name:'Catering draft',description:'A complete catering description.',serviceCategoryCode:'catering_service',occasionSchemaVersion:2,occasionScope:'specific',occasionIds:['birthday'],offerSchemaVersion:2,offerStructure:'customizable',packageStyle:'Buffet Catering',pricingModel:'per_pax',price:100.25,serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],equipmentInclusions:['Warmers']}},themeOptions:[],paymentPolicy:'full_payment',depositPercentage:100,minimumGuests:10,maximumGuests:50,imageUrl:'',imageUrls:[],foodInclusions:['Rice | Steamed rice'],foodChoiceGroups:choices,serviceInclusions:[],decorInclusions:[],furnitureInclusions:[],...extra});
function fixture({draftGate=true,publication=false}={}) {
 const records=new Map();const updateTimes=new Map();let serial=0;let commits=0;let external=0;
 function ref(p){return {path:p,id:p.split('/').at(-1),collection:name=>collection(p+'/'+name)};}
 function collection(p){const query={path:p,filters:[],maximum:Infinity,where(k,op,v){return {...this,filters:[...this.filters,[k,v]]};},limit(n){return {...this,maximum:n};},doc(id){return ref(p+'/'+(id??'generated_'+(++serial)));}};return query;}
 const snapshot=(r)=>({id:r.id,ref:r,updateTime:updateTimes.get(r.path),exists:records.has(r.path),data:()=>records.get(r.path)});
 const db={doc:ref,collection,async runTransaction(fn){
  const writes=[];let writing=false;const reads=new Map();
  const fingerprint=r=>JSON.stringify(r.id?records.get(r.path):[...records].filter(([p,data])=>p.startsWith(r.path+'/')&&!p.slice(r.path.length+1).includes('/')&&r.filters.every(([k,v])=>data[k]===v)).slice(0,r.maximum));
  const tx={async get(r){reads.set(r,fingerprint(r));assert.equal(writing,false,'Firestore reads must precede writes');if(!publication)assert.equal(r.path.startsWith('maintenance'),false,'private drafts must not read maintenance');if(r.id)return snapshot(r);
   const docs=[...records].filter(([p,data])=>p.startsWith(r.path+'/')&&!p.slice(r.path.length+1).includes('/')&&r.filters.every(([k,v])=>data[k]===v)).slice(0,r.maximum).map(([p])=>snapshot(ref(p)));return {docs,size:docs.length,empty:!docs.length};},
   create(r,data){writing=true;writes.push(['create',r,data]);},update(r,data){writing=true;writes.push(['update',r,data]);},set(r,data){writing=true;writes.push(['set',r,data]);},delete(r){writing=true;writes.push(['delete',r]);}};
  const result=await fn(tx);if([...reads].some(([r,version])=>fingerprint(r)!==version))return db.runTransaction(fn);for(const [mode,r]of writes){if(!publication)assert.equal(r.path.startsWith('maintenance'),false,'private drafts must not write maintenance');if(mode==='create')assert.equal(records.has(r.path),false);if(mode==='update')assert.equal(records.has(r.path),true);}
  for(const [mode,r,data]of writes){if(mode==='delete')records.delete(r.path);else records.set(r.path,mode==='update'?{...records.get(r.path),...data}:data);}if(writes.length)commits++;return result;
 }};
 records.set('users/owner',{role:'provider',providerId:'provider',accountStatus:'active',isActive:true,isBlocked:false});
 records.set('providers/provider',{ownerId:'owner',verificationStatus:'approved',isActive:true,eventTypesSupported:['birthday'],providerServiceType:'catering',serviceCategories:['catering_service'],minGuestsPerEvent:1,maxGuestsPerEvent:100});
 records.set('contractPolicies/providerPackageV2',{revision:1,effectiveEnvironment:'production',maxSpecificOccasions:10,maxThemeImages:4,featureGates:{packageDraftWrites:draftGate,packageEditorProgressWrites:true}});
 records.set('occasionCatalog/current',{revision:7,activationState:'stable'});
 records.set('providerEligibilityAuthorities/provider',{revision:3,approvedOccasionIds:['birthday'],approvedCategoryCodes:['catering_service']});
 records.set('occasions/birthday',{id:'birthday',label:'Birthday',active:true,moderationState:'approved',sortOrder:0,revision:1,applicableServiceCategoryCodes:['catering_service']});
 if(publication){
 Object.assign(records.get('providers/provider'),{operatingDays:['monday'],bookingLeadTimeDays:1,businessName:'Catering',description:'Catering business',address:'Address',city:'City',province:'Province',publiclyVisible:true});
 Object.assign(records.get('contractPolicies/providerPackageV2').featureGates,{packagePublication:true,customerDiscovery:true,customerBooking:true});
 records.set('maintenanceControls/intake',{schemaVersion:1,revision:1,intake:false,publication:false});
 records.set('appSettings/platform',{minimumDepositRateBps:2000,maximumDepositRateBps:8000});
 }
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
  '../shared/maintenance.js':{requireMaintenanceOpen:async(tx)=>{if(!publication)throw Error('MAINTENANCE_ADMISSION_FORBIDDEN');const m=(await tx.get(db.doc('maintenanceControls/intake'))).data();if(!m||m.publication!==false)throw Error('MAINTENANCE_PAUSED');},recordMaintenanceAdmission:(tx)=>{if(!publication)throw Error('MAINTENANCE_WRITE_FORBIDDEN');tx.update(db.doc('maintenanceControls/intake'),{lastAdmissionAt:1});}},
  './package-domain.js':domain,
  './editor-draft-media-cleanup-v1.js':{beginEditorDraftMediaDiscardV1:()=>{throw Error('UNEXPECTED_CLEANUP');},reconcileEditorDraftMediaDiscardV1:()=>{throw Error('UNEXPECTED_CLEANUP');}},
 };
 const api=load('provider-package-drafts-v2',mocks);
 const req=(data,uid='owner')=>({auth:{uid,token:{}},app:{appId:'simulated-app'},data});
 const readOwned=id=>domain.authorizeOwnedPackage({providerId:'provider',packageSnapshot:snapshot(ref('packages/'+id))}).packageData;
 return {env,domain,load,mocks,db,api,updateTimes,progressApi:load('provider-package-editor-progress',mocks),records,req,readOwned,counters:()=>({commits,external})};
}
for(const pricingModel of ['per_pax','per_bundle'])test('compiled V2 '+pricingModel+' create commits and owner-domain read retains menu data',async()=>{
 const f=fixture();const request=input({pricingModel});const result=await f.api.createProviderPackageV2(f.req(request));
 assert.equal(result.status,'draft');assert.equal(result.packageRevision,1);const saved=f.readOwned(result.packageId);
 for(const key of ['pricingModel','foodChoiceGroups','foodInclusions','serviceOptions','offerStructure','packageStyle'])assert.deepEqual(saved[key],request[key]);
 assert.equal(saved.isPublished,false);assert.equal(saved.providerPubliclyVisible,false);assert.equal(f.counters().commits,1);
 assert.deepEqual(await f.api.createProviderPackageV2(f.req(request)),result);assert.equal(f.counters().commits,1);
});
for(const offerStructure of ['fixed','customizable'])for(const pricingModel of ['per_pax','per_bundle'])test('compiled '+offerStructure+' '+pricingModel+' editor completion creates one package and decrements quota atomically',async()=>{
 const f=fixture({publication:true});f.records.delete('providerEligibilityAuthorities/provider');f.records.set('providerPackageEditorDrafts/editor',{editorSchemaVersion:2,ownerUid:'owner',providerId:'provider',state:'incomplete',revision:3,packageId:null,basePackageRevision:null,progress:{name:'Catering draft',description:'A complete catering description.',offerStructure,packageStyle:'Buffet Catering',serviceCategoryCode:'catering_service',occasion:{occasionSchemaVersion:2,occasionScope:'specific',occasionIds:['birthday']},pricingModel,minimumGuestsText:'10',maximumGuestsText:'50',paymentPolicy:'full_payment',tiers:{drop_off:{enabled:true,priceText:'100.25',includedServices:['Delivery'],decorInclusions:[],furnitureInclusions:[],equipmentInclusions:['Warmers']}},foodInclusions:['Rice | Steamed rice'],foodChoiceGroups:offerStructure==='customizable'?choices:[]}});
 f.records.set('providerPackageEditorQuotas/provider',{count:1});const request={editorDraftId:'editor',expectedRevision:3,expectedPackageRevision:null,idempotencyKey:'completion_simulated_key_001'};
 const result=await f.api.completeProviderPackageEditorDraft(f.req(request));assert.equal(result.status,'draft');assert.deepEqual(f.readOwned(result.packageId).foodChoiceGroups??[],offerStructure==='customizable'?choices:[]);
 assert.equal(f.readOwned(result.packageId).pricingModel,pricingModel);assert.equal(f.records.get('providerPackageEditorDrafts/editor').state,'completed');assert.equal(f.records.get('providerPackageEditorQuotas/provider').count,0);
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

// Production admission simulations execute compiled callables without Firebase/network.
const publicationRequest=id=>({packageId:id,expectedRevision:1,idempotencyKey:'production_publication_key_001',sharedContractVersion:2});
async function productionDraft(patch={}) {
 const f=fixture({publication:true});const result=await f.api.createProviderPackageV2(f.req(input(patch)));
 return {...f,id:result.packageId,publish:()=>f.api.publishProviderPackageV2Internal(f.req(publicationRequest(result.packageId)))};
}
for(const offerStructure of ['fixed','customizable'])for(const pricingModel of ['per_pax','per_bundle'])
 test('production publishes and discovers '+offerStructure+' '+pricingModel,async()=>{
 const f=await productionDraft({offerStructure,pricingModel,...(offerStructure==='fixed'?{foodChoiceGroups:[]}: {})});
 const customer=f.load('customer-package-v2',{...f.mocks,'./provider-package-drafts-v2.js':f.api});
 await assert.rejects(customer.getCustomerPackageV2({data:{packageId:f.id}}));
 const result=await f.publish();assert.equal(result.status,'published');assert.equal(result.packageRevision,2);
 const saved=f.records.get('packages/'+f.id);assert.equal(saved.providerEligibilityRevision,1);
 const read=await customer.getCustomerPackageV2({data:{packageId:f.id}});
 for(const key of ['offerStructure','pricingModel','foodChoiceGroups','serviceOptions','foodInclusions','paymentPolicy','depositPercentage','imageUrls'])assert.deepEqual(read.package[key],saved[key]);
 assert.deepEqual(await f.publish(),result);assert.equal(f.counters().commits,2);
 await assert.rejects(f.api.publishProviderPackageV2Internal(f.req({...publicationRequest(f.id),idempotencyKey:'different_publication_key_001',expectedRevision:2})));
 f.records.get('occasions/birthday').active=false;
 await assert.rejects(customer.getCustomerPackageV2({data:{packageId:f.id}}));
 });
for(const patch of [{revision:2},{status:'published'},{foodInclusions:[]},{serviceOptions:{}},{minimumGuests:51},
 {themeOptions:[{id:'bad',name:'Bad',description:'',imageUrls:['http://bad.test']}]},
 {foodChoiceGroups:[{...choices[0],selectionCount:3}]},{isActive:true},{individualFoodDraft:{}},
 {paymentTermsSchemaVersion:1}])test('production publication rejects invalid saved package '+JSON.stringify(patch),async()=>{
 const f=await productionDraft();Object.assign(f.records.get('packages/'+f.id),patch);
 await assert.rejects(f.publish());assert.equal(f.counters().commits,1);
});
for(const [path,patch] of [['providers/provider',{ownerId:'other'}],['providers/provider',{verificationStatus:'pending'}],
 ['providers/provider',{isBlocked:true}],['occasions/birthday',{active:false}],
 ['maintenanceControls/intake',{publication:true}],['occasionCatalog/current',{activationState:'transitioning'}]])
 test('production publication revalidates '+path+JSON.stringify(patch),async()=>{
 const f=await productionDraft();Object.assign(f.records.get(path),patch);await assert.rejects(f.publish());assert.equal(f.counters().commits,1);
});
for(const path of ['contractPolicies/providerPackageV2','maintenanceControls/intake','appSettings/platform','occasionCatalog/current'])
 test('production missing configuration fails closed '+path,async()=>{
 const f=await productionDraft();f.records.delete(path);await assert.rejects(f.publish());assert.equal(f.counters().commits,1);
});
test('production rejects missing authentication, App Check and stale request revision',async()=>{
 const f=await productionDraft();const req=f.req(publicationRequest(f.id));
 await assert.rejects(f.api.publishProviderPackageV2Internal({...req,auth:null}));
 await assert.rejects(f.api.publishProviderPackageV2Internal({...req,app:null}));
 await assert.rejects(f.api.publishProviderPackageV2Internal(f.req({...req.data,expectedRevision:2})));
 assert.equal(f.counters().commits,1);
});

test('concurrent publication replays one operation and customer reads never see partial publication',async()=>{
 const f=await productionDraft();const customer=f.load('customer-package-v2',{...f.mocks,'./provider-package-drafts-v2.js':f.api});
 const [a,read,b]=await Promise.allSettled([f.publish(),customer.getCustomerPackageV2({data:{packageId:f.id}}),f.publish()]);
 assert.equal(a.status,'fulfilled');assert.equal(b.status,'fulfilled');assert.deepEqual(a.value,b.value);
 assert.equal(f.counters().commits,2);assert.equal(f.records.get('packages/'+f.id).revision,2);
 if(read.status==='fulfilled'){assert.equal(read.value.package.status,'published');assert.equal(read.value.package.revision,2);}
});
test('competing publication keys cannot publish the same revision twice',async()=>{
 const f=await productionDraft();const results=await Promise.allSettled([f.publish(),f.api.publishProviderPackageV2Internal(f.req({...publicationRequest(f.id),idempotencyKey:'competing_publication_key_001'}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.counters().commits,2);
});
for(const change of ['revision','eligibility'])test('publication rereads '+change+' after external media admission',async()=>{
 const f=await productionDraft();f.domain.verifyPackageImages=async()=>{
  if(change==='revision')f.records.get('packages/'+f.id).revision++;
  else f.records.get('occasions/birthday').active=false;
 };
 await assert.rejects(f.publish());assert.equal(f.records.get('packages/'+f.id).isPublished,false);assert.equal(f.counters().commits,1);
});
test('booking admission uses fresh published authority and rejects revoked booking gates',async()=>{
 const f=await productionDraft();await f.publish();const customer=f.load('customer-package-v2',{...f.mocks,'./provider-package-drafts-v2.js':f.api});
 const read=()=>f.db.runTransaction(async tx=>customer.requireCustomerPackageV2(tx,(await tx.get(f.db.doc('packages/'+f.id))).data(),'booking'));
 assert.equal((await read()).revision,2);
 f.records.get('contractPolicies/providerPackageV2').featureGates.customerBooking=false;
 await assert.rejects(read());assert.equal(f.counters().commits,2);
});

test('missing runtime environment cannot admit publication replay or customer reads',async()=>{
 const f=await productionDraft();await f.publish();const customer=f.load('customer-package-v2',{...f.mocks,'./provider-package-drafts-v2.js':f.api});
 delete f.env.GCLOUD_PROJECT;delete f.env.GCP_PROJECT;delete f.records.get('contractPolicies/providerPackageV2').effectiveEnvironment;
 await assert.rejects(f.publish());await assert.rejects(customer.getCustomerPackageV2({data:{packageId:f.id}}));assert.equal(f.counters().commits,2);
});

// Fixed retains the existing maintenance policy; these fixtures admit it explicitly.
for(const pricingModel of ['per_pax','per_bundle'])test('Fixed '+pricingModel+' V2 persistence, CAS, replay and publication preserve configuration',async()=>{
 const f=fixture({publication:true});
 const request=input({offerStructure:'fixed',pricingModel,foodChoiceGroups:[],paymentPolicy:'deposit_then_balance',depositPercentage:30,
  serviceOptions:{buffet_setup:{price:100.25,includedServices:['Setup'],decorInclusions:['Flowers'],furnitureInclusions:['Tables'],equipmentInclusions:['Warmers']}},
  equipmentInclusions:['Shared equipment'],decorInclusions:['Backdrop'],furnitureInclusions:['Chairs'],serviceInclusions:['Delivery'],
  imageUrl:'https://example.com/cover.jpg',imageUrls:['https://example.com/cover.jpg'],
  themeOptions:[{id:'garden',name:'Garden',description:'Garden styling',imageUrls:['https://example.com/theme.jpg']}]});
 const verified=[];f.domain.verifyPackageImages=async(base,uid)=>{assert.equal(uid,'owner');verified.push(base);};
 const created=await f.api.createProviderPackageV2(f.req(request));
 const saved=f.readOwned(created.packageId);
 for(const key of Object.keys(request).filter(k=>k!=='idempotencyKey'))assert.deepEqual(saved[key],request[key],key);
 for(const key of ['sharedContractVersion','occasionSchemaVersion','offerSchemaVersion','paymentTermsSchemaVersion'])assert.equal(saved[key],2);
 assert.equal(saved.revision,1);assert.equal(saved.balanceDueHoursBeforeEvent,24);
 assert.deepEqual(await f.api.createProviderPackageV2(f.req(request)),created);
 const update={...request,packageId:created.packageId,expectedRevision:1,idempotencyKey:'fixed_update_key_001'};
 await f.api.updateProviderPackageV2(f.req(update));
 await assert.rejects(f.api.updateProviderPackageV2(f.req({...update,idempotencyKey:'fixed_stale_key_001'})),e=>e.details.reason==='REVISION_CONFLICT');
 const before=f.readOwned(created.packageId);
 await f.api.publishProviderPackageV2Internal(f.req({...publicationRequest(created.packageId),expectedRevision:2}));
 const published=f.readOwned(created.packageId);
 for(const key of Object.keys(request).filter(k=>k!=='idempotencyKey'))assert.deepEqual(published[key],before[key],key);
 assert.equal(published.status,'published');assert.equal(published.revision,3);
 await assert.rejects(f.api.updateProviderPackageV2(f.req({...update,expectedRevision:3,idempotencyKey:'fixed_published_key_001'})));
 assert.equal(f.readOwned(created.packageId),published);assert.ok(verified.length>=3);
});

test('incomplete Fixed records cannot use V2 update or linked editor completion',async()=>{
 const f=fixture({publication:true});const original={...input({offerStructure:'fixed',foodChoiceGroups:[]}),providerId:'provider',status:'draft',isDeleted:false,isActive:false,isPublished:false,providerPubliclyVisible:false,publishedAt:null};
 delete original.sharedContractVersion;delete original.occasionSchemaVersion;delete original.offerSchemaVersion;
 f.records.set('packages/original',original);
 await assert.rejects(f.api.updateProviderPackageV2(f.req(input({offerStructure:'fixed',foodChoiceGroups:[],packageId:'original',expectedRevision:1}))),e=>e.details.reason==='CLIENT_UPGRADE_REQUIRED');
 await assert.rejects(f.api.completeProviderPackageEditorDraft(f.req({editorDraftId:'editor',expectedRevision:1,expectedPackageRevision:1,idempotencyKey:'fixed_recovery_key_001'})),e=>e.details.reason==='CLIENT_UPGRADE_REQUIRED');
 assert.equal(f.records.get('packages/original'),original);assert.equal(f.counters().commits,0);
});

test('Fixed V2 writes retain maintenance, ownership and feature gates',async()=>{
 for(const patch of ['maintenance','ownership','gate']){
  const f=fixture({publication:true});
  if(patch==='maintenance')f.records.get('maintenanceControls/intake').publication=true;
  if(patch==='ownership')f.records.get('providers/provider').ownerId='other';
  if(patch==='gate')f.records.get('contractPolicies/providerPackageV2').featureGates.packageDraftWrites=false;
  await assert.rejects(f.api.createProviderPackageV2(f.req(input({offerStructure:'fixed',foodChoiceGroups:[]}))));
  assert.equal(f.counters().commits,0);
 }
});

// No deployed SDK calls: the production callable uses the same injected transaction harness.
function recoveryFixture(patch={}) {
 const f=fixture({publication:true});
 const source={...input({offerStructure:'fixed',foodChoiceGroups:[],...patch}),
  providerId:'provider',eventType:'birthday',status:'draft',isActive:false,isPublished:false,
  providerPubliclyVisible:false,isDeleted:false,publishedAt:null,deletedAt:null,deletedBy:null,deletionReason:null,
  createdAt:new Timestamp(100,123),createdBy:'original_creator',updatedAt:new Timestamp(200,456),updatedBy:'owner',
  paymentTermsSchemaVersion:2,balanceDueHoursBeforeEvent:patch.paymentPolicy==='deposit_then_balance'?24:null,
  balanceDueDaysBeforeEvent:null,downPaymentPercentage:patch.paymentPolicy==='deposit_then_balance'?patch.depositPercentage:100};
 for(const key of ['idempotencyKey','sharedContractVersion','occasionSchemaVersion','occasionScope','occasionIds','offerSchemaVersion'])delete source[key];
 f.records.set('packages/original',source);
 f.updateTimes.set('packages/original',new Timestamp(200,789));
 const preview=()=>f.api.previewFixedPackageV2Recovery(f.req({packageId:'original'}));
 const confirmation=p=>({packageId:'original',sourceFingerprint:p.sourceFingerprint,
  proposalFingerprint:p.proposalFingerprint,confirmed:true,idempotencyKey:'fixed_recovery_request_001'});
 return {...f,source,preview,confirmation,recover:p=>f.api.recoverFixedPackageV2Draft(f.req(confirmation(p)))};
}
for(const pricingModel of ['per_pax','per_bundle'])test('controlled Fixed '+pricingModel+' recovery previews without writes and preserves every source field',async()=>{
 const f=recoveryFixture({pricingModel,paymentPolicy:'deposit_then_balance',depositPercentage:30,
  serviceOptions:{buffet_setup:{price:100.25,includedServices:['Setup'],decorInclusions:['Flowers'],furnitureInclusions:['Chairs'],equipmentInclusions:['Warmers']}},
  equipmentInclusions:['Shared equipment'],decorInclusions:['Backdrop'],furnitureInclusions:['Tables'],serviceInclusions:['Delivery'],
  imageUrl:'https://example.com/cover.jpg',imageUrls:['https://example.com/cover.jpg'],
  themeOptions:[{id:'garden',name:'Garden',description:'Garden styling',imageUrls:['https://example.com/theme.jpg']}]});
 const before=[...f.records];const p=await f.preview();assert.equal(p.eligible,true);assert.deepEqual(p.blockers,[]);
 assert.equal(f.counters().commits,0);assert.equal(f.counters().external,0);assert.deepEqual([...f.records],before);
 assert.deepEqual(p.original,f.load('fixed-package-recovery').recoveryValue(f.source));
 let verified=0;f.domain.verifyPackageImages=async(base,uid)=>{verified++;assert.equal(uid,'owner');assert.deepEqual(base.imageUrls,f.source.imageUrls);assert.deepEqual(base.themeOptions,f.source.themeOptions);};
 const result=await f.recover(p);assert.equal(result.packageId,'original');assert.equal(result.packageRevision,1);
 const saved=f.records.get('packages/original');
 for(const key of Object.keys(f.source).filter(k=>!['updatedAt','updatedBy'].includes(k)))assert.deepEqual(saved[key],f.source[key],key);
 assert.equal(saved.sharedContractVersion,2);assert.equal(saved.occasionSchemaVersion,2);assert.equal(saved.offerSchemaVersion,2);
 assert.equal(saved.revision,1);assert.equal(saved.status,'draft');assert.equal(saved.isPublished,false);assert.equal(saved.publishedAt,null);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('packages/')).length,1);assert.equal(verified,1);
 const audits=[...f.records].filter(([k])=>k.startsWith('providerPackageRecoveryAudits/'));assert.equal(audits.length,1);
 assert.equal(audits[0][1].sourceFingerprint,p.sourceFingerprint);assert.equal(audits[0][1].proposalFingerprint,p.proposalFingerprint);
 assert.deepEqual(await f.recover(p),result);assert.equal(f.counters().commits,1);assert.equal(verified,1);
 await assert.rejects(f.api.recoverFixedPackageV2Draft(f.req({...f.confirmation(p),proposalFingerprint:'a'.repeat(64)})),e=>e.details.reason==='IDEMPOTENCY_CONFLICT');
});

test('recovery reports all unknown top-level and nested fields and never discards partial data',async()=>{
 const f=recoveryFixture({mystery:'retain',another:{private:true},serviceOptions:{drop_off:{price:100.25,includedServices:[],custom:'retain'}},themeOptions:[{id:'garden',name:'Garden',description:'',imageUrls:[],unknown:1}]});
 const p=await f.preview();assert.equal(p.eligible,false);assert.equal(p.proposed,null);
 for(const field of ['mystery','another','serviceOptions.drop_off.custom','themeOptions[0].unknown'])assert.ok(p.blockers.some(v=>v.startsWith(field)),field);
 const key=f.confirmation({...p,proposalFingerprint:'a'.repeat(64)});
 await assert.rejects(f.api.recoverFixedPackageV2Draft(f.req(key)),e=>e.details.reason==='RECOVERY_SOURCE_UNSUPPORTED');
 assert.equal(f.records.get('packages/original'),f.source);assert.equal(f.counters().commits,0);
});
for(const patch of [{price:0},{price:100.26},{minimumGuests:51},{maximumGuests:101},{foodInclusions:['Rice','Rice']},
 {foodChoiceGroups:choices},{paymentPolicy:'deposit_then_balance',depositPercentage:99}])test('recovery blocks invalid or lossy source '+JSON.stringify(patch),async()=>{
 const f=recoveryFixture(patch);const p=await f.preview();assert.equal(p.eligible,false);assert.ok(p.blockers.length);
 await assert.rejects(f.api.recoverFixedPackageV2Draft(f.req(f.confirmation({...p,proposalFingerprint:'a'.repeat(64)}))));
 assert.equal(f.records.get('packages/original'),f.source);assert.equal(f.counters().commits,0);
});
for(const change of ['source','updateTime','catalog'])test('recovery rejects stale preview after '+change+' changes',async()=>{
 const f=recoveryFixture();const p=await f.preview();assert.equal(p.eligible,true);
 if(change==='source')f.source.name='Edited after preview';
 if(change==='updateTime')f.updateTimes.set('packages/original',new Timestamp(201,789));
 if(change==='catalog')f.records.get('occasionCatalog/current').revision++;
 await assert.rejects(f.recover(p),e=>e.details.reason===(change==='catalog'?'RECOVERY_PREVIEW_STALE':'RECOVERY_SOURCE_CHANGED'));
 assert.equal(f.counters().commits,0);
});
for(const change of ['source','provider','occasion','payment','maintenance','gate','auth'])test('recovery rereads '+change+' after external media verification',async()=>{
 const f=recoveryFixture();const p=await f.preview();
 f.domain.verifyPackageImages=async()=>{
  if(change==='source')f.source.description='Modified during verification';
  if(change==='provider')f.records.get('providers/provider').maxGuestsPerEvent=20;
  if(change==='occasion')f.records.get('occasions/birthday').active=false;
  if(change==='payment')f.records.delete('appSettings/platform');
  if(change==='maintenance')f.records.get('maintenanceControls/intake').publication=true;
  if(change==='gate')f.records.get('contractPolicies/providerPackageV2').featureGates.packageDraftWrites=false;
  if(change==='auth')f.records.get('users/owner').role='customer';
 };
 await assert.rejects(f.recover(p));assert.equal(f.counters().commits,0);assert.equal(f.source.sharedContractVersion,undefined);
});

test('recovery refuses invalid occasion and unowned images without partial writes',async()=>{
 const invalid=recoveryFixture();invalid.records.get('occasions/birthday').active=false;
 assert.equal((await invalid.preview()).eligible,false);assert.equal(invalid.counters().commits,0);
 const media=recoveryFixture({imageUrl:'https://example.com/foreign.jpg',imageUrls:['https://example.com/foreign.jpg']});
 const p=await media.preview();assert.equal(p.eligible,true);
 await assert.rejects(media.recover(p),e=>e.code==='permission-denied');assert.equal(media.counters().external,0);assert.equal(media.counters().commits,0);
 assert.equal(media.records.get('packages/original'),media.source);
});
for(const patch of [{status:'published',isPublished:true},{isActive:true},{isDeleted:true},{publishedAt:new Timestamp(1,0)},
 {providerPubliclyVisible:true},{deletedAt:new Timestamp(1,0)},{offerStructure:'individual'},{revision:1},{sharedContractVersion:2}])test('recovery refuses lifecycle or contract '+JSON.stringify(patch),async()=>{
 const f=recoveryFixture();Object.assign(f.source,patch);
 const attempt=await Promise.allSettled([f.preview()]);assert.ok(attempt[0].status==='rejected'||attempt[0].value.eligible===false);
 assert.equal(f.counters().commits,0);
});

test('recovery requires App Check, real provider auth, owned provider and owned package',async()=>{
 for(const change of ['noauth','app','role','owner','package']){
  const f=recoveryFixture();const p=await f.preview();let request=f.req(f.confirmation(p));
  if(change==='noauth')request={...request,auth:null};
  if(change==='app')request={...request,app:null};
  if(change==='role')f.records.get('users/owner').role='customer';
  if(change==='owner')f.records.get('providers/provider').ownerId='other';
  if(change==='package')f.source.providerId='other';
  await assert.rejects(f.api.previewFixedPackageV2Recovery({...request,data:{packageId:'original'}}));
  await assert.rejects(f.api.recoverFixedPackageV2Draft(request));assert.equal(f.counters().commits,0);
 }
});

test('recovery rejects forged payloads, hashes and absent confirmation',async()=>{
 const f=recoveryFixture();const p=await f.preview();
 for(const patch of [{confirmed:false},{confirmed:undefined},{sourceFingerprint:'a'.repeat(64)},{proposalFingerprint:'a'.repeat(64)},
  {proposed:{price:1}},{isPublished:true},{expectedRevision:1}]){
  await assert.rejects(f.api.recoverFixedPackageV2Draft(f.req({...f.confirmation(p),...patch})));
 }
 assert.equal(f.counters().commits,0);
});

test('recovery retains absent optional data without inventing or deleting content',async()=>{
 const f=recoveryFixture();delete f.source.imageUrls;delete f.source.foodChoiceGroups;delete f.source.packageStyle;
 const p=await f.preview();assert.equal(p.eligible,true);await f.recover(p);
 const saved=f.records.get('packages/original');assert.deepEqual(saved.serviceOptions,f.source.serviceOptions);
 assert.equal(saved.createdAt.nanoseconds,123);assert.equal(saved.createdBy,'original_creator');
 assert.equal(saved.packageStyle,undefined);assert.equal(saved.isPublished,false);
});

test('recovery requires live external image verification even for unchanged saved URLs',async()=>{
 const url='https://res.cloudinary.com/demo/image/upload/v1/feasta/providers/owner/services/asset/image.jpg';
 const f=recoveryFixture({imageUrl:url,imageUrls:[url]});const p=await f.preview();assert.equal(p.eligible,true);
 await assert.rejects(f.recover(p),/NETWORK_FORBIDDEN/);assert.equal(f.counters().external,1);assert.equal(f.counters().commits,0);
});

test('concurrent recovery retries commit one original and one audit',async()=>{
 const f=recoveryFixture();const p=await f.preview();
 const results=await Promise.all([f.recover(p),f.recover(p)]);assert.deepEqual(results[0],results[1]);
 assert.equal(f.counters().commits,1);assert.equal([...f.records.keys()].filter(k=>k.startsWith('packages/')).length,1);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('providerPackageRecoveryAudits/')).length,1);
 assert.equal(f.records.get('packages/original').revision,1);
});

test('recovery audit and package update roll back together if audit creation fails',async()=>{
 const f=recoveryFixture();const p=await f.preview();
 const operation=require('node:crypto').createHash('sha256').update(JSON.stringify(['owner','recover','fixed_recovery_request_001'])).digest('hex');
 f.records.set('providerPackageRecoveryAudits/'+operation,{existing:true});
 await assert.rejects(f.recover(p));assert.equal(f.records.get('packages/original'),f.source);assert.equal(f.counters().commits,0);
});

test('recovery fingerprints retain timestamp precision and distinguish tagged user data',()=>{
 const f=fixture();const {recoveryHash}=f.load('fixed-package-recovery');
 assert.notEqual(recoveryHash(new Timestamp(10,1)),recoveryHash(new Timestamp(10,2)));
 assert.notEqual(recoveryHash(new Timestamp(10,1)),recoveryHash(['timestamp',10,1]));
 assert.notEqual(recoveryHash(NaN),recoveryHash(Infinity));assert.notEqual(recoveryHash(0),recoveryHash(-0));
 assert.equal(recoveryHash({a:1,b:2}),recoveryHash({b:2,a:1}));
});
