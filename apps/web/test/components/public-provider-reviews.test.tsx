import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {Timestamp} from "firebase-admin/firestore";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  candidates: [] as {id: string; data: () => Record<string, unknown>}[],
  where: vi.fn(), orderBy: vi.fn(), startAfter: vi.fn(), limit: vi.fn(), getAll: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: vi.fn()}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (collection: string) => {
    const query = {
      doc: (id: string) => ({path: `${collection}/${id}`, get: async () => ({
        id, exists: mocks.records.has(`${collection}/${id}`), data: () => mocks.records.get(`${collection}/${id}`),
      })}),
      where: (...args: unknown[]) => {mocks.where(...args); return query;},
      orderBy: (...args: unknown[]) => {mocks.orderBy(...args); return query;},
      startAfter: (...args: unknown[]) => {mocks.startAfter(...args); return query;},
      limit: (...args: unknown[]) => {mocks.limit(...args); return query;},
      get: async () => ({docs: mocks.candidates}),
    };
    return query;
  },
  getAll: async (...refs: {path: string}[]) => {
    mocks.getAll(...refs);
    return refs.map(({path}) => ({id: path.split("/")[1], exists: mocks.records.has(path), data: () => mocks.records.get(path)}));
  },
}}));
vi.mock("@/app/customer/favorites/actions", () => ({setProviderFavoriteAction: vi.fn()}));

import {getPublicReviewPage, decodePublicReviewCursor} from "@/lib/customer/providers/public-review-service";
import {publicReviewSummary} from "@/lib/customer/providers/public-review-summary";
import {ProviderPublicReviews} from "@/components/customer/providers/provider-public-reviews";
import {ProviderLogoCard} from "@/components/customer/providers/provider-logo-card";
import {ProviderCard} from "@/components/customer/providers/provider-card";
import {ProviderProfile} from "@/components/customer/providers/provider-profile";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";

const provider = {ownerId: "owner", businessName: "Real Events", providerServiceType: "addon",
  verificationStatus: "approved", publiclyVisible: true, isActive: true};
const owner = {role: "provider", providerId: "provider", accountStatus: "active"};
const counters = {canonicalReviewCount: 3, canonicalRatingTotal: 13, canonicalRatingDistribution: {1: 0, 2: 0, 3: 1, 4: 0, 5: 2}};
const reviewId = `review_${createHash("sha256").update("request\u0000customer").digest("hex")}`;
function review(overrides: Record<string, unknown> = {}) {
  return {providerId: "provider", customerId: "customer", mainEventId: "event", providerRequestId: "request",
    schemaVersion: 2, relationshipVersion: "provider_request_v1", rating: 5, comment: "Excellent service.",
    isVisible: true, isDeleted: false, moderationStatus: "published", createdAt: new Timestamp(1700000000, 123456789),
    providerReply: "Thank you!", providerReplyAt: Timestamp.fromMillis(1700000001000),
    customerEmail: "private@example.test", customerFirstName: "Private", ...overrides};
}
function candidate(data = review(), id = reviewId) {return {id, data: () => data};}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("providers/provider", {...provider, ...counters});
  mocks.records.set("users/owner", owner);
  mocks.records.set("providerRequests/request", {providerId: "provider", customerId: "customer", mainEventId: "event", status: "completed"});
  mocks.records.set("mainEvents/event", {customerId: "customer", status: "completed", providerRequestIds: ["request"], eventType: "wedding", eventDate: Timestamp.fromMillis(1600000000000)});
  mocks.candidates = [candidate()];
});

describe("public provider review projection", () => {
  it("uses validated canonical aggregates, including no-review providers", () => {
    expect(publicReviewSummary({})).toEqual({totalReviews: 0, averageRating: null, ratingDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}});
    expect(publicReviewSummary(counters)).toEqual({totalReviews: 3, averageRating: 4.33, ratingDistribution: counters.canonicalRatingDistribution});
  });
  it.each([
    {canonicalReviewCount: -1}, {canonicalRatingTotal: 12}, {canonicalReviewCount: 4},
    {canonicalReviewCount: 3.5}, {canonicalReviewCount: null},
    {canonicalRatingDistribution: {1: 0, 2: 0, 3: 1, 4: 0, 5: "2"}},
    {canonicalRatingDistribution: {1: 0, 2: 0, 3: 1, 4: 0}},
  ])("rejects corrupt aggregates %j", (changes) => {
    expect(publicReviewSummary({...counters, ...changes})).toBeNull();
  });
  it("does not mistake malformed present fields for a zero-review provider", () => {
    expect(publicReviewSummary({canonicalReviewCount: null, canonicalRatingTotal: null, canonicalRatingDistribution: null})).toBeNull();
  });
  it("projects only verified canonical reviews and safe reply fields", async () => {
    const page = await getPublicReviewPage("provider");
    expect(page?.reviews).toEqual([{id: reviewId, rating: 5, comment: "Excellent service.", createdAt: "2023-11-14T22:13:20.123Z", providerReply: "Thank you!"}]);
    expect(JSON.stringify(page)).not.toMatch(/customer|private@example|event|request|Private/);
    expect(mocks.getAll.mock.calls.flat().some((ref) => ref.path.startsWith("users/"))).toBe(false);
    expect(mocks.limit).toHaveBeenCalledWith(6);
  });
  it("returns an empty bounded page when no reviews exist", async () => {
    mocks.candidates = [];
    expect(await getPublicReviewPage("provider")).toEqual({reviews: [], nextCursor: null});
  });
  it("returns multiple genuine reviews after validating each booking", async () => {
    const secondId = `review_${createHash("sha256").update("request-two\u0000customer").digest("hex")}`;
    mocks.records.set("providerRequests/request-two", {providerId: "provider", customerId: "customer", mainEventId: "event", status: "completed"});
    mocks.records.set("mainEvents/event", {...mocks.records.get("mainEvents/event"), providerRequestIds: ["request", "request-two"]});
    mocks.candidates = [candidate(), candidate(review({providerRequestId: "request-two", rating: 3}), secondId)];
    expect((await getPublicReviewPage("provider"))?.reviews.map((item) => item.rating)).toEqual([5, 3]);
  });
  it.each([
    {moderationStatus: "hidden"}, {moderationStatus: "pending"}, {isVisible: false}, {isDeleted: true},
    {rating: 0}, {rating: 6}, {rating: "5"}, {rating: 4.5}, {comment: "  "}, {comment: 42},
    {providerId: "other"}, {customerId: "other"}, {providerRequestId: null}, {mainEventId: "other"},
    {schemaVersion: 1}, {relationshipVersion: "other"}, {createdAt: "bad"},
    {providerReply: 123}, {providerReplyAt: "invalid"},
  ])("excludes invalid review %j", async (changes) => {
    mocks.candidates = [candidate(review(changes))];
    expect((await getPublicReviewPage("provider"))?.reviews).toEqual([]);
  });
  it("rejects noncanonical review identities and legacy reviews", async () => {
    mocks.candidates = [candidate(review(), "unrelated")];
    expect((await getPublicReviewPage("provider"))?.reviews).toEqual([]);
    const legacy = review(); delete (legacy as Record<string, unknown>).providerRequestId;
    mocks.candidates = [candidate(legacy)];
    expect((await getPublicReviewPage("provider"))?.reviews).toEqual([]);
  });
  it.each([
    ["providerRequests/request", {providerId: "other"}],
    ["providerRequests/request", {customerId: "other"}],
    ["providerRequests/request", {mainEventId: "other"}],
    ["providerRequests/request", {providerRequestId: "other"}],
    ["providerRequests/request", {status: "accepted"}],
    ["mainEvents/event", {customerId: "other"}],
    ["mainEvents/event", {status: "in_progress"}],
    ["mainEvents/event", {providerRequestIds: []}],
  ] as const)("rejects invalid booking relationship %s %j", async (path, changes) => {
    mocks.records.set(path, {...mocks.records.get(path), ...changes});
    expect((await getPublicReviewPage("provider"))?.reviews).toEqual([]);
  });
  it.each(["providerRequests/request", "mainEvents/event"])("requires relationship document %s", async (path) => {
    mocks.records.delete(path);
    expect((await getPublicReviewPage("provider"))?.reviews).toEqual([]);
  });
  it.each([{verificationStatus: "pending"}, {isSuspended: true}, {publiclyVisible: false}, {isActive: false}])("denies nonpublic providers %j", async (changes) => {
    mocks.records.set("providers/provider", {...provider, ...changes});
    expect(await getPublicReviewPage("provider")).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("checks the active owner before reading reviews", async () => {
    mocks.records.set("users/owner", {...owner, isBlocked: true});
    expect(await getPublicReviewPage("provider")).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("advances bounded scans through excluded candidates with exact timestamp precision", async () => {
    mocks.candidates = Array.from({length: 6}, (_, index) => candidate(review({isVisible: false}), `review_${index}`));
    const first = await getPublicReviewPage("provider");
    expect(first?.reviews).toEqual([]);
    const cursor = first!.nextCursor!;
    expect(decodePublicReviewCursor(cursor, "provider")).toEqual({providerId: "provider", id: "review_4", seconds: 1700000000, nanoseconds: 123456789});
    await getPublicReviewPage("provider", cursor);
    expect(mocks.startAfter).toHaveBeenCalledWith(new Timestamp(1700000000, 123456789), "review_4");
    expect(() => decodePublicReviewCursor(cursor, "other")).toThrow();
  });
  it.each([-1, 1000000000, 1.5])("rejects invalid cursor nanoseconds %s", (nanoseconds) => {
    const cursor = Buffer.from(JSON.stringify({providerId: "provider", id: "review", seconds: 1700000000, nanoseconds})).toString("base64url");
    expect(() => decodePublicReviewCursor(cursor, "provider")).toThrow();
  });
  it.each(["!", "e30", "a".repeat(1001), Buffer.from(JSON.stringify({providerId: "provider", id: "x/y", seconds: 1, nanoseconds: 0})).toString("base64url")])("rejects malformed cursors", (cursor) => {
    expect(() => decodePublicReviewCursor(cursor, "provider")).toThrow();
  });
  it("uses an existing index without a new moderation index requirement", () => {
    const indexes = JSON.parse(readFileSync("../../firebase/firestore.indexes.json", "utf8")).indexes;
    expect(indexes.some((index: {collectionGroup: string; fields: {fieldPath: string}[]}) => index.collectionGroup === "reviews" && index.fields.map((field) => field.fieldPath).join(",") === "providerId,isDeleted,createdAt,__name__")).toBe(true);
  });
});

describe("public ratings presentation", () => {
  it.each([ProviderLogoCard, ProviderCard])("places genuine ratings directly below the provider name", (Card) => {
    const normalized = normalizePublicProvider("provider", {...provider, ...counters}, owner)!;
    render(<Card provider={normalized} />);
    const heading = screen.getByRole("heading", {name: "Real Events"});
    expect(heading.nextElementSibling).toHaveTextContent("4.3(3 reviews)");
    expect(screen.getByLabelText("4.33 out of 5 stars")).toBeVisible();
  });
  it("shows no reviews without a zero star rating", () => {
    render(<ProviderLogoCard provider={normalizePublicProvider("provider", provider, owner)!} />);
    expect(screen.getByText("No reviews yet")).toBeVisible();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });
  it("shows unavailable ratings for invalid aggregates", () => {
    render(<ProviderLogoCard provider={normalizePublicProvider("provider", {...provider, canonicalReviewCount: null}, owner)!} />);
    expect(screen.getByText("Ratings unavailable")).toBeVisible();
  });
  it("places the profile anchor before location and the review section before planning", () => {
    render(<ProviderProfile detail={{provider: {...normalizePublicProvider("provider", {...provider, ...counters}, owner)!, location: "Ormoc"}, packages: []}} />);
    const anchor = screen.getByRole("link", {name: "Read reviews"});
    expect(anchor).toHaveAttribute("href", "#provider-reviews");
    expect(anchor.compareDocumentPosition(screen.getByText("Ormoc")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const section = screen.getByRole("region", {name: "Ratings & Reviews"});
    expect(section.id).toBe("provider-reviews");
    expect(section.compareDocumentPosition(screen.getByRole("heading", {name: "Found something that fits your celebration?"})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("shows compact summary counts and gold distribution without redundant text", async () => {
    const page = await getPublicReviewPage("provider");
    render(<ProviderPublicReviews providerId="provider" summary={publicReviewSummary(counters)} initialPage={page} />);
    expect(screen.getByLabelText("4.33 out of 5 stars")).toBeVisible();
    expect(screen.getByText("(3 reviews)")).toBeVisible();
    expect(screen.queryByText("4.3 out of 5")).not.toBeInTheDocument();
    const meter = screen.getByRole("meter", {name: "5 star reviews"});
    expect(meter).toHaveAttribute("aria-valuenow", "2");
    expect(meter).toHaveAttribute("aria-valuemax", "3");
    expect(meter.firstElementChild).toHaveClass("bg-[#F5B301]");
    expect(meter.firstElementChild).toHaveStyle({width: `${2 / 3 * 100}%`});
    expect(screen.queryByText("Thank you!")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: /Read more/}));
    expect(within(screen.getByRole("dialog")).getByText("Thank you!")).toBeVisible();
  });

  it("shows neutral empty states without fabricated stars or navigation", () => {
    render(<ProviderPublicReviews providerId="provider" summary={publicReviewSummary({})} initialPage={{reviews: [], nextCursor: null}} />);
    expect(screen.getByText("No customer reviews yet.")).toBeVisible();
    expect(screen.getByText("No reviews yet")).toBeVisible();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  function reviews(start: number, count: number) {
    return Array.from({length: count}, (_, index) => ({id: `review-${start + index}`, rating: 5,
      comment: `Full review ${start + index}. ${"Long comment with details. ".repeat(30)}`,
      createdAt: "2023-11-14T22:13:20.123Z", providerReply: `Reply ${start + index}`}));
  }
  function response(page: {reviews: ReturnType<typeof reviews>; nextCursor: string | null}) {
    return {ok: true, json: async () => page} as Response;
  }

  it.each([1, 3])("shows %i compact previews with full comments and replies accessible", async (count) => {
    const user = userEvent.setup();
    const items = reviews(1, count);
    render(<ProviderPublicReviews providerId="provider" initialPage={{reviews: items, nextCursor: null}} />);
    const previews = screen.getByLabelText("Recent review previews");
    expect(within(previews).getAllByRole("article")).toHaveLength(count);
    expect(within(previews).getByText(items[0].comment.trim())).toHaveClass("line-clamp-2");
    expect(screen.queryByRole("button", {name: "View all reviews"})).not.toBeInTheDocument();
    await user.click(within(previews).getAllByRole("button", {name: /Read more/})[0]);
    const dialog = screen.getByRole("dialog", {name: "All reviews"});
    expect(within(dialog).getAllByRole("article")).toHaveLength(count);
    expect(within(dialog).getByText(items[0].comment.trim())).not.toHaveClass("line-clamp-2");
    expect(within(dialog).getByText("Reply 1")).toBeVisible();
    expect(within(dialog).getByRole("button", {name: "Next"})).toBeDisabled();
    expect(within(dialog).getByRole("button", {name: "Previous"})).toBeDisabled();
  });

  it("limits previews to three and replaces pages across thirteen reviews", async () => {
    const user = userEvent.setup();
    const first = {reviews: reviews(1, 5), nextCursor: "cursor-5"};
    const second = {reviews: reviews(6, 5), nextCursor: "cursor-10"};
    const third = {reviews: reviews(11, 3), nextCursor: null};
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(second)).mockResolvedValueOnce(response(third))
      .mockResolvedValueOnce(response(second)).mockResolvedValueOnce(response(first));
    render(<ProviderPublicReviews providerId="provider" summary={{totalReviews: 13, averageRating: 5, ratingDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 13}}} initialPage={first} />);
    const previews = screen.getByLabelText("Recent review previews");
    expect(within(previews).getAllByRole("article")).toHaveLength(3);
    await user.click(screen.getByRole("button", {name: "View all reviews"}));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("article")).toHaveLength(5);
    await user.click(within(dialog).getByRole("button", {name: "Next"}));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Page 2"));
    expect(within(dialog).queryByText(first.reviews[0].comment)).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("article")).toHaveLength(5);
    await user.click(within(dialog).getByRole("button", {name: "Next"}));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Page 3"));
    expect(within(dialog).getAllByRole("article")).toHaveLength(3);
    expect(within(dialog).getByRole("button", {name: "Next"})).toBeDisabled();
    await user.click(within(dialog).getByRole("button", {name: "Previous"}));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Page 2"));
    await user.click(within(dialog).getByRole("button", {name: "Previous"}));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Page 1"));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/customer/providers/provider/reviews?cursor=cursor-5",
      "/customer/providers/provider/reviews?cursor=cursor-10",
      "/customer/providers/provider/reviews?cursor=cursor-5",
      "/customer/providers/provider/reviews",
    ]);
    await user.click(within(dialog).getByRole("button", {name: "Close dialog"}));
    expect(within(previews).getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("(13 reviews)")).toBeVisible();
    expect(screen.getByRole("meter", {name: "5 star reviews"})).toHaveAttribute("aria-valuenow", "13");
  });

  it("retries the failed cursor, preserves the current page, and advances empty batches", async () => {
    const user = userEvent.setup();
    let finish: (value: Response) => void = () => {};
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {finish = resolve;}))
      .mockResolvedValueOnce(response({reviews: [], nextCursor: "empty-cursor"}))
      .mockResolvedValueOnce(response({reviews: reviews(6, 1), nextCursor: null}));
    render(<ProviderPublicReviews providerId="provider" initialPage={{reviews: reviews(1, 1), nextCursor: "cursor"}} />);
    await user.click(screen.getByRole("button", {name: "View all reviews"}));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", {name: "Next"}));
    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading reviews");
    expect(within(dialog).getByRole("button", {name: "Next"})).toBeDisabled();
    finish({ok: false} as Response);
    expect(await within(dialog).findByRole("alert")).toBeVisible();
    expect(within(dialog).getByText("Reply 1")).toBeVisible();
    await user.click(within(dialog).getByRole("button", {name: "Try again"}));
    expect(await within(dialog).findByText("No published reviews in this batch. Continue to the next page.")).toBeVisible();
    expect(within(dialog).getByRole("button", {name: "Next"})).toBeEnabled();
    await user.click(within(dialog).getByRole("button", {name: "Next"}));
    expect(await within(dialog).findByText("Reply 6")).toBeVisible();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/customer/providers/provider/reviews?cursor=cursor",
      "/customer/providers/provider/reviews?cursor=cursor",
      "/customer/providers/provider/reviews?cursor=empty-cursor",
    ]);
  });

  it("loads missing initial pages and offers retry and empty states", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({reviews: [], nextCursor: null}));
    render(<ProviderPublicReviews providerId="provider" />);
    await user.click(screen.getByRole("button", {name: "View all reviews"}));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toBeVisible();
    await user.click(within(dialog).getByRole("button", {name: "Try again"}));
    expect(await within(dialog).findByText("No customer reviews on this page.")).toBeVisible();
  });

  it("supports keyboard opening, traps focus, closes with Escape, and restores each opener", async () => {
    const user = userEvent.setup();
    render(<ProviderPublicReviews providerId="provider" initialPage={{reviews: reviews(1, 5), nextCursor: null}} />);
    const opener = screen.getByRole("button", {name: "View all reviews"});
    opener.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", {name: "All reviews"});
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const close = within(dialog).getByRole("button", {name: "Close dialog"});
    close.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({shift: true});
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    const readMore = screen.getAllByRole("button", {name: /Read more/})[1];
    await user.click(readMore);
    expect(within(screen.getByRole("dialog")).getAllByRole("article")[1]).toHaveFocus();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Close dialog"}));
    expect(readMore).toHaveFocus();
  });

  it("ignores a response after closing and reopens on the first page", async () => {
    const user = userEvent.setup();
    let finish: (value: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise<Response>((resolve) => {finish = resolve;}));
    render(<ProviderPublicReviews providerId="provider" initialPage={{reviews: reviews(1, 5), nextCursor: "cursor"}} />);
    const opener = screen.getByRole("button", {name: "View all reviews"});
    await user.click(opener);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Next"}));
    await user.keyboard("{Escape}");
    finish(response({reviews: reviews(6, 1), nextCursor: null}));
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("article")).toHaveLength(5);
    expect(within(dialog).getByText("Reply 1")).toBeVisible();
    expect(within(dialog).queryByText("Reply 6")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Page 1");
    expect(within(dialog).getByRole("button", {name: "Next"})).toBeEnabled();
  });

});
