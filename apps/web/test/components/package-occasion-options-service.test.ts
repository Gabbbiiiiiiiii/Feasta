import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({account: vi.fn(), transaction: vi.fn(), get: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireProviderCatalogAccess: mocks.account}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  doc: (path: string) => path,
  collection: (name: string) => ({doc: (id: string) => name + "/" + id,
    where: () => ({limit: () => "catalog-query"})}),
  runTransaction: mocks.transaction,
}}));
import {getPackageOccasionOptions} from "@/lib/provider/package-occasion-options-service";
import {packageOccasionChoices} from "@/lib/provider/package-occasion-options";
let records: Record<string, Record<string, unknown>>;
let rows: Record<string, unknown>[];
beforeEach(() => {
  vi.stubEnv("FIREBASE_ADMIN_PROJECT_ID", "demo-feasta");
  mocks.account.mockResolvedValue({uid: "owner", providerId: "provider"});
  records = {
    "contractPolicies/providerPackageV2": {effectiveEnvironment: "demo-feasta", featureGates: {occasionCatalogReads: true}, revision: 1, maxSpecificOccasions: 5},
    "occasionCatalog/current": {activationState: "stable", revision: 7},
    "providerEligibilityAuthorities/provider": {revision: 3, approvedOccasionIds: ["wedding"]},
    "providers/provider": {ownerId: "owner", verificationStatus: "approved", isActive: true, serviceCategories: ["food_catering"]},
    "users/owner": {role: "provider", providerId: "provider", accountStatus: "active"},
  };
  rows = ["wedding", "birthday"].map((id) => ({id, active: true, moderationState: "approved", label: id, revision: 1, applicableServiceCategoryCodes: ["food_catering"]}));
  mocks.get.mockImplementation(async (ref: string) => ref === "catalog-query" ? {size: rows.length, docs: rows.map((row) => ({id: row.id, data: () => row}))} : {data: () => records[ref]});
  mocks.transaction.mockImplementation(async (callback) => callback({get: mocks.get}));
});
describe("package occasion authority read", () => {
  it("returns canonical labels and explicit grants with both revision pins", async () => {
    const result = await getPackageOccasionOptions();
    expect(result).toEqual({options: [{id: "wedding", label: "wedding", categoryCodes: ["food_catering"]}], catalogRevision: 7, providerEligibilityRevision: 3, maxSpecificOccasions: 5});
    expect(packageOccasionChoices(result, "photographer")).toEqual([]);
  });
  it.each([
    ["contractPolicies/providerPackageV2", "effectiveEnvironment", "other-project"],
    ["contractPolicies/providerPackageV2", "featureGates", {occasionCatalogReads: false}],
    ["contractPolicies/providerPackageV2", "maxSpecificOccasions", 0],
    ["occasionCatalog/current", "activationState", "transitioning"],
    ["occasionCatalog/current", "revision", 0],
    ["providerEligibilityAuthorities/provider", "revision", 0],
    ["providers/provider", "ownerId", "another-owner"],
    ["providers/provider", "isSuspended", true],
    ["providers/provider", "verificationStatus", "pending"],
    ["users/owner", "role", "customer"],
  ])("fails closed for %s %s", async (path, field, value) => {
    records[path as string][field as string] = value;
    expect(await getPackageOccasionOptions()).toBeNull();
  });
  it("does not accept pending catalog rows", async () => { rows[0].moderationState = "pending"; expect(await getPackageOccasionOptions()).toBeNull(); });
  it("does not return a partial catalog or trust legacy supported occasions", async () => {
    rows = Array.from({length: 201}, () => rows[0]);
    expect(await getPackageOccasionOptions()).toBeNull();
  });
  it("returns unavailable on network/transaction errors", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("network"));
    expect(await getPackageOccasionOptions()).toBeNull();
  });
});
