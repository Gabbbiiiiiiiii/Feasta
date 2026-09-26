"use client";

import {
  httpsCallable,
} from "firebase/functions";

import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  auth,
  functions,
} from "@/lib/firebase/client";

import type {
  SubmitProviderTaxProfileInput,
  SubmitProviderTaxProfileResult,
} from "./provider-tax-profile-types";

export async function submitProviderTaxProfile(
  input:
    SubmitProviderTaxProfileInput,
): Promise<SubmitProviderTaxProfileResult> {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }

  try {
    const response =
      await httpsCallable<
        SubmitProviderTaxProfileInput,
        SubmitProviderTaxProfileResult
      >(
        functions,
        "submitProviderTaxProfile",
      )(input);

    return response.data;
  } catch (error) {
    throw normalizeTaxProfileError(
      error,
    );
  }
}

function normalizeTaxProfileError(
  error: unknown,
): Error {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error
      ? String(error.code)
      : "";

  if (
    code.includes(
      "unauthenticated",
    )
  ) {
    return new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }

  if (
    code.includes(
      "permission-denied",
    )
  ) {
    return new WebAuthenticationError(
      "Your provider tax profile is not available.",
      "forbidden",
    );
  }

  if (
    code.includes(
      "failed-precondition",
    )
  ) {
    return new WebAuthenticationError(
      "This tax profile cannot be changed in its current review status.",
      "forbidden",
    );
  }

  if (
    code.includes(
      "invalid-argument",
    )
  ) {
    return new WebAuthenticationError(
      "Review the tax information and try again.",
      "validation",
    );
  }

  return new WebAuthenticationError(
    "The tax profile could not be submitted. Please try again.",
    "update_failed",
  );
}
