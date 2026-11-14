import {expect,it} from "vitest";
import {validatePackageMutationResponse,validateV2DraftResponse} from "@/lib/provider/provider-package-mutation-response";
const result={success:true,status:"draft",packageId:"pkg",packageRevision:1,sharedContractVersion:2};
it("requires a matching positive legacy acknowledgement",()=>{
 expect(()=>validatePackageMutationResponse(result,"draft")).not.toThrow();
 for(const value of [null,{}, {...result,success:false},{...result,packageId:123},{...result,status:"published"}]) expect(()=>validatePackageMutationResponse(value,"draft")).toThrow("INVALID_DRAFT_RESPONSE");
 expect(()=>validatePackageMutationResponse(result,"draft","other")).toThrow();
});
it("requires the exact V2 package revision for create and update",()=>{
 expect(()=>validateV2DraftResponse(result,{kind:"create"})).not.toThrow();
 expect(()=>validateV2DraftResponse({...result,packageRevision:8},{kind:"update",packageId:"pkg",revision:7})).not.toThrow();
 for(const value of [{...result,success:false},{...result,sharedContractVersion:3},{...result,packageRevision:0},{...result,packageRevision:2},{...result,packageId:true}]) expect(()=>validateV2DraftResponse(value,{kind:"create"})).toThrow();
 expect(()=>validateV2DraftResponse({...result,packageRevision:8},{kind:"update",packageId:"other",revision:7})).toThrow();
});
it("matches completion to the exact editor revision",()=>{
 const completed={status:"draft",packageId:"pkg",packageRevision:1,editorDraftId:"editor",editorDraftRevision:4};
 const expected={kind:"complete" as const,editorDraftId:"editor",revision:3};
 expect(()=>validateV2DraftResponse(completed,expected)).not.toThrow();
 for(const value of [{...completed,editorDraftId:"other"},{...completed,editorDraftRevision:3},{...completed,packageRevision:2}])expect(()=>validateV2DraftResponse(value,expected)).toThrow();
});
