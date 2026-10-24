export type PublicReviewSummary = {
  totalReviews: number;
  averageRating: number | null;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type PublicReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  providerReply: string | null;
};

export type PublicReviewPage = {
  reviews: PublicReview[];
  nextCursor: string | null;
};
