import {beforeEach, expect, it, vi} from "vitest";
const mocks=vi.hoisted(()=>({call:vi.fn()}));
vi.mock("@/lib/firebase/client",()=>({auth:{currentUser:{uid:"owner"},
  authStateReady:async()=>{}},functions:{},initializeBrowserFirebase:vi.fn()}));
vi.mock("firebase/functions",()=>({httpsCallable:(_:unknown,name:string)=>(data:unknown)=>mocks.call(name,data)}));
import {confirmFixedRecovery, hasPendingFixedRecovery, previewFixedRecovery,
  recoveryInventory, retryFixedRecovery} from "@/lib/provider/fixed-package-recovery-client";
const preview={packageId:"original",sourceFingerprint:"a".repeat(64),
  proposalFingerprint:"b".repeat(64),eligible:true,blockers:[],original:["map",[]],proposed:["map",[]]};
const result={success:true,packageId:"original",packageRevision:1,sharedContractVersion:2,status:"draft"};
beforeEach(()=>{mocks.call.mockReset();sessionStorage.clear();});
it("requests a read-only server preview with no client replacement payload",async()=>{
  mocks.call.mockResolvedValue({data:preview});expect(await previewFixedRecovery("original")).toEqual(preview);
  expect(mocks.call).toHaveBeenCalledWith("previewFixedPackageV2Recovery",{packageId:"original"});
  expect(hasPendingFixedRecovery("original")).toBe(false);
});
it("sends only exact reviewed fingerprints, confirmation and an idempotency key",async()=>{
  mocks.call.mockResolvedValue({data:result});await confirmFixedRecovery(preview);
  expect(mocks.call).toHaveBeenCalledWith("recoverFixedPackageV2Draft",{
    packageId:"original",sourceFingerprint:preview.sourceFingerprint,
    proposalFingerprint:preview.proposalFingerprint,confirmed:true,idempotencyKey:expect.any(String)});
  expect(hasPendingFixedRecovery("original")).toBe(false);
});
it("preserves an ambiguous request and retries exactly the original key",async()=>{
  mocks.call.mockRejectedValueOnce({code:"functions/unavailable"});
  await expect(confirmFixedRecovery(preview)).rejects.toBeTruthy();
  const original=mocks.call.mock.calls[0][1];expect(hasPendingFixedRecovery("original")).toBe(true);
  await expect(confirmFixedRecovery(preview)).rejects.toThrow("PENDING_FIXED_RECOVERY");
  mocks.call.mockResolvedValue({data:result});await retryFixedRecovery("original");
  expect(mocks.call).toHaveBeenLastCalledWith("recoverFixedPackageV2Draft",original);
  expect(hasPendingFixedRecovery("original")).toBe(false);
});
it("clears definitive stale-preview denials without ever publishing",async()=>{
  mocks.call.mockRejectedValue({code:"functions/aborted"});
  await expect(confirmFixedRecovery(preview)).rejects.toBeTruthy();
  expect(hasPendingFixedRecovery("original")).toBe(false);
  expect(mocks.call.mock.calls.every(([name])=>name==="recoverFixedPackageV2Draft")).toBe(true);
});
it("fails closed on mismatched previews and invalid success responses",async()=>{
  mocks.call.mockResolvedValue({data:{...preview,packageId:"other"}});
  await expect(previewFixedRecovery("original")).rejects.toThrow("INVALID_RECOVERY_RESPONSE");
  mocks.call.mockResolvedValue({data:{...result,status:"published"}});
  await expect(confirmFixedRecovery(preview)).rejects.toThrow("INVALID_RECOVERY_RESPONSE");
  expect(hasPendingFixedRecovery("original")).toBe(true);
});
it("decodes every inventory field and exact timestamp precision for provider review",()=>{
  expect(recoveryInventory(["map",[["price",["number",1850]],
    ["createdAt",["timestamp",100,123]],["food",["array",[["string","Rice"]]]]]]))
    .toEqual({price:1850,createdAt:"100 seconds + 123 nanoseconds (UTC epoch)",food:["Rice"]});
});
