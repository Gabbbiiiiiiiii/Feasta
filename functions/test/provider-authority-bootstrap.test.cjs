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
   async getAll(...refs){return Promise.all(refs.map(r=>this.get(r)));},create(r,data){writing=true;writes.push(['create',r,data]);},update(r,data){writing=true;writes.push(['update',r,data]);},set(r,data){writing=true;writes.push(['set',r,data]);},delete(r){writing=true;writes.push(['delete',r]);}};
  const result=await fn(tx);for(const [mode,r]of writes){assert.equal(r.path.startsWith('maintenance'),false,'private drafts must not write maintenance');if(mode==='create')assert.equal(records.has(r.path),false);if(mode==='update')assert.equal(records.has(r.path),true);}
  for(const [mode,r,data]of writes){if(mode==='delete')records.delete(r.path);else records.set(r.path,mode==='update'?{...records.get(r.path),...data}:data);}if(writes.length)commits++;return result;
 }};
 records.set('users/admin',{role:'admin',accountStatus:'active',isActive:true,isBlocked:false});
 records.set('serviceCategories/catering_service',{code:'catering_service',name:'Catering',serviceType:'catering',status:'active'});
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
  '../shared/authorization.js':{requireRole:async (uid,roles)=>{if(!roles.includes(records.get('users/'+uid)?.role))throw new https.HttpsError('permission-denied','provider required');}},
  '../shared/rate-limit.js':{enforceCallableRateLimit:async()=>{}},
  '../shared/service-category-policy.js':{requireActiveServiceCategoryInTransaction:async(_tx,code)=>{assert.equal(code,'catering_service');}},
  '../shared/maintenance.js':{requireMaintenanceOpen:async()=>{throw Error('MAINTENANCE_ADMISSION_FORBIDDEN');},recordMaintenanceAdmission:()=>{throw Error('MAINTENANCE_WRITE_FORBIDDEN');}},
  './package-domain.js':domain,
  './editor-draft-media-cleanup-v1.js':{beginEditorDraftMediaDiscardV1:()=>{throw Error('UNEXPECTED_CLEANUP');},reconcileEditorDraftMediaDiscardV1:()=>{throw Error('UNEXPECTED_CLEANUP');}},
 };
 const api=load('provider-package-drafts-v2',mocks);
 const capabilities=load('provider-occasion-capabilities-v2',{...mocks,'firebase-admin/auth':{getAuth:()=>({getUser:async uid=>({uid,disabled:records.get('auth/'+uid)?.disabled===true})})},'../shared/security-events.js':{correlationIdFromCallable:()=> 'test-correlation'},'../shared/service-category-policy.js':load('../shared/service-category-policy',{'./firestore.js':{db}})});
 const req=(data,uid='owner')=>({auth:{uid,token:{}},app:{appId:'simulated-app'},data});
 const readOwned=id=>domain.authorizeOwnedPackage({providerId:'provider',packageSnapshot:snapshot(ref('packages/'+id))}).packageData;
 return {capabilities,api,progressApi:load('provider-package-editor-progress',mocks),records,req,readOwned,counters:()=>({commits,external})};
}
const approval=(extra={})=>({providerId:'provider',approveOccasionIds:['birthday'],approvedCategoryCodes:['catering_service'],approvalEvidence:'Reviewed catering verification and Birthday service evidence, approval ticket TEST-123.',expectedProviderEligibilityRevision:0,expectedCatalogRevision:7,reason:'Explicit Birthday catering approval.',idempotencyKey:'bootstrap_request_key_001',...extra});
const fresh=()=>{const f=fixture();f.records.delete('providerEligibilityAuthorities/provider');return f;};
const initialize=(f,data=approval(),uid='admin')=>f.capabilities.initializeProviderOccasionCapabilities(f.req(data,uid));
const reason=code=>e=>e.details?.reason===code;
test('missing authority permits private drafts without creating grants',async()=>{
 const f=fresh();const result=await f.api.createProviderPackageV2(f.req(input()));assert.equal(result.status,'draft');assert.equal(f.records.has('providerEligibilityAuthorities/provider'),false);
});
test('explicit admin Birthday approval creates audited revision 1 then permits only private V2 draft',async()=>{
 const f=fresh();const unrelated={revision:9,approvedOccasionIds:['wedding']};f.records.set('providerEligibilityAuthorities/unrelated',unrelated);
 const result=await initialize(f);assert.equal(result.providerEligibilityRevision,1);
 const authority=f.records.get('providerEligibilityAuthorities/provider');assert.deepEqual(authority.approvedOccasionIds,['birthday']);assert.deepEqual(authority.approvedCategoryCodes,['catering_service']);assert.equal(authority.approvedBy,'admin');assert.ok(authority.approvedAt instanceof Timestamp);assert.equal(authority.approvalEvidence,approval().approvalEvidence);
 const audit=f.records.get('providerOccasionCapabilityAudits/'+result.operationId);assert.equal(audit.actorUid,'admin');assert.equal(audit.beforeRevision,0);assert.equal(audit.afterRevision,1);assert.equal(audit.approvalEvidence,approval().approvalEvidence);assert.deepEqual(audit.before,[]);assert.deepEqual(audit.after,['birthday']);
 assert.equal(f.records.get('providerEligibilityAuthorities/unrelated'),unrelated);
 const saved=await f.api.createProviderPackageV2(f.req(input()));const pkg=f.readOwned(saved.packageId);assert.equal(pkg.status,'draft');assert.equal(pkg.isPublished,false);assert.equal(pkg.providerPubliclyVisible,false);
 await assert.rejects(f.api.publishProviderPackageV2Internal(f.req({packageId:saved.packageId,expectedRevision:1,idempotencyKey:'publication_request_key_001',sharedContractVersion:2})),reason('FEATURE_DISABLED'));
});
test('unauthenticated, non-admin, inactive admin and missing App Check cannot initialize',async()=>{
 for(const kind of ['unauthenticated','provider','inactive','appcheck']){const f=fresh();let req=f.req(approval(),'admin');if(kind==='unauthenticated')req.auth=null;if(kind==='provider')req.auth.uid='owner';if(kind==='inactive')f.records.get('users/admin').isBlocked=true;if(kind==='appcheck')req.app=null;await assert.rejects(f.capabilities.initializeProviderOccasionCapabilities(req));assert.equal(f.counters().commits,0);}
});
test('provider verification, identity, active status and auth account are enforced',async()=>{
 for(const patch of [{verificationStatus:'submitted'},{isActive:false},{isBlocked:true},{isSuspended:true},{isDeleted:true},{ownerId:'wrong'}]){const f=fresh();Object.assign(f.records.get('providers/provider'),patch);await assert.rejects(initialize(f));assert.equal(f.counters().commits,0);}
 const f=fresh();f.records.set('auth/owner',{disabled:true});await assert.rejects(initialize(f));assert.equal(f.counters().commits,0);
});
test('unknown, inactive, unapproved and category-inapplicable occasions are rejected',async()=>{
 for(const patch of [null,{active:false},{moderationState:'pending'},{applicableServiceCategoryCodes:['food_delivery']}]){const f=fresh();if(patch===null)f.records.delete('occasions/birthday');else Object.assign(f.records.get('occasions/birthday'),patch);await assert.rejects(initialize(f));assert.equal(f.counters().commits,0);}
});
test('category grants must be explicit, verified, active catering categories',async()=>{
 for(const change of [{approvedCategoryCodes:[]},{approvedCategoryCodes:['photography']},{approveOccasionIds:[]},{approvalEvidence:''},{supportedOccasionIds:['birthday']}]){const f=fresh();await assert.rejects(initialize(f,approval(change)));assert.equal(f.counters().commits,0);}
 for(const patch of [{status:'discontinued'},{serviceType:'addon'}]){const f=fresh();Object.assign(f.records.get('serviceCategories/catering_service'),patch);await assert.rejects(initialize(f));assert.equal(f.counters().commits,0);}
 const f=fresh();f.records.get('providers/provider').serviceCategories=[];await assert.rejects(initialize(f));assert.equal(f.counters().commits,0);
});
test('absence CAS, catalog CAS, transitioning catalog and idempotency conflicts are enforced',async()=>{
 for(const change of [{expectedProviderEligibilityRevision:1},{expectedCatalogRevision:6}]){const f=fresh();await assert.rejects(initialize(f,approval(change)));assert.equal(f.counters().commits,0);}
 const present=fixture();await assert.rejects(initialize(present),reason('REVISION_CONFLICT'));assert.equal(present.counters().commits,0);
 const transition=fresh();transition.records.get('occasionCatalog/current').activationState='transitioning';await assert.rejects(initialize(transition));assert.equal(transition.counters().commits,0);
 const f=fresh();const first=await initialize(f);assert.deepEqual(await initialize(f),first);assert.equal(f.counters().commits,1);await assert.rejects(initialize(f,approval({reason:'Changed approval reason.'})),reason('IDEMPOTENCY_CONFLICT'));await assert.rejects(initialize(f,approval({idempotencyKey:'second_bootstrap_key_001'})),reason('REVISION_CONFLICT'));assert.equal(f.counters().commits,1);
});
test('legacy Fixed Package and preferences stay unchanged; existing V2 inventory fails closed',async()=>{
 const f=fresh();const legacy={providerId:'provider',eventType:'birthday',status:'published',isPublished:true};f.records.set('packages/legacy',legacy);const before=structuredClone(f.records.get('providers/provider'));await initialize(f);assert.equal(f.records.get('packages/legacy'),legacy);assert.deepEqual(f.records.get('providers/provider'),before);
 for(const marker of [{occasionSchemaVersion:2},{occasionSchemaVersion:3},{offerSchemaVersion:2},{sharedContractVersion:2},{offerStructure:'customizable'},{occasionIds:['birthday']},{occasionSchemaVersion:null}]){const f=fresh();f.records.set('packages/prior',{providerId:'provider',...marker});await assert.rejects(initialize(f),reason('GALLERY_REVALIDATION_REQUIRED'));assert.equal(f.counters().commits,0);}
});
test('availability preference never supplies authority grants',async()=>{
 const f=fresh();f.records.get('providers/provider').eventTypesSupported=['birthday','wedding'];f.records.get('providers/provider').supportedOccasionIds=['birthday','wedding'];await initialize(f);assert.deepEqual(f.records.get('providerEligibilityAuthorities/provider').approvedOccasionIds,['birthday']);
});
