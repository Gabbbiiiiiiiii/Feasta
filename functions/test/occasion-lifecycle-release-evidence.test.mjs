import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedLifecycleReleaseChecks, REQUIRED_LIFECYCLE_RELEASE_CHECKS}
  from '../src/admin/occasion-lifecycle-release-evidence.ts';

const now = Date.UTC(2026,9,27,9,0,0);
const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const context = {projectId:'feasta-catering-system', deployedCommitSha:sha,
  occasionId:'birthday', action:'activate', catalogRevision:2,
  occasionRevision:1, nowMillis:now};
function evidence(extra={}) {
  return {
    schemaVersion:1, projectId:context.projectId, occasionId:'birthday',
    action:'activate', catalogRevision:2, occasionRevision:1,
    sourceCommitSha:sha, deployedFunctionsSha256:digest,
    deployedRulesetName:'projects/feasta-catering-system/rulesets/approved123',
    verifiedByUids:['release_manager_1','release_reviewer_2'],
    issuedAtMillis:now-1000, expiresAtMillis:now+3600000,
    checks:Object.fromEntries(REQUIRED_LIFECYCLE_RELEASE_CHECKS.map(code=>
      [code,{status:'VERIFIED',artifactSha256:digest,verifiedAtMillis:now-1000}])),
    ...extra,
  };
}
function accepted(proof, ctx=context) {
  return Object.values(verifiedLifecycleReleaseChecks(proof,ctx)).every(Boolean);
}
function denied(proof, ctx=context) {
  assert.equal(accepted(proof,ctx),false);
  assert.equal(Object.values(verifiedLifecycleReleaseChecks(proof,ctx)).filter(Boolean).length,0);
}
test('missing release evidence blocks every mandatory safeguard',()=>{
  denied(null);denied({});
  assert.equal(REQUIRED_LIFECYCLE_RELEASE_CHECKS.length,10);
});
test('a complete short-lived, operator-approved revision-scoped release can pass the pure policy',()=>{
  assert.equal(accepted(evidence()),true);
});
test('a purported browser approval or booleans are not accepted',()=>{
  denied({ready:true,allChecksPassed:true});
  denied(evidence({checks:Object.fromEntries(REQUIRED_LIFECYCLE_RELEASE_CHECKS.map(k=>[k,true]))}));
});
test('project, deployed commit, occasion, action and revisions must match',()=>{
  for(const patch of [{projectId:'someone-else'}, {occasionId:'wedding'},
    {action:'deactivate'}, {catalogRevision:3}, {occasionRevision:2},
    {sourceCommitSha:'c'.repeat(40)}]) denied(evidence(patch));
  denied(evidence(),{...context,deployedCommitSha:''});
  denied(evidence(),{...context,deployedCommitSha:'c'.repeat(40)});
});
test('expired, future-issued, overlong or malformed evidence is rejected',()=>{
  denied(evidence({expiresAtMillis:now}));
  denied(evidence({issuedAtMillis:now+100}));
  denied(evidence({expiresAtMillis:now+7*3600000}));
  denied(evidence({verifiedByUids:['same','same']}));
  denied(evidence({verifiedByUids:['one']}));
  denied(evidence({deployedRulesetName:'projects/other/rulesets/x'}));
});
test('missing, forged, stale or extra safeguard evidence fails all ten, not some',()=>{
  for(const code of REQUIRED_LIFECYCLE_RELEASE_CHECKS) {
    const original=evidence();delete original.checks[code];denied(original);
    const corrupt=evidence();corrupt.checks[code].status='CLAIMED';denied(corrupt);
    const missingArtifact=evidence();missingArtifact.checks[code].artifactSha256='oops';denied(missingArtifact);
  }
  const extra=evidence();extra.checks.CUSTOM_ISSUE={status:'VERIFIED',artifactSha256:digest,verifiedAtMillis:now};
  denied(extra);
});
test('unknown envelope fields cannot grant release authority',()=>{
  denied(evidence({browserSaysApproved:true}));
});
