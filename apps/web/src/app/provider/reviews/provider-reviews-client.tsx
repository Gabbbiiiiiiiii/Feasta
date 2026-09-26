"use client";

import {Eye, MessageSquareQuote, Star} from "lucide-react";
import {usePathname, useRouter} from "next/navigation";
import {useMemo, useRef, useState} from "react";

import {
  CursorPagination,
  DataTable,
  type DataTableColumn,
} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import type {
  ProviderReview,
  ProviderReviewDetail,
  ProviderReviewFilter,
  ProviderReviewFilters,
  ProviderReviewPage,
  ProviderReviewSummary,
  ProviderReviewVisibility,
} from "@/lib/provider/reviews/provider-review-types";

import {
  loadProviderReviewAction,
  loadProviderReviewsAction,
} from "./actions";
import {ProviderReviewDetailDrawer} from "./provider-review-detail-drawer";

type ProviderReviewsClientProps = {
  initialPage: ProviderReviewPage;
  initialFilters: ProviderReviewFilters;
  summary: ProviderReviewSummary;
};

const FIRST_PAGE_CURSOR = "__first_provider_review_page__";

const filterOptions: readonly {
  value: ProviderReviewFilter;
  label: string;
}[] = [
  {value: "all", label: "All Reviews"},
  {value: "5", label: "5 Stars"},
  {value: "4", label: "4 Stars"},
  {value: "3", label: "3 Stars"},
  {value: "2", label: "2 Stars"},
  {value: "1", label: "1 Star"},
];

const distributionRatings = [5, 4, 3, 2, 1] as const;
const starRatings = [1, 2, 3, 4, 5] as const;

export function ProviderReviewsClient({
  initialPage,
  initialFilters,
  summary,
}: ProviderReviewsClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState(initialFilters);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] =
    useState<ProviderReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);

  const columns = useMemo<readonly DataTableColumn<ProviderReview>[]>(() => [
    {
      id: "customer",
      header: "Customer",
      cell: (review) => (
        <span className="font-semibold">{review.customerDisplayName}</span>
      ),
    },
    {
      id: "rating",
      header: "Rating",
      cell: (review) => <StarRating rating={review.rating} />,
    },
    {
      id: "review",
      header: "Review",
      cell: (review) => (
        <p className="line-clamp-3 min-w-48 whitespace-pre-wrap break-words">
          {review.comment}
        </p>
      ),
    },
    {
      id: "event",
      header: "Event / Service",
      cell: (review) => (
        <span>
          <span className="block font-medium">
            {formatLabel(review.context.eventType)}
          </span>
          <span className="block text-muted-foreground">
            {formatDate(review.context.eventDate)}
          </span>
          <span className="block text-muted-foreground">
            {review.context.serviceSummary}
          </span>
        </span>
      ),
    },
    {
      id: "visibility",
      header: "Visibility",
      cell: (review) => <ReviewVisibility visibility={review.visibility} />,
    },
    {
      id: "created",
      header: "Received",
      cell: (review) => formatDate(review.createdAt),
    },
  ], []);

  const loadPage = async (
    nextFilters: ProviderReviewFilters,
    nextHistory: string[],
    nextPageNumber: number,
  ) => {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await loadProviderReviewsAction(nextFilters);
      setPage(result);
      setFilters(nextFilters);
      setCursorHistory(nextHistory);
      setPageNumber(nextPageNumber);
    } catch {
      setLoadError("Reviews could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectFilter = (rating: ProviderReviewFilter) => {
    if (loading || rating === filters.rating) return;

    const nextFilters = {...filters, rating, cursor: null};
    const query = rating === "all"
      ? ""
      : `?rating=${encodeURIComponent(rating)}`;
    router.replace(`${pathname}${query}`, {scroll: false});
    void loadPage(nextFilters, [], 1);
  };

  const openReview = async (
    reviewId: string,
    trigger?: HTMLButtonElement,
  ) => {
    if (trigger) reviewTrigger.current = trigger;
    setSelectedReviewId(reviewId);
    setSelectedReview(null);
    setDetailError(null);
    setDetailLoading(true);
    setDrawerOpen(true);

    try {
      setSelectedReview(await loadProviderReviewAction(reviewId));
    } catch {
      setDetailError("Review details could not be loaded. Please try again.");
    } finally {
      setDetailLoading(false);
    }
  };

  const previousCursor = cursorHistory.at(-1) ?? null;
  const emptyCopy = getEmptyCopy(filters.rating);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Customer feedback"
        title="Reviews"
        description="View customer feedback and ratings from completed FEASTA events."
      />

      <RatingOverview summary={summary} />

      <section
        className="rounded-card border border-border bg-card p-3 shadow-card"
        aria-labelledby="provider-review-filter-heading"
      >
        <h2 id="provider-review-filter-heading" className="sr-only">
          Filter customer reviews
        </h2>
        <div
          className="flex max-w-full gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Review rating filters"
        >
          {filterOptions.map((option) => (
            <Button
              key={option.value}
              variant={filters.rating === option.value ? "primary" : "secondary"}
              size="compact"
              className="shrink-0"
              aria-pressed={filters.rating === option.value}
              disabled={loading}
              onClick={() => selectFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4" aria-labelledby="review-history-heading">
        <div>
          <h2 id="review-history-heading" className="text-xl font-bold">
            Review history
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Feedback connected to completed events for your business.
          </p>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {loading ? "Loading provider reviews" : `${page.reviews.length} reviews displayed`}
        </p>

        {page.skippedMalformedCount > 0 && !loading && !loadError ? (
          <p
            className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-foreground"
            role="status"
          >
            Some review records could not be displayed safely.
          </p>
        ) : null}

        <DataTable
          columns={columns}
          rows={page.reviews}
          getRowId={(review) => review.id}
          caption="Provider review results"
          loading={loading}
          error={loadError ?? undefined}
          onRetry={() => void loadPage(filters, cursorHistory, pageNumber)}
          emptyTitle={emptyCopy.title}
          emptyDescription={emptyCopy.description}
          rowActionsLabel="View review"
          rowActions={(review) => (
            <Button
              variant="ghost"
              size="compact"
              aria-label={`View review from ${review.customerDisplayName}`}
              onClick={(event) => void openReview(review.id, event.currentTarget)}
            >
              <Eye aria-hidden="true" className="size-4" />
              View
            </Button>
          )}
          renderMobileRow={(review) => (
            <ReviewMobileCard
              review={review}
              onView={(trigger) => void openReview(review.id, trigger)}
            />
          )}
        />
      </section>

      <CursorPagination
        previousCursor={previousCursor}
        nextCursor={page.nextCursor}
        loading={loading}
        pageLabel={`Page ${pageNumber}`}
        onPrevious={(cursor) => {
          const nextHistory = cursorHistory.slice(0, -1);
          const nextCursor = cursor === FIRST_PAGE_CURSOR ? null : cursor;
          void loadPage(
            {...filters, cursor: nextCursor},
            nextHistory,
            Math.max(1, pageNumber - 1),
          );
        }}
        onNext={(cursor) => {
          const currentCursor = filters.cursor ?? FIRST_PAGE_CURSOR;
          void loadPage(
            {...filters, cursor},
            [...cursorHistory, currentCursor],
            pageNumber + 1,
          );
        }}
      />

      <ProviderReviewDetailDrawer
        review={selectedReview}
        open={drawerOpen}
        loading={detailLoading}
        error={detailError}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedReviewId(null);
            setSelectedReview(null);
            setDetailError(null);
            setTimeout(() => reviewTrigger.current?.focus(), 0);
          }
        }}
        onRetry={() => selectedReviewId && void openReview(selectedReviewId)}
      />
    </div>
  );
}

function RatingOverview({summary}: {summary: ProviderReviewSummary}) {
  return (
    <section
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]"
      aria-labelledby="rating-overview-heading"
    >
      <h2 id="rating-overview-heading" className="sr-only">
        Rating overview
      </h2>

      <article className="grid content-center justify-items-center rounded-card border border-border bg-card p-6 text-center shadow-card sm:p-8">
        <MessageSquareQuote aria-hidden="true" className="size-7 text-primary-strong" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          Average rating
        </p>
        <p className="mt-1 text-5xl font-black tracking-tight">
          {formatAverageRating(summary.averageRating)}
        </p>
        <StarRating rating={summary.averageRating} />
        <p className="mt-3 text-sm text-muted-foreground">
          Based on <span className="font-semibold text-foreground">
            {summary.totalReviews.toLocaleString("en-PH")}
          </span> {summary.totalReviews === 1 ? "review" : "reviews"}
        </p>
      </article>

      <article className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold">Rating distribution</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Exact published review counts by star rating.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold">
            {summary.totalReviews.toLocaleString("en-PH")} total
          </p>
        </div>
        <div className="mt-5 grid gap-3">
          {distributionRatings.map((rating) => {
            const count = summary.ratingDistribution[rating];
            const percentage = summary.totalReviews > 0
              ? (count / summary.totalReviews) * 100
              : 0;

            return (
              <div
                key={rating}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm"
                aria-label={`${rating} stars: ${count} reviews`}
              >
                <span className="font-semibold">{rating} stars</span>
                <span className="h-2.5 overflow-hidden rounded-pill bg-muted" aria-hidden="true">
                  <span
                    className="block h-full rounded-pill bg-primary"
                    style={{width: `${percentage}%`}}
                  />
                </span>
                <span className="text-right font-semibold">{count}</span>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function ReviewMobileCard({
  review,
  onView,
}: {
  review: ProviderReview;
  onView: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <article className="grid min-w-0 gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{review.customerDisplayName}</h3>
          <div className="mt-1"><StarRating rating={review.rating} /></div>
        </div>
        <ReviewVisibility visibility={review.visibility} />
      </div>

      <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm">
        {review.comment}
      </p>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Event</dt>
          <dd className="mt-1 font-medium">{formatLabel(review.context.eventType)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Event date</dt>
          <dd className="mt-1 font-medium">{formatDate(review.context.eventDate)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Service / package</dt>
          <dd className="mt-1 font-medium">{review.context.serviceSummary}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Received</dt>
          <dd className="mt-1 font-medium">{formatDate(review.createdAt)}</dd>
        </div>
      </dl>

      <Button
        variant="secondary"
        size="compact"
        onClick={(event) => onView(event.currentTarget)}
        aria-label={`View review from ${review.customerDisplayName}`}
      >
        <Eye aria-hidden="true" className="size-4" />
        View review
      </Button>
    </article>
  );
}

function StarRating({rating}: {rating: number}) {
  const roundedRating = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <span
      className="inline-flex items-center gap-2"
      aria-label={`${formatAverageRating(rating)} out of 5 stars`}
    >
      <span className="inline-flex gap-0.5 text-warning" aria-hidden="true">
        {starRatings.map((star) => (
          <Star
            key={star}
            className="size-4"
            fill={star <= roundedRating ? "currentColor" : "none"}
          />
        ))}
      </span>
      <span className="text-sm font-semibold" aria-hidden="true">
        {formatAverageRating(rating)}/5
      </span>
    </span>
  );
}

function ReviewVisibility({
  visibility,
}: {
  visibility: ProviderReviewVisibility;
}) {
  return (
    <span className="grid justify-items-start gap-1">
      <Badge tone={visibility === "visible" ? "success" : "neutral"}>
        {visibility === "visible" ? "Visible" : "Hidden"}
      </Badge>
      {visibility === "hidden" ? (
        <span className="text-xs text-muted-foreground">Hidden from public view</span>
      ) : null}
    </span>
  );
}

function getEmptyCopy(rating: ProviderReviewFilter) {
  if (rating === "all") {
    return {
      title: "No reviews yet",
      description: "Customer reviews from completed FEASTA events will appear here.",
    };
  }

  return {
    title: `No ${rating}-star reviews`,
    description: `No ${rating}-star customer reviews are available for your business.`,
  };
}

function formatAverageRating(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(date);
}
