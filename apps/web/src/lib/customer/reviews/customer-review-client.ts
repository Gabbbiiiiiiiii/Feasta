"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import type {
  SubmitCustomerReviewInput,
  SubmitCustomerReviewResult,
} from "@/lib/customer/reviews/customer-review-types";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const SUBMIT_REVIEW_FUNCTION = "submitReview";
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

type SubmitCustomerReviewCallableInput = SubmitCustomerReviewInput & {
  idempotencyKey: string;
};

type SubmitCustomerReviewCallableResponse = {
  success?: unknown;
  reviewId?: unknown;
  created?: unknown;
  idempotentReplay?: unknown;
};

export async function submitCustomerReview(
  input: SubmitCustomerReviewInput,
): Promise<SubmitCustomerReviewResult> {
  try {
    await auth.authStateReady();

    if (!auth.currentUser) {
      throw new Error("Please sign in again before submitting your review.");
    }

    const providerRequestId = input.providerRequestId.trim();
    const comment = input.comment.trim();
    if (!SAFE_DOCUMENT_ID.test(providerRequestId)) {
      throw new Error("This provider request cannot be reviewed.");
    }
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new Error("Choose a rating from 1 to 5 stars.");
    }
    if (comment.length < 2 || comment.length > 2_000) {
      throw new Error("Your review must be between 2 and 2,000 characters.");
    }

    const randomId = globalThis.crypto?.randomUUID?.();
    if (!randomId) {
      throw new Error("Secure review submission is unavailable. Refresh the page and try again.");
    }

    initializeBrowserAppCheck();
    const callable = httpsCallable<
      SubmitCustomerReviewCallableInput,
      SubmitCustomerReviewCallableResponse
    >(functions, SUBMIT_REVIEW_FUNCTION, {timeout: 30_000});
    const response = await callable({
      providerRequestId,
      rating: input.rating,
      comment,
      idempotencyKey: ["customer-review", providerRequestId, randomId].join(":"),
    });

    return validateReviewResponse(response.data);
  } catch (error: unknown) {
    throw normalizeReviewError(error);
  }
}

function validateReviewResponse(
  value: SubmitCustomerReviewCallableResponse,
): SubmitCustomerReviewResult {
  if (
    value.success !== true ||
    !SAFE_DOCUMENT_ID.test(
      typeof value.reviewId === "string" ? value.reviewId : "",
    ) ||
    typeof value.created !== "boolean" ||
    typeof value.idempotentReplay !== "boolean"
  ) {
    throw new Error("FEASTA received an invalid review response. Please try again.");
  }

  return {created: value.created};
}

function normalizeReviewError(error: unknown): Error {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error
      ? error
      : new Error("Your review could not be submitted. Please try again.");
  }

  switch (error.code.replace(/^functions\//u, "")) {
    case "unauthenticated":
      return new Error("Please sign in again before submitting your review.");
    case "permission-denied":
    case "not-found":
      return new Error("This provider request is not available for review.");
    case "failed-precondition":
      return new Error("This provider service is not currently eligible for review.");
    case "invalid-argument":
      return new Error("Review the rating and comment before trying again.");
    case "resource-exhausted":
      return new Error("Too many review attempts were made. Please wait before trying again.");
    case "unavailable":
    case "deadline-exceeded":
      return new Error("The review service is temporarily unavailable. Please try again.");
    default:
      return new Error("Your review could not be submitted. Please try again.");
  }
}
