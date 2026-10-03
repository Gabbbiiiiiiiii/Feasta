import {
  getProviderReviewPage,
  getProviderReviewSummary,
} from "@/lib/provider/reviews/provider-review-service";
import type {ProviderReviewFilter} from "@/lib/provider/reviews/provider-review-types";

import {ProviderReviewsClient} from "./provider-reviews-client";

type ProviderReviewsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ratingFilters: readonly ProviderReviewFilter[] = [
  "all",
  "5",
  "4",
  "3",
  "2",
  "1",
];

export default async function ProviderReviewsPage({
  searchParams,
}: ProviderReviewsPageProps) {
  const values = await searchParams;
  const requestedRating = Array.isArray(values.rating)
    ? values.rating[0]
    : values.rating;
  const rating = ratingFilters.includes(
    requestedRating as ProviderReviewFilter,
  )
    ? requestedRating as ProviderReviewFilter
    : "all";
  const initialFilters = {
    rating,
    pageSize: 10,
    cursor: null,
  } as const;
  const [initialPage, summary] = await Promise.all([
    getProviderReviewPage(initialFilters),
    getProviderReviewSummary(),
  ]);

  return (
    <ProviderReviewsClient
      initialFilters={initialFilters}
      initialPage={initialPage}
      summary={summary}
    />
  );
}
