"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.GCLOUD_PROJECT = "demo-feasta-multi-provider-submission-test";
process.env.GCP_PROJECT = process.env.GCLOUD_PROJECT;
const {initializeApp} = require("firebase-admin/app");
initializeApp({projectId: "demo-feasta-multi-provider-submission-test"});
const {db} = require("../lib/shared/firestore.js");
const {makeEnvelope, makeRecords} = require("./multi-provider-submission-fixture.cjs");
const {submitAuthorizedMultiProviderBooking: submit, submitMultiProviderBookingRequest: callable} =
  require("../lib/bookings/submit-multi-provider-booking.js");

const identity = {customerId: "customer_001", emailVerified: true, phoneNumber: "+639171234567"};
function fixture(count = 2) {
  const records = makeRecords();
  records["users/customer_001"] = {role: "customer", accountStatus: "active", isActive: true,
    isBlocked: false, isPhoneVerified: true, phoneNumber: identity.phoneNumber};
  records["customers/customer_001"] = {firstName: "Test", lastName: "Customer", email: "test@example.invalid"};
  const submission = makeEnvelope();
  for (let index = 3; index <= count; index++) {
    for (const [collection, prefix] of [["providers", "provider"], ["packages", "package"], ["users", "owner"]]) {
      records[`${collection}/${prefix}_00${index}`] = {...records[`${collection}/${prefix}_001`]};
    }
    Object.assign(records[`providers/provider_00${index}`], {ownerId: `owner_00${index}`});
    Object.assign(records[`packages/package_00${index}`], {providerId: `provider_00${index}`});
    Object.assign(records[`users/owner_00${index}`], {providerId: `provider_00${index}`});
    submission.selections.push({...submission.selections[0], providerId: `provider_00${index}`, packageId: `package_00${index}`});
  }
  const reads = [];
  const commits = [];
  let failCommit = false;
  // Real SDK references/queries, completely in-memory transaction execution.
  const firestore = {
    collection: name => db.collection(name), doc: path => db.doc(path),
    async runTransaction(work) {
      const queued = [];
      const tx = {
        async get(ref) {
          assert.equal(queued.length, 0, "all reads must precede writes");
          const options = ref._queryOptions;
          if (!ref.path && options) {
            const collection = options.collectionId;
            reads.push(collection);
            if (collection === "occasions") return {docs: Object.entries(records).filter(([path]) => path.startsWith("occasions/"))
              .map(([path, data]) => ({id: path.split("/").pop(), data: () => data})), size: 1, empty: false};
            assert.equal(collection, "providerRequests");
            return {docs: occupancy.map((data, index) => ({id: `occupied_${index}`, data: () => data}))};
          }
          reads.push(ref.path);
          return {id: ref.id, exists: Object.hasOwn(records, ref.path), data: () => records[ref.path]};
        },
        create(ref, data) {assert.equal(Object.hasOwn(records, ref.path), false); queued.push([ref.path, data]);},
        set(ref, data) {queued.push([ref.path, data]);},
        update(ref, data) {assert.ok(records[ref.path]); queued.push([ref.path, {...records[ref.path], ...data}]);},
      };
      const result = await work(tx);
      if (failCommit) throw new Error("simulated atomic commit failure");
      for (const [path, data] of queued) records[path] = data;
      commits.push(queued);
      return result;
    },
  };
  const occupancy = [];
  const input = {submission};
  const disclose = async () => {
    const result = await submit(firestore, identity, input, true);
    input.agreementAcknowledgements = result.agreements.map(({providerId, agreementKey}) => ({providerId, agreementKey}));
    input.policyAcknowledgements = [];
    return result;
  };
  return {records, input, firestore, reads, commits, occupancy, disclose, fail: () => {failCommit = true;}};
}
function bookings(f) {return Object.keys(f.records).filter(path => /^(mainEvents|providerRequests)\/[^/]+$/.test(path));}


const {createHash} = require('node:crypto');
const {validateAcceptanceProviderRequest: validate} = require('../lib/provider-requests/provider-request-integrity.js');
function mixed() {
 const f=fixture(); const e=f.input.submission;
 e.schemaVersion=2; e.selections[0].kind='catering_package';
 e.selections[1]={kind:'marketplace_service',providerId:'provider_002',serviceId:'photography_001',expectedRevision:3,configuration:{event:{...e.event}}};
 Object.assign(f.records['providers/provider_002'],{providerServiceType:'addon',serviceCategories:['photographer']});
 Object.assign(f.records['packages/package_001'],{paymentPolicy:'deposit_then_balance',depositPercentage:50,downPaymentPercentage:50,balanceDueHoursBeforeEvent:24});
 f.records['serviceCategories/photographer']={code:'photographer',name:'Photography',serviceType:'addon',status:'active'};
 f.records['addons/photography_001']={providerId:'provider_002',ownerId:'owner_002',name:'Wedding Photography',category:'photographer',price:12000,pricingType:'fixed',revision:3,status:'published',isPublished:true,isActive:true,isAvailable:true,isDeleted:false};
 return f;
}

const {Timestamp} = require('firebase-admin/firestore');
const {providerAcceptancePlan} = require('../lib/provider-requests/provider-acceptance-plan.js');
function requiredRefunds(f) {
 f.records['appSettings/refundPolicyBookingAgreement']={schemaVersion:1,isPublic:false,enforcementMode:'required'};
 for(const [i,id] of ['provider_001','provider_002'].entries()) f.records['providers/'+id].refundPolicy={
  schemaVersion:1,policyVersion:i+1,rules:['preparation_not_started','preparation_started','service_started'].map((stage,j)=>({stage,refundBasisPoints:[9000,4000,0][j]})),
  terms:'Provider '+id,effectiveAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))};
}
async function reviewRefunds(f) {
 requiredRefunds(f); const disclosure=await f.disclose();
 f.input.policyAcknowledgements=disclosure.refundPolicies.policies.map(({providerId,effectivePolicyKey})=>({providerId,effectivePolicyKey}));
 return disclosure;
}
test('review: required refunds produce separate evidence and acknowledgement rejection receipts',async()=>{
 const f=mixed(); const d=await reviewRefunds(f); assert.equal(d.refundPolicies.policies.length,2);
 const result=await submit(f.firestore,identity,f.input);
 for(const id of result.providerRequestIds){const r=f.records['providerRequests/'+id];
  assert.equal(r.refundPolicySnapshot.source.sourceId,r.providerId);
  assert.equal(r.refundPolicyAgreement.policyKey,r.refundPolicySnapshot.policyKey);
 }
 for(const changed of [false,true]){
  const bad=mixed(); await reviewRefunds(bad);
  if(changed)bad.input.policyAcknowledgements[1].effectivePolicyKey='provider_default:provider_002:v999';
  else delete bad.input.policyAcknowledgements;
  await assert.rejects(submit(bad.firestore,identity,bad.input)); assert.equal(bookings(bad).length,0);
  assert.equal(Object.keys(bad.records).filter(p=>p.startsWith('bookingSubmissionOutcomes/')).length,1);
  await assert.rejects(submit(bad.firestore,identity,bad.input)); assert.equal(bookings(bad).length,0);
 }
});
test('review: marketplace-first order retains assignment finances and independent response',async()=>{
 const f=mixed(); f.input.submission.selections.reverse(); await f.disclose();
 const result=await submit(f.firestore,identity,f.input); const event=f.records['mainEvents/'+result.mainEventId];
 const docs=result.providerRequestIds.map(id=>({id,data:()=>f.records['providerRequests/'+id]}));
 for(const doc of docs)validate({authorized:{providerId:doc.data().providerId,requestData:doc.data()},mainEventData:event,now:new Date()});
 const plan=providerAcceptancePlan({mainEventId:result.mainEventId,mainEvent:event,mainEventStatus:event.status,providerRequestId:docs[0].id,requests:docs});
 assert.equal(plan.overrides.length,1); assert.equal(plan.overrides[0].providerRequestId,docs[0].id);
 assert.equal(docs[1].data().status,'pending'); assert.equal(docs[1].data().amount,15000);
 assert.equal(event.totalAmount,27000);assert.equal(event.pendingProviderRequestCount,2);
});
test('review: marketplace top-level provider instructions survive nested shared event',async()=>{
 const f=mixed();f.input.submission.selections[1].configuration.specialRequest='Photograph the ceremony';
 await f.disclose();const result=await submit(f.firestore,identity,f.input);
 const photo=result.providerRequestIds.map(id=>f.records['providerRequests/'+id]).find(r=>r.type==='addon');
 assert.equal(photo.specialRequest,'Photograph the ceremony');
});
