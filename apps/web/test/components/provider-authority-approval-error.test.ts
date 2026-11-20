import {expect, it} from "vitest";
import {providerPackageSaveError} from "@/lib/provider/provider-package-save-error";
it("explains obsolete backend approval errors without requesting approval", () => {
 const message=providerPackageSaveError({code:"functions/failed-precondition",details:{reason:"PROVIDER_OCCASION_APPROVAL_REQUIRED"}});
 expect(message).toContain("backend update");expect(message).not.toContain("administrator must approve");expect(message).toContain("Your entries are still here");
});
for(const reason of ["PROVIDER_NOT_APPROVED","INVALID_SERVICE_CATEGORY","OCCASION_INACTIVE","INVALID_OCCASION_SELECTION","REVISION_CONFLICT"])it("preserves entries for "+reason,()=>{expect(providerPackageSaveError({details:{reason}})).toContain("Your entries are still here");});
