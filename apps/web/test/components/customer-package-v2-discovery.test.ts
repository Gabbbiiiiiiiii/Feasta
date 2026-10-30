import {afterEach, beforeEach, expect, it, vi} from "vitest";
const mock=vi.hoisted(()=>({records:new Map<string,Record<string,unknown>>(), catalog:[] as Record<string,unknown>[]}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/firebase/admin",()=>({adminDb:{
 doc:(path:string)=>({path}),collection:()=>({where:()=>({limit:()=>({query:true})})}),
 runTransaction:async(work:(tx:unknown)=>unknown)=>work({get:async(ref:{path?:string;query?:boolean})=>
  ref.query ? {size:mock.catalog.length,docs:mock.catalog.map(row=>({data:()=>row}))} :
  {data:()=>mock.records.get(ref.path!)}}),
}}));
import {customerV2DemoEnabled, verifiedPublicPackageV2} from "@/lib/customer/discovery/verified-package-v2";
import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
const id="package_v2_public",providerId="provider_v2_public";
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{
 vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS","true");vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID","demo-feasta-package-drafts");
 mock.records.clear();
 mock.catalog=['birthday','wedding'].map((id,sortOrder)=>({id,sortOrder,revision:1,active:true,
  moderationState:'approved',applicableServiceCategoryCodes:['catering_service']}));
 mock.records.set('packages/'+id,{sharedContractVersion:2,occasionSchemaVersion:2,offerSchemaVersion:2,
  revision:2,providerId,name:'Verified Catering',description:'Verified package',eventType:'birthday',
  occasionScope:'all',occasionIds:[],occasionMatchIds:['birthday','wedding'],occasionCatalogRevision:7,
  providerEligibilityRevision:3,occasionEligibilityState:'valid',pricingModel:'per_pax',price:100.25,
  serviceCategoryCode:'catering_service',minimumGuests:10,maximumGuests:50,
  serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],equipmentInclusions:['Warmer']}},
  foodInclusions:[],serviceInclusions:[],decorInclusions:[],furnitureInclusions:[],
  foodChoiceGroups:[{id:'main',title:'Main',selectionCount:1,options:[{id:'a',name:'Chicken'},{id:'b',name:'Fish'}]}],
  status:'published',isActive:true,isPublished:true,providerPubliclyVisible:true,isDeleted:false,publishedAt:{}});
 mock.records.set('contractPolicies/providerPackageV2',{revision:1,effectiveEnvironment:'demo-feasta-package-drafts',
  maxSpecificOccasions:10,featureGates:{customerDiscovery:true}});
 mock.records.set('occasionCatalog/current',{revision:7,activationState:'stable'});
 mock.records.set('providerEligibilityAuthorities/'+providerId,{revision:3,
  approvedOccasionIds:['birthday','wedding'],approvedCategoryCodes:['catering_service']});
 mock.records.set('providers/'+providerId,{ownerId:'owner_v2_public',businessName:'Demo Catering',
  publiclyVisible:true,verificationStatus:'approved',isActive:true,providerServiceType:'catering'});
 mock.records.set('users/owner_v2_public',{role:'provider',providerId,accountStatus:'active',isActive:true});
 mock.records.set('serviceCategories/catering_service',{status:'active',serviceType:'catering'});
 mock.records.set('maintenanceControls/intake',{schemaVersion:1,revision:1,publication:false,intake:false});
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
  ['serviceCategories/catering_service',{status:'inactive'}],['providerEligibilityAuthorities/'+providerId,{approvedOccasionIds:['birthday']}]] as const) {
  const prior=mock.records.get(path)!;mock.records.set(path,{...prior,...patch});
  expect(await verifiedPublicPackageV2(id)).toBeNull();mock.records.set(path,prior);
 }
});
it('never opens the production reader gate or indexed V2 query path',async()=>{
 expect(customerV2DemoEnabled()).toBe(true);
 vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID','feasta-catering-system');
 expect(customerV2DemoEnabled()).toBe(false);
 expect(await verifiedPublicPackageV2(id)).toBeNull();
});
