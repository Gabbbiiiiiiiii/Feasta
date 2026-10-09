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
import type {
  AdminPayoutSetupRepairInput,
  AdminPayoutSetupRepairResult,
} from "@/lib/admin/payments/admin-payment-types";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const REPAIR_AMBIGUOUS_PAYOUT_FUNCTION =
  "repairAmbiguousProviderPayoutAccount";

const PAYOUT_REPAIR_REASON =
  "Operator confirmed no PayMongo test child account exists after ambiguous Create Account attempt.";

const SAFE_PROVIDER_ID =
  /^[A-Za-z0-9_-]{8,160}$/u;

export async function repairAmbiguousProviderPayoutSetup(
  input: AdminPayoutSetupRepairInput,
): Promise<AdminPayoutSetupRepairResult> {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }

  const providerId =
    input.providerId.trim();

  if (!SAFE_PROVIDER_ID.test(providerId)) {
    throw new Error(
      "The Provider payout account is unavailable.",
    );
  }

  if (
    !Number.isSafeInteger(
      input.expectedUpdatedAtMillis,
    ) ||
    input.expectedUpdatedAtMillis <= 0
  ) {
    throw new Error(
      "The payout recovery state is stale. Refresh Finance attention.",
    );
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {
      providerId: string;
      expectedUpdatedAtMillis: number;
      reason: string;
    },
    AdminPayoutSetupRepairResult
  >(
    functions,
    REPAIR_AMBIGUOUS_PAYOUT_FUNCTION,
    {
      timeout: 30_000,
    },
  );

  try {
    const result = await callable({
      providerId,
      expectedUpdatedAtMillis:
        input.expectedUpdatedAtMillis,
      reason: PAYOUT_REPAIR_REASON,
    });

    return result.data;
  } catch (error: unknown) {
    throw new Error(
      payoutRepairErrorMessage(error),
    );
  }
}

function normalizeCallableCode(
  code: string,
): string {
  return code
    .replace(/^functions\//, "")
    .replace(/^functions:/, "");
}

function payoutRepairErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof
      WebAuthenticationError
  ) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (
      normalizeCallableCode(error.code)
    ) {
      case "unauthenticated":
        return "Your admin session has expired. Please sign in again.";

      case "permission-denied":
        return "Only an authorized FEASTA Admin can repair this payout setup.";

      case "not-found":
        return "This payout setup is no longer available. Refresh Finance attention.";

      case "invalid-argument":
        return "The payout recovery request is invalid.";

      case "failed-precondition":
        return "The payout setup changed or is no longer safe to repair. Refresh Finance attention.";

      case "resource-exhausted":
        return "Too many payout recovery attempts were made. Wait a moment and try again.";

      case "unavailable":
      case "deadline-exceeded":
        return "The trusted payout recovery service is temporarily unavailable.";

      default:
        return "The payout setup could not be repaired safely.";
    }
  }

  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "The payout setup could not be repaired safely.";
}