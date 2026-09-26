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
  AdminPaymentRefundInput,
  AdminPaymentRefundResult,
} from "@/lib/admin/payments/admin-payment-types";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const REQUEST_PAYMENT_REFUND_FUNCTION =
  "requestPaymentRefund";

export async function requestAdminPaymentRefund(
  input: AdminPaymentRefundInput,
): Promise<AdminPaymentRefundResult> {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    AdminPaymentRefundInput,
    AdminPaymentRefundResult
  >(
    functions,
    REQUEST_PAYMENT_REFUND_FUNCTION,
    {
      timeout: 30_000,
    },
  );

  try {
    const result = await callable({
      paymentId: input.paymentId,
      reason: normalizeRefundReason(
        input.reason,
      ),
      idempotencyKey:
        input.idempotencyKey,
    });

    return result.data;
  } catch (error: unknown) {
    throw new Error(
      refundErrorMessage(error),
    );
  }
}

export function createRefundIdempotencyKey(
  paymentId: string,
): string {
  const randomId =
    globalThis.crypto?.randomUUID?.();

  if (!randomId) {
    throw new Error(
      "Secure refund initialization is unavailable. Refresh the page and try again.",
    );
  }

  return [
    "admin-refund",
    paymentId,
    randomId,
  ].join(":");
}

function normalizeRefundReason(
  reason: string,
): string {
  const normalized = reason
    .trim()
    .replace(/\s+/g, " ");

  if (
    normalized.length < 5 ||
    normalized.length > 500
  ) {
    throw new Error(
      "Enter a refund reason between 5 and 500 characters.",
    );
  }

  return normalized;
}

function refundErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof
      WebAuthenticationError
  ) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (normalizeCallableCode(
      error.code,
    )) {
      case "unauthenticated":
        return "Your admin session has expired. Please sign in again.";

      case "permission-denied":
        return "You do not have permission to request this refund.";

      case "failed-precondition":
        return "This payment is no longer eligible for a refund. Refresh its details and try again.";

      case "invalid-argument":
        return "The refund request contains invalid information.";

      case "already-exists":
        return "A refund has already been requested for this payment.";

      case "resource-exhausted":
        return "Too many refund attempts were made. Please wait before trying again.";

      case "unavailable":
      case "deadline-exceeded":
        return "The payment service is temporarily unavailable. Please try again.";

      case "internal":
        return "The refund request could not be completed safely.";

      default:
        return "The refund request could not be completed.";
    }
  }

  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "The refund request could not be completed.";
}

function normalizeCallableCode(
  code: string,
): string {
  return code
    .replace(/^functions\//, "")
    .replace(/^functions:/, "");
}