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
function restrictCustomer(f) {
  const now = Date.now();
  f.records["customerViolationStates/customer_001"] = {schemaVersion: 1, revision: 3, pending: [],
    restriction: {id: "event_cycle_001", startedAtMs: now, untilMs: now + 7 * 86400000,
      basis: [1, 2, 3].map(n => ({id: `event_cycle_00${n}`, occurredAtMs: now - 1000}))}};
}

test("booking-only restriction rejects fresh multi-provider intake but preserves successful replay and disclosures", async () => {
  const f = fixture(); await f.disclose();
  restrictCustomer(f);
  await assert.rejects(submit(f.firestore, identity, f.input), e => e.details.reason === "customer_booking_restricted");
  assert.equal(f.commits.length, 1, "only disclosure transaction committed");
  await f.disclose();
  delete f.records["customerViolationStates/customer_001"];
  const result = await submit(f.firestore, identity, f.input);
  assert.equal(f.records[`mainEvents/${result.mainEventId}`].customerViolationPolicyVersion, 1);
  restrictCustomer(f);
  const replay = await submit(f.firestore, identity, f.input);
  assert.equal(replay.created, false); assert.equal(replay.mainEventId, result.mainEventId);
});
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

for (const count of [2, 3, 4]) test(`positive: ${count} providers create one canonical event and linked pending requests`, async () => {
  const f = fixture(count);
  await f.disclose();
  const result = await submit(f.firestore, identity, f.input);
  assert.equal(result.created, true);
  assert.equal(result.providerRequestIds.length, count);
  assert.equal(bookings(f).length, count + 1);
  const event = f.records[`mainEvents/${result.mainEventId}`];
  assert.equal(event.customerId, identity.customerId);
  assert.equal(event.status, "pending_provider_approval");
  assert.equal(event.estimatedEventTotal, count * 15000);
  assert.deepEqual(event.providerRequestIds, result.providerRequestIds);
  for (const id of result.providerRequestIds) {
    const request = f.records[`providerRequests/${id}`];
    assert.equal(request.mainEventId, result.mainEventId);
    assert.equal(request.customerId, identity.customerId);
    assert.equal(request.status, "pending"); assert.equal(request.paymentStatus, "unpaid");
    assert.equal(request.amount, 15000);
    assert.equal(request.bookingPaymentAgreement.grossAmountInCentavos, 1500000);
    assert.equal(request.packagePaymentTerms.paymentPolicy, "full_payment");
    assert.equal(request.confirmedAt, null); assert.equal(request.paymentId, null);
    assert.ok(f.reads.includes(`providers/${request.providerId}`));
    assert.ok(f.reads.includes(`packages/${request.packageId}`));
  }
  const writes = f.commits.at(-1).length;
  assert.ok(writes > count + 1, "timeline, audit and notifications are atomic with booking");
  const replay = await submit(f.firestore, identity, f.input);
  assert.equal(replay.created, false); assert.deepEqual(replay.providerRequestIds, result.providerRequestIds);
  assert.equal(bookings(f).length, count + 1); assert.equal(f.commits.at(-1).length, 0);
  f.input.submission.event.specialRequest = "changed";
  await assert.rejects(submit(f.firestore, identity, f.input), {code: "already-exists"});
});

for (const [label, mutate, expected] of [
  ["unavailable provider", f => {f.records["providers/provider_002"].isActive = false;}],
  ["stale revision", f => {f.input.submission.selections[1].configuration.expectedPackageRevision = 1;}],
  ["invalid price", f => {f.records["packages/package_002"].serviceOptions.drop_off.price = -1;}],
  ["duplicate provider", f => {f.input.submission.selections[1].providerId = "provider_001";}],
  ["conflicting provider/package", f => {f.input.submission.selections[1].packageId = "package_001";}],
  ["blocked customer", f => {f.records["users/customer_001"].isBlocked = true;}],
  ["occasion unavailable", f => {f.records["occasions/wedding"].active = false;}],
  ["maintenance", f => {f.records["maintenanceControls/intake"].intake = true;}],
  ["missing agreement", f => {delete f.input.agreementAcknowledgements;}, /Review and acknowledge each Booking/],
  ["changed agreement", f => {f.input.agreementAcknowledgements[1].agreementKey = "0".repeat(64);}, /Booking terms changed/],
  ["same-day occupancy", f => {f.occupancy.push({status: "confirmed", eventTime: "19:00", eventEndTime: "20:00"});}],
]) test(`negative: ${label} creates no event or provider request`, async () => {
  const f = fixture(); await f.disclose(); mutate(f);
  await assert.rejects(submit(f.firestore, identity, f.input), expected);
  assert.equal(bookings(f).length, 0);
});

test("negative: atomic commit failure leaves no partial booking or notification", async () => {
  const f = fixture(); await f.disclose(); const before = Object.keys(f.records);
  f.fail(); await assert.rejects(submit(f.firestore, identity, f.input), /simulated atomic commit failure/);
  assert.deepEqual(Object.keys(f.records), before);
});
test("negative: unverified identity is rejected", async () => {
  const f = fixture();
  await assert.rejects(submit(f.firestore, {...identity, emailVerified: false}, f.input), {code: "failed-precondition"});
  assert.equal(bookings(f).length, 0);
});
test("negative: callable rejects missing authentication before data access", async () => {
  await assert.rejects(callable.run({data: {}, rawRequest: {headers: {}}}), {code: "unauthenticated"});
});


const {validateAcceptanceProviderRequest: validate} = require("../lib/provider-requests/provider-request-integrity.js");
const {providerAcceptancePlan} = require("../lib/provider-requests/provider-acceptance-plan.js");
const {calculateMainEventRequestSummary} = require("../lib/provider-requests/recalculate-main-event-status.js");
const {buildProviderRequestFinancialSnapshot} = require("../lib/provider-requests/provider-request-financial-snapshot.js");
test("independent package acceptance, rejection aggregation and tamper protection", async () => {
  const f = fixture(3); await f.disclose();
  const result = await submit(f.firestore, identity, f.input);
  const event = f.records['mainEvents/' + result.mainEventId];
  const requests = result.providerRequestIds.map(id => ({id, data: () => f.records['providerRequests/' + id]}));
  for (const document of requests) {
    const request = document.data();
    const authorized = {providerId: request.providerId, requestData: request};
    const check = () => validate({authorized, mainEventData: event, now: new Date()});
    check();
    for (const [field, value] of Object.entries({providerId: 'provider_wrong', packageId: 'package_wrong',
      packageRevision: -1, amount: 1, packagePaymentTerms: null,
      services: [{...request.services[0], category: 'tampered'}]})) {
      const original = request[field]; request[field] = value;
      assert.throws(check, {code: 'failed-precondition'}, field); request[field] = original;
    }
    const financial = buildProviderRequestFinancialSnapshot({providerId: request.providerId,
      providerOwnerId: f.records['providers/' + request.providerId].ownerId, providerRequest: request, platformSettings: null, providerTaxProfile: null});
    assert.equal(financial.grossAmountInCentavos, 1500000);
  }
  for (const document of requests.slice(0,2)) {
    const plan = providerAcceptancePlan({mainEventId: result.mainEventId, mainEvent: event,
      mainEventStatus: event.status, providerRequestId: document.id, requests});
    assert.equal(plan.nextStatus, 'waiting_for_down_payment');
    document.data().status = plan.nextStatus; Object.assign(event, plan.summary);
  }
  requests[2].data().status = 'rejected';
  const summary = calculateMainEventRequestSummary(requests, event.status);
  assert.equal(summary.status, 'needs_provider_replacement');
  assert.equal(requests[0].data().status, 'waiting_for_down_payment');
  assert.equal(requests[1].data().status, 'waiting_for_down_payment');
  event.packageAssignments.pop();
  assert.throws(() => validate({authorized: {providerId: requests[0].data().providerId,
    requestData: requests[0].data()}, mainEventData: event, now: new Date()}), {code: 'failed-precondition'});
});

test("each package retains its distinct price, revision and payment authority", async () => {
  const f = fixture();
  f.records['packages/package_002'].serviceOptions.drop_off.price = 23000;
  f.records['packages/package_002'].price = 23000;
  f.records['packages/package_002'].revision = 4;
  f.input.submission.selections[1].configuration.expectedPackageRevision = 4;
  await f.disclose();
  const result = await submit(f.firestore, identity, f.input);
  const event = f.records['mainEvents/' + result.mainEventId];
  const requests = result.providerRequestIds.map(id => f.records['providerRequests/' + id]);
  assert.deepEqual(requests.map(r => r.amount), [15000, 23000]);
  assert.deepEqual(requests.map(r => r.packageRevision), [3, 4]);
  assert.equal(event.estimatedEventTotal, 38000);
  assert.equal(event.totalAmount, 38000);
  assert.equal(event.downPaymentAmount, 38000);
  assert.equal(event.marketplaceAddOnsTotal, 0);
  for (const request of requests) validate({authorized: {providerId: request.providerId,
    requestData: request}, mainEventData: event, now: new Date()});
  const request = requests[1];
  const original = request.packagePaymentTerms;
  request.packagePaymentTerms = {...original, depositRateBps: 5000};
  assert.throws(() => validate({authorized: {providerId: request.providerId,
    requestData: request}, mainEventData: event, now: new Date()}), {code: 'failed-precondition'});
});

test("independent packages can use distinct authoritative payment terms", async () => {
  const f = fixture();
  Object.assign(f.records['packages/package_002'], {paymentPolicy: 'deposit_then_balance',
    depositPercentage: 50, downPaymentPercentage: 50, balanceDueHoursBeforeEvent: 24});
  await f.disclose();
  const result = await submit(f.firestore, identity, f.input);
  const event = f.records['mainEvents/' + result.mainEventId];
  const requests = result.providerRequestIds.map(id => f.records['providerRequests/' + id]);
  assert.deepEqual(requests.map(r => r.downPaymentAmount), [15000, 7500]);
  for (const request of requests) validate({authorized: {providerId: request.providerId,
    requestData: request}, mainEventData: event, now: new Date()});
});
