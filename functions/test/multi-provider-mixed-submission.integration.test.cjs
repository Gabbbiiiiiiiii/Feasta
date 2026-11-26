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
test("catering and mixed bookings disclose the same canonical catering timing and allocations", async () => {
  const legacy = fixture();
  const combined = mixed();
  Object.assign(legacy.records["packages/package_001"], combined.records["packages/package_001"]);
  const {agreements: [legacyCatering]} = await legacy.disclose();
  const {agreements: [mixedCatering, media]} = await combined.disclose();

  for (const field of [
    "eventStartAt", "preparationStartsAt", "hardPaymentDeadlineAt",
    "grossAmountInCentavos", "requiredUpfrontAmountInCentavos", "remainingBalanceInCentavos",
    "paymentDefaultAllocation",
  ]) {
    assert.deepEqual(mixedCatering[field], legacyCatering[field], field);
  }
  assert.deepEqual(mixedCatering.paymentDefaultAllocation, {
    schemaVersion: 1,
    paidDepositInCentavos: 751500,
    customerRefundRateBps: 7000,
    providerReservationCompRateBps: 2000,
    feastaCancellationFeeRateBps: 1000,
    customerDefaultRefundAmountInCentavos: 526050,
    providerReservationCompAmountInCentavos: 150300,
    feastaCancellationFeeAmountInCentavos: 75150,
  });
  assert.equal(media.eventStartAt, mixedCatering.eventStartAt);
  assert.equal(media.preparationStartsAt, mixedCatering.preparationStartsAt);
  assert.equal(media.requiredUpfrontAmountInCentavos, media.grossAmountInCentavos);
  assert.equal(media.remainingBalanceInCentavos, 0);
  assert.equal(media.paymentDefaultAllocation, null);
});

test('mixed atomic submission preserves independent finances, real acceptance and idempotency',async()=>{
 const f=mixed(); await f.disclose(); const result=await submit(f.firestore,identity,f.input);
 const event=f.records['mainEvents/'+result.mainEventId];
 const requests=result.providerRequestIds.map(id=>f.records['providerRequests/'+id]);
 assert.equal(bookings(f).length,3); assert.equal(event.packageAssignmentVersion,2);
 assert.equal(event.providerAssignments.length,2); assert.equal(event.totalAmount,27054);
 assert.equal(event.cateringSubtotal,15030); assert.equal(event.marketplaceAddOnsTotal,12024);
 assert.deepEqual(requests.map(r=>r.downPaymentAmount),[7515,12024]);
 assert.deepEqual(requests.map(r=>r.remainingBalance),[7515,0]);
 assert.deepEqual(requests.map(r=>r.initialPaymentEligibility.depositEligible),[true,false]);
 assert.equal(event.downPaymentAmount,19539);
 for(const r of requests){
  assert.equal(r.providerRequestId,createHash('sha256').update(result.mainEventId+':'+r.type+':'+r.providerId).digest('hex').slice(0,40));
  validate({authorized:{providerId:r.providerId,requestData:r},mainEventData:event,now:new Date()});
 }
 const photo=requests[1]; assert.equal(photo.assignmentKind,'independent_marketplace_service');
 assert.equal(photo.packageId,null); assert.equal(photo.packageName,null); assert.equal(photo.packagePaymentTerms,null);
 assert.equal(photo.selectedAddOns[0].addonId,'photography_001');
 const replay=await submit(f.firestore,identity,f.input); assert.equal(replay.created,false); assert.equal(bookings(f).length,3);
 f.input.submission.event.specialRequest='conflict';
 await assert.rejects(submit(f.firestore,identity,f.input),{code:'already-exists'});
});
for(const [label,mutate] of [
 ['inactive category',f=>f.records['serviceCategories/photographer'].status='inactive'],
 ['wrong category type',f=>f.records['serviceCategories/photographer'].serviceType='catering'],
 ['missing provider category',f=>f.records['providers/provider_002'].serviceCategories=[]],
 ['unavailable provider',f=>f.records['providers/provider_002'].isActive=false],
 ['invalid ownership',f=>f.records['addons/photography_001'].ownerId='owner_wrong'],
 ['unpublished service',f=>f.records['addons/photography_001'].isPublished=false],
 ['unavailable service',f=>f.records['addons/photography_001'].isAvailable=false],
 ['stale revision',f=>f.records['addons/photography_001'].revision=4],
 ['forged client price',f=>f.input.submission.selections[1].configuration.price=1],
 ['duplicate provider',f=>f.input.submission.selections[1].providerId='provider_001'],
 ['mismatched schedule',f=>f.input.submission.selections[1].configuration.event.eventTime='11:00'],
 ['expired deadline',f=>{f.input.submission.event.eventDate='2020-01-01';for(const s of f.input.submission.selections)s.configuration.event.eventDate='2020-01-01';}],
 ['missing payment agreement',f=>delete f.input.agreementAcknowledgements],
 ['altered payment agreement',f=>f.input.agreementAcknowledgements[1].agreementKey='0'.repeat(64)],
 ['occupancy',f=>f.occupancy.push({status:'confirmed',eventTime:'10:00',eventEndTime:'18:00'})],
])test('mixed rejects '+label+' atomically',async()=>{
 const f=mixed(); await f.disclose(); mutate(f);
 await assert.rejects(submit(f.firestore,identity,f.input)); assert.equal(bookings(f).length,0);
});

test('standalone photography package supports review, booking and replay', async () => {
  const f = mixed();
  f.input.submission.selections.shift();
  const review = await f.disclose();
  assert.equal(review.agreements.length, 1);
  assert.equal(review.agreements[0].grossAmountInCentavos, 1202400);
  assert.equal(review.agreements[0].serviceSubtotalInCentavos, 1200000);
  assert.equal(review.agreements[0].platformFeeInCentavos, 2400);
  assert.equal(review.agreements[0].platformCommissionRateBps, 20);
  assert.equal(bookings(f).length, 0);

  const result = await submit(f.firestore, identity, f.input);
  const event = f.records['mainEvents/' + result.mainEventId];
  assert.equal(event.cateringSubtotal, 0);
  assert.equal(event.totalAmount, 12024);
  assert.equal(result.providerRequestIds.length, 1);
  const request = f.records['providerRequests/' + result.providerRequestIds[0]];
  assert.equal(request.assignmentKind, 'independent_marketplace_service');
  assert.equal(request.downPaymentAmount, 12024);
  assert.equal(request.remainingBalance, 0);
  assert.equal((await submit(f.firestore, identity, f.input)).created, false);
});

test('standalone purchase rejects other event service categories', async () => {
  const f = mixed();
  f.input.submission.selections.shift();
  f.records['addons/photography_001'].category = 'photobooth';
  await assert.rejects(f.disclose(), /Standalone booking/);
  assert.equal(bookings(f).length, 0);
});

test('standalone legacy videography requires the disclosed refund policy', async () => {
  const f = mixed();
  f.input.submission.selections.shift();
  f.input.submission.selections[0].expectedRevision = 0;
  const service = f.records['addons/photography_001'];
  delete service.revision;
  service.category = 'videographer';
  const provider = f.records['providers/provider_002'];
  provider.serviceCategories = ['videographer'];
  f.records['serviceCategories/videographer'] = {
    code: 'videographer', name: 'Videography', serviceType: 'addon', status: 'active',
  };
  f.records['appSettings/refundPolicyBookingAgreement'] = {
    schemaVersion: 1, isPublic: false, enforcementMode: 'required',
  };
  provider.refundPolicy = {
    schemaVersion: 1, policyVersion: 1,
    effectiveAt: require('firebase-admin/firestore').Timestamp.fromMillis(0),
    terms: null,
    rules: ['preparation_not_started', 'preparation_started', 'service_started']
      .map((stage, index) => ({stage, refundBasisPoints: [10000, 5000, 0][index]})),
  };

  const {refundPolicies} = await f.disclose();
  assert.equal(refundPolicies.acknowledgementsRequired, true);
  await assert.rejects(submit(f.firestore, identity, f.input));
  assert.equal(bookings(f).length, 0);
  f.input.submission.clientRequestId = "videography_refund_retry";
  f.input.policyAcknowledgements = refundPolicies.policies
    .map(({providerId, effectivePolicyKey}) => ({providerId, effectivePolicyKey}));
  assert.equal((await submit(f.firestore, identity, f.input)).created, true);
});
