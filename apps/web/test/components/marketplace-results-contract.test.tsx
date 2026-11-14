import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({page: vi.fn()}));
vi.mock("@/lib/customer/providers/provider-discovery-service", () => ({getPublicProviderPage: mocks.page}));
import {loadMarketplaceResultsAction} from "@/app/customer/search/actions";
beforeEach(() => mocks.page.mockReset().mockResolvedValue({providers: [], nextCursor: null}));
it("uses the canonical public results loader and resets pagination", async () => {
  await loadMarketplaceResultsAction("bag", "service=catering&category=catering_service&eventDate=2026-09-10&cursor=old");
  expect(mocks.page).toHaveBeenCalledWith(expect.objectContaining({
    search: "bag",
    serviceType: "catering",
    category: "catering_service",
    cursor: null,
  }));
});
it("does not treat one character as a provider-name token and restores a blank query for whitespace", async () => {
  await loadMarketplaceResultsAction("b", "service=catering&category=catering_service");
  expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({
    search: "",
    serviceType: "catering",
    category: "catering_service",
  }));
  await loadMarketplaceResultsAction("  ");
  expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({search: ""}));
});
