"use server";

import {
  getAdminReviewDetails,
  getAdminReviewPage,
} from "@/lib/admin/reviews/admin-review-service";
import type {
  AdminReviewDetailsResult,
  AdminReviewFilters,
  AdminReviewPage,
} from "@/lib/admin/reviews/admin-review-types";

export async function loadAdminReviewsAction(
  filters: AdminReviewFilters,
): Promise<AdminReviewPage> {
  return getAdminReviewPage(filters);
}

export async function loadAdminReviewDetailsAction(
  reviewId: string,
): Promise<AdminReviewDetailsResult> {
  return getAdminReviewDetails(reviewId);
}