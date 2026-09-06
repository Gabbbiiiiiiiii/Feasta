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

const ACCEPT_PROVIDER_REQUEST_FUNCTION =
  "acceptProviderRequest";

const REJECT_PROVIDER_REQUEST_FUNCTION =
  "rejectProviderRequest";

export type AcceptProviderRequestInput = {
  providerRequestId: string;
};

export type AcceptProviderRequestResult = {
  providerRequestId: string;
  mainEventId: string;
  status: string;
  accepted: boolean;
};

export type RejectProviderRequestInput = {
  providerRequestId: string;
  reason: string;
};

export type RejectProviderRequestResult = {
  providerRequestId: string;
  mainEventId: string;
  status: "rejected";
  rejected: boolean;
};

export async function acceptProviderRequest(
  input: AcceptProviderRequestInput,
): Promise<AcceptProviderRequestResult> {
  requireAuthenticatedProviderSession();

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    AcceptProviderRequestInput,
    AcceptProviderRequestResult
  >(
    functions,
    ACCEPT_PROVIDER_REQUEST_FUNCTION,
    {
      timeout: 30_000,
    },
  );

  try {
    const response =
      await callable({
        providerRequestId:
          input.providerRequestId.trim(),
      });

    return response.data;
  } catch (error) {
    throw normalizeProviderRequestError(
      error,
      "Unable to accept this request right now.",
    );
  }
}

export async function rejectProviderRequest(
  input: RejectProviderRequestInput,
): Promise<RejectProviderRequestResult> {
  requireAuthenticatedProviderSession();

  const providerRequestId =
    input.providerRequestId.trim();

  const reason =
    input.reason.trim();

  if (reason.length < 5) {
    throw new Error(
      "Please provide a rejection reason of at least 5 characters.",
    );
  }

  if (reason.length > 500) {
    throw new Error(
      "The rejection reason cannot exceed 500 characters.",
    );
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    RejectProviderRequestInput,
    RejectProviderRequestResult
  >(
    functions,
    REJECT_PROVIDER_REQUEST_FUNCTION,
    {
      timeout: 30_000,
    },
  );

  try {
    const response =
      await callable({
        providerRequestId,
        reason,
      });

    return response.data;
  } catch (error) {
    throw normalizeProviderRequestError(
      error,
      "Unable to reject this request right now.",
    );
  }
}

function requireAuthenticatedProviderSession(): void {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your provider session has expired. Sign in again.",
    );
  }
}

function normalizeProviderRequestError(
  error: unknown,
  fallbackMessage: string,
): Error {
  if (
    error instanceof
    WebAuthenticationError
  ) {
    return error;
  }

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return new WebAuthenticationError(
          "Your provider session has expired. Sign in again.",
        );

      case "functions/permission-denied":
        return new Error(
          "You do not have permission to manage this request.",
        );

      case "functions/not-found":
        return new Error(
          "This request could not be found. It may have been removed.",
        );

      case "functions/failed-precondition":
        return new Error(
          error.message ||
            "This request can no longer be changed.",
        );

      case "functions/resource-exhausted":
        return new Error(
          error.message ||
            "This request cannot be accepted because your current capacity has been reached.",
        );

      case "functions/invalid-argument":
        return new Error(
          error.message ||
            "Some of the request information is invalid.",
        );

      case "functions/deadline-exceeded":
      case "functions/unavailable":
        return new Error(
          "FEASTA could not reach the server. Please try again.",
        );

      default:
        return new Error(
          error.message ||
            fallbackMessage,
        );
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}