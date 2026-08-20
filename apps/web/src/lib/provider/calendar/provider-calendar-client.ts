"use client";

import {
  FirebaseError,
} from "firebase/app";
import {
  httpsCallable,
} from "firebase/functions";

import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

export type ProviderAvailabilityAction =
  | "mark_unavailable"
  | "mark_available";

type UpdateProviderAvailabilityInput = {
  date: string;
  action: ProviderAvailabilityAction;
};

type UpdateProviderAvailabilityResult = {
  providerId: string;
  date: string;
  action: ProviderAvailabilityAction;
  unavailableDates: string[];
};

const UPDATE_PROVIDER_AVAILABILITY_FUNCTION =
  "updateProviderAvailability";

export async function updateProviderAvailability(
  input: UpdateProviderAvailabilityInput,
): Promise<UpdateProviderAvailabilityResult> {
  requireAuthenticatedProviderSession();

  initializeBrowserAppCheck();

  const callable =
    httpsCallable<
      UpdateProviderAvailabilityInput,
      UpdateProviderAvailabilityResult
    >(
      functions,
      UPDATE_PROVIDER_AVAILABILITY_FUNCTION,
      {
        timeout: 30_000,
      },
    );

  try {
    const result =
      await callable(input);

    return result.data;
  } catch (error) {
    if (
      error instanceof
      WebAuthenticationError
    ) {
      throw error;
    }

    if (error instanceof FirebaseError) {
      throw new Error(
        providerAvailabilityErrorMessage(
          error,
        ),
      );
    }

    throw error;
  }
}

function requireAuthenticatedProviderSession():
void {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your provider session expired. Sign in again.",
      "session_expired",
    );
  }
}

function providerAvailabilityErrorMessage(
  error: FirebaseError,
): string {
  switch (error.code) {
    case "functions/unauthenticated":
      return "Your provider session expired. Sign in again.";

    case "functions/permission-denied":
      return "You do not have permission to update this provider's availability.";

    case "functions/not-found":
      return "Your provider account could not be found.";

    case "functions/failed-precondition":
      return error.message ||
        "Your provider account is not available for this operation.";

    case "functions/invalid-argument":
      return error.message ||
        "The selected availability date is invalid.";

    case "functions/resource-exhausted":
      return "Too many availability updates were attempted. Please wait and try again.";

    case "functions/deadline-exceeded":
    case "functions/unavailable":
      return "The availability service is temporarily unavailable. Please try again.";

    default:
      return error.message ||
        "Unable to update availability. Please try again.";
  }
}