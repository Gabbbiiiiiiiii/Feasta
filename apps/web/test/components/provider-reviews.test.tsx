import {readFileSync} from "node:fs";
import {join} from "node:path";

import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  ProviderReview,
  ProviderReviewFilter,
  ProviderReviewPage,
  ProviderReviewSummary,
} from "@/lib/provider/reviews/provider-review-types";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  loadPage: vi.fn(),
  loadReview: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/provider/reviews",
  useRouter: () => ({replace: mocks.replace}),
}));

vi.mock("@/app/provider/reviews/actions", () => ({
  loadProviderReviewsAction: mocks.loadPage,
  loadProviderReviewAction: mocks.loadReview,
}));

import {ProviderReviewsClient} from "@/app/provider/reviews/provider-reviews-client";

const summary: ProviderReviewSummary = {
  totalReviews: 10,
  averageRating: 4.2,
  ratingDistribution: {
    5: 6,
    4: 2,
    3: 1,
    2: 0,
    1: 1,
  },
};

function review(overrides: Partial<ProviderReview> = {}): ProviderReview {
  return {
    id: "review-event_customer",
    rating: 5,
    comment: "The team made our celebration feel effortless and memorable.",
    customerDisplayName: "Ana Reyes",
    visibility: "visible",
    context: {
      eventType: "birthday_party",
      eventDate: "2026-08-15T04:00:00.000Z",
      serviceSummary: "Celebration Package",
    },
    providerReply: "Thank you for trusting our team with your celebration.",
    providerReplyAt: "2026-08-18T02:30:00.000Z",
    createdAt: "2026-08-17T02:00:00.000Z",
    updatedAt: "2026-08-18T02:30:00.000Z",
    ...overrides,
  };
}

function reviewPage(
  reviews: ProviderReview[] = [review()],
  nextCursor: string | null = null,
  skippedMalformedCount = 0,
): ProviderReviewPage {
  return {
    reviews,
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount,
  };
}

function renderWorkspace({
  initialPage = reviewPage(),
  rating = "all",
}: {
  initialPage?: ProviderReviewPage;
  rating?: ProviderReviewFilter;
} = {}) {
  render(
    <ProviderReviewsClient
      initialPage={initialPage}
      initialFilters={{rating, pageSize: 10, cursor: null}}
      summary={summary}
    />,
  );
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.loadPage.mockReset();
  mocks.loadReview.mockReset();
  mocks.loadPage.mockResolvedValue(reviewPage());
  mocks.loadReview.mockResolvedValue(review());
});

describe("provider reviews route contract", () => {
  const root = process.cwd();
  const pageSource = readFileSync(
    join(root, "src/app/provider/reviews/page.tsx"),
    "utf8",
  );
  const actionSource = readFileSync(
    join(root, "src/app/provider/reviews/actions.ts"),
    "utf8",
  );
  const serviceSource = readFileSync(
    join(root, "src/lib/provider/reviews/provider-review-service.ts"),
    "utf8",
  );

  it("loads the protected canonical page and exact summary on the server", () => {
    expect(pageSource).toContain("getProviderReviewPage(initialFilters)");
    expect(pageSource).toContain("getProviderReviewSummary()");
    expect(pageSource).toContain("await Promise.all(");
    expect(actionSource).toContain("await getProviderReviewPage(filters)");
    expect(actionSource).toContain("await getProviderReview(reviewId)");
    expect(serviceSource).toContain("await requireApprovedProvider()");
    expect(pageSource).not.toContain("firebase/firestore");
    expect(actionSource).not.toContain("providerId");
  });
});

describe("provider reviews workspace", () => {
  it("renders one heading and the exact average, total, and complete distribution", () => {
    renderWorkspace();

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: "Reviews"})).toBeVisible();
    expect(screen.getByText("Customer feedback")).toBeVisible();
    expect(screen.getByText("4.2", {selector: "p"})).toBeVisible();
    expect(screen.getByText(/Based on/iu)).toHaveTextContent("10 reviews");

    for (const [rating, count] of [[5, 6], [4, 2], [3, 1], [2, 0], [1, 1]]) {
      expect(screen.getByLabelText(`${rating} stars: ${count} reviews`)).toBeVisible();
    }
  });

  it("shows every URL-backed rating filter and resets pagination", async () => {
    const user = userEvent.setup();
    renderWorkspace({initialPage: reviewPage([review()], "opaque-page-two")});

    const filters = screen.getByRole("group", {name: "Review rating filters"});
    for (const label of [
      "All Reviews",
      "5 Stars",
      "4 Stars",
      "3 Stars",
      "2 Stars",
      "1 Star",
    ]) {
      expect(within(filters).getByRole("button", {name: label})).toBeVisible();
    }

    await user.click(within(filters).getByRole("button", {name: "5 Stars"}));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        "/provider/reviews?rating=5",
        {scroll: false},
      );
      expect(mocks.loadPage).toHaveBeenCalledWith({
        rating: "5",
        pageSize: 10,
        cursor: null,
      });
    });
    expect(await screen.findByText("Page 1")).toBeVisible();
  });

  it("uses opaque filter-scoped cursor history for Next and Previous", async () => {
    const user = userEvent.setup();
    mocks.loadPage
      .mockResolvedValueOnce(reviewPage([review()], "opaque-next-2"))
      .mockResolvedValueOnce(reviewPage());
    renderWorkspace({initialPage: reviewPage([review()], "opaque-next-1"), rating: "4"});

    await user.click(screen.getByRole("button", {name: "Next"}));
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith({
      rating: "4",
      pageSize: 10,
      cursor: "opaque-next-1",
    }));
    expect(await screen.findByText("Page 2")).toBeVisible();

    await user.click(screen.getByRole("button", {name: "Previous"}));
    await waitFor(() => expect(mocks.loadPage).toHaveBeenLastCalledWith({
      rating: "4",
      pageSize: 10,
      cursor: null,
    }));
    expect(await screen.findByText("Page 1")).toBeVisible();
  });

  it("renders provider-safe desktop rows and mobile review cards", () => {
    renderWorkspace();

    const table = screen.getByRole("table", {name: "Provider review results"});
    for (const heading of [
      "Customer",
      "Rating",
      "Review",
      "Event / Service",
      "Visibility",
      "Received",
      "View review",
    ]) {
      expect(within(table).getByRole("columnheader", {name: heading})).toBeVisible();
    }
    expect(within(table).getByText("Ana Reyes")).toBeVisible();
    expect(within(table).getByText("Celebration Package")).toBeVisible();
    expect(within(table).getByLabelText("5.0 out of 5 stars")).toBeVisible();

    const mobile = screen.getByLabelText("Provider review results, mobile view");
    expect(within(mobile).getByText("Ana Reyes")).toBeVisible();
    expect(within(mobile).getByText("Celebration Package")).toBeVisible();
    expect(within(mobile).getByRole("button", {
      name: "View review from Ana Reyes",
    })).toBeVisible();
  });

  it("presents visible and hidden states without moderation metadata", () => {
    renderWorkspace({
      initialPage: reviewPage([
        review(),
        review({id: "review-hidden", customerDisplayName: "Mara Cruz", visibility: "hidden"}),
      ]),
    });

    expect(screen.getAllByText("Visible").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hidden").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hidden from public view").length)
      .toBeGreaterThanOrEqual(2);
    expect(document.body).not.toHaveTextContent(
      /moderation reason|moderator|reported|abuse|admin notes/iu,
    );
  });

  it("announces malformed records without exposing unsafe content", () => {
    renderWorkspace({initialPage: reviewPage([review()], null, 2)});
    expect(screen.getByText("Some review records could not be displayed safely."))
      .toBeVisible();
  });

  it("opens an accessible detail drawer with event context and a read-only reply", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const view = screen.getAllByRole("button", {
      name: "View review from Ana Reyes",
    })[0];

    await user.click(view);
    await waitFor(() => expect(mocks.loadReview).toHaveBeenCalledWith(
      "review-event_customer",
    ));
    const drawer = await screen.findByRole("dialog", {name: "Review details"});
    expect(within(drawer).getByText("review-event_customer")).toBeVisible();
    expect(within(drawer).getByText("Ana Reyes")).toBeVisible();
    expect(within(drawer).getByText("Birthday Party")).toBeVisible();
    expect(within(drawer).getByText("Celebration Package")).toBeVisible();
    expect(within(drawer).getByRole("heading", {name: "Your reply"})).toBeVisible();
    expect(within(drawer).getByText(
      "Thank you for trusting our team with your celebration.",
    )).toBeVisible();
    expect(within(drawer).queryByRole("button", {name: /reply/iu}))
      .not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", {name: "Review details"}))
      .not.toBeInTheDocument();
    await waitFor(() => expect(view).toHaveFocus());
  });

  it("shows no reply or moderation, edit, and delete controls", async () => {
    const user = userEvent.setup();
    const withoutReply = review({providerReply: null, providerReplyAt: null});
    mocks.loadReview.mockResolvedValue(withoutReply);
    renderWorkspace({initialPage: reviewPage([withoutReply])});

    await user.click(screen.getAllByRole("button", {
      name: "View review from Ana Reyes",
    })[0]);
    const drawer = await screen.findByRole("dialog", {name: "Review details"});
    expect(within(drawer).queryByRole("heading", {name: "Your reply"}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: /reply|hide|restore|approve|reject|moderate|delete|edit|dismiss/iu,
    })).not.toBeInTheDocument();
  });

  it("never renders customer contacts or internal moderation information", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getAllByRole("button", {
      name: "View review from Ana Reyes",
    })[0]);
    const drawer = await screen.findByRole("dialog", {name: "Review details"});

    expect(drawer).not.toHaveTextContent(
      /customerId|email|phone|address|moderation|reported|deletedBy|admin/iu,
    );
  });

  it("renders all-reviews and filter-specific empty states", () => {
    const {unmount} = render(
      <ProviderReviewsClient
        initialPage={reviewPage([])}
        initialFilters={{rating: "all", pageSize: 10, cursor: null}}
        summary={{...summary, totalReviews: 0, averageRating: 0}}
      />,
    );
    expect(screen.getByText("No reviews yet")).toBeVisible();
    expect(screen.getByText(
      "Customer reviews from completed FEASTA events will appear here.",
    )).toBeVisible();
    unmount();

    renderWorkspace({initialPage: reviewPage([]), rating: "3"});
    expect(screen.getByText("No 3-star reviews")).toBeVisible();
  });

  it("normalizes action failures into safe provider-facing errors", async () => {
    const user = userEvent.setup();
    mocks.loadReview.mockRejectedValueOnce(new Error("Firestore permission-denied"));
    renderWorkspace();
    await user.click(screen.getAllByRole("button", {
      name: "View review from Ana Reyes",
    })[0]);

    expect(await screen.findByText(
      "Review details could not be loaded. Please try again.",
    )).toBeVisible();
    expect(screen.queryByText("Firestore permission-denied")).not.toBeInTheDocument();
  });
});
