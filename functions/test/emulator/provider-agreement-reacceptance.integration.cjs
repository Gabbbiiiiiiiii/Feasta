// Explicit emulator guards: this suite must never write to a live project.
const assert = require("node:assert/strict");
const {before, after, test} = require("node:test");
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (!/^127\.0\.0\.1:\d+$/u.test(process.env[name] ?? "")) throw Error("Local emulator required: "+name);
}
const projectId=process.env.GCLOUD_PROJECT;
if (!projectId?.startsWith("demo-")) throw Error("Demo project required");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore,Timestamp}=require("firebase-admin/firestore");
const {assertFails}=require("@firebase/rules-unit-testing");
const {doc,updateDoc,setDoc,getDoc}=require("firebase/firestore");
const {createRulesTestEnvironment,authenticated}=require("../rules/rules-test-helpers.cjs");
const app=initializeApp({projectId});const db=getFirestore(app);const auth=getAuth(app);
const {acceptCurrentProviderAgreement}=require("../../lib/providers/accept-current-provider-agreement.js");
const {initialAgreementTypes}=require("../../lib/shared/agreement-types.js");
const uid="reaccept-owner",providerId="reaccept-provider";
let rules;
const request=data=>({data,auth:{uid,token:{}},rawRequest:{headers:{},ip:"127.0.0.1"}});
const call=data=>acceptCurrentProviderAgreement.run(request(data));
before(async()=>{
  rules=await createRulesTestEnvironment();await rules.clearFirestore();
  await auth.createUser({uid,email:"owner@feasta.test"});
  await auth.createUser({uid:"reaccept-admin",email:"admin@feasta.test"});
  await db.doc("users/"+uid).set({uid,role:"provider",providerId,accountStatus:"active",isActive:true,isBlocked:false});
  await db.doc("users/reaccept-admin").set({uid:"reaccept-admin",role:"admin",accountStatus:"active",isActive:true,isBlocked:false});
  await db.doc("providers/"+providerId).set({ownerId:uid,verificationStatus:"approved",isActive:true,businessName:"Original Business",ownerFirstName:"Original",ownerLastName:"Owner"});
  await db.doc("providerVerifications/original").set({ownerId:uid,providerId,providerAgreementAccepted:true,providerAgreementVersion:"2026-09-23",providerAgreementAcceptedAt:Timestamp.fromDate(new Date("2026-09-28T00:00:00Z"))});
  await db.doc("bookings/original").set({providerId,agreementVersion:"2026-09-23",amount:100});
  for(const type of initialAgreementTypes()) await db.doc("agreementTypes/"+type.code).set(type);
  await db.doc("agreementTemplates/provider_agreement").set({status:"active",agreementTypeCode:"provider_agreement",versions:[{
    version:"1.7",name:"Provider Agreement",effectiveDate:"2026-10-01",status:"current",
    sections:[{title:"Current terms",paragraphs:["Exact published current content."]}],
    createdAt:"2026-10-01T00:00:00Z",publishedAt:"2026-10-01T00:00:00Z",archivedAt:null,
  }]});
});
after(async()=>{await rules?.cleanup();await deleteApp(app);});
test("real Firestore concurrent confirmations commit one immutable event and one audit record",async()=>{
  const before=(await db.doc("providerVerifications/original").get()).data();
  const booking=(await db.doc("bookings/original").get()).data();
  const review=await call({action:"review"});
  assert.equal((await db.collection("providerAgreementAcceptances").get()).size,0);
  const start=Date.now();
  const payload={action:"accept",confirmed:true,version:review.agreement.version,digest:review.digest,acceptedAt:"1990-01-01"};
  const result=await Promise.all(Array.from({length:4},()=>call(payload)));
  assert.equal(result.filter(r=>r.recorded).length,1);
  const events=await db.collection("providerAgreementAcceptances").get();assert.equal(events.size,1);
  const event=events.docs[0].data();assert.deepEqual(event.snapshot,{...review.agreement,acceptedAt:event.acceptedAt});
  assert.ok(event.acceptedAt.toMillis()>=start && event.acceptedAt.toMillis()<=Date.now());
  const logs=await db.collection("adminLogs").where("action","==","provider.agreement_accepted").get();assert.equal(logs.size,1);
  const stored=events.docs[0].data();await call(payload);assert.deepEqual((await events.docs[0].ref.get()).data(),stored);
  assert.deepEqual((await db.doc("providerVerifications/original").get()).data(),before);
  assert.deepEqual((await db.doc("bookings/original").get()).data(),booking);
  assert.equal((await db.doc("providers/"+providerId).get()).data().verificationStatus,"approved");
  await assert.rejects(call({...payload,version:"1.6"}),e=>e.code==="failed-precondition");
});
test("provider and admin clients cannot write acceptance events, pointers, or legacy acceptance fields",async()=>{
  for(const [id,role] of [[uid,"provider"],["reaccept-admin","admin"]]) {
    const client=authenticated(rules,id,role).firestore();
    await assertFails(setDoc(doc(client,"providerAgreementAcceptances/forged"),{ownerId:uid,providerId}));
    await assertFails(getDoc(doc(client,"providerAgreementAcceptances/forged")));
    for(const field of ["providerAgreementCurrentAcceptanceId","providerAgreementVersion","providerAgreementAcceptedAt","providerAgreementSnapshot"]) {
      await assertFails(updateDoc(doc(client,"providers/"+providerId),{[field]:"forged"}));
    }
    await assertFails(updateDoc(doc(client,"providerVerifications/original"),{providerAgreementVersion:"forged"}));
  }
});
test("real transaction validates previous history and verification overflow before a valid second acceptance",async()=>{
  const providerRef=db.doc("providers/"+providerId),legacyRef=db.doc("providerVerifications/original");
  const originalLegacy=(await legacyRef.get()).data();
  const providerBefore=(await providerRef.get()).data();
  const previousRef=db.doc("providerAgreementAcceptances/"+providerBefore.providerAgreementCurrentAcceptanceId);
  const previous=(await previousRef.get()).data();
  const templateRef=db.doc("agreementTemplates/provider_agreement");
  const template=(await templateRef.get()).data();
  await templateRef.update({versions:[{...template.versions[0],version:"1.8"}]});
  const review=await call({action:"review"});
  const payload={action:"accept",confirmed:true,version:review.agreement.version,digest:review.digest};
  const eventCount=(await db.collection("providerAgreementAcceptances").get()).size;
  const auditCount=(await db.collection("adminLogs").get()).size;
  async function rejected() {
    await assert.rejects(call(payload),e=>e.code==="failed-precondition");
    assert.deepEqual((await providerRef.get()).data(),providerBefore);
    assert.equal((await db.collection("providerAgreementAcceptances").get()).size,eventCount);
    assert.equal((await db.collection("adminLogs").get()).size,auditCount);
    assert.deepEqual((await legacyRef.get()).data(),originalLegacy);
  }
  await previousRef.update({digest:"corrupted"});await rejected();await previousRef.set(previous);
  await previousRef.update({"snapshot.acceptedAt":Timestamp.fromMillis(0)});
  await rejected();await previousRef.set(previous);
  const extras=[];
  for(let i=0;i<10;i++) {
    const ref=db.doc("providerVerifications/overflow-"+i);extras.push(ref);await ref.set(originalLegacy);
  }
  await rejected();for(const ref of extras) await ref.delete();
  const conflictingRef=db.doc("providerVerifications/conflicting");
  await conflictingRef.set({...originalLegacy,providerAgreementVersion:"contradictory"});
  await rejected();await conflictingRef.delete();
  const result=await call(payload);assert.equal(result.recorded,true);
  const next=(await db.doc("providerAgreementAcceptances/"+result.acceptanceId).get()).data();
  assert.equal(next.previousAcceptanceId,previousRef.id);
  assert.deepEqual((await previousRef.get()).data(),previous);
  assert.deepEqual((await legacyRef.get()).data(),originalLegacy);
  assert.deepEqual((await db.doc("bookings/original").get()).data(),{providerId,agreementVersion:"2026-09-23",amount:100});
});
