import {beforeEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({venue: false, serviceType: "catering", stale: true as boolean | undefined, oneOf: false}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: vi.fn()}));
vi.mock("@/lib/documents/document-catalog-service", () => ({getAdminBusinessDocumentTypes: async () => [
  {code: "sanitary_permit", status: "active", rules: [{effect: state.oneOf ? "one_of" : "required", oneOfGroup: "permit", registrationScope: "any", serviceTypes: ["catering", "both"], serviceCategoryCodes: [], excludeServiceCategoryCodes: []}]},
  {code: "mayors_permit", status: "active", rules: [{effect: state.oneOf ? "one_of" : "required", oneOfGroup: "permit", registrationScope: "any", serviceTypes: [], serviceCategoryCodes: state.oneOf ? [] : ["venue_provider"], excludeServiceCategoryCodes: []}]},
]}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {collection: (name: string) => reference(name)}}));
function reference(path: string): object {
  return {doc: (id: string) => reference(`${path}/${id}`), collection: (name: string) => reference(`${path}/${name}`),
    limit: () => reference(path), orderBy: () => reference(path), get: async () => {
      const values: Record<string, object> = {
        "providerVerifications/v": {providerId: "p", ownerId: "owner", status: "suspended"},
        "providers/p": {ownerId: "owner", providerServiceType: state.serviceType, serviceCategories: state.venue ? ["venue_provider"] : []},
        "users/owner": {},
      };
      return {exists: path in values, data: () => values[path], ref: reference(path),
        docs: path.endsWith("/documents") ? ["sanitary_permit", "mayors_permit"].map((type) => ({id: type,
          data: () => ({documentType: type, status: "pending", isRequired: state.stale})})) : []};
    }};
}
import {getProviderVerificationReview} from "@/lib/admin/provider-verification/provider-verification-service";
beforeEach(() => {state.venue = false; state.serviceType = "catering"; state.stale = true; state.oneOf = false;});
it.each([true, undefined])("uses current policy over stale or missing upload flags (%s)", async (stale) => {
  state.stale = stale;
  const detail = await getProviderVerificationReview("v");
  expect(detail?.documents.find((doc) => doc.documentType === "mayors_permit")).toMatchObject({isRequired: false, requirementKind: "optional", status: "pending"});
  expect(detail?.documents.find((doc) => doc.documentType === "sanitary_permit")).toMatchObject({isRequired: true, requirementKind: "required"});
});
it("requires Mayor's permit for current venue context", async () => {
  state.venue = true;
  expect((await getProviderVerificationReview("v"))?.documents.find((doc) => doc.documentType === "mayors_permit")).toMatchObject({isRequired: true, requirementKind: "required"});
});
it("requires Sanitary permit for both service types", async () => {
  state.serviceType = "both";
  expect((await getProviderVerificationReview("v"))?.documents.find((doc) => doc.documentType === "sanitary_permit")?.isRequired).toBe(true);
});
it("preserves one-of semantics instead of marking each alternative required", async () => {
  state.oneOf = true;
  expect((await getProviderVerificationReview("v"))?.documents.every((doc) => !doc.isRequired && doc.requirementKind === "one_of")).toBe(true);
});
