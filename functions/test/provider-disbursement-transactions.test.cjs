const test=require("node:test"),assert=require("node:assert/strict");
const {initializeApp,getApps}=require("firebase-admin/app");if(!getApps().length)initializeApp({projectId:"demo-feasta"});
const {Timestamp}=require("firebase-admin/firestore");
const {db}=require("../lib/shared/firestore.js");
const authority=require("../lib/payments/provider-request-payment-reader.js");
const execution=require("../lib/provider-finance/provider-disbursement-execution.js");
const reconcile=require("../lib/provider-finance/provider-disbursement-reconciliation.js");
const management=require("../lib/provider-finance/provider-disbursement-management.js");
const {fixture,reserved,evidence}=require("./provider-disbursement-fixtures.cjs");
const originalTransaction=db.runTransaction.bind(db),originalAuthority=authority.readTrustedProviderRequestPaymentSetInTransaction;
function harness(f=fixture()) {
 const anchor=Timestamp.fromDate(new Date("2026-10-01T00:00:00Z"));
 const d={...f.disbursement,trigger:"completed_booking",completedBookingAt:anchor,
  sourcePaymentIds:f.sources.map(s=>s.payment.paymentId),payoutEligibleAt:anchor};
 const records=new Map([["providerDisbursements/disbursement",d],
  ["appSettings/platform",{providerDisbursementsEnabled:true}],
  ["providerPaymentAccounts/provider",{schemaVersion:1,providerId:"provider",setupStatus:"ready",payoutReady:true,
   paymongoAccountId:"org_provider",activationStatus:"activated",relationshipStatus:"enabled",
   settlementTransportMode:"workflow",settlementTransportReady:true}],
  ["providerRequests/request",{status:"completed",completedAt:anchor,financialSnapshot:{providerDisbursementPolicyVersion:1}}],
  ["mainEvents/event",{}]]);
 for(const s of f.sources) {records.set(`providerSettlements/${s.settlement.settlementId}`,s.settlement);
 records.set(`providerEarnings/${s.earning.earningId}`,s.earning);records.set(`payments/${s.payment.paymentId}`,s.payment);}
 let commits=0,reads=0;
 const snapshot=ref=>({ref,id:ref.id,exists:records.has(ref.path),data:()=>records.get(ref.path),updateTime:Timestamp.fromMillis(2)});
 db.runTransaction=async callback=>{
  const writes=[];const tx={get:async ref=>{reads++;return snapshot(ref)},getAll:async(...refs)=>refs.map(snapshot),
   update:(ref,data)=>writes.push(["update",ref,data]),create:(ref,data)=>writes.push(["create",ref,data])};
  const result=await callback(tx);
  for(const [mode,ref,data] of writes) {if(mode==="create"&&records.has(ref.path))throw new Error("Already exists");
   records.set(ref.path,mode==="create"?data:{...records.get(ref.path),...data});}
  if(writes.length)commits++;return result;
 };
 authority.readTrustedProviderRequestPaymentSetInTransaction=async()=>({mode:"p5",settlement:{fullySettled:true,settledPaymentIds:["deposit","balance"]}});
 const transport={capability:()=>({ready:true,transportMode:"workflow",destinationSnapshot:f.destinationSnapshot}),
  dispatch:async()=>null,retrieve:async()=>null};
 return {records,transport,d,get commits(){return commits},get reads(){return reads},snapshot};
}
test.afterEach(()=>{db.runTransaction=originalTransaction;authority.readTrustedProviderRequestPaymentSetInTransaction=originalAuthority;});
test("transaction reserves all settlements and one external attempt",async()=>{
 const h=harness();const a=await execution.reserveProviderDisbursement("disbursement",h.transport);
 assert.equal(h.commits,1);assert.equal([...h.records.keys()].filter(k=>k.startsWith("providerDisbursementAttempts/")).length,1);
 for(const id of h.d.sourceSettlementIds)assert.equal(h.records.get(`providerSettlements/${id}`).status,"reserved");
 assert.equal(a.amountInCentavos,900000);
});
test("invalid second settlement aborts transaction without any writes",async()=>{
 const h=harness();h.records.get(`providerSettlements/${h.d.sourceSettlementIds[1]}`).status="processing";
 await assert.rejects(execution.reserveProviderDisbursement("disbursement",h.transport));assert.equal(h.commits,0);
 assert.equal(h.records.get(`providerSettlements/${h.d.sourceSettlementIds[0]}`).status,"ready");
});
test("duplicate reservation creates no second external attempt",async()=>{
 const h=harness();await execution.reserveProviderDisbursement("disbursement",h.transport);
 await assert.rejects(execution.reserveProviderDisbursement("disbursement",h.transport));assert.equal(h.commits,1);
});
test("dispatch disabled transaction reserves nothing",async()=>{
 const h=harness();h.records.set("appSettings/platform",{});
 await assert.rejects(execution.reserveProviderDisbursement("disbursement",h.transport),/disabled/);assert.equal(h.commits,0);
});
test("financial reconciliation reaches ready while dispatch and transport are disabled",async()=>{
 const h=harness();h.d.status="scheduled";h.records.set("appSettings/platform",{});h.records.delete("providerPaymentAccounts/provider");
 await reconcile.reconcileOne("disbursement",new Date("2026-10-09T00:00:00Z"));
 const d=h.records.get("providerDisbursements/disbursement");assert.equal(d.status,"ready");assert.equal(d.dispatchEnabled,false);assert.equal(d.amountInCentavos,900000);
});
for(const status of ["reserved","processing","paid","failed","reconciliation_required","cancelled"]) {
 test(`readiness cannot regress ${status}`,async()=>{const h=harness();h.d.status=status;
 await reconcile.reconcileOne("disbursement",new Date("2026-10-09T00:00:00Z"));assert.equal(h.records.get("providerDisbursements/disbursement").status,status);});
 test(`stale failure cannot overwrite ${status}`,async()=>{const h=harness();h.d.status=status;
 const ref=db.collection("providerDisbursements").doc("disbursement");await reconcile.recordReadinessReconciliationFailure({ref,updateTime:Timestamp.fromMillis(1)});
 assert.equal(h.commits,0);assert.equal(h.d.status,status);});
}
test("stale scheduled error cannot overwrite a newer readiness version",async()=>{const h=harness();h.d.status="ready";
 await reconcile.recordReadinessReconciliationFailure({ref:db.collection("providerDisbursements").doc("disbursement"),updateTime:Timestamp.fromMillis(1)});assert.equal(h.commits,0);});
test("duplicate success is idempotent and moves every earning exactly once",async()=>{
 const h=harness(),a=await execution.reserveProviderDisbursement("disbursement",h.transport),e=evidence({attempt:a},"succeeded");
 await execution.applyProviderDisbursementEvidence(a.externalAttemptId,e);
 const result=await execution.applyProviderDisbursementEvidence(a.externalAttemptId,e);assert.equal(result.duplicate,true);
 for(const id of ["deposit","balance"])assert.equal(h.records.get(`providerEarnings/${id}`).paidAmountInCentavos,450000);
 const paid=h.records.get("providerDisbursements/disbursement");assert.equal(paid.status,"paid");
 assert.equal(paid.activePayoutAttemptId,null);assert.equal(paid.lastPayoutAttemptId,a.externalAttemptId);
 assert.equal(paid.gatewayResourceId,e.id);assert.equal(h.commits,2);
});
test("timeout keeps all reservations locked and prohibits second dispatch",async()=>{
 const h=harness();await execution.dispatchProviderDisbursement("disbursement",h.transport);
 assert.equal(h.records.get("providerDisbursements/disbursement").status,"reconciliation_required");
 for(const id of h.d.sourceSettlementIds)assert.equal(h.records.get(`providerSettlements/${id}`).reservedAmountInCentavos,450000);
 await assert.rejects(execution.dispatchProviderDisbursement("disbursement",h.transport));
});
test("scheduling retries reuse the supplied trusted completion authority",()=>{
 const anchor=new Date("2026-10-09T04:00:00Z"),writes=[];
 const input={transaction:{create:(ref,data)=>writes.push(data)},providerRequestId:"request",mainEventId:"event",providerId:"provider",customerId:"customer",
 providerRequest:{financialSnapshot:{providerDisbursementPolicyVersion:1}},sourcePaymentIds:["deposit","balance"],completedAt:anchor,platformSettings:{},timestamp:"server"};
 management.scheduleCompletedProviderRequestDisbursementInTransaction(input);management.scheduleCompletedProviderRequestDisbursementInTransaction(input);
 assert.equal(writes[0].payoutEligibleAt.toMillis(),writes[1].payoutEligibleAt.toMillis());assert.equal(writes[0].completedBookingAt.toMillis(),anchor.getTime());
 assert.equal(writes[0].transportMode,"disabled");
});
test("legacy scheduling does not enroll historical requests",()=>{
 let count=0;assert.equal(management.scheduleCompletedProviderRequestDisbursementInTransaction({transaction:{create:()=>count++},providerRequest:{},completedAt:new Date()}),null);assert.equal(count,0);
});

test("definitive failure prepares a controlled retry with entirely new identity",async()=>{
 const h=harness(),a=await execution.reserveProviderDisbursement("disbursement",h.transport);
 await execution.applyProviderDisbursementEvidence(a.externalAttemptId,evidence({attempt:a},"failed"));
 await execution.prepareFailedProviderDisbursementRetry("disbursement");
 await reconcile.reconcileOne("disbursement",new Date("2026-10-09T00:00:00Z"));
 const b=await execution.reserveProviderDisbursement("disbursement",h.transport);
 for(const key of ["externalAttemptId","referenceNumber","idempotencyKey"])assert.notEqual(a[key],b[key]);
 assert.equal(b.attemptSequence,2);
});
test("ambiguous payout cannot be prepared for Admin retry",async()=>{
 const h=harness();await execution.dispatchProviderDisbursement("disbursement",h.transport);
 await assert.rejects(execution.prepareFailedProviderDisbursementRetry("disbursement"));
});
test("finalized compensation is scheduled once from persisted refund authority",async()=>{
 const h=harness(),anchor=Timestamp.fromDate(new Date("2026-10-09T04:00:00Z"));
 const request={providerRequestId:"request",mainEventId:"event",providerId:"provider",customerId:"customer",status:"cancelled",
  initialPaymentId:"deposit",cancellationReason:"remaining_balance_unpaid_at_deadline",paymentDefaultAccountingSchemaVersion:1,
  paymentDefaultAccountingFinalizedAt:anchor,providerReservationCompEarnedInCentavos:450000,financialSnapshot:{providerDisbursementPolicyVersion:1}};
 h.records.set("providerRequests/request",request);Object.assign(h.records.get("payments/deposit"),{
  paymentDefaultAccountingSchemaVersion:1,paymentDefaultAccountingFinalizedAt:anchor});
 Object.assign(h.records.get("providerEarnings/deposit"),{economicSource:"payment_default_reservation_compensation",netEarningAmountInCentavos:450000});
 const trigger=require("../lib/provider-finance/provider-disbursement-compensation.js").scheduleProviderDefaultCompensation;
 const event={params:{providerRequestId:"request"},data:{after:{data:()=>request}}};
 await trigger.run(event);await trigger.run(event);
 const id=management.providerDisbursementIdForProviderRequest("request"),d=h.records.get(`providerDisbursements/${id}`);
 assert.equal(d.trigger,"payment_default_compensation");assert.equal(d.payoutEligibleAt.toDate().toISOString(),"2026-10-12T02:00:00.000Z");
 assert.deepEqual(d.sourcePaymentIds,["deposit"]);assert.equal(h.commits,1);
});
test("compensation cannot schedule before trusted refund accounting finalization",async()=>{
 const h=harness();const trigger=require("../lib/provider-finance/provider-disbursement-compensation.js").scheduleProviderDefaultCompensation;
 await trigger.run({params:{providerRequestId:"request"},data:{after:{data:()=>({financialSnapshot:{providerDisbursementPolicyVersion:1}})}}});
 assert.equal(h.commits,0);
});
test("signed transfer success finalizes through existing webhook route; duplicate is harmless",async()=>{
 const h=harness(),a=await execution.reserveProviderDisbursement("disbursement",h.transport);
 const e=evidence({attempt:a},"succeeded");
 const body=Buffer.from(JSON.stringify({data:{id:"evt_test",attributes:{type:"transfer.outward.successful",livemode:false,
  data:{id:e.id,type:"transfer",attributes:e}}}}));
 process.env.PAYMONGO_WEBHOOK_SECRET="fixture-secret-for-signature-only";
 const timestamp=Math.floor(Date.now()/1000);const signature=require("node:crypto").createHmac("sha256",process.env.PAYMONGO_WEBHOOK_SECRET)
  .update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
 const route=require("../lib/payments/paymongo-webhook.js").payMongoWebhook;
 let status,result;const response={status:n=>(status=n,response),set:()=>response,json:value=>{result=value;return response;}};
 const request={method:"POST",rawBody:body,headers:{},get:()=>`t=${timestamp},te=${signature}`};
 await route(request,response);assert.equal(status,200);assert.equal(result.applied,true);
 await route(request,response);assert.equal(result.duplicate,true);
});
test("unsigned transfer webhook cannot mark a disbursement paid",async()=>{
 const h=harness(),a=await execution.reserveProviderDisbursement("disbursement",h.transport);
 process.env.PAYMONGO_WEBHOOK_SECRET="fixture-secret-for-signature-only";
 const route=require("../lib/payments/paymongo-webhook.js").payMongoWebhook;
 let status;const response={status:n=>(status=n,response),set:()=>response,json:()=>response};
 await route({method:"POST",headers:{},rawBody:Buffer.from("{}"),get:()=>undefined},response);
 assert.equal(status,401);assert.equal(h.records.get("providerDisbursements/disbursement").status,"reserved");
});

for (const kind of ["transfer.outward.failed", "live_mismatch", "malformed"]) test(`trusted transfer webhook ${kind} fails or releases safely`,async()=>{
 const h=harness(),a=await execution.reserveProviderDisbursement("disbursement",h.transport),e=evidence({attempt:a},"failed");
 if(kind==="live_mismatch")e.livemode=true;if(kind==="malformed")e.amount=1;
 const body=Buffer.from(JSON.stringify({data:{id:"evt_failure",attributes:{type:"transfer.outward.failed",livemode:false,
  data:{id:e.id,type:"transfer",attributes:e}}}}));
 process.env.PAYMONGO_WEBHOOK_SECRET="fixture-secret-for-signature-only";
 const timestamp=Math.floor(Date.now()/1000),signature=require("node:crypto").createHmac("sha256",process.env.PAYMONGO_WEBHOOK_SECRET)
  .update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
 let status;const response={status:n=>(status=n,response),set:()=>response,json:()=>response};
 const route=require("../lib/payments/paymongo-webhook.js").payMongoWebhook;
 await route({method:"POST",headers:{},rawBody:body,get:()=>`t=${timestamp},te=${signature}`},response);
 assert.equal(status,kind==="transfer.outward.failed"?200:400);
 assert.equal(h.records.get("providerDisbursements/disbursement").status,kind==="transfer.outward.failed"?"failed":"reserved");
 for(const id of ["deposit","balance"])assert.equal(h.records.get(`providerEarnings/${id}`).paidAmountInCentavos,0);
});

test("first financial readyAt persists across repeated rechecks",async()=>{
 const h=harness();h.d.status="scheduled";
 await reconcile.reconcileOne("disbursement",new Date("2026-10-09T00:00:00Z"));
 assert.ok(h.records.get("providerDisbursements/disbursement").readyAt);
 // Firestore resolves the first server timestamp when the transaction commits.
 const first=Timestamp.fromDate(new Date("2026-10-09T00:00:00Z"));
 h.records.get("providerDisbursements/disbursement").readyAt=first;
 for(const date of ["2026-10-09T01:00:00Z","2026-10-10T00:00:00Z"]) {
  await reconcile.reconcileOne("disbursement",new Date(date));
  assert.equal(h.records.get("providerDisbursements/disbursement").readyAt,first);
 }
});
for(const status of ["scheduled","held","ready"]) test(`unchanged ${status} with invalid canonical finance requires review`,async()=>{
 const h=harness();h.d.status=status;h.records.get("providerRequests/request").status="confirmed";
 await assert.rejects(reconcile.reconcileOne("disbursement",new Date("2026-10-09T00:00:00Z")),/authority/);
 const current=h.records.get("providerDisbursements/disbursement");
 assert.equal(current.status,"reconciliation_required");assert.equal(current.holdReason,"internal_reconciliation_failure");
 assert.equal(current.nextCheckAt,null);assert.equal(h.commits,1);
});
test("execution error after successful readiness does not mark obligation for financial review",async()=>{
 const h=harness(),originalProcess=execution.processReadyProviderDisbursement,originalCollection=db.collection.bind(db);
 const candidate=h.snapshot(originalCollection("providerDisbursements").doc("disbursement"));
 db.collection=name=>name==="providerDisbursements"?{doc:id=>originalCollection(name).doc(id),
  where:()=>({orderBy:()=>({limit:()=>({get:async()=>({docs:[candidate]})})})})}:originalCollection(name);
 execution.processReadyProviderDisbursement=async()=>{throw new Error("mock dispatch error");};
 try {await reconcile.reconcileProviderDisbursements.run({});
 assert.equal(h.records.get("providerDisbursements/disbursement").status,"ready");assert.equal(h.commits,1);
 } finally {db.collection=originalCollection;execution.processReadyProviderDisbursement=originalProcess;}
});
