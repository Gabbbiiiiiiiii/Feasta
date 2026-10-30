import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({call:vi.fn(), user:{uid:"provider_owner"}}));
vi.mock("@/lib/firebase/client", () => ({auth:{currentUser:mocks.user,authStateReady:async()=>{}},functions:{},initializeBrowserFirebase:vi.fn()}));
vi.mock("firebase/functions", () => ({httpsCallable: (_f:unknown,name:string) => (input:unknown) => mocks.call(name,input)}));
beforeEach(() => {
  vi.resetModules(); sessionStorage.clear(); mocks.call.mockReset();
  vi.stubEnv("NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED","true");
  vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS","true");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID","demo-feasta-stage-e");
});
const data = {sharedContractVersion:2,idempotencyKey:"adapter_request_key_123",occasionSchemaVersion:2,occasionScope:"all",occasionIds:[]} as never;
const result = {status:"draft",packageId:"pkg",packageRevision:1,success:true,sharedContractVersion:2};
it("sends the exact typed payload using the existing callable and clears confirmed requests", async () => {
  const api = await import("@/lib/provider/provider-package-v2-client");
  mocks.call.mockResolvedValue({data:result});
  await api.createV2PackageDraft(data);
  expect(mocks.call).toHaveBeenCalledWith("createProviderPackageV2",data);
  expect(api.hasPendingV2Draft()).toBe(false);
});
it("retains ambiguous requests across module reload and retries the original key without a new create", async () => {
  let api = await import("@/lib/provider/provider-package-v2-client");
  mocks.call.mockRejectedValueOnce({code:"functions/unavailable"});
  await expect(api.createV2PackageDraft(data)).rejects.toBeTruthy();
  expect(api.hasPendingV2Draft()).toBe(true);
  await expect(api.createV2PackageDraft({...data as object,idempotencyKey:"another_request_key"} as never)).rejects.toThrow("PENDING_V2_SAVE");
  expect(mocks.call).toHaveBeenCalledTimes(1);
  vi.resetModules(); api = await import("@/lib/provider/provider-package-v2-client");
  mocks.call.mockResolvedValue({data:result});
  await api.retryPendingV2Draft();
  expect(mocks.call).toHaveBeenLastCalledWith("createProviderPackageV2",data);
  expect(api.hasPendingV2Draft()).toBe(false);
});
it("keeps stale revision authoritative and permits repair after a definitive rejection", async () => {
  const api = await import("@/lib/provider/provider-package-v2-client");
  const request = {...data as object,packageId:"pkg",expectedRevision:7} as never;
  mocks.call.mockRejectedValue({code:"functions/aborted",details:{reason:"REVISION_CONFLICT"}});
  await expect(api.updateV2PackageDraft(request)).rejects.toBeTruthy();
  expect(mocks.call).toHaveBeenCalledWith("updateProviderPackageV2",request);
  expect(api.hasPendingV2Draft()).toBe(false);
});
it("routes completion with editor revision and never supplies ownership or discovery fields", async () => {
  const api = await import("@/lib/provider/provider-package-v2-client");
  const input={editorDraftId:"editor",expectedRevision:3,expectedPackageRevision:null,idempotencyKey:"completion_request_key"};
  mocks.call.mockResolvedValue({data:{...result,editorDraftId:"editor",editorDraftRevision:4}});
  await api.completeV2PackageProgress(input);
  expect(mocks.call).toHaveBeenCalledWith("completeProviderPackageEditorDraft",input);
});
it("disables V2 adapters for production project configuration", async () => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID","feasta-catering-system");
  const api = await import("@/lib/provider/provider-package-v2-client");
  await expect(api.createV2PackageDraft(data)).rejects.toThrow("FEATURE_DISABLED");
  expect(mocks.call).not.toHaveBeenCalled();
});
