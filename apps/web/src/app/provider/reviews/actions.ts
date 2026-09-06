"use server";

import {
  getProviderReview,
  getProviderReviewPage,
} from "@/lib/provider/reviews/provider-review-service";
import type {
  ProviderReviewDetail,
  ProviderReviewFilters,
  ProviderReviewPage,
} from "@/lib/provider/reviews/provider-review-types";

export async function loadProviderReviewsAction(
  filters: ProviderReviewFilters,
): Promise<ProviderReviewPage> {
  return await getProviderReviewPage(filters);
}

export async function loadProviderReviewAction(
  reviewId: string,
): Promise<ProviderReviewDetail> {
  return await getProviderReview(reviewId);
}
