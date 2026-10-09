const {beforeEach,after,test}=require("node:test"),assert=require("node:assert/strict");
if(process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:43080")throw new Error("Local Firestore emulator required; never use a real project.");
const {initializeApp,getApps}=require("firebase-admin/app");if(!getApps().length)initializeApp({projectId:"demo-feasta-phase3"});
const {Timestamp}=require("firebase-admin/firestore");
const {db}=require("../../lib/shared/firestore.js");
const execution=require("../../lib/provider-finance/provider-disbursement-execution.js");
const {fixture,evidence}=require("../provider-disbursement-fixtures.cjs");
const {paymentIdForProviderRequestChoice,providerPaymentObligationForChoice}=require("../../lib/payments/payment-obligation.js");
const {buildProviderSettlementPlan}=require("../../lib/provider-finance/provider-settlement-domain.js");
const financial={schemaVersion:1,currency:"PHP",providerDisbursementPolicyVersion:1,grossAmountInCentavos:900000,
 requiredUpfrontAmountInCentavos:450000,remainingBalanceInCentavos:450000};
const f=fixture();f.sources=f.sources.map((s,index)=>{
 const choice=index===0?"minimum":"remaining_balance",id=paymentIdForProviderRequestChoice("provider_request_integration",choice);
 const obligation=providerPaymentObligationForChoice({financialSnapshot:financial,paymentChoice:choice});
 const earning={...s.earning,earningId:id,paymentId:id,providerRequestId:"provider_request_integration"};
 return {earning,settlement:buildProviderSettlementPlan({earningId:id,earning,timestamp:"now"}).settlementRecord,
 payment:{...s.payment,providerRequestId:"provider_request_integration",paymentId:id,providerEarningId:id,bookingId:"event",gateway:"paymongo",status:"paid",
  obligationSchemaVersion:1,paymentChoice:choice,obligationKey:obligation.obligationKey,obligationKind:obligation.obligationKind,
  paymentType:obligation.paymentType,amountInCentavos:450000,amount:4500,paidAt:Timestamp.fromMillis(1700000000000)}};
});f.disbursement.providerRequestId="provider_request_integration";f.disbursement.sourceSettlementIds=f.sources.map(s=>s.settlement.settlementId);
const anchor=Timestamp.fromDate(new Date("2026-10-01T00:00:00Z"));
const transport={capability:()=>({ready:true,transportMode:"workflow",destinationSnapshot:f.destinationSnapshot}),dispatch:async()=>null,retrieve:async()=>null};
const collections=["providerDisbursementAttempts","providerPayoutAttempts","providerDisbursements","providerSettlements","providerEarnings","payments","providerRequests","mainEvents","providerPaymentAccounts","appSettings"];
async function clear(){for(const name of collections){const docs=await db.collection(name).get();const batch=db.batch();docs.docs.forEach(d=>batch.delete(d.ref));if(docs.size)await batch.commit();}}
beforeEach(async()=>{await clear();const records={
 "providerDisbursements/disbursement":{...f.disbursement,trigger:"completed_booking",sourcePaymentIds:f.sources.map(s=>s.payment.paymentId),
  completedBookingAt:anchor,payoutEligibleAt:anchor},
 "appSettings/platform":{providerDisbursementsEnabled:true},
 "providerPaymentAccounts/provider":{schemaVersion:1,providerId:"provider",setupStatus:"ready",payoutReady:true,paymongoAccountId:"org_provider",
  activationStatus:"activated",relationshipStatus:"enabled",settlementTransportMode:"workflow",settlementTransportReady:true},
 "providerRequests/provider_request_integration":{providerRequestId:"provider_request_integration",providerId:"provider",customerId:"customer",mainEventId:"event",bookingId:"event",
  status:"completed",completedAt:anchor,financialSnapshot:financial,initialPaymentChoice:"minimum",initialPaymentId:f.sources[0].payment.paymentId,
  remainingBalancePaymentId:f.sources[1].payment.paymentId,paymentId:f.sources[1].payment.paymentId,
  settlementSchemaVersion:1,settlementStatus:"fully_settled",grossSettledAmountInCentavos:900000,outstandingAmountInCentavos:0},
 "mainEvents/event":{mainEventId:"event",bookingId:"event",customerId:"customer",providerRequestIds:["provider_request_integration"]}};
 for(const s of f.sources){records[`providerSettlements/${s.settlement.settlementId}`]=s.settlement;
 records[`providerEarnings/${s.earning.earningId}`]={...s.earning,economicSource:"payment_default_reservation_compensation"};
 records[`payments/${s.payment.paymentId}`]={...s.payment,paymentDefaultAccountingSchemaVersion:1,paymentDefaultAccountingFinalizedAt:anchor};}
 const batch=db.batch();for(const [path,data]of Object.entries(records))batch.set(db.doc(path),data);await batch.commit();});
after(async()=>{await clear();});
test("real Firestore concurrent reservation commits exactly one aggregate attempt",async()=>{
 const results=await Promise.allSettled([execution.reserveProviderDisbursement("disbursement",transport),execution.reserveProviderDisbursement("disbursement",transport)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal((await db.collection("providerDisbursementAttempts").get()).size,1);
 for(const s of f.sources)assert.equal((await db.doc(`providerSettlements/${s.settlement.settlementId}`).get()).data().status,"reserved");
});
test("real Firestore aborts all reservations when a constituent is invalid",async()=>{
 await db.doc(`providerSettlements/${f.sources[1].settlement.settlementId}`).update({status:"processing"});
 await assert.rejects(execution.reserveProviderDisbursement("disbursement",transport));
 assert.equal((await db.doc(`providerSettlements/${f.sources[0].settlement.settlementId}`).get()).data().status,"ready");
 assert.equal((await db.collection("providerDisbursementAttempts").get()).size,0);
});
test("real Firestore concurrent duplicate success moves paid buckets once",async()=>{
 const a=await execution.reserveProviderDisbursement("disbursement",transport),e=evidence({attempt:a},"succeeded");
 await Promise.all([execution.applyProviderDisbursementEvidence(a.externalAttemptId,e),execution.applyProviderDisbursementEvidence(a.externalAttemptId,e)]);
 for(const s of f.sources)assert.equal((await db.doc(`providerEarnings/${s.earning.earningId}`).get()).data().paidAmountInCentavos,450000);
 const paid=(await db.doc("providerDisbursements/disbursement").get()).data();assert.equal(paid.status,"paid");
 assert.equal(paid.activePayoutAttemptId,null);assert.equal(paid.lastPayoutAttemptId,a.externalAttemptId);
 assert.equal(paid.gatewayResourceId,e.id);
});
test("real Firestore refund reservation blocks the whole payout",async()=>{
 await db.doc(`payments/${f.sources[1].payment.paymentId}`).update({refundReservedAmountInCentavos:1});
 await assert.rejects(execution.reserveProviderDisbursement("disbursement",transport));
 assert.equal((await db.collection("providerDisbursementAttempts").get()).size,0);
});

test("real Firestore readyAt stays at first readiness across rechecks",async()=>{
 const {reconcileOne}=require("../../lib/provider-finance/provider-disbursement-reconciliation.js");
 await reconcileOne("disbursement",new Date("2026-10-09T00:00:00Z"));
 const first=(await db.doc("providerDisbursements/disbursement").get()).data().readyAt;
 assert.ok(first instanceof Timestamp);
 await reconcileOne("disbursement",new Date("2026-10-10T00:00:00Z"));
 assert.ok((await db.doc("providerDisbursements/disbursement").get()).data().readyAt.isEqual(first));
});
test("real Firestore invalid unchanged ready finance moves to review",async()=>{
 const {reconcileOne}=require("../../lib/provider-finance/provider-disbursement-reconciliation.js");
 await db.doc("providerRequests/provider_request_integration").update({status:"confirmed"});
 await assert.rejects(reconcileOne("disbursement",new Date("2026-10-09T00:00:00Z")));
 assert.equal((await db.doc("providerDisbursements/disbursement").get()).data().status,"reconciliation_required");
});
for(const status of ["ready","reserved","processing","paid"]) test(`real Firestore stale readiness failure preserves newer ${status}`,async()=>{
 const {recordReadinessReconciliationFailure}=require("../../lib/provider-finance/provider-disbursement-reconciliation.js");
 const ref=db.doc("providerDisbursements/disbursement"),stale=await ref.get();
 await ref.update({status,revision:"newer"});
 await recordReadinessReconciliationFailure(stale);
 const current=(await ref.get()).data();assert.equal(current.status,status);assert.equal(current.revision,"newer");
});
