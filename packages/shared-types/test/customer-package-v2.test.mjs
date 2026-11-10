import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentCustomerPackageV2 as eligible, customerPackageEstimate as estimate} from '../dist/customer-package-v2.cjs';
const context=()=>({enabled:true,catalogRevision:7,providerEligibilityRevision:3,maxSpecificOccasions:10,maxThemeImages:4,
 approvedOccasionIds:['birthday','wedding'],approvedCategoryCodes:['catering_service'],catalog:
 ['birthday','wedding'].map((id,sortOrder)=>({id,label:id,sortOrder,revision:1,active:true,moderationState:'approved',applicableServiceCategoryCodes:['catering_service']}))});
const data=()=>({sharedContractVersion:2,occasionSchemaVersion:2,offerSchemaVersion:2,revision:2,
 occasionCatalogRevision:7,providerEligibilityRevision:3,occasionEligibilityState:'valid',
 occasionScope:'specific',occasionIds:['birthday','wedding'],occasionMatchIds:['birthday','wedding'],eventType:'birthday',
 serviceCategoryCode:'catering_service',pricingModel:'per_pax',minimumGuests:10,maximumGuests:50,price:100.25,
 serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],equipmentInclusions:['Warmer']}},
 name:"Complete catering",description:"Complete catering description",
 status:"published",isActive:true,isPublished:true,providerPubliclyVisible:true,isDeleted:false,publishedAt:1,
 paymentTermsSchemaVersion:2,paymentPolicy:"full_payment",depositPercentage:100,balanceDueHoursBeforeEvent:null,
 imageUrl:"",imageUrls:[],themeOptions:[],foodInclusions:["Rice"],serviceInclusions:[],decorInclusions:[],furnitureInclusions:[]});
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

test('production payment policy accepts canonical decimal percentages and rejects missing configuration', async()=>{
 const {isV2PaymentPolicyValid}=await import('../dist/customer-package-v2.cjs');
 const policy={minimumDepositRateBps:2000,maximumDepositRateBps:8000};
 for(const depositPercentage of [20,20.17,28.23,79.99,80])assert.equal(isV2PaymentPolicyValid({paymentPolicy:'deposit_then_balance',depositPercentage},policy),true);
 for(const settings of [null,{}, {...policy,minimumDepositRateBps:9000}])assert.equal(isV2PaymentPolicyValid({paymentPolicy:'full_payment'},settings),false);
});

// Exercise the customer gate with the same Fixed Per Bundle shape as publication.
for (const [label, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
 test(label + ' published Fixed Per Bundle remains customer eligible without weakening validation',()=>{
  const description=['Enjoy our Filipino bilao package for family gatherings.',
   'Includes selected dishes for 8-10 guests.', 'A convenient food-sharing experience.'].join(newline+newline);
  const saved={...data(),offerStructure:'fixed',pricingModel:'per_bundle',
   name:'Busog Na Set ? Bilao Package',description,minimumGuests:8,maximumGuests:10,price:1850,
   serviceOptions:{drop_off:{price:1850,includedServices:[]}},
   paymentPolicy:'deposit_then_balance',depositPercentage:50,balanceDueHoursBeforeEvent:24};
  const before=structuredClone(saved);
  assert.equal(eligible(saved,context()),true);
  assert.deepEqual(saved,before);
  for(const invalid of ['\r','\t','\u200B','\uD800'])
   assert.equal(eligible({...saved,description:description+invalid+'Invalid'},context()),false);
  for(const patch of [{status:'draft'},{isPublished:false},{isActive:false},
   {providerPubliclyVisible:false},{isDeleted:true},{publishedAt:null},
   {occasionCatalogRevision:6},{providerEligibilityRevision:2},{occasionMatchIds:['birthday']},
   {paymentPolicy:'invalid'},{depositPercentage:0},{maximumGuests:7},
   {name:'Invalid\nPackage'},{foodInclusions:[]}])
   assert.equal(eligible({...saved,...patch},context()),false);
  assert.equal(eligible(saved,{...context(),enabled:false}),false);
  assert.equal(eligible(saved,{...context(),approvedCategoryCodes:[]}),false);
 });
}
