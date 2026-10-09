const test = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../lib/provider-finance/provider-disbursement-domain.js");
const settlementDomain = require("../lib/provider-finance/provider-settlement-domain.js");
const {providerDisbursementTransport} = require("../lib/provider-finance/provider-disbursement-transport.js");
const {fixture,reserved,evidence} = require("./provider-disbursement-fixtures.cjs");
test("deposit and balance reserve one aggregate external attempt",()=>{
 const f=fixture(), p=domain.aggregateReservationPlan(f);assert.equal(p.externalAttempt.amountInCentavos,900000);
 assert.equal(p.reservations.length,2);assert.equal(p.externalAttempt.constituentPayoutAttemptIds.length,2);
 for(const r of p.reservations) {assert.equal(r.payoutAttemptRecord.externalAttemptId,p.externalAttempt.externalAttemptId);
 assert.equal(r.payoutAttemptRecord.externalDispatchAllowed,false);assert.equal(r.settlementUpdate.reservedAmountInCentavos,450000);}
 assert.equal(f.sources[0].earning.availableAmountInCentavos,450000);
});
test("one invalid member produces no reservation or input mutation",()=>{
 const f=fixture();f.sources[1].settlement.status="processing";const before=JSON.stringify(f);
 assert.throws(()=>domain.aggregateReservationPlan(f));assert.equal(JSON.stringify(f),before);
});
for(const [name,change] of [
 ["disabled dispatch",f=>f.dispatchEnabled=false], ["aggregate amount mismatch",f=>f.disbursement.amountInCentavos=1],
 ["refund reservation",f=>f.sources[1].payment.refundReservedAmountInCentavos=1],
 ["refund execution lock",f=>f.sources[1].payment.refundExecutionLock="locked"],
 ["payment reconciliation",f=>f.sources[0].payment.reconciliationRequired=true],
 ["wrong payment linkage",f=>f.sources[0].payment.providerId="other"],
 ["duplicate sources",f=>f.disbursement.sourceSettlementIds[1]=f.disbursement.sourceSettlementIds[0]],
 ["live destination",f=>f.destinationSnapshot.livemode=true], ["disabled transport",f=>f.transportMode="disabled"],
 ["duplicate reservation",f=>f.disbursement.status="reserved"],
 ["active external attempt",f=>f.disbursement.activePayoutAttemptId="existing"],
 ["historical policy",f=>f.disbursement.policyVersion=null],
]) test(name+" fails closed",()=>{const f=fixture();change(f);assert.throws(()=>domain.aggregateReservationPlan(f));});
test("frozen destination does not follow later account changes",()=>{
 const f=fixture(),p=domain.aggregateReservationPlan(f);f.destinationSnapshot.destinationAccount.number="456";
 assert.equal(p.externalAttempt.destinationSnapshot.destinationAccount.number,"123");
});
test("pending keeps all reservations and earning buckets locked",()=>{
 const r=reserved(),p=domain.aggregateOutcomePlan({...r,evidence:evidence(r)});assert.equal(p.disbursementUpdate.status,"processing");
 for(const x of p.plans) {assert.equal(x.settlementUpdate.status,"processing");assert.equal(x.settlementUpdate.reservedAmountInCentavos,undefined);
 assert.equal(x.earningUpdate.paidAmountInCentavos,undefined);}
});
test("success completes each settlement with exact canonical earning amounts",()=>{
 const r=reserved(),p=domain.aggregateOutcomePlan({...r,evidence:evidence(r,"succeeded")});assert.equal(p.disbursementUpdate.status,"paid");
 for(const x of p.plans) {assert.equal(x.settlementUpdate.reservedAmountInCentavos,0);assert.equal(x.earningUpdate.availableAmountInCentavos,0);
 assert.equal(x.earningUpdate.paidAmountInCentavos,450000);}
});
test("gateway fees do not reduce Provider entitlement",()=>{
 const r=reserved(),p=domain.aggregateOutcomePlan({...r,evidence:{...evidence(r,"succeeded"),fee:800}});
 assert.equal(p.plans.reduce((sum,x)=>sum+x.earningUpdate.paidAmountInCentavos,0),900000);
});
test("authoritative failure releases every reservation without marking earnings paid",()=>{
 const r=reserved(),p=domain.aggregateOutcomePlan({...r,evidence:evidence(r,"failed")});assert.equal(p.disbursementUpdate.status,"failed");
 for(const x of p.plans) {assert.equal(x.settlementUpdate.reservedAmountInCentavos,0);assert.equal(x.settlementUpdate.status,"ready");
 assert.equal(x.earningUpdate.paidAmountInCentavos,undefined);}
});
test("timeout or unresolved 409 is ambiguous and never releases reservations",()=>{
 const r=reserved(),p=domain.aggregateOutcomePlan(r);assert.equal(p.attemptUpdate.status,"ambiguous");
 for(const x of p.plans) {assert.equal(x.settlementUpdate.status,"reconciliation_required");assert.equal(x.settlementUpdate.reservedAmountInCentavos,undefined);}
});
test("ambiguous attempt cannot reserve or automatically retry",()=>{
 const r=reserved(),p=domain.aggregateOutcomePlan(r);assert.throws(()=>domain.aggregateReservationPlan({...fixture(),disbursement:{...r.disbursement,...p.disbursementUpdate}}));
});
test("new sequence has new attempt, reference and idempotency identity",()=>{
 const a=domain.externalAttemptIdentity("disbursement",1),b=domain.externalAttemptIdentity("disbursement",2);
 for(const key of Object.keys(a)) assert.notEqual(a[key],b[key]);assert.deepEqual(a,domain.externalAttemptIdentity("disbursement",1));
});
for(const [name,change] of [
 ["live mode",e=>e.livemode=true], ["wrong amount",e=>e.amount=1], ["wrong currency",e=>e.currency="USD"],
 ["wrong reference",e=>e.reference_number="other"], ["malformed resource",e=>e.id="invalid"],
 ["wrong destination",e=>e.destination_account.number="456"], ["unknown state",e=>e.status="unknown"],
]) test(name+" evidence cannot finalize",()=>{const r=reserved(),e=evidence(r,"succeeded");change(e);assert.throws(()=>domain.aggregateOutcomePlan({...r,evidence:e}));});
test("ready cannot directly become paid",()=>{
 const r=reserved();r.disbursement.status="ready";assert.throws(()=>domain.aggregateOutcomePlan({...r,evidence:evidence(r,"succeeded")}));
});
test("paid settlements cannot refund or claw back automatically",()=>{
 const r=reserved(),p=domain.aggregateOutcomePlan({...r,evidence:evidence(r,"succeeded")});
 for(let i=0;i<r.sources.length;i++) assert.throws(()=>settlementDomain.assertProviderSettlementRefundDispatchAllowed({...r.sources[i].settlement,...p.plans[i].settlementUpdate}));
});
test("reserved settlement blocks refund dispatch",()=>{for(const s of reserved().sources) assert.throws(()=>settlementDomain.assertProviderSettlementRefundDispatchAllowed(s.settlement));});
test("default transport fails closed without transfer destination configuration",async()=>{
 assert.equal(providerDisbursementTransport.capability({},{}).ready,false);await assert.rejects(providerDisbursementTransport.dispatch({}));
 assert.equal(await providerDisbursementTransport.retrieve({}),null);
});


test("fully reversed zero source remains canonical evidence without blocking a payable sibling",()=>{
 const f=fixture();const s=f.sources[0];s.earning.availableAmountInCentavos=0;s.earning.reversedAmountInCentavos=450000;
 s.settlement=settlementDomain.buildProviderSettlementPlan({earningId:s.earning.earningId,earning:s.earning,timestamp:"now"}).settlementRecord;
 f.disbursement.amountInCentavos=450000;const p=domain.aggregateReservationPlan(f);
 assert.equal(p.reservations.length,1);assert.equal(p.reservations[0].sourceIndex,1);
 assert.equal(p.externalAttempt.canonicalSourceSettlementIds.length,2);assert.equal(p.externalAttempt.sourceSettlementIds.length,1);
 assert.equal(p.externalAttempt.amountInCentavos,450000);
});

test("paid aggregate clears active identity and retains completion history and gateway", () => {
 const r=reserved(), before=JSON.stringify(r), p=domain.aggregateOutcomePlan({...r,evidence:evidence(r,"succeeded")});
 assert.equal(p.disbursementUpdate.activePayoutAttemptId,null);
 assert.equal(p.disbursementUpdate.lastPayoutAttemptId,r.attempt.externalAttemptId);
 assert.equal(p.disbursementUpdate.gatewayResourceId,"tr_test");
 assert.equal(p.disbursementUpdate.paidAt,r.timestamp);assert.equal(JSON.stringify(r),before);
});
function advance(r, outcome) {
 const p=domain.aggregateOutcomePlan({...r,...(outcome?{evidence:evidence(r,outcome)}:{})});
 Object.assign(r.disbursement,p.disbursementUpdate);Object.assign(r.attempt,p.attemptUpdate);
 p.plans.forEach((plan,i)=>{Object.assign(r.sources[i].settlement,plan.settlementUpdate);
 Object.assign(r.sources[i].earning,plan.earningUpdate);Object.assign(r.sources[i].payoutAttempt,plan.payoutAttemptUpdate);});
 return r;
}
for(const state of ["reserved","processing","ambiguous"]) for(const outcome of ["succeeded","failed","pending"]) {
 test(`trusted ${outcome} accepts persisted ${state} constituents`,()=>{
  const r=reserved();if(state!=="reserved")advance(r,state==="processing"?"pending":undefined);
  const before=JSON.stringify(r),p=domain.aggregateOutcomePlan({...r,evidence:evidence(r,outcome)});
  assert.equal(p.disbursementUpdate.status,outcome==="succeeded"?"paid":outcome==="failed"?"failed":"processing");
  assert.equal(JSON.stringify(r),before);
  if(outcome==="pending") {advance(r,"pending");assert.doesNotThrow(()=>domain.aggregateOutcomePlan({...r,evidence:evidence(r,"succeeded")}));}
 });
}
for(const outcome of ["succeeded","failed","pending",undefined]) for(const [name,corrupt] of [
 ["paid settlement",r=>r.sources[0].settlement.status="paid"],
 ["ready settlement",r=>r.sources[0].settlement.status="ready"],
 ["failed member",r=>r.sources[0].payoutAttempt.status="failed"],
 ["processing member on reservation",r=>r.sources[0].payoutAttempt.status="processing"],
 ["inconsistent review flag",r=>r.sources[0].settlement.reconciliationRequired=true],
 ["wrong earning linkage",r=>r.sources[0].payoutAttempt.earningId="other"],
 ["paid money on reservation",r=>r.sources[0].settlement.paidOutAmountInCentavos=1],
 ["pending earning",r=>r.sources[0].earning.pendingAmountInCentavos=1],
 ["mixed aggregate state",r=>r.disbursement.status="processing"],
 ["stale external settlement linkage",r=>r.sources[0].settlement.externalAttemptId="other"],
 ["dispatchable constituent",r=>r.sources[0].payoutAttempt.externalDispatchAllowed=true],
 ["duplicate member identity",r=>r.attempt.constituentPayoutAttemptIds[1]=r.attempt.constituentPayoutAttemptIds[0]],
 ["duplicate payable source",r=>r.attempt.sourceSettlementIds[1]=r.attempt.sourceSettlementIds[0]],
]) test(`${outcome??"ambiguous"} rejects ${name}`,()=>{
 const r=reserved();corrupt(r);const before=JSON.stringify(r);
 assert.throws(()=>domain.aggregateOutcomePlan({...r,...(outcome?{evidence:evidence(r,outcome)}:{})}));assert.equal(JSON.stringify(r),before);
});
test("ambiguous constituent with wrong reconciliation reason fails closed",()=>{
 const r=advance(reserved());r.sources[0].settlement.reconciliationReason="other";
 assert.throws(()=>domain.aggregateOutcomePlan({...r,evidence:evidence(r,"succeeded")}));
});
