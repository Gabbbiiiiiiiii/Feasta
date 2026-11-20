import {expect,it} from "vitest";
import {providerPackageSaveError} from "@/lib/provider/provider-package-save-error";
it.each([["INVALID_PACKAGE_STYLE","Step 1:"],["INVALID_FOOD_CHOICE_GROUP","Step 3:"],["INVALID_MEDIA_REFERENCE","Step 4:"]])("maps known %s to its wizard step",(reason,step)=>{
 expect(providerPackageSaveError({code:"functions/invalid-argument",details:{reason}})).toContain(step);
});
it("explains classification compatibility without dropping fields",()=>{
 expect(providerPackageSaveError({code:"functions/invalid-argument",message:"Unsupported package fields: offerStructure, packageStyle."})).toContain("compatible backend release");
});
it("does not render unrecognized server details",()=>{
 expect(providerPackageSaveError({code:"functions/invalid-argument",details:{reason:"private diagnostic"}})).not.toContain("private diagnostic");
});

it("explains the media completion boundary using reliable field details",()=>{
 expect(providerPackageSaveError({code:"functions/failed-precondition",details:{reason:"CLIENT_UPGRADE_REQUIRED",field:"media",step:4}})).toContain("Step 4:");
});
it("keeps individual-food progress separate from canonical packages",()=>{
 expect(providerPackageSaveError({details:{reason:"INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED"}})).toContain("Step 3:");
});
