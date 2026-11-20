import {beforeEach, expect, it, vi} from "vitest";
import {FirebaseError} from "firebase/app";
import {retryFailedProviderDisbursement} from "@/lib/admin/payments/admin-payment-client";
const mocks=vi.hoisted(()=>({invoke:vi.fn(),callable:vi.fn(),appCheck:vi.fn(),auth:{authStateReady:vi.fn(),currentUser:{} as object|null}}));
vi.mock("firebase/functions",()=>({httpsCallable:mocks.callable}));
vi.mock("@/lib/firebase/client",()=>({auth:mocks.auth,functions:{},initializeBrowserAppCheck:mocks.appCheck}));
beforeEach(()=>{vi.clearAllMocks();mocks.auth.currentUser={};mocks.callable.mockReturnValue(mocks.invoke);mocks.invoke.mockResolvedValue({data:{prepared:true}});});
it("uses App Check and the existing callable, forwarding only canonical ID",async()=>{
 await retryFailedProviderDisbursement({providerDisbursementId:"payout",amount:1,gatewayEvidence:{status:"succeeded"}} as {providerDisbursementId:string});
 expect(mocks.appCheck).toHaveBeenCalledTimes(1);expect(mocks.callable).toHaveBeenCalledWith({},"retryFailedProviderDisbursement",{timeout:30000});
 expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith({providerDisbursementId:"payout"});
});
it("rejects missing session before invoking retry",async()=>{
 mocks.auth.currentUser=null;await expect(retryFailedProviderDisbursement({providerDisbursementId:"payout"})).rejects.toThrow(/session has expired/);
 expect(mocks.callable).not.toHaveBeenCalled();
});
it("rejects invalid canonical IDs",async()=>{
 await expect(retryFailedProviderDisbursement({providerDisbursementId:"unsafe/path"})).rejects.toThrow(/reference is invalid/);
 expect(mocks.callable).not.toHaveBeenCalled();
});
it("maps concurrent change to safe feedback without exposing gateway details",async()=>{
 mocks.invoke.mockRejectedValue(new FirebaseError("functions/failed-precondition","private gateway detail"));
 await expect(retryFailedProviderDisbursement({providerDisbursementId:"payout"})).rejects.toThrow("This payout changed or is no longer authoritatively failed. Refresh Provider payout issues.");
});
it("conceals unexpected service errors",async()=>{
 mocks.invoke.mockRejectedValue(new Error("private gateway detail"));
 await expect(retryFailedProviderDisbursement({providerDisbursementId:"payout"})).rejects.toThrow("The trusted payout retry service could not prepare this retry safely. Refresh Provider payout issues.");
});
