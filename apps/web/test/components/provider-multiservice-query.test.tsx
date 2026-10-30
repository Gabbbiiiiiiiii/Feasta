import {beforeEach, describe, expect, it, vi} from "vitest";
import {TEST_SERVICE_CATEGORY_OPTIONS} from "../fixtures/service-category-options";

const mocks = vi.hoisted(() => ({
  query: {where: vi.fn(), orderBy: vi.fn(), startAfter: vi.fn(), endBefore: vi.fn(), limit: vi.fn(), limitToLast: vi.fn(), get: vi.fn()},
  catalog: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {collection: () => mocks.query, getAll: vi.fn().mockResolvedValue([])}}));
vi.mock("@/lib/service-categories/service-category-service", () => ({getServiceCategoryOptions: mocks.catalog}));
vi.mock("@/lib/customer/providers/provider-normalization", () => ({normalizePublicProvider: (id: string) => ({id})}));
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters} from "@/lib/customer/providers/provider-query";

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [mocks.query.where, mocks.query.orderBy, mocks.query.startAfter, mocks.query.endBefore, mocks.query.limit, mocks.query.limitToLast]) method.mockReturnValue(mocks.query);
  mocks.catalog.mockResolvedValue(TEST_SERVICE_CATEGORY_OPTIONS);
  mocks.query.get.mockResolvedValue({docs: []});
});

describe("multi-service server query", () => {
  it("uses OR on the canonical primary category and retains every public eligibility predicate", async () => {
    await getPublicProviderPage(parseProviderDiscoveryFilters({categories: "photographer,catering_service,photographer,unknown_category", q: "party"}));
    expect(mocks.query.where).toHaveBeenCalledWith("providerCategory", "in", ["catering_service", "photographer"]);
    for (const [field, value] of [["verificationStatus", "approved"], ["publiclyVisible", true], ["isActive", true], ["isSuspended", false], ["isDeleted", false]]) {
      expect(mocks.query.where).toHaveBeenCalledWith(field, "==", value);
    }
    expect(mocks.query.where).toHaveBeenCalledWith("searchTokens", "array-contains", "party");
    expect(mocks.query.orderBy).toHaveBeenCalledWith("favoriteCount", "desc");
    expect(mocks.query.limit).toHaveBeenCalledWith(13);
  });

  it("keeps single-category equality and never queries unsupported catalog codes", async () => {
    await getPublicProviderPage(parseProviderDiscoveryFilters({category: "photographer", service: "addon"}));
    expect(mocks.query.where).toHaveBeenCalledWith("providerCategory", "==", "photographer");
    expect(mocks.query.where).toHaveBeenCalledWith("providerServiceType", "==", "addon");
    mocks.query.get.mockClear();
    const page = await getPublicProviderPage(parseProviderDiscoveryFilters({categories: "invented_category,unknown_category"}));
    expect(page.providers).toEqual([]);
    expect(mocks.query.get).not.toHaveBeenCalled();
  });

  it("retains deterministic cursor boundaries for next and previous pages without duplicate cards", async () => {
    const docs = ["c", "b", "a"].map((id) => ({id, data: () => ({favoriteCount: 5})}));
    mocks.query.get.mockResolvedValue({docs});
    const filters = parseProviderDiscoveryFilters({categories: "photographer,catering_service"});
    const first = await getPublicProviderPage(filters, 2);
    expect(first.providers.map((p) => p.id)).toEqual(["c", "b"]);
    await getPublicProviderPage({...filters, cursor: first.nextCursor}, 2);
    expect(mocks.query.startAfter).toHaveBeenCalledWith(5, "b");
    const previous = btoa(JSON.stringify({direction: "previous", favoriteCount: 5, providerId: "b"})).replaceAll("=", "");
    const back = await getPublicProviderPage({...filters, cursor: previous}, 2);
    expect(mocks.query.endBefore).toHaveBeenCalledWith(5, "b");
    expect(mocks.query.limitToLast).toHaveBeenCalledWith(3);
    expect(back.providers.map((p) => p.id)).toEqual(["b", "a"]);
    mocks.query.startAfter.mockClear();
    await getPublicProviderPage({...filters, cursor: "malformed"}, 2);
    expect(mocks.query.startAfter).not.toHaveBeenCalled();
  });
});

it("bounds large selections and merges chunk results before global pagination", async () => {
  const codes = TEST_SERVICE_CATEGORY_OPTIONS.slice(0, 15).map((option) => option.code);
  const doc = (id: string, favoriteCount: number) => ({id, data: () => ({favoriteCount})});
  mocks.query.get.mockResolvedValueOnce({docs: [doc("z", 10), doc("x", 4), doc("b", 1)]})
    .mockResolvedValueOnce({docs: [doc("y", 8), doc("w", 3), doc("a", 0)]});
  const page = await getPublicProviderPage(parseProviderDiscoveryFilters({categories: codes.join(","), service: "addon", q: "party"}), 2);
  expect(mocks.query.get).toHaveBeenCalledTimes(2);
  const categoryCalls = mocks.query.where.mock.calls.filter(([field]) => field === "providerCategory");
  expect(categoryCalls.map(([, , values]) => values.length)).toEqual([10, 5]);
  expect(page.providers.map((provider) => provider.id)).toEqual(["z", "y"]);
  expect(page.nextCursor).not.toBeNull();
});
