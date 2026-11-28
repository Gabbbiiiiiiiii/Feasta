import {Star} from "lucide-react";
import {filledRatingStarClassName} from "@/components/ui/rating-styles";
import type {PublicReviewSummary} from "@/lib/customer/providers/public-review-types";

export function ProviderRating({summary}: {summary?: PublicReviewSummary | null}) {
  return <p className="mt-2 flex flex-wrap items-center justify-center gap-1 text-xs text-feasta-text-secondary">
    {summary && summary.totalReviews > 0 && summary.averageRating !== null ? <>
      <Star aria-hidden="true" className={`size-3.5 ${filledRatingStarClassName}`} />
      <span aria-label={`${summary.averageRating} out of 5 stars`}>{summary.averageRating.toFixed(1)}</span>
      <span>({summary.totalReviews} {summary.totalReviews === 1 ? "review" : "reviews"})</span>
    </> : summary === null ? "Ratings unavailable" : "No reviews yet"}
  </p>;
}
