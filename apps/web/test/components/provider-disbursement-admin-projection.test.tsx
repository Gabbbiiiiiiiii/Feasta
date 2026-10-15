import {beforeEach, expect, it, vi} from "vitest";
const state=vi.hoisted(()=>({status:"failed",reason:null as string|null,requireAdmin:vi.fn(),canonical:false,changes:{} as Record<string,unknown>}));
vi.mock("@/lib/auth/session",()=>({requireAdmin:state.requireAdmin}));
vi.mock("@/lib/firebase/admin",()=>({adminDb:{collection:(name:string)=>query(name)}}));
function query(name:string): Record<string,unknown> {
 const q={where:()=>q,limit:()=>q,orderBy:()=>q,
 get:async()=>({docs:name==="providerDisbursements"?[{id:"disbursement",data:()=>({schemaVersion:1,policyVersion:1,
  disbursementId:"disbursement",providerId:"provider",currency:"PHP",status:state.status,
  sourcePaymentIds:["missing"],activePayoutAttemptId:"external-attempt",amountInCentavos:900000,
  transportReady:false,holdReason:state.reason,updatedAt:new Date(),
  ...(state.canonical?{providerRequestId:"request",mainEventId:"event",customerId:"customer",trigger:"completed_booking",
    completedBookingAt:new Date(),payoutEligibleAt:new Date(),sourceSettlementIds:["settlement"],attemptSequence:1,activePayoutAttemptId:null}:{}),
  ...state.changes})}]:[]}),
 doc:(id:string)=>({get:async()=>({exists:name==="payments"&&state.canonical,id,data:()=>({paymentId:id,currency:"PHP",amountInCentavos:900000,status:"paid"})})})};return q;
}
beforeEach(()=>{state.requireAdmin.mockClear();state.canonical=false;state.changes={};});
it.each(["failed","reconciliation_required","held","ready"])("projects canonical %s disbursements into Provider payout issues",async status=>{
 state.status=status;const {getAdminFinanceAttentionQueue}=await import("@/lib/admin/payments/admin-payment-service");
 const result=await getAdminFinanceAttentionQueue();expect(state.requireAdmin).toHaveBeenCalled();
 expect(result.items).toHaveLength(1);expect(result.items[0].id).toBe("disbursement:disbursement");
 expect(result.items[0].amountInCentavos).toBe(900000);expect(result.items[0].kind).toBe(status==="failed"?"failed_payout":"reconciliation_required");
});

it("offers retry only for a structurally valid failed canonical aggregate with linked payment",async()=>{
 state.canonical=true;state.status="failed";
 const {getAdminFinanceAttentionQueue}=await import("@/lib/admin/payments/admin-payment-service");
 const item=(await getAdminFinanceAttentionQueue()).items[0];
 expect(item.recordState).toBe("valid");expect(item.canonicalDisbursementStatus).toBe("failed");
 expect(item.providerDisbursementId).toBe("disbursement");expect(item.failedDisbursementRetryEligible).toBe(true);
});
it.each([{attemptSequence:0},{activePayoutAttemptId:"active"},{sourceSettlementIds:[]},{providerRequestId:null},
 {sourcePaymentIds:["duplicate","duplicate"],sourceSettlementIds:["a","b"]},{completedBookingAt:null},{amountInCentavos:0}])("excludes malformed failed aggregates %j",async changes=>{
 state.canonical=true;state.status="failed";state.changes=changes;
 const {getAdminFinanceAttentionQueue}=await import("@/lib/admin/payments/admin-payment-service");
 expect((await getAdminFinanceAttentionQueue()).items[0].failedDisbursementRetryEligible).toBe(false);
});
