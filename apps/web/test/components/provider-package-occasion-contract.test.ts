import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({call: vi.fn(), getDocs: vi.fn()}));
vi.mock("firebase/functions", () => ({httpsCallable: () => mocks.call}));
vi.mock("firebase/firestore", () => ({collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), getDocs: mocks.getDocs}));
vi.mock("@/lib/firebase/client", () => ({auth: {authStateReady: async () => {}, currentUser: {uid: "owner"}}, db: {}, functions: {}}));
import {createProviderPackage, listProviderPackages, type ProviderPackageInput} from "@/lib/provider/provider-package-client";
import {providerPackageSaveError} from "@/lib/provider/provider-package-save-error";
beforeEach(() => {mocks.call.mockReset(); mocks.getDocs.mockReset();});
it.each(["occasionSchemaVersion", "occasionScope", "occasionIds", "selectedOccasions"])("rejects incompatible %s without silently stripping it", async (field) => {
  await expect(createProviderPackage({[field]: []} as unknown as ProviderPackageInput)).rejects.toThrow("requires the V2 package writer");
  expect(mocks.call).not.toHaveBeenCalled();
});
it.each(["occasionSchemaVersion", "occasionScope", "occasionIds", "occasionMatchIds"])("refuses legacy editing of a stored %s record", async (field) => {
  mocks.getDocs.mockResolvedValue({docs: [{id: "package", data: () => ({[field]: []})}]});
  await expect(listProviderPackages("provider")).rejects.toThrow("requires the V2 occasion editor");
});
it("explains revision conflicts without treating them as save success", () => {
  expect(providerPackageSaveError({code: "functions/aborted", details: {reason: "REVISION_CONFLICT"}})).toContain("Reload current package and occasion choices");
});
