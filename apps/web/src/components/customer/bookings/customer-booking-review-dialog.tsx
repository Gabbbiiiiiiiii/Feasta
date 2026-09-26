"use client";

import {Star} from "lucide-react";
import {useEffect, useRef, useState} from "react";

import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Textarea} from "@/components/ui/textarea";
import type {CustomerBookingProviderRequest} from "@/lib/customer/bookings/customer-booking-types";
import {submitCustomerReview} from "@/lib/customer/reviews/customer-review-client";
import type {CustomerReviewRating} from "@/lib/customer/reviews/customer-review-types";
import {cn} from "@/lib/utils";

const RATINGS: readonly CustomerReviewRating[] = [1, 2, 3, 4, 5];

type CustomerBookingReviewDialogProps = {
  request: CustomerBookingProviderRequest;
  onClose: () => void;
  onSubmitted: (providerRequestId: string) => void;
};

function CustomerBookingReviewDialog({
  request,
  onClose,
  onSubmitted,
}: CustomerBookingReviewDialogProps) {
  const [rating, setRating] = useState<CustomerReviewRating | null>(null);
  const [comment, setComment] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function submitReview() {
    if (submittingRef.current) return;

    const normalizedComment = comment.trim();
    const nextRatingError = rating === null
      ? "Choose a rating from 1 to 5 stars."
      : null;
    const nextCommentError = normalizedComment.length < 2
      ? "Enter at least 2 characters."
      : normalizedComment.length > 2_000
        ? "Keep your review to 2,000 characters or fewer."
        : null;

    setRatingError(nextRatingError);
    setCommentError(nextCommentError);
    setSubmissionError(null);
    if (nextRatingError || nextCommentError || rating === null) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const result = await submitCustomerReview({
        providerRequestId: request.providerRequestId,
        rating,
        comment: normalizedComment,
      });
      if (!mountedRef.current) return;

      onSubmitted(request.providerRequestId);
      feastaToast.success(
        result.created
          ? "Your review was submitted."
          : "Your review was already submitted.",
      );
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      setSubmissionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Your review could not be submitted. Please try again.",
      );
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }

  return (
    <ConfirmationDialog
      open
      onOpenChange={(open) => {
        if (!open && !submittingRef.current) {
          onClose();
        }
      }}
      title={`Review ${request.providerName}`}
      description="Rate this completed provider service and share concise feedback about your experience."
      confirmLabel="Submit review"
      loadingLabel="Submitting review"
      cancelLabel="Cancel"
      onConfirm={submitReview}
      loading={submitting}
    >
      <div className="grid gap-5">
        <fieldset className="grid gap-2" aria-describedby={ratingError ? "customer-review-rating-error" : undefined}>
          <legend className="text-sm font-bold">
            Rating <span aria-hidden="true" className="text-destructive">*</span>
            <span className="sr-only"> required</span>
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Review rating">
            {RATINGS.map((value) => (
              <label
                key={value}
                className={cn(
                  "inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-1 rounded-lg border px-3 font-bold focus-within:ring-2 focus-within:ring-ring",
                  rating === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card text-foreground hover:bg-secondary",
                )}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="customer-review-rating"
                  value={value}
                  checked={rating === value}
                  aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                  onChange={() => {
                    setRating(value);
                    setRatingError(null);
                  }}
                />
                <Star aria-hidden="true" className="size-4" fill={rating === value ? "currentColor" : "none"} />
                {value}
              </label>
            ))}
          </div>
          {ratingError ? (
            <p id="customer-review-rating-error" className="text-sm font-semibold text-destructive" role="alert">
              {ratingError}
            </p>
          ) : null}
        </fieldset>

        <FormField
          id="customer-review-comment"
          label="Review (required)"
          description={`${comment.length.toLocaleString("en-PH")}/2,000 characters`}
          error={commentError ?? undefined}
        >
          <Textarea
            required
            value={comment}
            maxLength={2_000}
            placeholder="Describe your experience with this provider service."
            onChange={(event) => {
              setComment(event.currentTarget.value);
              setCommentError(null);
            }}
          />
        </FormField>

        {submissionError ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm font-semibold text-destructive" role="alert">
            {submissionError}
          </p>
        ) : null}
      </div>
    </ConfirmationDialog>
  );
}

export {CustomerBookingReviewDialog, type CustomerBookingReviewDialogProps};
