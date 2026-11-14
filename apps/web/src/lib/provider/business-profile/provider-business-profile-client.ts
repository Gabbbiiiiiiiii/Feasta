"use client";

import {httpsCallable} from "firebase/functions";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import {auth, functions} from "@/lib/firebase/client";

import type {
  UpdateProviderBusinessProfileInput,
  UpdateProviderBusinessProfileResult,
} from "./provider-business-profile-types";

export async function updateProviderBusinessProfile(
  input: UpdateProviderBusinessProfileInput,
): Promise<UpdateProviderBusinessProfileResult> {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }

  try {
    const response = await httpsCallable<
      UpdateProviderBusinessProfileInput,
      UpdateProviderBusinessProfileResult
    >(functions, "updateProviderBusinessProfile")(input);
    return response.data;
  } catch (error) {
    throw normalizeBusinessProfileError(error);
  }
}

function callableMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String(error.message).trim();
    return message.length <= 240 ? message : "";
  }
  return "";
}

function normalizeBusinessProfileError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

  if (code.includes("unauthenticated")) {
    return new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }
  if (code.includes("permission-denied") || code.includes("failed-precondition")) {
    const message = callableMessage(error);
    if (message.includes("after payout setup has started")) {
      return new WebAuthenticationError(
        "Business registration status cannot be changed after payout setup has started.",
        "forbidden",
      );
    }
    if (message.includes("Business registration status cannot be changed")) {
      return new WebAuthenticationError(
        "Business registration status cannot be changed from Business Profile.",
        "forbidden",
      );
    }
    return new WebAuthenticationError(
      "Your provider business profile is not available for editing.",
      "forbidden",
    );
  }
  if (code.includes("invalid-argument")) {
    return new WebAuthenticationError(
      "Review the business profile information and try again.",
      "validation",
    );
  }

  return new WebAuthenticationError(
    "The business profile could not be updated. Please try again.",
    "update_failed",
  );
}
