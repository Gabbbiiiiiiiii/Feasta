const domain = require("../lib/provider-finance/provider-disbursement-domain.js");
const settlementDomain = require("../lib/provider-finance/provider-settlement-domain.js");
function fixture() {
 const sources = ["deposit", "balance"].map(id => {
  const earning = {schemaVersion:1, earningId:id, paymentId:id, providerRequestId:"request", mainEventId:"event",
   providerId:"provider", customerId:"customer", currency:"PHP", earningAmountInCentavos:450000,
   pendingAmountInCentavos:0, availableAmountInCentavos:450000, paidAmountInCentavos:0, reversedAmountInCentavos:0};
  const settlement = settlementDomain.buildProviderSettlementPlan({earningId:id,earning,timestamp:"now"}).settlementRecord;
  const payment = {paymentId:id, providerRequestId:"request", mainEventId:"event", providerId:"provider", customerId:"customer",
   currency:"PHP", providerEarningSchemaVersion:1,providerEarningId:id};
  return {earning, settlement, payment};
 });
 return {sources, disbursement:{schemaVersion:1, policyVersion:1,disbursementId:"disbursement",providerRequestId:"request",
  mainEventId:"event",providerId:"provider",customerId:"customer",currency:"PHP",status:"ready",attemptSequence:0,
  sourceSettlementIds:sources.map(s=>s.settlement.settlementId),amountInCentavos:900000},
  destinationSnapshot:{livemode:false,destinationAccount:{number:"123",name:"Test",bic:"TESTPHMM"}},
  transportMode:"workflow",dispatchEnabled:true,timestamp:"now"};
}
function reserved() {
 const f=fixture(); const plan=domain.aggregateReservationPlan(f);
 return {disbursement:{...f.disbursement,...plan.disbursementUpdate},attempt:plan.externalAttempt,
  sources:f.sources.map((s,i)=>({...s,settlement:{...s.settlement,...plan.reservations[i].settlementUpdate},
   payoutAttempt:plan.reservations[i].payoutAttemptRecord})),timestamp:"later"};
}
function evidence(r,status="pending") {return {id:"tr_test",reference_number:r.attempt.referenceNumber,
 amount:900000,currency:"PHP",livemode:false,status,destination_account:{number:"123",name:"Test",bic:"TESTPHMM"}};}

module.exports={fixture,reserved,evidence};
