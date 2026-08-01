import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  loadReviews: vi.fn(),
  loadDetails: vi.fn(),
  moderateReview: vi.fn(),
  createIdempotencyKey: vi.fn(() => "secure-review-key"),
}));

vi.mock("@/app/admin/reviews/actions", () => ({
  loadAdminReviewsAction: mocks.loadReviews,
  loadAdminReviewDetailsAction: mocks.loadDetails,
}));

vi.mock("@/lib/admin/reviews/admin-review-client", () => ({
  moderateAdminReview: mocks.moderateReview,
  createReviewModerationIdempotencyKey: mocks.createIdempotencyKey,
}));

import {ReviewManagementClient} from "@/components/admin/reviews/review-management-client";
import type {
  AdminReview,
  AdminReviewDetails,
  AdminReviewPage,
} from "@/lib/admin/reviews/admin-review-types";

const review: AdminReview = {
  id: "booking-one_customer-one",
  reviewId: "booking-one_customer-one",
  bookingId: "booking-one",
  bookingCode: "BK-001",
  packageId: "package-one",
  packageName: "Wedding Celebration",
  customerId: "customer-one",
  customerName: "Maria Santos",
  customerEmail: "maria@example.test",
  providerId: "provider-one",
  providerName: "Ormoc Celebration Catering",
  providerOwnerId: "owner-one",
  rating: 5,
  comment: "The catering team was professional and the food was excellent.",
  providerReply: "Thank you for celebrating with us.",
  providerReplyAt: "2026-07-31T03:00:00.000Z",
  moderationStatus: "published",
  moderationReason: null,
  moderatedAt: null,
  moderatedBy: null,
  isVisible: true,
  isReported: true,
  isDeleted: false,
  createdAt: "2026-07-31T02:00:00.000Z",
  updatedAt: "2026-07-31T03:00:00.000Z",
};

const page: AdminReviewPage = {
  reviews: [review],
  statistics: {
    totalCount: 1,
    publishedCount: 1,
    reportedCount: 1,
    hiddenCount: 0,
    averageRating: 5,
  },
  nextCursor: null,
  hasMore: false,
};

const details: AdminReviewDetails = {
  review,
  booking: {
    exists: true,
    id: "booking-one",
    bookingCode: "BK-001",
    eventType: "Wedding",
    eventDate: "2026-07-30T00:00:00.000Z",
    status: "completed",
  },
  provider: {
    exists: true,
    id: "provider-one",
    name: "Ormoc Celebration Catering",
    ownerId: "owner-one",
    verificationStatus: "approved",
    ratingAverage: 5,
    reviewCount: 1,
  },
  auditHistory: [],
};

describe("admin review management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadReviews.mockResolvedValue(page);
    mocks.loadDetails.mockResolvedValue({details});
    mocks.moderateReview.mockResolvedValue({
      reviewId: review.id,
      moderationStatus: "hidden",
      isVisible: false,
      isReported: false,
      idempotentReplay: false,
    });
  });

  it("renders review statistics and verified review context", () => {
    render(<ReviewManagementClient initialPage={page} />);

    expect(screen.getByRole("heading", {name: "Review Management"}))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Total Reviews")).toHaveTextContent("1");
    expect(screen.getByLabelText("Average Rating")).toHaveTextContent("5.0 / 5");
    expect(screen.getAllByText("Maria Santos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ormoc Celebration Catering").length)
      .toBeGreaterThan(0);
    expect(screen.getAllByText("Reported").length).toBeGreaterThan(0);
  });

  it("loads bounded server results when a moderation filter changes", async () => {
    const user = userEvent.setup();
    render(<ReviewManagementClient initialPage={page} />);

    await user.selectOptions(
      screen.getByRole("combobox", {name: "Moderation status"}),
      "hidden",
    );

    await waitFor(() => expect(mocks.loadReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "hidden",
        cursor: null,
        pageSize: 10,
      }),
    ));
  });

  it("requires a reason and sends a replay-safe hide decision", async () => {
    const user = userEvent.setup();
    render(<ReviewManagementClient initialPage={page} />);

    await user.click(screen.getAllByRole("button", {name: "Review"})[0]);
    await screen.findByText("Review parties");

    const hide = screen.getByRole("button", {name: /hide review/i});
    expect(hide).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", {
    name: /^Reason for hiding/u,
    }), {
      target: {value: "The review contains prohibited personal information."},
    });
    expect(hide).toBeEnabled();
    await user.click(hide);

    await waitFor(() => expect(mocks.moderateReview).toHaveBeenCalledWith({
      reviewId: review.id,
      action: "hide",
      reason: "The review contains prohibited personal information.",
      idempotencyKey: "secure-review-key",
    }));
    expect(mocks.createIdempotencyKey).toHaveBeenCalledWith(review.id, "hide");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "The review was hidden",
    );
  });

  it("renders an honest empty state", () => {
    render(<ReviewManagementClient initialPage={{
      ...page,
      reviews: [],
      statistics: {
        totalCount: 0,
        publishedCount: 0,
        reportedCount: 0,
        hiddenCount: 0,
        averageRating: 0,
      },
    }} />);

    expect(screen.getByText("No reviews found")).toBeInTheDocument();
    expect(screen.getByText(/No review records match/u)).toBeInTheDocument();
  });
});