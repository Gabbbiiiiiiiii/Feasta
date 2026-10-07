import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({page: vi.fn()}));
vi.mock("@/lib/customer/providers/provider-discovery-service", () => ({getPublicProviderPage: mocks.page}));
import {loadMarketplaceSuggestionsAction} from "@/app/customer/search/actions";
beforeEach(() => mocks.page.mockReset().mockResolvedValue({providers: [{id: "public-provider", businessName: "Ana Catering", serviceType: "catering", primaryCategory: "catering", location: "Ormoc", ownerId: "private", email: "private@example.test", gatewayResourceId: "pi_secret", taxProfile: {tin: "private"}}]}));
it("uses the public discovery gates with a bounded page and projects only suggestion fields", async () => {
  const result = await loadMarketplaceSuggestionsAction("ana", "service=catering&cursor=old");
  expect(mocks.page).toHaveBeenCalledWith(expect.objectContaining({search: "ana", serviceType: "catering", cursor: null}), 6);
  expect(result).toEqual([{key: "public-provider", label: "Ana Catering", context: "catering · catering · Ormoc", value: "/customer/providers/public-provider"}]);
  expect(JSON.stringify(result)).not.toMatch(/private|pi_secret|taxProfile|email/);
});
it("does not read for short queries", async () => {expect(await loadMarketplaceSuggestionsAction("a")).toEqual([]); expect(mocks.page).not.toHaveBeenCalled();});
