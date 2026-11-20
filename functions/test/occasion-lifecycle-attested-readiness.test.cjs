/** Full readiness integration with mocked transaction snapshots; no Firebase writes. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const now = Date.now();
const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const proofCodes = [
  'RELEASE_AUTHORIZATION_UNVERIFIED','ELIGIBILITY_WRITER_COVERAGE_UNVERIFIED',
  'AFFECTED_INVENTORY_UNVERIFIED','PUBLICATION_WITHDRAWAL_UNAVAILABLE',
  'BOOKING_COMPATIBILITY_UNVERIFIED','CUSTOMER_WEB_COMPATIBILITY_UNVERIFIED',
  'FLUTTER_COMPATIBILITY_UNVERIFIED','INDEX_QUERY_READINESS_UNVERIFIED',
  'GENERATION_COORDINATION_UNAVAILABLE','DEPLOYMENT_SECURITY_GATES_UNVERIFIED',
];
const input = {occasionId:'birthday',expectedOccasionRevision:1,expectedCatalogRevision:2};
const state = new Map([
  ['occasionCatalog/current',{activationState:'stable',revision:2}],
  ['occasions/birthday',{id:'birthday',active:false,moderationState:'approved',revision:1,
    applicableServiceCategoryCodes:['catering_service']}],
  ['serviceCategories/catering_service',{code:'catering_service',serviceType:'catering',status:'active'}],
]);
const db = {collection(name){return {doc(id){return {key:`${name}/${id}`,path:`${name}/${id}`}}}}};
const tx = {get:async ref=>({data:()=>state.get(ref.key)})};
const original = Module._load;
Module._load = function(id,parent,...rest){
  let resolved = '';
  try {resolved=Module._resolveFilename(id,parent).replaceAll('\\','/')} catch {}
  if(resolved.endsWith('/lib/shared/firestore.js')) return {db};
  if(resolved.endsWith('/lib/shared/authorization.js')) return {requireRole:async()=>{}};
  if(resolved.endsWith('/lib/shared/rate-limit.js')) return {enforceCallableRateLimit:async()=>{}};
  return original.call(this,id,parent,...rest);
};
let readiness;
try {readiness=require(path.resolve(__dirname,'../lib/admin/occasion-activation-readiness.js'))}
finally {Module._load=original}
function permit(){
  return {schemaVersion:1,projectId:'feasta-catering-system',occasionId:'birthday',
    action:'activate',catalogRevision:2,occasionRevision:1,sourceCommitSha:sha,
    deployedFunctionsSha256:digest,
    deployedRulesetName:'projects/feasta-catering-system/rulesets/ready',
    verifiedByUids:['release_approver_1','release_reviewer_2'],
    issuedAtMillis:now-2000,expiresAtMillis:now+3600000,
    checks:Object.fromEntries(proofCodes.map(code=>[code,{status:'VERIFIED',
      artifactSha256:digest,verifiedAtMillis:now-1000}]))};
}
async function evaluate(){return readiness.readOccasionReadiness(tx,input,'activate')}
const priorProject = process.env.GCLOUD_PROJECT;
const priorSha = process.env.FEASTA_LIFECYCLE_RELEASE_COMMIT_SHA;
function setEnv(){process.env.GCLOUD_PROJECT='feasta-catering-system';
  process.env.FEASTA_LIFECYCLE_RELEASE_COMMIT_SHA=sha}
function restoreEnv(){
  if(priorProject===undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT=priorProject;
  if(priorSha===undefined) delete process.env.FEASTA_LIFECYCLE_RELEASE_COMMIT_SHA;
  else process.env.FEASTA_LIFECYCLE_RELEASE_COMMIT_SHA=priorSha;
}

test('without trusted evidence, legacy and atomic readiness both remain blocked',async()=>{
  setEnv();state.delete('occasionLifecycleReleaseEvidence/birthday_activate');
  try {
    const r=await evaluate();assert.equal(r.status,'BLOCKED');
    assert.equal(r.blockers.length,10);
  } finally {restoreEnv()}
});
test('complete, scoped evidence can permit the readiness transaction',async()=>{
  setEnv();state.set('occasionLifecycleReleaseEvidence/birthday_activate',permit());
  try {
    const r=await evaluate();assert.equal(r.status,'ELIGIBLE_FOR_TRANSACTION');
    assert.equal(r.lifecycleAvailable,true);assert.equal(r.checks.length,17);
    assert.deepEqual(r.blockers,[]);
  } finally {state.delete('occasionLifecycleReleaseEvidence/birthday_activate');restoreEnv()}
});
test('stale catalog evidence or absent deployed commit marker fail closed',async()=>{
  setEnv();state.set('occasionLifecycleReleaseEvidence/birthday_activate',permit());
  try {
    state.get('occasionCatalog/current').revision=3;
    assert.equal((await evaluate()).status,'BLOCKED');
    state.get('occasionCatalog/current').revision=2;
    delete process.env.FEASTA_LIFECYCLE_RELEASE_COMMIT_SHA;
    assert.equal((await evaluate()).blockers.length,10);
  } finally {state.get('occasionCatalog/current').revision=2;
    state.delete('occasionLifecycleReleaseEvidence/birthday_activate');restoreEnv()}
});
