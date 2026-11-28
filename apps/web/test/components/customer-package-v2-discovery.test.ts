import {afterEach, beforeEach, expect, it, vi} from "vitest";
const mock=vi.hoisted(()=>({records:new Map<string,Record<string,unknown>>(), catalog:[] as Record<string,unknown>[]}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/firebase/admin",()=>({adminDb:{
 doc:(path:string)=>({path}),collection:()=>({where:()=>({limit:()=>({query:true})})}),
 runTransaction:async(work:(tx:unknown)=>unknown)=>work({get:async(ref:{path?:string;query?:boolean})=>
  ref.query ? {size:mock.catalog.length,docs:mock.catalog.map(row=>({id:row.id,data:()=>row}))} :
  {data:()=>mock.records.get(ref.path!)}}),
}}));
import {verifiedPublicPackageV2} from "@/lib/customer/discovery/verified-package-v2";
import {normalizePublicPackageCustomization, normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
const id="package_v2_public",providerId="provider_v2_public";
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{
 vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS","true");vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID","demo-feasta-package-drafts");
 mock.records.clear();
 mock.catalog=['birthday','wedding'].map((id,sortOrder)=>({id,label:id,sortOrder,revision:1,active:true,
  moderationState:'approved',applicableServiceCategoryCodes:['catering_service']}));
 mock.records.set('packages/'+id,{sharedContractVersion:2,occasionSchemaVersion:2,offerSchemaVersion:2,
  revision:2,providerId,name:'Verified Catering',description:'Verified package',eventType:'birthday',
  occasionScope:'all',occasionIds:[],occasionMatchIds:['birthday','wedding'],occasionCatalogRevision:7,
  providerEligibilityRevision:1,occasionEligibilityState:'valid',pricingModel:'per_pax',price:100.25,
  serviceCategoryCode:'catering_service',minimumGuests:10,maximumGuests:50,
  serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],equipmentInclusions:['Warmer']}},
  imageUrl:'',imageUrls:[],themeOptions:[],paymentPolicy:'full_payment',depositPercentage:100,
  paymentTermsSchemaVersion:2,balanceDueHoursBeforeEvent:null,
  foodInclusions:['Rice'],serviceInclusions:[],decorInclusions:[],furnitureInclusions:[],
  foodChoiceGroups:[{id:'main',title:'Main',selectionCount:1,options:[{id:'a',name:'Chicken'},{id:'b',name:'Fish'}]}],
  status:'published',isActive:true,isPublished:true,providerPubliclyVisible:true,isDeleted:false,publishedAt:{}});
 mock.records.set('contractPolicies/providerPackageV2',{revision:1,effectiveEnvironment:'demo-feasta-package-drafts',
  maxSpecificOccasions:10,maxThemeImages:4,featureGates:{customerDiscovery:true}});
 mock.records.set('appSettings/platform',{minimumDepositRateBps:2000,maximumDepositRateBps:8000});
 mock.records.set('occasionCatalog/current',{revision:7,activationState:'stable'});
 mock.records.set('providers/'+providerId,{ownerId:'owner_v2_public',businessName:'Demo Catering',
  serviceCategories:['catering_service'],minGuestsPerEvent:1,maxGuestsPerEvent:100,operatingDays:['monday'],bookingLeadTimeDays:1,description:'Catering business',address:'Address',city:'City',province:'Province',publiclyVisible:true,verificationStatus:'approved',isActive:true,providerServiceType:'catering'});
 mock.records.set('users/owner_v2_public',{role:'provider',providerId,accountStatus:'active',isActive:true});
 mock.records.set('serviceCategories/catering_service',{code:'catering_service',name:'Catering',status:'active',serviceType:'catering'});
 mock.records.set('maintenanceControls/intake',{schemaVersion:1,revision:1,publication:false,intake:false});
});
it('admits an approved provider without a separate occasion authority',async()=>{
  expect(mock.records.has('providerEligibilityAuthorities/'+providerId)).toBe(false);
  expect(await verifiedPublicPackageV2(id)).not.toBeNull();
});

it('rejects pending providers and withdrawn service categories',async()=>{
  const path='providers/'+providerId;
  const original=mock.records.get(path)!;
  try {
    mock.records.set(path,{...original,verificationStatus:'pending'});
    expect(await verifiedPublicPackageV2(id)).toBeNull();

    mock.records.set(path,{...original,serviceCategories:[]});
    expect(await verifiedPublicPackageV2(id)).toBeNull();
  } finally {
    mock.records.set(path,original);
  }
});
it('verifies Fits All, food groups and tier equipment while legacy readers stay fenced',async()=>{
 const raw=await verifiedPublicPackageV2(id);expect(raw).not.toBeNull();
 const names=new Map([[providerId,'Demo Catering']]);
 expect(normalizePublicPackage(id,raw!,names)).toBeNull();
 expect(normalizePublicPackage(id,raw!,names,true)).toMatchObject({revision:2,sharedContractVersion:2,
  occasionScope:'all',occasionMatchIds:['birthday','wedding'],pricingModel:'per_pax',price:100.25,
  foodChoiceGroups:[{id:'main',selectionCount:1}],serviceOptions:{drop_off:{equipmentInclusions:['Warmer']}}});
});
it('hides private drafts and stale or manipulated generations',async()=>{
 for(const patch of [{status:'draft'},{isPublished:false},{isDeleted:true},{occasionCatalogRevision:6},
  {providerEligibilityRevision:2},{occasionMatchIds:['birthday']},{price:1}]) {
  const prior=mock.records.get('packages/'+id)!;mock.records.set('packages/'+id,{...prior,...patch});
  expect(await verifiedPublicPackageV2(id)).toBeNull();mock.records.set('packages/'+id,prior);
 }
});
it('hides packages after gate revocation, transitions, provider suspension or category withdrawal',async()=>{
 for(const [path,patch] of [['contractPolicies/providerPackageV2',{featureGates:{customerDiscovery:false}}],
  ['occasionCatalog/current',{activationState:'transitioning'}],['providers/'+providerId,{isSuspended:true}],
  ['serviceCategories/catering_service',{status:'inactive'}]] as const) {
  const prior=mock.records.get(path)!;mock.records.set(path,{...prior,...patch});
  expect(await verifiedPublicPackageV2(id)).toBeNull();mock.records.set(path,prior);
 }
});
it('admits production only with matching environment and current server policy',async()=>{
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_USE_FIREBASE_EMULATORS','false');
 vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID','feasta-catering-system');
 expect(await verifiedPublicPackageV2(id)).toBeNull();
 mock.records.get('contractPolicies/providerPackageV2')!.effectiveEnvironment='feasta-catering-system';
 expect(await verifiedPublicPackageV2(id)).not.toBeNull();
});

it.each(['fixed', 'customizable'] as const)('retains %s contracts for both pricing models', async (offerStructure) => {
 for (const pricingModel of ['per_pax', 'per_bundle'] as const) {
  const food = 'x'.repeat(160);
  const stored = mock.records.get('packages/'+id)!;
  mock.records.set('packages/'+id, {...stored, offerStructure, pricingModel,
   foodChoiceGroups:offerStructure==='fixed'?[]:stored.foodChoiceGroups,
   foodInclusions:[food], imageUrl:'https://example.com/a.jpg', imageUrls:['https://example.com/a.jpg','https://example.com/b.jpg'],
   paymentPolicy:'deposit_then_balance',depositPercentage:30,paymentTermsSchemaVersion:2,
   balanceDueDaysBeforeEvent:null,balanceDueHoursBeforeEvent:24,
   themeOptions:[{id:'garden',name:'Garden',description:'',imageUrls:[]}],
   serviceOptions:{...stored.serviceOptions as object,full_service:{price:250.75,includedServices:['Staff']}}});
  const raw = await verifiedPublicPackageV2(id);
  expect(raw).not.toBeNull();
  const result=normalizePublicPackage(id,raw!,new Map([[providerId,'Demo Catering']]),true)!;
  expect(result).toMatchObject({offerStructure,pricingModel,revision:2,inclusions:[food],foodInclusions:[food],
   paymentPolicy:'deposit_then_balance',depositPercentage:30,paymentTermsSchemaVersion:2,
   balanceDueDaysBeforeEvent:null,balanceDueHoursBeforeEvent:24,
   imageUrls:['https://example.com/a.jpg','https://example.com/b.jpg'],themeOptions:[{id:'garden'}],
   foodChoiceGroups:offerStructure==='fixed'?[]:[{id:'main',selectionCount:1,options:[{id:'a'},{id:'b'}]}],
   serviceOptions:{drop_off:{price:100.25},full_service:{price:250.75}}});
 }
});

it('retains all shared foods and full-length customization strings', () => {
 const foods=Array.from({length:50},(_,i)=>String(i).padStart(3,'0')+'x'.repeat(157));
 const raw={...mock.records.get('packages/'+id)!,foodInclusions:foods};
 expect(normalizePublicPackageCustomization(raw).foods).toEqual(foods);
 expect(normalizePublicPackage(id,raw,new Map([[providerId,'Demo Catering']]),true)?.foodInclusions).toEqual(foods);
});
