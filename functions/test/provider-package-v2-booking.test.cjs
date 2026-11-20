const {test}=require('node:test');const assert=require('node:assert/strict');
const {resolveBookingPackageOffer:resolve,rejectClientBookingFinancialAuthority:reject}=require('../lib/bookings/booking-package-offer.js');
const {validateBookingPackage:validate}=require('../lib/bookings/booking-contract.js');
const data=()=>({offerSchemaVersion:2,revision:8,price:100.25,pricingModel:'per_pax',minimumGuests:10,maximumGuests:50,
 foodInclusions:['Rice'],serviceInclusions:['Coordination'],decorInclusions:['Shared flowers'],furnitureInclusions:[],equipmentInclusions:['Shared warmer'],
 serviceOptions:Object.fromEntries(['drop_off','buffet_setup','full_service'].map((tier,i)=>[tier,{price:100.25+i*50,
  includedServices:['Tier '+i],decorInclusions:['Decor '+i],furnitureInclusions:['Furniture '+i],equipmentInclusions:['Equipment '+i]}])),
 themeOptions:[{id:'garden',name:'Garden',description:'Green theme',imageUrls:['https://example.com/theme.jpg']}],
 providerId:'provider_demo',status:'published',isActive:true,isPublished:true,providerPubliclyVisible:true,isDeleted:false,
 eventType:'birthday',occasionMatchIds:['birthday','wedding']});
for(const model of ['per_pax','per_bundle']) for(const [i,tier] of ['drop_off','buffet_setup','full_service'].entries()) {
 test('V2 '+model+' '+tier+' prices and freezes only its selected inclusions',()=>{
  const d={...data(),pricingModel:model};const r=resolve({packageData:d,guestCount:20,serviceTier:tier,packageThemeId:tier==='drop_off'?null:'garden'});
  assert.equal(r.basePrice,(100.25+i*50)*(model==='per_pax'?20:1));
  assert.deepEqual(r.selection.serviceTierIncludedServices,['Coordination','Tier '+i]);
  assert.deepEqual(r.selection.packageOfferSnapshotV2.decorInclusions,['Shared flowers','Decor '+i]);
  assert.deepEqual(r.selection.packageOfferSnapshotV2.equipmentInclusions,['Shared warmer','Equipment '+i]);
  d.serviceOptions[tier].decorInclusions[0]='Changed';assert.equal(r.selection.packageOfferSnapshotV2.decorInclusions[1],'Decor '+i);
  assert.equal(r.selection.packageOfferSnapshotV2.revision,8);
 });
}
test('V2 rejects stale themes, missing tiers, excess capacity and invalid stored rules',()=>{
 for(const patch of [{serviceTier:null},{serviceTier:'unknown'},{guestCount:9},{guestCount:51},{packageThemeId:'stale'}])
  assert.throws(()=>resolve({packageData:data(),guestCount:20,serviceTier:'buffet_setup',packageThemeId:null,...patch}));
 assert.throws(()=>resolve({packageData:data(),guestCount:20,serviceTier:'drop_off',packageThemeId:'garden'}));
 assert.throws(()=>resolve({packageData:{...data(),price:1},guestCount:20,serviceTier:'drop_off',packageThemeId:null}));
});
test('V2 cannot bypass server verification and still validates occasion and capacities',()=>{
 const d=data();assert.equal(validate({packageData:d,expectedProviderId:'provider_demo',submittedEventType:'wedding',guestCount:20}).valid,false);
 assert.equal(validate({packageData:d,expectedProviderId:'provider_demo',submittedEventType:'wedding',guestCount:20,verifiedV2:true}).valid,true);
 for(const patch of [{submittedEventType:'debut'},{guestCount:9},{guestCount:51},{expectedProviderId:'foreign'}])
  assert.equal(validate({packageData:d,expectedProviderId:'provider_demo',submittedEventType:'wedding',guestCount:20,verifiedV2:true,...patch}).valid,false);
});
test('client prices and financial snapshots remain forbidden',()=>{
 for(const field of ['clientPrice','packagePrice','tierPrice','total','financialSnapshot']) assert.throws(()=>reject({[field]:1}));
});

for(const offerStructure of ['fixed','customizable'])for(const pricingModel of ['per_pax','per_bundle'])
 test('production '+offerStructure+' '+pricingModel+' keeps server totals and immutable food snapshots',()=>{
 const {resolveFoodChoiceSelections}=require('../lib/bookings/food-choice-selection.js');
 const groups=[{id:'main',title:'Main dishes',selectionCount:1,options:[{id:'chicken',name:'Chicken'},{id:'fish',name:'Fish'}]}];
 const d={...data(),offerStructure,pricingModel,foodChoiceGroups:offerStructure==='customizable'?groups:[]};
 const offer=resolve({packageData:d,guestCount:20,serviceTier:'buffet_setup',packageThemeId:'garden'});
 assert.equal(Math.round(offer.basePrice*100),15025*(pricingModel==='per_pax'?20:1));
 const selection=offerStructure==='customizable'?[{groupId:'main',optionIds:['chicken']}]:[];
 const snapshot=resolveFoodChoiceSelections(d,selection);
 if(offerStructure==='customizable'){
  for(const bad of [[],[{groupId:'main',optionIds:['missing']}],[{groupId:'main',optionIds:['chicken','fish']}]])assert.throws(()=>resolveFoodChoiceSelections(d,bad));
  d.foodChoiceGroups[0].options[0].name='Changed after booking';assert.equal(snapshot[0].options[0].name,'Chicken');
 } else assert.deepEqual(snapshot,[]);
 assert.equal(offer.selection.packageOfferSnapshotV2.revision,8);
 });
