"use client";

import {memo, useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {ratingBarClassName, ratingGlyphClassName} from "@/components/ui/rating-styles";
import type {PublicReview, PublicReviewPage, PublicReviewSummary} from "@/lib/customer/providers/public-review-types";
import {ProviderRating} from "./provider-rating";

type PublicReviewsProps = {
  providerId: string; summary?: PublicReviewSummary | null; initialPage?: PublicReviewPage | null;
};

// Changing providers unmounts the previous dialog and cancels pending work.
export function ProviderPublicReviews(props: PublicReviewsProps) {
  return <PublicReviewsSession key={props.providerId} {...props} />;
}

function PublicReviewsSession({providerId, summary, initialPage}: PublicReviewsProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const currentPage = useRef(initialPage);
  const completedCursors = useRef(new Set<string | null>());
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const failedRequest = useRef(false);
  const lastScrollTop = useRef(0);
  const selectedReviewId = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => {
    requestId.current += 1;
    controller.current?.abort();
  }, []);

  async function loadMore(manual = false) {
    const previous = currentPage.current;
    const cursor = previous?.nextCursor ?? null;
    if (busy.current || (failedRequest.current && !manual) ||
      (previous && cursor === null) || completedCursors.current.has(cursor)) return;
    busy.current = true;
    const id = ++requestId.current;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20_000);
    controller.current = abort;
    setLoading(true);
    setFailed(false);
    failedRequest.current = false;
    try {
      const response = await fetch(`/customer/providers/${encodeURIComponent(providerId)}/reviews${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {cache: "no-store", signal: abort.signal});
      if (!response.ok) throw new Error();
      const next = await response.json() as PublicReviewPage;
      if (id !== requestId.current) return;
      completedCursors.current.add(cursor);
      const seen = new Set(previous?.reviews.map((review) => review.id));
      const additions = next.reviews.filter((review) => {
        if (seen.has(review.id)) return false;
        seen.add(review.id);
        return true;
      });
      const updated = {
        reviews: [...(previous?.reviews ?? []), ...additions],
        // Repeated cursors must never create an automatic request cycle.
        nextCursor: completedCursors.current.has(next.nextCursor) ? null : next.nextCursor,
      };
      currentPage.current = updated;
      setPage(updated);
      // Preserve scroll and focus while appending. If the final manual action
      // disappears, keep keyboard focus inside the review list.
      if (manual && updated.nextCursor === null && list.current?.contains(document.activeElement)) {
        list.current.focus({preventScroll: true});
      }
    } catch {
      if (id === requestId.current) {failedRequest.current = true; setFailed(true);}
    } finally {
      clearTimeout(timeout);
      if (id === requestId.current) {busy.current = false; setLoading(false);}
    }
  }

  function showReviews(button: HTMLButtonElement, reviewId?: string) {
    selectedReviewId.current = reviewId ?? null;
    trigger.current = button;
    currentPage.current = initialPage;
    completedCursors.current.clear();
    lastScrollTop.current = 0;
    failedRequest.current = false;
    setPage(initialPage);
    setFailed(false);
    setOpen(true);
    if (!initialPage) void loadMore();
  }

  const previews = initialPage?.reviews.slice(0, 3) ?? [];
  const hasMore = !initialPage || Boolean(initialPage.nextCursor) || initialPage.reviews.length > 3 ||
    (summary?.totalReviews ?? 0) > previews.length;

  return <section id="provider-reviews" aria-labelledby="provider-reviews-heading" className="min-w-0 scroll-mt-24 rounded-[24px] border border-feasta-border-soft bg-white p-5 sm:p-7">
    <h2 id="provider-reviews-heading" className="text-2xl font-extrabold text-foreground">Ratings &amp; Reviews</h2>
    <div className="mt-3 grid min-w-0 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="min-w-0 justify-self-start"><ProviderRating summary={summary} /></div>
      {summary && summary.totalReviews > 0 ? <div className="grid min-w-0 gap-1.5" aria-label="Rating distribution">
        {([5, 4, 3, 2, 1] as const).map((rating) => {
          const count = summary.ratingDistribution[rating];
          return <div key={rating} className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
            <span>{rating} stars</span>
            <div role="meter" aria-label={`${rating} star reviews`} aria-valuemin={0} aria-valuemax={summary.totalReviews} aria-valuenow={count} aria-valuetext={`${count} of ${summary.totalReviews} reviews`} className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${ratingBarClassName}`} style={{width: `${count / summary.totalReviews * 100}%`}} />
            </div>
            <span className="min-w-4 text-right tabular-nums">{count}</span>
          </div>;
        })}
      </div> : null}
    </div>
    <div className="mt-4 min-w-0 divide-y divide-feasta-border-soft" aria-label="Recent review previews">
      {previews.map((review) => <ReviewRow key={review.id} review={review} preview onReadMore={showReviews} />)}
      {initialPage && previews.length === 0 ? <p className="py-3 text-sm text-feasta-text-secondary">{initialPage.nextCursor ? "No published reviews in this batch." : "No customer reviews yet."}</p> : null}
    </div>
    {hasMore && !(summary?.totalReviews === 0 && !initialPage?.nextCursor) ? <Button variant="secondary" className="mt-3" onClick={(event) => showReviews(event.currentTarget)}>View all reviews</Button> : null}

    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) {requestId.current += 1; controller.current?.abort(); busy.current = false; setLoading(false);}
    }}>
      <DialogContent className="flex h-auto max-h-[80dvh] min-w-0 max-w-2xl flex-col overflow-hidden" onOpenAutoFocus={(event) => {
        const selected = Array.from(list.current?.querySelectorAll<HTMLElement>("article") ?? [])
          .find((article) => article.dataset.reviewId === selectedReviewId.current);
        if (selected) {event.preventDefault(); selected.focus();}
      }} onCloseAutoFocus={(event) => {event.preventDefault(); trigger.current?.focus();}}>
        <DialogHeader>
          <DialogTitle>All reviews</DialogTitle>
          <DialogDescription>Verified booking reviews and provider replies.</DialogDescription>
        </DialogHeader>
        <div ref={list} tabIndex={0} aria-label="Review list" aria-busy={loading} onScroll={(event) => {
          const element = event.currentTarget;
          const movingDown = element.scrollTop > lastScrollTop.current;
          lastScrollTop.current = element.scrollTop;
          // Require scroll progress instead of mount-time observation. Empty
          // filtered batches cannot recursively trigger additional requests.
          if (movingDown && element.scrollHeight - element.scrollTop - element.clientHeight <= 200) void loadMore();
        }} className="min-h-0 min-w-0 flex-initial overflow-y-auto overscroll-contain [overflow-anchor:none] outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="divide-y divide-feasta-border-soft">
            {page?.reviews.map((review) => <ReviewRow key={review.id} review={review} />)}
          </div>
          {!loading && page?.reviews.length === 0 ? <p className="py-3 text-sm">{page.nextCursor ? "No published reviews in this batch. Load more to continue." : "No customer reviews yet."}</p> : null}
          <p role="status" className="py-2 text-xs text-feasta-text-secondary">{loading ? "Loading reviews…" : !page ? "" : page.nextCursor ? `${page.reviews.length} reviews loaded` : page.reviews.length > 0 ? "All reviews loaded" : ""}</p>
          {failed ? <div className="flex flex-wrap items-center gap-2 py-2">
            <p role="alert" className="text-sm">Reviews are unavailable. Please try again.</p>
            <Button variant="ghost" size="compact" onClick={() => void loadMore(true)}>Retry</Button>
          </div> : page?.nextCursor ? <Button variant="ghost" size="compact" disabled={loading} onClick={() => void loadMore(true)}>Load more reviews</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}

const ReviewRow = memo(function ReviewRow({review, preview = false, onReadMore}: {
  review: PublicReview; preview?: boolean; onReadMore?: (button: HTMLButtonElement, reviewId: string) => void;
}) {
  return <article data-review-id={review.id} tabIndex={preview ? undefined : -1} className="min-w-0 py-3 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-sm font-bold">Verified customer</p>
      <p className="text-xs font-semibold text-primary-strong">Verified booking</p>
      <span className="text-sm" aria-label={`${review.rating} out of 5 stars`}><span className={ratingGlyphClassName} aria-hidden="true">{"★".repeat(review.rating)}</span></span>
      <time className="text-xs text-feasta-text-secondary" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("en-PH", {year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila"})}</time>
    </div>
    <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${preview ? "line-clamp-2" : ""}`}>{review.comment}</p>
    {preview ? <button type="button" className="mt-1 min-h-11 text-sm font-semibold text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Read more about the ${review.rating}-star review from ${new Date(review.createdAt).toLocaleDateString("en-PH", {timeZone: "Asia/Manila"})}`} onClick={(event) => onReadMore?.(event.currentTarget, review.id)}>{review.providerReply ? "Read more & provider reply" : "Read more"}</button> : review.providerReply ? <div className="mt-2 border-l-2 border-feasta-border-soft pl-3">
      <p className="text-xs font-bold">Provider reply</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{review.providerReply}</p>
    </div> : null}
  </article>;
});
