const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');
const moduleURL = url.pathToFileURL(path.join(__dirname,
  '../src/packages/occasion-transition-withdrawal-plan.ts')).href;
let helpers;
async function get() { return helpers ??= await import(moduleURL); }
const base = {action:'activate',occasionId:'birthday', applicableCategoryCodes:['catering_service'],
  fullyEnumerated:true, authorities:[], packages:[]};
function legacy(extra={}) {return {id:'p1',providerId:'c1',serviceCategoryCode:'catering_service',
  eventType:'birthday',status:'published',isPublished:true,isActive:true,
  providerPubliclyVisible:true,isDeleted:false,publishedAt:{seconds:1},...extra};}
function provider(extra={}) {return {providerId:'c1',operationallyApproved:true,
  providerEligibilityRevision:2,approvedOccasionIds:['birthday'],
  approvedCategoryCodes:['catering_service'],...extra};}

test('never marks catalog commit or package restoration allowed',async()=>{
  const {planOccasionTransitionWithdrawals: plan}=await get();
  const p=plan({...base,packages:[legacy()],authorities:[provider()]});
  assert.equal(p.state,'blocked');assert.equal(p.canCommitCatalog,false);
  assert.equal(p.canRestorePackages,false);assert.equal(p.lifecycleAvailable,false);
  assert.equal(p.candidateWithdrawals.length,1);
  assert.equal(p.candidateWithdrawals[0].reason,'LEGACY_REFERENCE');
});

test('all occasion packages are withdrawn, never silently converted to specific',async()=>{
  const {planOccasionTransitionWithdrawals: plan}=await get();
  const v2=legacy({eventType:'wedding',occasionSchemaVersion:2,occasionScope:'all',
    occasionIds:[],occasionMatchIds:['wedding'],occasionCatalogRevision:7,
    providerEligibilityRevision:2,occasionEligibilityState:'valid'});
  const p=plan({...base,packages:[v2],authorities:[provider({approvedOccasionIds:['wedding']})]});
  assert.equal(p.candidateWithdrawals[0].reason,'UNIVERSAL_SCOPE');
  assert.deepEqual(p.providerReviewIds,['c1']);
  assert.deepEqual(p.candidateWithdrawals[0].requiredPrivateProjection,{
    status:'draft',isPublished:false,isActive:false,
    providerPubliclyVisible:false,publishedAt:null});
});

test('specific records referring to disabled target are identified for withdrawal',async()=>{
 const {planOccasionTransitionWithdrawals: plan}=await get();
 const x=legacy({eventType:'wedding',occasionSchemaVersion:2,occasionScope:'specific',
  occasionIds:['birthday'],occasionMatchIds:['birthday'],occasionCatalogRevision:7,
  providerEligibilityRevision:2,occasionEligibilityState:'valid'});
 assert.equal(plan({...base,action:'deactivate',packages:[x],authorities:[provider()]})
  .candidateWithdrawals[0].reason,'SPECIFIC_REFERENCE');
});

test('mixed unknown contract cannot silently pass as legacy',async()=>{
 const {planOccasionTransitionWithdrawals: plan}=await get();
 const x=legacy({eventType:'wedding',occasionIds:['birthday']});
 const p=plan({...base,packages:[x]});
 assert.deepEqual(p.unverifiedPackageIds,['p1']);
 assert.equal(p.candidateWithdrawals[0].reason,'UNKNOWN_OCCASION_CONTRACT');
 assert.ok(p.blockers.includes('UNKNOWN_PACKAGE_CONTRACTS'));
});

test('missing grants and categories never infer provider approval from legacy',async()=>{
 const {planOccasionTransitionWithdrawals: plan}=await get();
 const p=plan({...base,packages:[legacy()],authorities:[provider({approvedOccasionIds:[]})]});
 assert.deepEqual(p.providerReviewIds,['c1']);
 assert.ok(p.blockers.includes('PROVIDER_ELIGIBILITY_REVIEW_REQUIRED'));
});

test('incomplete inventory, even empty, always blocks transitions',async()=>{
 const {planOccasionTransitionWithdrawals: plan}=await get();
 const p=plan({...base,fullyEnumerated:false});
 assert.ok(p.blockers.includes('INVENTORY_INCOMPLETE'));
 assert.equal(p.canCommitCatalog,false);
});

test('duplicate packages and invalid evidence fail closed',async()=>{
 const {planOccasionTransitionWithdrawals: plan}=await get();
 assert.throws(()=>plan({...base,packages:[legacy(),legacy()]}),/INVALID_PACKAGE_INVENTORY/);
 assert.throws(()=>plan({...base,applicableCategoryCodes:[]}),/INVALID_TRANSITION_INVENTORY/);
 assert.throws(()=>plan({...base,action:'override'}),/INVALID_TRANSITION_INVENTORY/);
 assert.throws(()=>plan({...base,authorities:[provider(),provider()]}),/INVALID_AUTHORITY_INVENTORY/);
});

test('private projection verification requires all five withdrawal controls',async()=>{
 const {hasPrivateWithdrawalProjection: isWithdrawn}=await get();
 const safe=legacy({status:'draft',isActive:false,isPublished:false,
  providerPubliclyVisible:false,publishedAt:null});
 assert.equal(isWithdrawn(safe),true);
 for(const key of ['status','isActive','isPublished','providerPubliclyVisible','publishedAt']){
   const x={...safe};delete x[key];assert.equal(isWithdrawn(x),false,key);
 }
});

test('legacy unknown or universal event type is never treated as unrelated',async()=>{
 const {planOccasionTransitionWithdrawals: plan}=await get();
 const p=plan({...base,packages:[legacy({eventType:'all'})]});
 assert.equal(p.candidateWithdrawals[0].reason,'UNKNOWN_OCCASION_CONTRACT');
 assert.deepEqual(p.unverifiedPackageIds,['p1']);
});

test('nonmatching specific records do not receive a withdrawal candidate',async()=>{
 const {planOccasionTransitionWithdrawals: plan}=await get();
 const p=plan({...base,packages:[legacy({eventType:'wedding'})],authorities:[provider()]});
 assert.equal(p.candidateWithdrawals.length,0);
 assert.equal(p.state,'blocked');
});
