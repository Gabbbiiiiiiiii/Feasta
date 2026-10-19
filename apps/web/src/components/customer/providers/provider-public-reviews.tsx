"use client";

import {useState} from "react";
import type {PublicReviewPage, PublicReviewSummary} from "@/lib/customer/providers/public-review-types";
import {ProviderRating} from "./provider-rating";

export function ProviderPublicReviews({providerId, summary, initialPage}: {
  providerId: string; summary?: PublicReviewSummary | null; initialPage?: PublicReviewPage | null;
}) {
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function loadMore() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/customer/providers/${encodeURIComponent(providerId)}/reviews${page?.nextCursor ? `?cursor=${encodeURIComponent(page.nextCursor)}` : ""}`, {cache: "no-store"});
      if (!response.ok) throw new Error();
      const next = await response.json() as PublicReviewPage;
      setPage((previous) => ({reviews: [...(previous?.reviews ?? []), ...next.reviews]
        .filter((review, index, all) => all.findIndex((item) => item.id === review.id) === index), nextCursor: next.nextCursor}));
    } catch {
      setError("Reviews are unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  return <section id="provider-reviews" aria-labelledby="provider-reviews-heading" className="min-w-0 scroll-mt-24 rounded-[24px] border border-feasta-border-soft bg-white p-5 sm:p-7">
    <h2 id="provider-reviews-heading" className="text-2xl font-extrabold text-foreground">Ratings &amp; Reviews</h2>
    <ProviderRating summary={summary} />
    {summary?.averageRating !== null && summary?.averageRating !== undefined ? <p className="mt-2 text-center text-sm">{summary.averageRating.toFixed(1)} out of 5</p> : null}
    {summary && summary.totalReviews > 0 ? <div className="my-5 grid gap-2" aria-label="Rating distribution">
      {[5, 4, 3, 2, 1].map((rating) => <div key={rating} className="flex items-center gap-3 text-sm">
        <span className="w-14">{rating} stars</span>
        <meter className="h-3 min-w-0 flex-1 accent-primary" min={0} max={summary.totalReviews} value={summary.ratingDistribution[rating as 1 | 2 | 3 | 4 | 5]} aria-label={`${rating} star reviews`} />
        <span>{summary.ratingDistribution[rating as 1 | 2 | 3 | 4 | 5]}</span>
      </div>)}
    </div> : null}
    <div className="mt-5 grid gap-4" aria-live="polite">
      {page?.reviews.map((review) => <article key={review.id} className="min-w-0 rounded-xl border border-feasta-border-soft p-4">
        <p className="font-bold">Verified customer</p>
        <p className="text-xs font-semibold text-primary-strong">Verified booking</p>
        <p className="mt-2 text-sm"><span aria-hidden="true">{"★".repeat(review.rating)} </span>{review.rating} out of 5 stars</p>
        <time className="text-xs text-feasta-text-secondary" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("en-PH", {year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila"})}</time>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{review.comment}</p>
        {review.providerReply ? <div className="mt-4 rounded-lg bg-feasta-canvas p-3">
          <p className="text-sm font-bold">Provider reply</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{review.providerReply}</p>
        </div> : null}
      </article>)}
      {page && page.reviews.length === 0 ? <p>{page.nextCursor ? "No published reviews in this batch." : "No customer reviews yet."}</p> : null}
    </div>
    {error ? <p role="alert" className="mt-4 text-sm">{error}</p> : null}
    {!page || page.nextCursor ? <button type="button" disabled={loading} onClick={loadMore} className="mt-4 min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">{loading ? "Loading reviews…" : page ? "Load more reviews" : "Load reviews"}</button> : null}
  </section>;
}
