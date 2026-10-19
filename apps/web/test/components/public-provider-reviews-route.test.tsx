import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({page: vi.fn(), cursor: vi.fn()}));
vi.mock("@/lib/customer/providers/public-review-service", () => ({
  getPublicReviewPage: mocks.page, decodePublicReviewCursor: mocks.cursor,
}));
import {GET} from "@/app/customer/providers/[providerId]/reviews/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.page.mockResolvedValue({reviews: [], nextCursor: null});
});

describe("public review HTTP projection", () => {
  it("serves bounded public pages without caching moderation decisions", async () => {
    const response = await GET(new Request("https://feasta.test/customer/providers/provider/reviews?cursor=valid"), {params: Promise.resolve({providerId: "provider"})});
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({reviews: [], nextCursor: null});
    expect(mocks.cursor).toHaveBeenCalledWith("valid", "provider");
    expect(mocks.page).toHaveBeenCalledWith("provider", "valid");
  });
  it("rejects malformed cursors before reading Firestore", async () => {
    mocks.cursor.mockImplementation(() => {throw new Error("invalid");});
    const response = await GET(new Request("https://feasta.test/customer/providers/provider/reviews?cursor=bad"), {params: Promise.resolve({providerId: "provider"})});
    expect(response.status).toBe(400);
    expect(mocks.page).not.toHaveBeenCalled();
  });
  it("returns no review data for a nonpublic provider", async () => {
    mocks.page.mockResolvedValue(null);
    const response = await GET(new Request("https://feasta.test/customer/providers/provider/reviews"), {params: Promise.resolve({providerId: "provider"})});
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({error: "Provider unavailable."});
  });
  it("does not leak internal errors", async () => {
    mocks.page.mockRejectedValue(new Error("private internal record"));
    const response = await GET(new Request("https://feasta.test/customer/providers/provider/reviews"), {params: Promise.resolve({providerId: "provider"})});
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private internal record");
  });
});
