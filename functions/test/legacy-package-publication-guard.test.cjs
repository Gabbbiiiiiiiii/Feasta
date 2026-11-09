// Offline compiled-handler execution. No emulators or live services.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const https = require('firebase-functions/v2/https');
const publisherSource=fs.readFileSync(path.resolve(__dirname,'../src/packages/publish-provider-package.ts'),'utf8');
const hasMaintenance=publisherSource.includes('requireMaintenanceOpen');
const hasV2Route=publisherSource.includes('publishProviderPackageV2Internal');

function fixture(patch = {}, options = {}) {
  const records = new Map([
    ['users/owner', {role:'provider', providerId:'provider', accountStatus:'active', isActive:true}],
    ['providers/provider', {ownerId:'owner', verificationStatus:'approved', isActive:true,
      providerServiceType:'catering', serviceCategories:['catering_service'],
      eventTypesSupported:['birthday'], minGuestsPerEvent:1, maxGuestsPerEvent:100}],
    ['packages/draft', {providerId:'provider', status:'draft', isPublished:false,
      isActive:false, providerPubliclyVisible:false, isDeleted:false, publishedAt:null,
      revision:1, name:'Fixed catering', description:'A complete catering description.',
      eventType:'birthday', serviceCategoryCode:'catering_service', price:100,
      serviceOptions:{drop_off:{price:100,includedServices:['Delivery']}}, themeOptions:[],
      paymentTermsSchemaVersion:2, paymentPolicy:'full_payment', depositPercentage:100,
      balanceDueDaysBeforeEvent:null, balanceDueHoursBeforeEvent:null,
      minimumGuests:10, maximumGuests:50, imageUrl:'', imageUrls:[],
      foodInclusions:['Rice'], decorInclusions:[], furnitureInclusions:[], serviceInclusions:[], ...patch}],
    ['occasionCatalog/current', {revision:1,activationState:'stable'}],
    ['occasions/birthday', {id:'birthday', active:true, moderationState:'approved', revision:1,
      applicableServiceCategoryCodes:['catering_service']}],
    ['contractPolicies/providerPackageV2', {revision:1,effectiveEnvironment:'production',
      maxSpecificOccasions:10,maxThemeImages:4, featureGates:{packageDraftWrites:true,
        packagePublication:true,customerDiscovery:true,customerBooking:true}}],
  ]);
  const writes = [], reads = [];
  const ref = p => ({path:p,id:p.split('/').at(-1)});
  const db = {doc:ref, collection:p=>({doc:id=>ref(p+'/'+(id??'generated'))}),
    async runTransaction(fn) {
      const pending=[];
      const tx={get:async r=>{assert.equal(pending.length,0,'read after write'); reads.push(r.path);
        return {id:r.id,ref:r,exists:records.has(r.path),data:()=>records.get(r.path)};},
        update:(r,d)=>pending.push([r,d]),create:(r,d)=>pending.push([r,d]),
        set:(r,d)=>pending.push([r,d]),delete:r=>pending.push([r,null])};
      const result=await fn(tx);
      for(const [r,d] of pending) records.set(r.path,{...records.get(r.path),...d});
      writes.push(...pending); return result;
    }};
  const cache = new Map();
  function load(file) {
    if(cache.has(file))return cache.get(file);
    const exports={}; cache.set(file,exports);
    const real=createRequire(file);
    const mocks={
      'firebase-functions/v2/https':{...https,onCall:(_o,h)=>Object.assign(h,{run:h})},
      '../shared/firestore.js':{db},
      '../shared/auth.js':{requireAuth:r=>{if(!r.auth)throw new https.HttpsError('unauthenticated','required');return r.auth;}},
      '../shared/authorization.js':{requireRole:async uid=>{if(records.get('users/'+uid)?.role!=='provider')throw new https.HttpsError('permission-denied','provider required');}},
      '../shared/rate-limit.js':{enforceCallableRateLimit:async()=>{}},
      '../shared/service-category-policy.js':{requireActiveServiceCategoryInTransaction:async()=>{
        if(options.inactiveCategory)throw new https.HttpsError('failed-precondition','inactive category');}},
      '../shared/timestamps.js':{serverTimestamp:()=> 'offline-timestamp'},
      '../shared/maintenance.js':{requireMaintenanceOpen:async()=>{
        if(options.maintenance)throw new https.HttpsError('failed-precondition','maintenance');},
        recordMaintenanceAdmission:tx=>tx.update(ref('maintenance/publication'),{admitted:true})},
      '../shared/cloudinary.js':{cloudinarySecrets:[],verifyProviderServiceImage:async()=>{throw Error('NETWORK_FORBIDDEN');}},
    };
    const req=name=>{
      if(Object.hasOwn(mocks,name))return mocks[name];
      if(name==='../shared/constants.js')return {...real(name),isProviderPubliclyEligible:()=>!options.ineligible};
      return name.startsWith('.')?load(path.resolve(path.dirname(file),name)):real(name);
    };
    vm.runInThisContext('(function(exports,require,process){'+fs.readFileSync(file,'utf8')+'\n})',{filename:file})
      (exports,req,{env:{GCLOUD_PROJECT:'production',FEASTA_V2_PUBLICATION_DEMO_ENABLED:'true'}});
    return exports;
  }
  const handler=load(path.resolve(__dirname,'../lib/packages/publish-provider-package.js')).publishProviderPackage;
  const request=data=>({auth:{uid:'owner'},app:{appId:'offline'},data:data??{packageId:'draft'}});
  return {records,writes,reads,handler,request};
}

for(const patch of [{},{offerStructure:'fixed',packageStyle:'Bilao Package'},
  {sharedContractVersion:1,offerSchemaVersion:1,occasionSchemaVersion:1,offerStructure:'fixed'}]) {
  test('legacy Fixed publication succeeds '+JSON.stringify(patch),async()=>{
    const f=fixture(patch);assert.equal((await f.handler(f.request())).status,'published');
    assert.equal(f.records.get('packages/draft').isPublished,true);
    assert.equal(f.records.get('packages/draft').providerPubliclyVisible,true);
  });
}
const denied = [
  {offerStructure:'customizable'}, {offerStructure:'individual'}, {offerStructure:'unknown'},
  {offerStructure:null}, {offerStructure:''}, {offerStructure:{type:'fixed'}},
  ...['sharedContractVersion','offerSchemaVersion','occasionSchemaVersion'].flatMap(key=>
    [2,3,null,'1',0,{}].map(value=>({[key]:value}))),
  ...['foodChoiceGroups','individualFoodItems','individualFoodDraft','individualPricing',
    'equipmentInclusions','occasionScope','occasionIds','occasionMatchIds',
    'occasionCatalogRevision','providerEligibilityRevision','occasionEligibilityState',
    'editorSchemaVersion','progress'].flatMap(key=>[null,[],{},''].map(value=>({offerStructure:'fixed',[key]:value}))),
  {sharedContractVersion:2,offerSchemaVersion:2,occasionSchemaVersion:2,
    offerStructure:'customizable',pricingModel:'per_pax',foodChoiceGroups:[{id:'main'}]},
];
for(const patch of denied) test('packageId cannot publish incompatible persisted evidence '+JSON.stringify(patch),async()=>{
  const f=fixture(patch);const before=structuredClone([...f.records]);
  await assert.rejects(f.handler(f.request()),e=>e.code==='failed-precondition'&&
    e.details?.reason==='UNSUPPORTED_PACKAGE_PUBLICATION_CONTRACT');
  assert.deepEqual([...f.records],before);assert.equal(f.writes.length,0);
  assert.ok(f.reads.includes('packages/draft'));assert.equal(f.reads.includes('occasionCatalog/current'),false);
});
for(const pricingModel of ['per_pax','per_bundle',null,'unknown']) test('pricing publication remains blocked '+pricingModel,async()=>{
  const f=fixture({offerStructure:'fixed',pricingModel});
  await assert.rejects(f.handler(f.request()),e=>e.code==='failed-precondition');assert.equal(f.writes.length,0);
});
test('client structure cannot override persisted evidence',async()=>{
  const f=fixture({offerStructure:'customizable'});
  await assert.rejects(f.handler(f.request({packageId:'draft',offerStructure:'fixed'})),e=>e.code==='invalid-argument');
  assert.equal(f.writes.length,0);
});
test('V2 route rejects malformed customizable rules with all publication gates enabled',async()=>{
  const f=fixture({sharedContractVersion:2,offerSchemaVersion:2,occasionSchemaVersion:2,
    occasionScope:'specific',occasionIds:['birthday'],offerStructure:'customizable',pricingModel:'per_pax',
    foodChoiceGroups:[{id:'main',title:'Main',selectionCount:1,options:[{id:'chicken',name:'Chicken'}]}]});
  f.records.get('users/owner').isBlocked=false;
  Object.assign(f.records.get('providers/provider'),{businessName:'Catering',description:'Catering business',
    address:'Address',city:'City',province:'Province',operatingDays:['monday'],bookingLeadTimeDays:1});
  const before=structuredClone([...f.records]);
  await assert.rejects(f.handler(f.request({packageId:'draft',sharedContractVersion:2,
    expectedRevision:1,idempotencyKey:'publication_guard_key_001'})),e=>hasV2Route ?
      e.details?.reason==='INVALID_FOOD_CHOICE_GROUP' : e.code==='invalid-argument');
  assert.deepEqual([...f.records],before);assert.equal(f.writes.length,0);
});
for(const mode of ['unauthenticated','role','provider-owner','package-owner']) test('authorization remains enforced '+mode,async()=>{
  const f=fixture();const req=f.request();
  if(mode==='unauthenticated')req.auth=null;
  if(mode==='role')f.records.get('users/owner').role='customer';
  if(mode==='provider-owner')f.records.get('providers/provider').ownerId='other';
  if(mode==='package-owner')f.records.get('packages/draft').providerId='other';
  await assert.rejects(f.handler(req),e=>['unauthenticated','permission-denied'].includes(e.code));
  assert.equal(f.writes.length,0);
});
for(const options of [{inactiveCategory:true},{ineligible:true}])
  test('existing publication safeguard remains enforced '+JSON.stringify(options),async()=>{
    const f=fixture({},options);await assert.rejects(f.handler(f.request()));assert.equal(f.writes.length,0);
  });
test('maintenance requirements match the existing publisher contract',async()=>{
  const f=fixture({},{maintenance:true});
  if(hasMaintenance){await assert.rejects(f.handler(f.request()));assert.equal(f.writes.length,0);}
  else assert.equal((await f.handler(f.request())).status,'published');
});
test('occasion transition and invalid financial data cannot publish',async()=>{
  for(const patch of [{price:-1},{minimumGuests:51},{depositPercentage:0}]) {
    const f=fixture(patch);await assert.rejects(f.handler(f.request()));assert.equal(f.writes.length,0);
  }
  const f=fixture();f.records.get('occasionCatalog/current').activationState='transitioning';
  if(hasMaintenance){await assert.rejects(f.handler(f.request()));assert.equal(f.writes.length,0);}
  else assert.equal((await f.handler(f.request())).status,'published');
});
