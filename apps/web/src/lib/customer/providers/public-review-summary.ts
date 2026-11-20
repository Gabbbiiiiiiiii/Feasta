import type {PublicReviewSummary} from "./public-review-types";

/** Only the canonical, transactionally maintained published-review counters. */
export function publicReviewSummary(data: Readonly<Record<string, unknown>>): PublicReviewSummary | null {
  const fields = ["canonicalReviewCount", "canonicalRatingTotal", "canonicalRatingDistribution"];
  if (fields.every((field) => !Object.hasOwn(data, field))) {
    return {totalReviews: 0, averageRating: null, ratingDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}};
  }
  const count = data.canonicalReviewCount;
  const total = data.canonicalRatingTotal;
  const distribution = data.canonicalRatingDistribution;
  if (!integer(count) || !integer(total) || !distribution ||
    typeof distribution !== "object" || Array.isArray(distribution)) return null;
  const values = distribution as Record<string, unknown>;
  const ratings = [1, 2, 3, 4, 5] as const;
  if (!ratings.every((rating) => integer(values[rating]))) return null;
  const bins = Object.fromEntries(ratings.map((rating) => [rating, values[rating]])) as PublicReviewSummary["ratingDistribution"];
  const calculatedCount = ratings.reduce((sum, rating) => sum + bins[rating], 0);
  const calculatedTotal = ratings.reduce((sum, rating) => sum + rating * bins[rating], 0);
  if (!Number.isSafeInteger(calculatedCount) || !Number.isSafeInteger(calculatedTotal) ||
    calculatedCount !== count || calculatedTotal !== total) return null;
  return {totalReviews: count, averageRating: count ? Math.round(total / count * 100) / 100 : null, ratingDistribution: bins};
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
