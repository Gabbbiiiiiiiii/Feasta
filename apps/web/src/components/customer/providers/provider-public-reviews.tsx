"use client";

import {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {ratingBarClassName, ratingGlyphClassName} from "@/components/ui/rating-styles";
import type {PublicReview, PublicReviewPage, PublicReviewSummary} from "@/lib/customer/providers/public-review-types";
import {ProviderRating} from "./provider-rating";

type Navigation = {cursor: string | null; history: (string | null)[]};

export function ProviderPublicReviews({providerId, summary, initialPage}: {
  providerId: string; summary?: PublicReviewSummary | null; initialPage?: PublicReviewPage | null;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedNavigation, setFailedNavigation] = useState<Navigation | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const selectedReviewId = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => {requestId.current += 1;}, []);

  async function loadPage(navigation: Navigation) {
    if (busy.current) return;
    busy.current = true;
    const id = ++requestId.current;
    setLoading(true);
    setFailedNavigation(null);
    try {
      const response = await fetch(`/customer/providers/${encodeURIComponent(providerId)}/reviews${navigation.cursor ? `?cursor=${encodeURIComponent(navigation.cursor)}` : ""}`, {cache: "no-store"});
      if (!response.ok) throw new Error();
      const next = await response.json() as PublicReviewPage;
      if (id !== requestId.current) return;
      setPage(next);
      setCursor(navigation.cursor);
      setHistory(navigation.history);
      if (list.current) {list.current.scrollTop = 0; list.current.focus();}
    } catch {
      if (id === requestId.current) setFailedNavigation(navigation);
    } finally {
      if (id === requestId.current) {busy.current = false; setLoading(false);}
    }
  }

  function showReviews(button: HTMLButtonElement, reviewId?: string) {
    selectedReviewId.current = reviewId ?? null;
    trigger.current = button;
    setPage(initialPage);
    setCursor(null);
    setHistory([]);
    setFailedNavigation(null);
    setOpen(true);
    if (!initialPage) void loadPage({cursor: null, history: []});
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
      if (!nextOpen) {requestId.current += 1; busy.current = false; setLoading(false);}
    }}>
      <DialogContent className="flex min-w-0 max-w-2xl flex-col overflow-hidden" onOpenAutoFocus={(event) => {
        const selected = Array.from(list.current?.querySelectorAll<HTMLElement>("article") ?? [])
          .find((article) => article.dataset.reviewId === selectedReviewId.current);
        if (selected) {event.preventDefault(); selected.focus();}
      }} onCloseAutoFocus={(event) => {event.preventDefault(); trigger.current?.focus();}}>
        <DialogHeader>
          <DialogTitle>All reviews</DialogTitle>
          <DialogDescription>Verified booking reviews. Up to five reviews per page.</DialogDescription>
        </DialogHeader>
        <div ref={list} tabIndex={0} aria-label="Review list" aria-busy={loading} className="min-h-0 min-w-0 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="divide-y divide-feasta-border-soft">
            {page?.reviews.map((review) => <ReviewRow key={review.id} review={review} />)}
          </div>
          {!loading && page?.reviews.length === 0 ? <p className="py-3 text-sm">{page.nextCursor ? "No published reviews in this batch. Continue to the next page." : "No customer reviews on this page."}</p> : null}
        </div>
        <p role="status" className="text-sm text-feasta-text-secondary">{loading ? "Loading reviews…" : `Page ${history.length + 1}`}</p>
        {failedNavigation ? <div className="grid gap-2">
          <p role="alert" className="text-sm">Reviews are unavailable. Please try again.</p>
          <Button variant="secondary" onClick={() => void loadPage(failedNavigation)}>Try again</Button>
        </div> : null}
        <nav aria-label="Review pages" className="flex flex-wrap justify-between gap-2">
          <Button variant="secondary" disabled={loading || history.length === 0} onClick={() => void loadPage({cursor: history.at(-1) ?? null, history: history.slice(0, -1)})}>Previous</Button>
          <Button variant="secondary" disabled={loading || !page?.nextCursor} onClick={() => page?.nextCursor && void loadPage({cursor: page.nextCursor, history: [...history, cursor]})}>Next</Button>
        </nav>
      </DialogContent>
    </Dialog>
  </section>;
}

function ReviewRow({review, preview = false, onReadMore}: {
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
}
