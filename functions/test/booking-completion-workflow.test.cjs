const test = require('node:test');
const assert = require('node:assert/strict');
const {initializeApp, getApps} = require('firebase-admin/app');
if (!getApps().length) initializeApp({projectId: 'demo-feasta-completion'});
const {Timestamp} = require('firebase-admin/firestore');
const {db} = require('../lib/shared/firestore.js');
const paymentReader = require('../lib/payments/provider-request-payment-reader.js');
const {bookingPolicyV3Evidence} = require('../lib/bookings/booking-policy-v3.js');
const {executeProviderBookingLifecycle, completeProviderBooking} = require('../lib/provider-requests/update-provider-booking-lifecycle.js');
const {materializeBookingLifecycleV3, reconcileAutomaticBookingCompletionsV3} = require('../lib/bookings/booking-lifecycle-v3.js');
const {automaticCompletionAt} = require('../lib/bookings/booking-completion-policy.js');
const {createBookingComplaint} = require('../lib/content/booking-complaint.js');
const {providerDisbursementEligibleAt} = require('../lib/provider-finance/provider-disbursement-policy.js');
const original = {collection: db.collection, runTransaction: db.runTransaction, reader: paymentReader.readTrustedProviderRequestPaymentSetInTransaction};
const start = new Date('2026-10-16T10:00:00Z'), end = new Date('2026-10-16T12:00:00Z'), fallback = new Date('2026-10-17T12:00:00Z');
const providerActor = {kind: 'provider', uid: 'owner_owned'}, systemActor = {kind: 'system', uid: 'feasta'};
function harness() {
  const schedule = {eventDate: Timestamp.fromDate(start), eventTime: '18:00', eventEndTime: '20:00'};
  const request = {...bookingPolicyV3Evidence(start, Timestamp.fromDate), ...schedule,
    providerRequestId: 'request_owned', mainEventId: 'event_owned', bookingId: 'event_owned', customerId: 'customer_owned', providerId: 'provider_owned', providerOwnerId: 'owner_owned',
    refundPolicySnapshot: {schemaVersion:1,policyKey:'provider_default:provider_owned:v1',source:{kind:'provider_default',sourceId:'provider_owned',policyVersion:1},
      rules:[{stage:'preparation_not_started',refundBasisPoints:10000},{stage:'preparation_started',refundBasisPoints:5000},{stage:'service_started',refundBasisPoints:0}],terms:null,capturedAt:Timestamp.fromDate(start)},
    refundPolicyAgreement:{schemaVersion:1,policyKey:'provider_default:provider_owned:v1',agreedAt:Timestamp.fromDate(start),channel:'booking_submission'},
    refundEligibilityState:{schemaVersion:1,currentStage:'service_started',stageSequence:2,enteredAt:Timestamp.fromDate(start),activeCancellationRequestId:null},
    type: 'catering', status: 'in_progress', amount: 10000, downPaymentAmount: 10000, guestCount: 50,
    settlementSchemaVersion: 1, settlementStatus: 'fully_settled', grossSettledAmountInCentavos: 1000000, outstandingAmountInCentavos: 0,
    initialPaymentChoice: 'full', initialPaymentId: 'payment_owned', financialSnapshot: {schemaVersion: 1, currency: 'PHP', grossAmountInCentavos: 1000000,
      remainingBalanceInCentavos: 0, providerDisbursementPolicyVersion: 1}};
  const records = new Map([
    ['providerRequests/request_owned', request], ['mainEvents/event_owned', {...schedule, mainEventId: 'event_owned', bookingId: 'event_owned', customerId: 'customer_owned', status: 'in_progress', providerRequestIds: ['request_owned']}],
    ['providers/provider_owned', {ownerId: 'owner_owned', verificationStatus: 'approved', isActive: true}],
    ['users/owner_owned', {role: 'provider', providerId: 'provider_owned', accountStatus: 'active'}], ['appSettings/platform', {}],
    ['providerEarnings/payment_owned', {schemaVersion:1, earningId:'payment_owned', paymentId:'payment_owned', providerRequestId:'request_owned', mainEventId:'event_owned', providerId:'provider_owned', customerId:'customer_owned', currency:'PHP', earningAmountInCentavos:900000, pendingAmountInCentavos:900000, availableAmountInCentavos:0, paidAmountInCentavos:0, reversedAmountInCentavos:0}],
  ]);
  let sequence = 0, version = 0, commits = 0, retries = 0;
  const snapshot = ref => ({id: ref.id, ref, exists: records.has(ref.path), data: () => records.get(ref.path)});
  function collection(path) {
    const query = {path, filters: [], max: Infinity, cursor: null,
      doc(id = 'generated_' + (++sequence)) {return reference(path + '/' + id);},
      where(field, op, value) {return {...this, filters: [...this.filters, [field,op,value]]};},
      limit(max) {return {...this, max};}, orderBy() {return this;}, startAfter(cursor) {return {...this, cursor};},
      async get() {return querySnapshot(this);}};
    return query;
  }
  function reference(path) {return {path, id: path.split('/').at(-1), collection: name => collection(path + '/' + name),
    get: async function() {return snapshot(this);}, set: async function(data) {records.set(path, data);version++;}};}
  function querySnapshot(query) {
    let docs = [...records.keys()].filter(path => path.startsWith(query.path + '/') && path.split('/').length === query.path.split('/').length + 1)
      .map(reference).sort((a,b) => a.id.localeCompare(b.id)).filter(ref => !query.cursor || ref.id > query.cursor)
      .filter(ref => query.filters.every(([field, op, value]) => op === '==' ? records.get(ref.path)[field] === value : false)).slice(0, query.max).map(snapshot);
    return {docs, size: docs.length};
  }
  db.collection = collection;
  db.runTransaction = async callback => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const observed = version, writes = [];let wrote = false;
      const tx = {get: async ref => {assert.equal(wrote, false, 'all reads precede writes'); return ref.filters ? querySnapshot(ref) : snapshot(ref);},
        update: (ref,data) => {wrote=true;writes.push(['update',ref,data]);}, create: (ref,data) => {wrote=true;writes.push(['create',ref,data]);}, set: (ref,data) => {wrote=true;writes.push(['set',ref,data]);}};
      const result = await callback(tx);
      if (observed !== version) {retries++;continue;}
      for (const [mode, ref] of writes) if (mode === 'create') assert.equal(records.has(ref.path), false, 'create once');
      for (const [mode,ref,data] of writes) records.set(ref.path, mode === 'update' ? {...records.get(ref.path), ...data} : data);
      if(writes.length) {version++;commits++;}
      return result;
    }
    throw new Error('retry limit');
  };
  paymentReader.readTrustedProviderRequestPaymentSetInTransaction = async () => ({mode: 'p5', payments: [{id:'payment_owned',data:{status:'paid'}}], settlement: {fullySettled: true, outstandingAmountInCentavos: 0}});
  return {records, request, get commits() {return commits;}, get retries() {return retries;}, count: prefix => [...records.keys()].filter(key => key.startsWith(prefix)).length};
}
test.afterEach(() => {db.collection=original.collection;db.runTransaction=original.runTransaction;paymentReader.readTrustedProviderRequestPaymentSetInTransaction=original.reader;});
function complete(actor, now) {return executeProviderBookingLifecycle('request_owned', 'completed', actor, now);}
function assertFinancials(h, now) {
  assert.equal(h.records.get('providerEarnings/payment_owned').availableAmountInCentavos, 900000);
  assert.equal(h.records.get('providerEarnings/payment_owned').pendingAmountInCentavos, 0);
  assert.equal(h.count('providerSettlements/'), 1);assert.equal(h.count('providerDisbursements/'), 1);
  const disbursement=[...h.records.entries()].find(([key]) => key.startsWith('providerDisbursements/'))[1];
  assert.equal(disbursement.payoutEligibleAt.toMillis(), providerDisbursementEligibleAt({anchor: now, trigger: 'completed_booking'}).getTime());
  assert.equal(disbursement.status, 'scheduled');assert.equal(disbursement.transportReady, false);
}
test('manual completion at trusted end releases earnings once and retains three banking days', async () => {
  const h=harness();assert.equal((await complete(providerActor,end)).changed,true);assertFinancials(h,end);
  assert.equal((await complete(providerActor,fallback)).changed,false);assert.equal(h.commits,1);
  assert.equal(h.request.eventDate.toMillis(), start.getTime());
});
test('automatic fallback and repeated scheduler execution create one system timeline/audit and two notifications', async () => {
  const h=harness();await reconcileAutomaticBookingCompletionsV3(fallback);await reconcileAutomaticBookingCompletionsV3(fallback);
  assertFinancials(h,fallback);assert.equal(h.count('mainEvents/event_owned/timeline/'),1);assert.equal(h.count('notifications/'),2);assert.equal(h.count('adminLogs/'),1);
  const timeline=[...h.records.entries()].find(([key]) => key.startsWith('mainEvents/event_owned/timeline/'))[1];assert.equal(timeline.createdByRole,'system');
  assert.equal(h.records.get('providerRequests/request_owned').completionSource,'automatic_fallback');
});
test('early manual and automatic completion reject without financial writes', async () => {
  const h=harness();await assert.rejects(complete(providerActor,new Date(end.getTime()-1)),/completion time/);
  await assert.rejects(complete(systemActor,new Date(fallback.getTime()-1)),/not due/);assert.equal(h.commits,0);
});
for (const [name, patch] of [['outstanding payment',{outstandingAmountInCentavos:1}],['settlement hold',{settlementStatus:'deposit_settled'}],['refund lock',{refundExecutionLock:{}}],['dispute',{activeDisputeId:'dispute'}],['unknown dispute',{disputeStatus:'unknown'}],['cancellation',{activeCancellationRequestId:'cancel'}],['reconciliation',{reconciliationRequired:true}]]) {
  test(name + ' blocks completion', async () => {const h=harness();Object.assign(h.request,patch);await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);});
}
for (const status of ['submitted','under_review','awaiting_customer','awaiting_provider','awaiting_response','escalated','unknown']) {
 test('unresolved complaint '+status+' blocks both completion authorities',async()=>{const h=harness();h.records.set('complaints/one',{providerId:'provider_owned',userId:'customer_owned',status});
 await assert.rejects(complete(systemActor,fallback));await assert.rejects(complete(providerActor,end));assert.equal(h.commits,0);});
}
test('resolved authoritative complaint allows completion',async()=>{
 const h=harness();h.records.set('complaints/one',{providerId:'provider_owned',status:'resolved',resolvedAt:Timestamp.fromDate(end),resolvedBy:'admin'});
 await complete(systemActor,fallback);assertFinancials(h,fallback);
});

test('customer intake blocks both completion authorities until admin resolution evidence exists', async () => {
 const h = harness(); const {complaintId} = await createBookingComplaint('customer_owned', {
   providerRequestId: 'request_owned', category: 'service_quality'}, 'The service did not match our agreement.');
 const commits = h.commits;
 await assert.rejects(complete(providerActor, end)); await assert.rejects(complete(systemActor, fallback)); assert.equal(h.commits, commits);
 const complaint = h.records.get('complaints/' + complaintId);
 Object.assign(complaint, {status: 'resolved', resolvedAt: Timestamp.fromDate(end), resolvedBy: 'admin_owned'});
 await complete(systemActor, fallback); assertFinancials(h, fallback);
});
for (const scope of [{providerRequestId: 'request_owned'}, {bookingId: 'event_owned'}, {mainEventId: 'event_owned'}]) {
 test('direct scope query blocks despite missing or wrong party fields ' + JSON.stringify(scope), async () => {
  const h = harness(); h.records.set('complaints/scoped', {...scope, providerId: 'provider_wrong', userId: 'customer_wrong', status: 'submitted'});
  // Request linkage is authoritative; event-only linkage with another provider is a separate service.
  if (scope.providerRequestId) {
   await assert.rejects(complete(providerActor, end)); await assert.rejects(complete(systemActor, fallback)); assert.equal(h.commits, 0);
  } else {
   h.records.get('complaints/scoped').providerId = null;
   await assert.rejects(complete(providerActor, end)); await assert.rejects(complete(systemActor, fallback)); assert.equal(h.commits, 0);
  }
 });
}
for (const scope of [{providerRequestId: 'request_other'}, {bookingId: 'event_other'}, {mainEventId: 'event_other'}]) {
 test('scoped complaint for another booking/service does not block shared parties ' + JSON.stringify(scope), async () => {
  const h = harness(); h.records.set('complaints/scoped', {...scope, providerId: 'provider_owned', userId: 'customer_owned', status: 'submitted'});
  await complete(systemActor, fallback); assertFinancials(h, fallback);
 });
}
for (const status of ['resolved', 'dismissed', 'closed']) {
 test('booking-linked ' + status + ' requires admin metadata; reopen blocks again', async () => {
  const h = harness(); const complaint = {providerRequestId: 'request_owned', status}; h.records.set('complaints/scoped', complaint);
  await assert.rejects(complete(systemActor, fallback)); complaint.resolvedAt = Timestamp.fromDate(end);
  await assert.rejects(complete(providerActor, end)); complaint.resolvedBy = '   ';
  await assert.rejects(complete(systemActor, fallback)); complaint.resolvedBy = 'admin_owned';
  Object.assign(complaint, {status: 'under_review', resolvedAt: null, resolvedBy: null});
  await assert.rejects(complete(providerActor, end)); await assert.rejects(complete(systemActor, fallback)); assert.equal(h.commits, 0);
  Object.assign(complaint, {status, resolvedAt: Timestamp.fromDate(end), resolvedBy: 'admin_owned'});
  await complete(providerActor, end); assertFinancials(h, end);
 });
}
test('malformed scope retains conservative legacy protection and deleted reports still block', async () => {
 const h = harness(); h.records.set('complaints/scoped', {bookingId: '', providerId: 'provider_owned', status: 'submitted', isDeleted: true});
 await assert.rejects(complete(systemActor, fallback)); assert.equal(h.commits, 0);
});
test('unavailable payment authority and missing earning fail closed',async()=>{const h=harness();paymentReader.readTrustedProviderRequestPaymentSetInTransaction=async()=>{throw new Error('unavailable');};
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
 paymentReader.readTrustedProviderRequestPaymentSetInTransaction=async()=>({mode:'p5',payments:[{id:'payment_owned',data:{status:'paid'}}],settlement:{fullySettled:true,outstandingAmountInCentavos:0}});
 h.records.delete('providerEarnings/payment_owned');await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
});
test('parent schedule mismatch and ineligible provider owner fail closed',async()=>{const h=harness();h.records.get('mainEvents/event_owned').eventEndTime='21:00';await assert.rejects(complete(systemActor,fallback));
 h.records.get('mainEvents/event_owned').eventEndTime='20:00';h.records.get('users/owner_owned').accountStatus='blocked';await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
});
test('concurrent manual/automatic completion retries and releases exactly once',async()=>{const h=harness();const results=await Promise.all([complete(providerActor,fallback),complete(systemActor,fallback)]);
 assert.equal(results.filter(result=>result.changed).length,1);assert.equal(h.commits,1);assert.ok(h.retries>0);assertFinancials(h,fallback);assert.equal(h.count('mainEvents/event_owned/timeline/'),1);
});
test('scheduler next transition retains fallback; completed rerun is harmless',async()=>{const h=harness();await materializeBookingLifecycleV3('request_owned',end);
 assert.equal(h.records.get('providerRequests/request_owned').lifecycleNextTransitionAt.toMillis(),automaticCompletionAt(h.request).getTime());
 await materializeBookingLifecycleV3('request_owned',fallback);await materializeBookingLifecycleV3('request_owned',fallback);assertFinancials(h,fallback);
});
test('callable still rejects unauthenticated users even with system actor supplied',async()=>{await assert.rejects(completeProviderBooking.run({data:{providerRequestId:'request_owned',actor:{kind:'system'}},auth:null,rawRequest:{headers:{}}}),error=>error.code==='unauthenticated');});

test('missing refund or disbursement authority blocks automatic completion',async()=>{
 const h=harness();delete h.request.refundPolicySnapshot;delete h.request.refundPolicyAgreement;delete h.request.refundEligibilityState;
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
});
test('missing disbursement contract blocks automatic completion',async()=>{
 const h=harness();delete h.request.financialSnapshot.providerDisbursementPolicyVersion;
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
});
test('customer unscoped and deleted unresolved complaints fail closed',async()=>{
 const h=harness();h.records.set('complaints/one',{userId:'customer_owned',providerId:null,status:'submitted',isDeleted:true});
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
});
test('complaint query overflow and unavailable reads fail closed',async()=>{
 const h=harness();for(let i=0;i<101;i++)h.records.set('complaints/'+i,{providerId:'provider_owned',status:'resolved',resolvedAt:Timestamp.fromDate(end),resolvedBy:'admin'});
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
 const collection=db.collection;db.collection=path=>{if(path==='complaints')throw new Error('complaint authority unavailable');return collection(path);};
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
});
test('concurrent automatic/automatic executions release once',async()=>{
 const h=harness();const results=await Promise.all([complete(systemActor,fallback),complete(systemActor,fallback)]);
 assert.equal(results.filter(result=>result.changed).length,1);assert.equal(h.commits,1);assertFinancials(h,fallback);assert.equal(h.count('notifications/'),2);
});

for (const patch of [{status:'refunded'},{status:'partially_refunded'},{status:'paid',refundReservedAmountInCentavos:1},{status:'paid',refundedAmountInCentavos:1}]) {
 test('trusted payment refund evidence '+JSON.stringify(patch)+' blocks completion',async()=>{
  const h=harness();paymentReader.readTrustedProviderRequestPaymentSetInTransaction=async()=>({mode:'p5',payments:[{id:'payment_owned',data:patch}],settlement:{fullySettled:true,outstandingAmountInCentavos:0}});
  await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
 });
}

for (const patch of [{verificationStatus:'under_review'},{isActive:false},{isSuspended:true},{isDeleted:true}]) {
 test('provider eligibility '+JSON.stringify(patch)+' blocks fallback',async()=>{const h=harness();Object.assign(h.records.get('providers/provider_owned'),patch);
  await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
 });
}
test('invalid canonical relationships block fallback',async()=>{const h=harness();h.records.get('mainEvents/event_owned').providerRequestIds=['different_request'];
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
});

for (const actor of [providerActor, systemActor]) {
 for (const enrollment of [undefined,null,0,2,'1']) {
  test(actor.kind+' completion rejects unproven/malformed v3 enrollment '+String(enrollment),async()=>{
   const h=harness();h.request.financialSnapshot.providerDisbursementPolicyVersion=enrollment;
   await assert.rejects(complete(actor,fallback),/canonical disbursement contract/);assert.equal(h.commits,0);
   assert.equal(h.count('providerSettlements/'),0);assert.equal(h.count('providerDisbursements/'),0);
  });
 }
 test(actor.kind+' completion preserves lifecycle reconciliation block',async()=>{
  const h=harness();h.request.lifecycleReconciliationRequired=true;
  await assert.rejects(complete(actor,fallback));assert.equal(h.commits,0);
 });
 test(actor.kind+' completion rejects unpaid canonical authority',async()=>{
  const h=harness();paymentReader.readTrustedProviderRequestPaymentSetInTransaction=async()=>({mode:'p5',payments:[{id:'payment_owned',data:{status:'pending'}}],settlement:{fullySettled:true,outstandingAmountInCentavos:0}});
  await assert.rejects(complete(actor,fallback));assert.equal(h.commits,0);
 });
}

test('existing pre-canonical manual contract completes without inventing settlements or enrollment',async()=>{
 const h=harness();
 for(const field of ['remainingBalanceTimingSchemaVersion','financialSnapshot','settlementSchemaVersion','settlementStatus','grossSettledAmountInCentavos','outstandingAmountInCentavos']) delete h.request[field];
 // Legacy completion is the existing provider-only path; automatic eligibility is never inferred.
 await assert.rejects(complete(systemActor,fallback));assert.equal(h.commits,0);
 await complete(providerActor,end);assert.equal(h.count('providerSettlements/'),0);assert.equal(h.count('providerDisbursements/'),0);
 assert.equal(h.records.get('providerEarnings/payment_owned').availableAmountInCentavos,0);
 assert.equal((await complete(providerActor,fallback)).changed,false);
});

test('pre-v3 canonical payment records cannot evade enrollment or paid-source checks',async()=>{
 const h=harness();delete h.request.remainingBalanceTimingSchemaVersion;
 delete h.request.financialSnapshot.providerDisbursementPolicyVersion;
 await assert.rejects(complete(providerActor,end),/canonical disbursement contract/);assert.equal(h.commits,0);
 h.request.financialSnapshot.providerDisbursementPolicyVersion=1;
 paymentReader.readTrustedProviderRequestPaymentSetInTransaction=async()=>({mode:'p5',payments:[{id:'payment_owned',data:{status:'refunded'}}],settlement:{fullySettled:true,outstandingAmountInCentavos:0}});
 await assert.rejects(complete(providerActor,end));assert.equal(h.commits,0);
});
