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

for (const [label, top, expected] of [
 ['explicit top-level instructions', 'Photograph the ceremony', 'Photograph the ceremony'],
 ['explicit empty instructions', '', ''],
 ['absent top-level instructions', undefined, 'Nested provider instructions'],
]) test('marketplace preserves '+label,async()=>{
 const f=mixed(); const config=f.input.submission.selections[1].configuration;
 config.event.specialRequest='Nested provider instructions';
 if(top!==undefined)config.specialRequest=top;
 await f.disclose();const result=await submit(f.firestore,identity,f.input);
 const photo=result.providerRequestIds.map(id=>f.records['providerRequests/'+id]).find(r=>r.type==='addon');
 assert.equal(photo.specialRequest,expected);
});
for (const version of [1,2]) test('Catering schema-v'+version+' retains nested-event precedence',async()=>{
 const f=version===1?fixture():mixed();
 const config=f.input.submission.selections[0].configuration;
 config.event.specialRequest='Catering nested instructions';
 config.specialRequest='Top-level Catering instructions';
 await f.disclose();const result=await submit(f.firestore,identity,f.input);
 const catering=result.providerRequestIds.map(id=>f.records['providerRequests/'+id]).find(r=>r.providerId==='provider_001');
 assert.equal(catering.specialRequest,'Catering nested instructions');
});
