import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({get: vi.fn(), getAll: vi.fn(), normalize: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (collection: string) => ({
    where: () => ({where: () => ({limit: () => ({get: mocks.get})})}),
    doc: (id: string) => ({collection, id}),
  }), getAll: mocks.getAll,
}}));
vi.mock("@/lib/customer/providers/provider-normalization", () => ({normalizePublicProvider: mocks.normalize}));
import {getPublicEventServices} from "@/lib/customer/discovery/event-service-discovery-service";
const addon = {providerId: "provider", ownerId: "owner", name: "Photography", isActive: true, isAvailable: true, isPublished: true, status: "published", price: 1000, privateNotes: "hidden"};
const doc = (id: string, data: object) => ({id, exists: true, data: () => data});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAll.mockResolvedValueOnce([doc("provider", {ownerId: "owner", bankAccount: "hidden"})])
    .mockResolvedValueOnce([doc("owner", {privateEmail: "hidden"})]);
  mocks.normalize.mockReturnValue({id: "provider", businessName: "Real provider"});
});
it("serializes only public service presentation, never private provider/customer fields", async () => {
  mocks.get.mockResolvedValue({docs: [doc("addon", addon)]});
  const result = await getPublicEventServices("provider");
  expect(result.services).toHaveLength(1);
  expect(Object.keys(result.services[0]).sort()).toEqual(["id", "providerId", "providerName", "name", "description", "category", "price", "imageUrl", "source"].sort());
  expect(JSON.stringify(result)).not.toContain("hidden");
});
it.each([
  {status: "draft"}, {isPublished: false}, {isActive: false}, {isAvailable: false},
  {isDeleted: true}, {ownerId: "another-owner"},
])("excludes unavailable/unpublished/foreign-owned records %j", async (change) => {
  mocks.get.mockResolvedValue({docs: [doc("addon", {...addon, ...change})]});
  expect((await getPublicEventServices("provider")).services).toEqual([]);
});
it("excludes an ineligible provider", async () => {
  mocks.get.mockResolvedValue({docs: [doc("addon", addon)]}); mocks.normalize.mockReturnValue(null);
  expect((await getPublicEventServices("provider")).services).toEqual([]);
});
