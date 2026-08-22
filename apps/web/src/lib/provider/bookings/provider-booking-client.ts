"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

type ProviderBookingLifecycleResult = {
  providerRequestId: string;
  mainEventId: string;
  status: "in_progress" | "completed";
  mainEventStatus: string;
  changed: boolean;
};

export async function markProviderBookingInProgress(
  providerRequestId: string,
): Promise<ProviderBookingLifecycleResult> {
  return callProviderBookingLifecycle(
    "markProviderBookingInProgress",
    providerRequestId,
    "Unable to start this event right now.",
  );
}

export async function completeProviderBooking(
  providerRequestId: string,
): Promise<ProviderBookingLifecycleResult> {
  return callProviderBookingLifecycle(
    "completeProviderBooking",
    providerRequestId,
    "Unable to complete this booking right now.",
  );
}

async function callProviderBookingLifecycle(
  functionName: "markProviderBookingInProgress" | "completeProviderBooking",
  providerRequestId: string,
  fallbackMessage: string,
): Promise<ProviderBookingLifecycleResult> {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your provider session has expired. Sign in again.",
    );
  }

  const normalizedRequestId = providerRequestId.trim();

  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(normalizedRequestId)) {
    throw new Error("This provider booking is unavailable.");
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {providerRequestId: string},
    ProviderBookingLifecycleResult
  >(functions, functionName, {timeout: 30_000});

  try {
    const response = await callable({
      providerRequestId: normalizedRequestId,
    });

    return response.data;
  } catch (error) {
    throw normalizeProviderBookingError(error, fallbackMessage);
  }
}

function normalizeProviderBookingError(
  error: unknown,
  fallbackMessage: string,
): Error {
  if (error instanceof WebAuthenticationError) return error;

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return new WebAuthenticationError(
          "Your provider session has expired. Sign in again.",
        );
      case "functions/permission-denied":
        return new Error(
          "You do not have permission to manage this booking.",
        );
      case "functions/not-found":
        return new Error(
          "This booking could not be found. It may have been removed.",
        );
      case "functions/failed-precondition":
        return new Error(
          error.message || "This booking is not eligible for that action.",
        );
      case "functions/invalid-argument":
        return new Error("This booking request is invalid.");
      case "functions/deadline-exceeded":
      case "functions/unavailable":
        return new Error(
          "FEASTA could not reach the server. Please try again.",
        );
      default:
        return new Error(error.message || fallbackMessage);
    }
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

export type {ProviderBookingLifecycleResult};
