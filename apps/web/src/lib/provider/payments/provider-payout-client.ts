"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

import type {
  ProviderPayoutActivationInput,
  ProviderPayoutOnboardingResult,
  ProviderPayoutRefreshResult,
} from "./provider-finance-types";

export async function startProviderPayoutSetup():
Promise<ProviderPayoutOnboardingResult> {
  return callProviderFinance(
    "startProviderPayoutOnboarding",
  );
}

export async function refreshProviderPayoutSetup():
Promise<ProviderPayoutRefreshResult> {
  return callProviderFinance(
    "refreshProviderPayoutAccount",
  );
}

export async function saveProviderPayoutActivationProfile(
  input: ProviderPayoutActivationInput,
): Promise<{saved: boolean}> {
  return callProviderFinance(
    "saveProviderPayoutActivationProfile",
    input,
  );
}

async function callProviderFinance<T>(
  functionName: string,
  data: object = {},
): Promise<T> {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your provider session has expired. Sign in again.",
    );
  }

  initializeBrowserAppCheck();

  try {
    const response =
      await httpsCallable<
        object,
        T
      >(
        functions,
        functionName,
        {
          timeout: 30_000,
        },
      )(data);

    return response.data;
  } catch (error) {
    throw normalizeProviderFinanceError(
      error,
    );
  }
}

function normalizeProviderFinanceError(
  error: unknown,
): Error {
  if (
    error instanceof
      WebAuthenticationError
  ) {
    return error;
  }

  if (!(error instanceof FirebaseError)) {
    return error instanceof Error
      ? error
      : new Error(
        "The payout action could not be completed.",
      );
  }

  switch (error.code) {
    case "functions/unauthenticated":
      return new WebAuthenticationError(
        "Your provider session has expired. Sign in again.",
      );

    case "functions/permission-denied":
      return new Error(
        "Only an approved provider can manage payout setup.",
      );

    case "functions/failed-precondition":
      return new Error(
        safeMessage(error.message),
      );

    case "functions/resource-exhausted":
      return new Error(
        "Too many payout actions were attempted. Wait a moment and try again.",
      );

    case "functions/deadline-exceeded":
    case "functions/unavailable":
      return new Error(
        "FEASTA could not reach the payout service. Try again.",
      );

    default:
      return new Error(
        "The payout action could not be completed.",
      );
  }
}

function safeMessage(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    normalized.length >= 4 &&
    normalized.length <= 240
  ) {
    return normalized;
  }

  return "The payout account is not ready for this action.";
}