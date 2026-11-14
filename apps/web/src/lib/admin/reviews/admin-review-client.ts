"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import type {
  ModerateAdminReviewInput,
  ModerateAdminReviewResult,
} from "@/lib/admin/reviews/admin-review-types";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const MODERATE_REVIEW_FUNCTION = "moderateReview";

export async function moderateAdminReview(
  input: ModerateAdminReviewInput,
): Promise<ModerateAdminReviewResult> {
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }

  initializeBrowserAppCheck();
  const callable = httpsCallable<
    ModerateAdminReviewInput,
    ModerateAdminReviewResult
  >(functions, MODERATE_REVIEW_FUNCTION, {timeout: 30_000});

  try {
    const result = await callable({
      reviewId: input.reviewId.trim(),
      action: input.action,
      ...(input.action === "hide"
        ? {reason: normalizeModerationReason(input.reason)}
        : {}),
      idempotencyKey: input.idempotencyKey,
    });
    return result.data;
  } catch (error: unknown) {
    throw new Error(moderationErrorMessage(error));
  }
}

export function createReviewModerationIdempotencyKey(
  reviewId: string,
  action: ModerateAdminReviewInput["action"],
): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (!randomId) {
    throw new Error(
      "Secure moderation initialization is unavailable. Refresh and try again.",
    );
  }
  return ["admin-review", action, reviewId, randomId].join(":");
}

function normalizeModerationReason(reason: string | undefined): string {
  const normalized = (reason ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length < 10 || normalized.length > 500) {
    throw new Error(
      "Enter a moderation reason between 10 and 500 characters.",
    );
  }
  return normalized;
}

function moderationErrorMessage(error: unknown): string {
  if (error instanceof WebAuthenticationError) return error.message;
  if (error instanceof FirebaseError) {
    switch (normalizeCallableCode(error.code)) {
      case "unauthenticated":
        return "Your admin session has expired. Please sign in again.";
      case "permission-denied":
        return "You do not have permission to moderate reviews.";
      case "not-found":
        return "The review or its provider could not be found.";
      case "invalid-argument":
        return "The moderation request contains invalid information.";
      case "failed-precondition":
        return "The review is no longer in a state that allows this action.";
      case "resource-exhausted":
        return "Too many moderation attempts were made. Please wait and try again.";
      case "unavailable":
      case "deadline-exceeded":
        return "The review service is temporarily unavailable. Please try again.";
      default:
        return "The review moderation action could not be completed.";
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The review moderation action could not be completed.";
}

function normalizeCallableCode(code: string): string {
  return code.replace(/^functions\//, "").replace(/^functions:/, "");
}