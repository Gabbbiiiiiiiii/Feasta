const {test, beforeEach, after} = require("node:test");
const assert = require("node:assert/strict");
const {initialAgreementTypes} = require("../../lib/shared/agreement-types.js");
const consent = {acceptedTerms:true, acceptedPrivacy:true, termsPolicyVersion:"1.1", privacyPolicyVersion:"1.1"};
const version = (label="1.1") => ({version:label,name:"Legal agreement",effectiveDate:"2026-07-29",
  sections:[{title:"Policy", paragraphs:["Published legal content."]}],status:"current",
  createdAt:"2026-07-29T00:00:00Z",publishedAt:"2026-07-29T00:00:00Z",archivedAt:null});
module.exports = function suite({db, auth, clear, race, concurrent}) {
  const {ensureUserProfile} = require("../../lib/auth/ensure-user-profile.js");
  let uid;
  const request = (data={}, authenticated=true) => ({data,
    auth:authenticated?{uid,token:{email:uid+"@example.test"}}:undefined,
    rawRequest:{headers:{},ip:"127.0.0.1"}});
  const call = (data={}, authenticated=true) => ensureUserProfile.run(request(data,authenticated));
  const user = () => db.collection("users").doc(uid);
  const customer = () => db.collection("customers").doc(uid);
  const terms = () => db.collection("agreementTemplates").doc("terms_of_service");
  const privacy = () => db.collection("agreementTemplates").doc("privacy_policy");
  const seed = async () => {
    for (const type of initialAgreementTypes()) await db.collection("agreementTypes").doc(type.code).set(type);
    await terms().set({agreementTypeCode:"terms_of_service",versions:[version()]});
    await privacy().set({agreementTypeCode:"privacy_policy",versions:[version()]});
  };
  const rejected = async (data,reason,code="failed-precondition") => {
    const beforeU=(await user().get()).data(), beforeC=(await customer().get()).data();
    await assert.rejects(call(data), e => e.code===code && e.details?.reason===reason);
    assert.deepEqual((await user().get()).data(),beforeU,"rejected request mutated user");
    assert.deepEqual((await customer().get()).data(),beforeC,"rejected request mutated customer");
  };
  beforeEach(async () => {await clear(); uid="consent-"+require("node:crypto").randomUUID();
    await auth.createUser({uid,email:uid+"@example.test"});await seed();});
  after(clear);
  test("new customer records verified 1.1 versions and server timestamps",async()=>{
    assert.deepEqual(await call(consent),{success:true,created:true,user:{uid,role:"customer",accountStatus:"active"}});
    const u=(await user().get()).data();assert.equal(u.termsVersion,"1.1");assert.equal(u.privacyVersion,"1.1");
    assert.ok(u.termsAcceptedAt);assert.ok(u.privacyAcceptedAt);assert.equal((await customer().get()).exists,true);
  });
  for(const input of [{}, {...consent,acceptedPrivacy:false},{...consent,acceptedTerms:"true"}])
    test("missing explicit acceptance "+JSON.stringify(input),()=>rejected(input,"consent-required"));
  for(const field of ["termsPolicyVersion","privacyPolicyVersion"])
    test("missing "+field,()=>rejected({...consent,[field]:undefined},"invalid-policy-version","invalid-argument"));
  for(const value of [123," "," 1.1","x".repeat(101)])
    test("malformed client version "+JSON.stringify(value),()=>rejected({...consent,termsPolicyVersion:value},"invalid-policy-version","invalid-argument"));
  test("outdated date identifiers rejected",()=>rejected({...consent,termsPolicyVersion:"2026-07-29",privacyPolicyVersion:"2026-07-29"},"policy-version-outdated"));
  for(const field of ["termsPolicyVersion","privacyPolicyVersion"])
    test("stale "+field+" independently rejected",()=>rejected({...consent,[field]:"1.0"},"policy-version-outdated"));
  test("existing false acceptance flags never rewrite historical consent",async()=>{
    await call(consent);await user().update({termsVersion:"historical",privacyVersion:"historical"});
    const before=(await user().get()).data();await call({acceptedTerms:false,acceptedPrivacy:false});
    const now=(await user().get()).data();
    for(const field of ["termsVersion","privacyVersion","termsAcceptedAt","privacyAcceptedAt"])assert.deepEqual(now[field],before[field]);
  });
  test("agreement changed since display rejects old acceptance",async()=>{
    await terms().update({versions:[version("1.2")]});await rejected(consent,"policy-version-outdated");
    await call({...consent,termsPolicyVersion:"1.2"});assert.equal((await user().get()).data().termsVersion,"1.2");
  });
  for(const kind of ["missing","draft","duplicate-lineage","duplicate-current","malformed-current","malformed-extra","legacy","duplicate-label","inactive-type","malformed-type","malformed-date"])
    test("invalid authority "+kind+" creates no profiles",async()=>{
      if(kind==="malformed-date")await terms().update({versions:[{...version(),effectiveDate:"2026-02-30"}]});
      if(kind==="missing")await terms().delete();
      if(kind==="draft")await terms().update({versions:[{...version(),status:"draft"}]});
      if(kind==="duplicate-lineage")await db.collection("agreementTemplates").doc("duplicate").set({agreementTypeCode:"terms_of_service",versions:[]});
      if(kind==="duplicate-current")await terms().update({versions:[version(),{status:"current"}]});
      if(kind==="malformed-current")await terms().update({versions:[{...version(),sections:[]}]});
      if(kind==="malformed-extra")await terms().update({versions:[version(),{status:"draft"}]});
      if(kind==="legacy")await terms().set({...version(),agreementTypeCode:"terms_of_service"});
      if(kind==="duplicate-label")await terms().update({versions:[version(),{...version(),status:"archived"}]});
      if(kind==="inactive-type")await db.collection("agreementTypes").doc("terms_of_service").update({isActive:false});
      if(kind==="malformed-type")await db.collection("agreementTypes").doc("terms_of_service").update({system:false});
      await rejected(consent,"policy-unavailable");
    });
  test("existing sync and missing customer repair preserve historical consent despite unavailable policies",async()=>{
    await call(consent);await user().update({termsVersion:"historical",privacyVersion:"historical"});
    const before=(await user().get()).data();await terms().delete();await customer().delete();
    assert.equal((await call()).created,false);const now=(await user().get()).data();
    assert.equal(now.termsVersion,"historical");assert.equal(now.privacyVersion,"historical");
    assert.deepEqual(now.termsAcceptedAt,before.termsAcceptedAt);assert.equal((await customer().get()).exists,true);
  });
  test("existing invalid acceptance is atomic and cannot repair customer",async()=>{
    await call(consent);await customer().delete();await rejected({...consent,termsPolicyVersion:"old"},"policy-version-outdated");
    await rejected({...consent,acceptedPrivacy:false},"consent-required");
  });
  test("explicit valid reacceptance updates only verified changed versions",async()=>{
    await call(consent);const before=(await user().get()).data();await terms().update({versions:[version("1.2")]});
    await call({...consent,termsPolicyVersion:"1.2"});const now=(await user().get()).data();
    assert.equal(now.termsVersion,"1.2");assert.deepEqual(now.privacyAcceptedAt,before.privacyAcceptedAt);
  });
  test("repeat requests preserve consent and creation timestamps",async()=>{
    await call(consent);const before=(await user().get()).data();assert.equal((await call(consent)).created,false);
    const now=(await user().get()).data();for(const f of ["createdAt","termsAcceptedAt","privacyAcceptedAt"])assert.deepEqual(now[f],before[f]);
  });
  for(const [patch,reason] of [[{isBlocked:true},"blocked"],[{accountStatus:"disabled"},"disabled"],[{isActive:false},"disabled"],
    [{role:"provider"},"unsupported-role"],[{role:"admin"},"unsupported-role"]])
    test("existing account security "+JSON.stringify(patch),async()=>{await call(consent);await user().update(patch);await customer().delete();
      await rejected(consent,reason,"permission-denied");});
  test("Firebase Auth disabled account cannot provision",async()=>{
    await auth.updateUser(uid,{disabled:true});await assert.rejects(call(consent),{code:"permission-denied"});
    assert.equal((await user().get()).exists,false);assert.equal((await customer().get()).exists,false);
  });
  test("unauthenticated request is rejected before profile writes",async()=>{
    await assert.rejects(call(consent,false),{code:"unauthenticated"});assert.equal((await user().get()).exists,false);
  });
  test("client cannot supply role or phone authority",async()=>{
    for(const field of ["role","phoneNumber"])await assert.rejects(call({...consent,[field]:"admin"}),{code:"invalid-argument"});
    assert.equal((await user().get()).exists,false);
  });
  test("phone projection mismatch retains fail closed repair",async()=>{
    await call(consent);await user().update({phoneNumber:"+639171234567"});await customer().delete();
    await assert.rejects(call(),{code:"failed-precondition"});assert.equal((await customer().get()).exists,false);
  });
  test("rate limit still rejects eleventh callable",async()=>{
    for(let i=0;i<10;i++)await call(consent);await assert.rejects(call(consent),{code:"resource-exhausted"});
  });
  if(concurrent){
    test("verified Auth phone owner can provision with valid consent",async()=>{
      await auth.updateUser(uid,{phoneNumber:"+639171234567"});
      await call(consent);assert.equal((await user().get()).data().phoneNumber,"+639171234567");
    });
    test("conflicting phone projection prevents consent and profile creation",async()=>{
      await auth.updateUser(uid,{phoneNumber:"+639171234567"});
      await db.collection("customers").doc("other-owner").set({phoneNumber:"+639171234567"});
      await assert.rejects(call(consent),{code:"failed-precondition"});
      assert.equal((await user().get()).exists,false);assert.equal((await customer().get()).exists,false);
    });
  }
  if(concurrent)test("concurrent duplicate provision commits one creation",async()=>{
    const results=await Promise.all([call(consent),call(consent)]);
    assert.equal(results.filter(r=>r.created).length,1);
    assert.equal((await user().get()).data().termsVersion,"1.1");
    assert.equal((await customer().get()).exists,true);
  });
  if(race)test("transaction retry revalidates a policy changed during submission",async()=>{
    race(async()=>terms().update({versions:[version("1.2")]}));
    await rejected(consent,"policy-version-outdated");
  });
};
