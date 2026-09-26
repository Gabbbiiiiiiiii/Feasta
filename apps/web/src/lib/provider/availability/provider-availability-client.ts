"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

import type {
  UpdateProviderAvailabilityInput,
  UpdateProviderAvailabilityResult,
  UpdateProviderAvailabilitySettingsInput,
  UpdateProviderAvailabilitySettingsResult,
} from "./provider-availability-types";

export async function updateProviderAvailability(
  input: UpdateProviderAvailabilityInput,
): Promise<UpdateProviderAvailabilityResult> {
  requireAuthenticatedProviderSession();

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    UpdateProviderAvailabilityInput,
    UpdateProviderAvailabilityResult
  >(
    functions,
    "updateProviderAvailability",
    {timeout: 30_000},
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error) {
    throw normalizeProviderAvailabilityError(
      error,
      "The selected availability date is invalid.",
    );
  }
}

export async function updateProviderAvailabilitySettings(
  input: UpdateProviderAvailabilitySettingsInput,
): Promise<UpdateProviderAvailabilitySettingsResult> {
  requireAuthenticatedProviderSession();

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    UpdateProviderAvailabilitySettingsInput,
    UpdateProviderAvailabilitySettingsResult
  >(
    functions,
    "updateProviderAvailabilitySettings",
    {timeout: 30_000},
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error) {
    throw normalizeProviderAvailabilityError(
      error,
      "The availability settings could not be saved.",
    );
  }
}

function requireAuthenticatedProviderSession(): void {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your provider session expired. Sign in again.",
      "session_expired",
    );
  }
}

function normalizeProviderAvailabilityError(
  error: unknown,
  invalidArgumentFallback: string,
): Error {
  if (error instanceof WebAuthenticationError) return error;

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return new WebAuthenticationError(
          "Your provider session expired. Sign in again.",
          "session_expired",
        );
      case "functions/permission-denied":
        return new Error(
          "You do not have permission to update this provider's availability.",
        );
      case "functions/not-found":
        return new Error("Your provider account could not be found.");
      case "functions/invalid-argument":
      case "functions/failed-precondition":
        return new Error(error.message || invalidArgumentFallback);
      case "functions/resource-exhausted":
        return new Error(
          "Too many availability updates were attempted. Please wait and try again.",
        );
      case "functions/deadline-exceeded":
      case "functions/unavailable":
        return new Error(
          "The availability service is temporarily unavailable. Please try again.",
        );
      default:
        return new Error(invalidArgumentFallback);
    }
  }

  return new Error(invalidArgumentFallback);
}
