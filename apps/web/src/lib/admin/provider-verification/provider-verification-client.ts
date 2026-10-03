"use client";

import {httpsCallable} from "firebase/functions";

import {auth, functions} from "@/lib/firebase/client";

export const providerReviewActions = [
  "start_review",
  "approve",
  "reject",
  "require_resubmission",
  "suspend",
] as const;

export type ProviderReviewAction = (typeof providerReviewActions)[number];

export type ProviderReviewResult = {
  success: true;
  verificationId: string;
  providerId: string;
  previousStatus: string;
  status: string;
  idempotentReplay: boolean;
};

export const providerTaxReviewActions = [
  "verify",
  "reject",
] as const;

export type ProviderTaxReviewAction =
  (typeof providerTaxReviewActions)[number];

export type ProviderTaxReviewResult = {
  providerId: string;

  verificationStatus:
    | "verified"
    | "rejected";
};

export async function reviewProviderVerification({
  verificationId,
  action,
  remarks,
  idempotencyKey,
}: {
  verificationId: string;
  action: ProviderReviewAction;
  remarks?: string;
  idempotencyKey: string;
}): Promise<ProviderReviewResult> {
  if (!auth.currentUser) {
    throw new Error("Your administrator session expired. Sign in again.");
  }
  try {
    const callable = httpsCallable<
      {
        verificationId: string;
        action: ProviderReviewAction;
        remarks?: string;
        idempotencyKey: string;
      },
      ProviderReviewResult
    >(functions, "reviewProviderVerification");
    const response = await callable({
      verificationId,
      action,
      remarks,
      idempotencyKey,
    });
    return response.data;
  } catch (error) {
    throw new Error(reviewErrorMessage(error));
  }
}

export async function reviewProviderTaxProfile({
  providerId,
  action,
  reason,
}: {
  providerId: string;
  action: ProviderTaxReviewAction;
  reason?: string;
}): Promise<ProviderTaxReviewResult> {
  if (!auth.currentUser) {
    throw new Error(
      "Your administrator session expired. Sign in again.",
    );
  }

  try {
    const callable = httpsCallable<
      {
        providerId: string;
        action: ProviderTaxReviewAction;
        reason?: string;
      },
      ProviderTaxReviewResult
    >(
      functions,
      "reviewProviderTaxProfile",
    );

    const response =
      await callable({
        providerId,
        action,
        reason:
          reason?.trim() ||
          undefined,
      });

    return response.data;
  } catch (error) {
    throw new Error(
      taxReviewErrorMessage(
        error,
      ),
    );
  }
}

function taxReviewErrorMessage(
  error: unknown,
): string {
  const code =
    typeof error === "object" &&
    error != null &&
    "code" in error
      ? String(error.code)
      : "";

  switch (
    code.replace(
      "functions/",
      "",
    )
  ) {
    case "unauthenticated":
      return "Your administrator session expired. Sign in again.";

    case "permission-denied":
      return "You are not authorized to review this tax profile.";

    case "failed-precondition":
      return "This tax profile changed or is no longer pending review.";

    case "resource-exhausted":
      return "Too many tax review attempts. Wait briefly and try again.";

    case "invalid-argument":
      return "Check the tax review reason and try again.";

    case "not-found":
      return "The provider tax profile no longer exists.";

    default:
      return "The tax-profile decision could not be saved. Try again.";
  }
}

function reviewErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error != null && "code" in error
    ? String(error.code)
    : "";
  switch (code.replace("functions/", "")) {
    case "unauthenticated":
      return "Your administrator session expired. Sign in again.";
    case "permission-denied":
      return "You are not authorized to review this provider.";
    case "failed-precondition":
      return "This application changed or is not ready for that decision.";
    case "aborted":
      return "Another review is in progress. Reload before trying again.";
    case "resource-exhausted":
      return "Too many review attempts. Wait briefly and try again.";
    case "invalid-argument":
      return "Check the review remarks and try again.";
    default:
      return "The review decision could not be saved. Try again.";
  }
}
