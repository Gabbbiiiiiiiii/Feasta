"use client";

import {
  Eye,
  EyeOff,
  Flag,
  MessageSquareText,
  RefreshCw,
  Star,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  loadAdminReviewDetailsAction,
  loadAdminReviewsAction,
} from "@/app/admin/reviews/actions";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSort,
} from "@/components/data/data-table";
import {DetailDrawer} from "@/components/data/detail-drawer";
import {FilterToolbar} from "@/components/data/filter-toolbar";
import {SummaryCard} from "@/components/data/summary-card";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {
  createReviewModerationIdempotencyKey,
  moderateAdminReview,
} from "@/lib/admin/reviews/admin-review-client";
import type {
  AdminReview,
  AdminReviewDateFilter,
  AdminReviewDetails,
  AdminReviewFilters,
  AdminReviewModerationAction,
  AdminReviewModerationStatusFilter,
  AdminReviewPage,
  AdminReviewRatingFilter,
  AdminReviewReportFilter,
  AdminReviewSortDirection,
  AdminReviewSortField,
  ModerateAdminReviewResult,
} from "@/lib/admin/reviews/admin-review-types";
import {cn} from "@/lib/utils";

type ReviewManagementClientProps = {
  initialPage: AdminReviewPage;
};

const DEFAULT_FILTERS: AdminReviewFilters = {
  search: "",
  status: "all",
  report: "all",
  rating: "all",
  date: "all",
  sortField: "createdAt",
  sortDirection: "descending",
  pageSize: 10,
  cursor: null,
};

function ReviewManagementClient({
  initialPage,
}: ReviewManagementClientProps) {
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchValue, setSearchValue] = useState("");
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([
    null,
  ]);
  const [pageError, setPageError] = useState<string>();
  const [selectedReview, setSelectedReview] = useState<AdminReview | null>(null);
  const [details, setDetails] = useState<AdminReviewDetails | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string>();
  const [moderationAction, setModerationAction] =
    useState<AdminReviewModerationAction | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [moderationError, setModerationError] = useState<string>();
  const [moderationNotice, setModerationNotice] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const pageRequestId = useRef(0);
  const detailsRequestId = useRef(0);
  const submittingModeration = useRef(false);

  const loadPage = useCallback((
    nextFilters: AdminReviewFilters,
    cursor: string | null,
    history: (string | null)[],
  ) => {
    const requestId = ++pageRequestId.current;
    setPageError(undefined);
    const requestFilters = {...nextFilters, cursor};
    startTransition(async () => {
      try {
        const result = await loadAdminReviewsAction(requestFilters);
        if (pageRequestId.current !== requestId) return;
        setPage(result);
        setFilters(requestFilters);
        setCursorHistory(history);
      } catch (error: unknown) {
        if (pageRequestId.current === requestId) {
          setPageError(errorMessage(error));
        }
      }
    });
  }, []);

  const applyFilters = useCallback((changes: Partial<AdminReviewFilters>) => {
    const nextFilters = {...filters, ...changes, cursor: null};
    loadPage(nextFilters, null, [null]);
  }, [filters, loadPage]);

  const loadDetails = useCallback((review: AdminReview) => {
    const requestId = ++detailsRequestId.current;
    setDetailsLoading(true);
    setDetailsError(undefined);
    setDetails(null);
    void loadAdminReviewDetailsAction(review.id)
      .then((result) => {
        if (detailsRequestId.current === requestId) setDetails(result.details);
      })
      .catch((error: unknown) => {
        if (detailsRequestId.current === requestId) {
          setDetailsError(errorMessage(error));
        }
      })
      .finally(() => {
        if (detailsRequestId.current === requestId) setDetailsLoading(false);
      });
  }, []);

  const openDetails = useCallback((review: AdminReview) => {
    setSelectedReview(review);
    setDrawerOpen(true);
    setModerationAction(null);
    setModerationReason("");
    setModerationError(undefined);
    setModerationNotice(undefined);
    loadDetails(review);
  }, [loadDetails]);

  const onDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      detailsRequestId.current += 1;
      setDetailsLoading(false);
      setDetailsError(undefined);
      setDetails(null);
      setSelectedReview(null);
      setModerationAction(null);
      setModerationReason("");
      setModerationError(undefined);
      setModerationNotice(undefined);
    }
  }, []);

  const submitModeration = useCallback(async (
    action: AdminReviewModerationAction,
  ) => {
    const review = details?.review ?? selectedReview;
    if (!review || submittingModeration.current) return;
    submittingModeration.current = true;
    setModerationAction(action);
    setModerationError(undefined);
    setModerationNotice(undefined);
    try {
      const result = await moderateAdminReview({
        reviewId: review.id,
        action,
        ...(action === "hide" ? {reason: moderationReason} : {}),
        idempotencyKey: createReviewModerationIdempotencyKey(review.id, action),
      });
      const updated = applyModerationResult(review, result, moderationReason);
      setSelectedReview(updated);
      setDetails((current) => current
        ? {...current, review: applyModerationResult(
            current.review,
            result,
            moderationReason,
          )}
        : current);
      setPage((current) => updateReviewPage(current, review, updated));
      setModerationReason("");
      setModerationNotice(moderationSuccessMessage(action));
    } catch (error: unknown) {
      setModerationError(errorMessage(error));
    } finally {
      submittingModeration.current = false;
      setModerationAction(null);
    }
  }, [details, moderationReason, selectedReview]);

  const currentCursor = cursorHistory.at(-1) ?? null;
  const previousCursor = cursorHistory.length > 1
    ? cursorHistory.at(-2) ?? "__first_page__"
    : null;
  const activeFilters = useMemo(() => filterLabels(filters), [filters]);
  const tableSort: DataTableSort = {
    columnId: filters.sortField,
    direction: filters.sortDirection,
  };
  const columns = useMemo<readonly DataTableColumn<AdminReview>[]>(() => [
    {
      id: "customer",
      header: "Customer review",
      cell: (review) => (
        <div className="grid gap-1">
          <span className="font-bold">{review.customerName}</span>
          <p className="line-clamp-2 max-w-sm text-muted-foreground">
            {review.comment || "No written comment"}
          </p>
          <span className="text-xs text-muted-foreground">
            {review.bookingCode ?? review.bookingId}
          </span>
        </div>
      ),
    },
    {
      id: "provider",
      header: "Provider",
      cell: (review) => (
        <div className="grid gap-1">
          <span className="font-semibold">{review.providerName}</span>
          {review.providerReply ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <MessageSquareText aria-hidden="true" className="size-3.5" />
              Provider replied
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No reply</span>
          )}
        </div>
      ),
    },
    {
      id: "rating",
      header: "Rating",
      sortable: true,
      cell: (review) => <Rating rating={review.rating} />,
    },
    {
      id: "status",
      header: "Moderation",
      cell: (review) => <ReviewStatus review={review} />,
    },
    {
      id: "createdAt",
      header: "Submitted",
      sortable: true,
      cell: (review) => formatReviewDate(review.createdAt),
    },
  ], []);

  const retryPage = () => loadPage(filters, currentCursor, cursorHistory);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Review Management"
        description="Monitor verified customer feedback, provider replies, reports, and moderation decisions."
        actions={
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={isPending}
            onClick={retryPage}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("size-4", isPending && "animate-spin motion-reduce:animate-none")}
            />
            Refresh
          </Button>
        }
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Review statistics"
      >
        <SummaryCard
          label="Total Reviews"
          value={page.statistics.totalCount}
          icon={<MessageSquareText className="size-5" />}
          loading={isPending}
        />
        <SummaryCard
          label="Published"
          value={page.statistics.publishedCount}
          icon={<Eye className="size-5" />}
          loading={isPending}
        />
        <SummaryCard
          label="Reported"
          value={page.statistics.reportedCount}
          icon={<Flag className="size-5" />}
          loading={isPending}
        />
        <SummaryCard
          label="Hidden"
          value={page.statistics.hiddenCount}
          icon={<EyeOff className="size-5" />}
          loading={isPending}
        />
        <SummaryCard
          label="Average Rating"
          value={`${page.statistics.averageRating.toFixed(1)} / 5`}
          icon={<Star className="size-5" />}
          loading={isPending}
        />
      </section>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={(search) => applyFilters({search})}
        onClearFilters={() => {
          setSearchValue("");
          loadPage(DEFAULT_FILTERS, null, [null]);
        }}
        activeFilters={activeFilters}
        loading={isPending}
        searchLabel="Search reviews"
        searchPlaceholder="Customer, provider, booking, review, or package"
        filterControls={
          <>
            <FilterSelect
              label="Moderation status"
              value={filters.status}
              disabled={isPending}
              onChange={(value) => applyFilters({
                status: value as AdminReviewModerationStatusFilter,
              })}
            >
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </FilterSelect>
            <FilterSelect
              label="Report status"
              value={filters.report}
              disabled={isPending}
              onChange={(value) => applyFilters({
                report: value as AdminReviewReportFilter,
              })}
            >
              <option value="all">All reports</option>
              <option value="reported">Reported</option>
              <option value="not_reported">Not reported</option>
            </FilterSelect>
            <FilterSelect
              label="Rating"
              value={filters.rating}
              disabled={isPending}
              onChange={(value) => applyFilters({
                rating: value as AdminReviewRatingFilter,
              })}
            >
              <option value="all">All ratings</option>
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>{rating} stars</option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Submitted date"
              value={filters.date}
              disabled={isPending}
              onChange={(value) => applyFilters({
                date: value as AdminReviewDateFilter,
              })}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 days</option>
              <option value="last_30_days">Last 30 days</option>
            </FilterSelect>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={page.reviews}
        getRowId={(review) => review.id}
        caption="Customer review moderation records"
        loading={isPending}
        error={pageError}
        onRetry={retryPage}
        emptyTitle="No reviews found"
        emptyDescription="No review records match the selected query and filters."
        sort={tableSort}
        onSortChange={(sort) => {
          if (sort.columnId !== "createdAt" && sort.columnId !== "rating") return;
          applyFilters({
            sortField: sort.columnId as AdminReviewSortField,
            sortDirection: sort.direction as AdminReviewSortDirection,
          });
        }}
        rowActions={(review) => (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => openDetails(review)}
          >
            Review
          </Button>
        )}
        renderMobileRow={(review) => (
          <ReviewMobileCard review={review} onOpen={() => openDetails(review)} />
        )}
      />

      <CursorPagination
        previousCursor={previousCursor}
        nextCursor={page.hasMore ? page.nextCursor : null}
        loading={isPending}
        pageLabel={`Page ${cursorHistory.length}`}
        onPrevious={() => {
          if (cursorHistory.length <= 1) return;
          const history = cursorHistory.slice(0, -1);
          loadPage(filters, history.at(-1) ?? null, history);
        }}
        onNext={(cursor) => {
          const history = [...cursorHistory, cursor];
          loadPage(filters, cursor, history);
        }}
      />

      <ReviewDetailsDrawer
        review={selectedReview}
        details={details}
        open={drawerOpen}
        loading={detailsLoading}
        error={detailsError}
        moderationAction={moderationAction}
        moderationReason={moderationReason}
        moderationError={moderationError}
        moderationNotice={moderationNotice}
        onReasonChange={setModerationReason}
        onOpenChange={onDrawerOpenChange}
        onRetry={() => selectedReview && loadDetails(selectedReview)}
        onModerate={(action) => void submitModeration(action)}
      />
    </div>
  );
}

function ReviewDetailsDrawer({
  review,
  details,
  open,
  loading,
  error,
  moderationAction,
  moderationReason,
  moderationError,
  moderationNotice,
  onReasonChange,
  onOpenChange,
  onRetry,
  onModerate,
}: {
  review: AdminReview | null;
  details: AdminReviewDetails | null;
  open: boolean;
  loading: boolean;
  error?: string;
  moderationAction: AdminReviewModerationAction | null;
  moderationReason: string;
  moderationError?: string;
  moderationNotice?: string;
  onReasonChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onModerate: (action: AdminReviewModerationAction) => void;
}) {
  const current = details?.review ?? review;
  const busy = moderationAction !== null;
  return (
    <DetailDrawer
      title={current ? `${current.customerName}'s review` : "Review details"}
      description="Verified booking feedback and immutable moderation history."
      open={open}
      onOpenChange={onOpenChange}
    >
      {loading ? (
        <p className="py-8 text-center text-muted-foreground" role="status">
          Loading review details…
        </p>
      ) : error ? (
        <div className="grid gap-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>
          <Button variant="secondary" size="compact" onClick={onRetry}>Retry</Button>
        </div>
      ) : current ? (
        <div className="grid gap-5">
          <section className="grid gap-3 rounded-card border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Rating rating={current.rating} />
              <ReviewStatus review={current} />
            </div>
            <p className="whitespace-pre-wrap break-words leading-7">{current.comment}</p>
            <p className="text-sm text-muted-foreground">
              Submitted {formatReviewDate(current.createdAt)}
            </p>
          </section>

          <DetailSection title="Review parties">
            <Detail label="Customer" value={current.customerName} />
            <Detail label="Customer email" value={current.customerEmail} />
            <Detail label="Provider" value={current.providerName} />
            <Detail label="Package" value={current.packageName} />
          </DetailSection>

          <DetailSection title="Booking references">
            <Detail label="Review ID" value={current.id} />
            <Detail label="Booking" value={current.bookingCode ?? current.bookingId} />
            <Detail label="Event type" value={details?.booking.eventType} />
            <Detail label="Booking status" value={details?.booking.status} />
          </DetailSection>

          <section className="grid gap-3 rounded-card border border-border p-4">
            <h3 className="font-bold">Provider reply</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {current.providerReply ?? "The provider has not replied."}
            </p>
          </section>

          <section className="grid gap-4 rounded-card border border-border p-4">
            <div>
              <h3 className="font-bold">Administrative moderation</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Hiding a review requires a reason and adjusts the provider rating aggregate.
              </p>
            </div>
            {current.moderationStatus === "published" ? (
              <label className="grid gap-2">
                <span className="text-sm font-bold">Reason for hiding</span>
                <textarea
                  className="min-h-28 w-full resize-y rounded-lg border border-input bg-card px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={moderationReason}
                  maxLength={500}
                  disabled={busy}
                  aria-describedby="moderation-reason-description"
                  onChange={(event) => onReasonChange(event.currentTarget.value)}
                />
                <span id="moderation-reason-description" className="text-xs text-muted-foreground">
                  Use 10–500 characters. This reason is recorded in the audit trail.
                </span>
              </label>
            ) : current.moderationReason ? (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Hidden reason: {current.moderationReason}
              </p>
            ) : null}
            {moderationNotice ? (
              <p className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm font-semibold text-success" role="status">
                {moderationNotice}
              </p>
            ) : null}
            {moderationError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">
                {moderationError}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {current.moderationStatus === "published" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || moderationReason.trim().length < 10}
                  loading={moderationAction === "hide"}
                  loadingLabel="Hiding review"
                  onClick={() => onModerate("hide")}
                >
                  <EyeOff aria-hidden="true" /> Hide review
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  loading={moderationAction === "restore"}
                  loadingLabel="Restoring review"
                  onClick={() => onModerate("restore")}
                >
                  <Eye aria-hidden="true" /> Restore review
                </Button>
              )}
              {current.isReported ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  loading={moderationAction === "dismiss_report"}
                  loadingLabel="Dismissing report"
                  onClick={() => onModerate("dismiss_report")}
                >
                  Dismiss report
                </Button>
              ) : null}
            </div>
          </section>

          <DetailSection title="Moderation history">
            {details?.auditHistory.length ? details.auditHistory.map((entry) => (
              <div key={entry.id} className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
                <span className="font-semibold">{humanize(entry.action)}</span>
                <span className="text-sm text-muted-foreground">
                  {formatReviewDate(entry.createdAt)} · {entry.actorRole}
                </span>
                {entry.reason ? <span className="text-sm">{entry.reason}</span> : null}
              </div>
            )) : <p className="text-sm text-muted-foreground">No moderation decisions recorded.</p>}
          </DetailSection>
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function ReviewMobileCard({
  review,
  onOpen,
}: {
  review: AdminReview;
  onOpen: () => void;
}) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{review.customerName}</h3>
          <p className="truncate text-sm text-muted-foreground">{review.providerName}</p>
        </div>
        <ReviewStatus review={review} compact />
      </div>
      <Rating rating={review.rating} />
      <p className="line-clamp-3 text-sm leading-6">{review.comment}</p>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{formatReviewDate(review.createdAt)}</span>
        <Button variant="secondary" size="compact" onClick={onOpen}>Review</Button>
      </div>
    </article>
  );
}

function ReviewStatus({review, compact = false}: {review: AdminReview; compact?: boolean}) {
  return (
    <div className={cn("flex flex-wrap gap-2", compact && "justify-end")}>
      <span className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold",
        review.moderationStatus === "published"
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
      )}>
        {review.moderationStatus === "published" ? "Published" : "Hidden"}
      </span>
      {review.isReported ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">
          <Flag aria-hidden="true" className="size-3" /> Reported
        </span>
      ) : null}
    </div>
  );
}

function Rating({rating}: {rating: number}) {
  return (
    <span className="inline-flex items-center gap-1 font-bold" aria-label={`${rating} out of 5 stars`}>
      <Star aria-hidden="true" className="size-4 fill-warning text-warning" />
      {rating.toFixed(1)}
    </span>
  );
}

function DetailSection({title, children}: {title: string; children: ReactNode}) {
  return (
    <section className="grid gap-3 rounded-card border border-border p-4">
      <h3 className="font-bold">{title}</h3>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Detail({label, value}: {label: string; value: string | null | undefined}) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="break-words text-sm">{value || "Not available"}</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-44 gap-2">
      <span className="text-sm font-bold">{label}</span>
      <Select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </Select>
    </label>
  );
}

function applyModerationResult(
  review: AdminReview,
  result: ModerateAdminReviewResult,
  reason: string,
): AdminReview {
  return {
    ...review,
    moderationStatus: result.moderationStatus,
    moderationReason: result.moderationStatus === "hidden"
      ? reason.trim()
      : null,
    moderatedAt: new Date().toISOString(),
    isVisible: result.isVisible,
    isReported: result.isReported,
    updatedAt: new Date().toISOString(),
  };
}

function updateReviewPage(
  page: AdminReviewPage,
  before: AdminReview,
  after: AdminReview,
): AdminReviewPage {
  let statistics = page.statistics;
  const wasPublished = before.moderationStatus === "published";
  const isPublished = after.moderationStatus === "published";
  if (wasPublished !== isPublished) {
    const previousCount = statistics.publishedCount;
    const nextCount = Math.max(0, previousCount + (isPublished ? 1 : -1));
    const ratingTotal = statistics.averageRating * previousCount;
    const nextAverage = nextCount === 0
      ? 0
      : (ratingTotal + (isPublished ? after.rating : -before.rating)) / nextCount;
    statistics = {
      ...statistics,
      publishedCount: nextCount,
      hiddenCount: Math.max(0, statistics.hiddenCount + (isPublished ? -1 : 1)),
      averageRating: Math.round(nextAverage * 10) / 10,
    };
  }
  if (before.isReported !== after.isReported) {
    statistics = {
      ...statistics,
      reportedCount: Math.max(
        0,
        statistics.reportedCount + (after.isReported ? 1 : -1),
      ),
    };
  }
  return {
    ...page,
    statistics,
    reviews: page.reviews.map((review) => review.id === after.id ? after : review),
  };
}

function filterLabels(filters: AdminReviewFilters): string[] {
  const labels: string[] = [];
  if (filters.status !== "all") labels.push(`Status: ${humanize(filters.status)}`);
  if (filters.report !== "all") labels.push(`Report: ${humanize(filters.report)}`);
  if (filters.rating !== "all") labels.push(`Rating: ${filters.rating} stars`);
  if (filters.date !== "all") labels.push(`Date: ${humanize(filters.date)}`);
  return labels;
}

function moderationSuccessMessage(action: AdminReviewModerationAction): string {
  if (action === "hide") return "The review was hidden and its rating was removed from the provider aggregate.";
  if (action === "restore") return "The review was restored and its rating was returned to the provider aggregate.";
  return "The report was dismissed. The review visibility was not changed.";
}

function formatReviewDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Review records could not be loaded. Please try again.";
}

export {ReviewManagementClient, type ReviewManagementClientProps};