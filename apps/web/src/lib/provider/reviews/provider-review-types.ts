export type ProviderReviewRating = 1 | 2 | 3 | 4 | 5;

export type ProviderReviewFilter =
  | "all"
  | "5"
  | "4"
  | "3"
  | "2"
  | "1";

export type ProviderReviewFilters = {
  rating: ProviderReviewFilter;
  pageSize: number;
  cursor?: string | null;
};

export type ProviderReviewVisibility = "visible" | "hidden";

export type ProviderReviewContext = {
  eventType: string;
  eventDate: string;
  serviceSummary: string;
};

export type ProviderReview = {
  id: string;
  rating: ProviderReviewRating;
  comment: string;
  customerDisplayName: string;
  visibility: ProviderReviewVisibility;
  context: ProviderReviewContext;
  providerReply: string | null;
  providerReplyAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type ProviderReviewDetail = ProviderReview;

export type ProviderReviewRatingDistribution = {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
};

export type ProviderReviewSummary = {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: ProviderReviewRatingDistribution;
};

export type ProviderReviewPage = {
  reviews: ProviderReview[];
  nextCursor: string | null;
  hasMore: boolean;
  skippedMalformedCount: number;
};
