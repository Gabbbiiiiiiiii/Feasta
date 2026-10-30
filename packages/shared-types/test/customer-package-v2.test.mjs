import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentCustomerPackageV2 as eligible, customerPackageEstimate as estimate} from '../dist/customer-package-v2.cjs';
const context=()=>({enabled:true,catalogRevision:7,providerEligibilityRevision:3,maxSpecificOccasions:10,
 approvedOccasionIds:['birthday','wedding'],approvedCategoryCodes:['catering_service'],catalog:
 ['birthday','wedding'].map((id,sortOrder)=>({id,sortOrder,revision:1,active:true,moderationState:'approved',applicableServiceCategoryCodes:['catering_service']}))});
const data=()=>({sharedContractVersion:2,occasionSchemaVersion:2,offerSchemaVersion:2,revision:2,
 occasionCatalogRevision:7,providerEligibilityRevision:3,occasionEligibilityState:'valid',
 occasionScope:'specific',occasionIds:['birthday','wedding'],occasionMatchIds:['birthday','wedding'],eventType:'birthday',
 serviceCategoryCode:'catering_service',pricingModel:'per_pax',minimumGuests:10,maximumGuests:50,price:100.25,
 serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],equipmentInclusions:['Warmer']}},
 foodInclusions:[],serviceInclusions:[],decorInclusions:[],furnitureInclusions:[]});
test('current specific and Fits All match the whole authoritative catalog',()=>{
 assert.equal(eligible(data(),context()),true);
 assert.equal(eligible({...data(),occasionScope:'all',occasionIds:[]},context()),true);
});
test('stale and tampered membership is never eligible',()=>{
 for(const patch of [{occasionCatalogRevision:6},{providerEligibilityRevision:2},{occasionMatchIds:['birthday']},
  {occasionEligibilityState:'review_required'},{occasionIds:[]},{eventType:'unknown'},{sharedContractVersion:1}])
  assert.equal(eligible({...data(),...patch},context()),false);
});
test('revoked provider approval, gates and incomplete Fits All are rejected',()=>{
 for(const patch of [{enabled:false},{approvedOccasionIds:['birthday']},{approvedCategoryCodes:[]},
  {catalogRevision:8},{providerEligibilityRevision:4}]) assert.equal(eligible(data(),{...context(),...patch}),false);
});
test('malformed pricing, tiers and capacities fail closed',()=>{
 for(const patch of [{price:100},{pricingModel:'free'},{minimumGuests:51},{maximumGuests:0},
  {serviceOptions:{}},{serviceOptions:{drop_off:{price:100.251,includedServices:[]}}}])
  assert.equal(eligible({...data(),...patch},context()),false);
});
test('per pax uses centavos and bundle/legacy prices remain fixed',()=>{
 assert.equal(estimate(100.25,20,'per_pax'),2005);
 assert.equal(estimate(100.25,20,'per_bundle'),100.25);
 assert.equal(estimate(100.25,20),100.25);
 assert.equal(estimate(100.25,0,'per_pax'),null);
 assert.equal(estimate(10000000,100000,'per_pax'),null);
});
