"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import type {
  CreateCustomerPaymentSessionInput,
  CreateCustomerPaymentSessionResult,
  CustomerPaymentReturnLookup,
} from "@/lib/customer/payments/customer-payment-types";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const CREATE_PAYMENT_SESSION_FUNCTION = "createPaymentSession";
const SAFE_PROVIDER_REQUEST_ID = /^[A-Za-z0-9_-]{8,160}$/u;
const PAYMENT_RETURN_STORAGE_KEY = "feasta.customer.payment-return.v1";
const PAYMENT_RETURN_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const SAFE_CLIENT_PAYMENT_ERRORS = new Set([
  "The selected payment request is invalid.",
  "Secure payment initialization is unavailable. Refresh the page and try again.",
  "The payment service returned an invalid response.",
  "The payment checkout URL is invalid.",
]);

export async function createCustomerPaymentCheckout(
  providerRequestId: string,
): Promise<CreateCustomerPaymentSessionResult> {
  try {
    await auth.authStateReady();

    if (!auth.currentUser) {
      throw new WebAuthenticationError(
        "Please sign in again to continue.",
        "session_expired",
      );
    }

    const normalizedProviderRequestId = normalizeProviderRequestId(
      providerRequestId,
    );
    const idempotencyKey = createPaymentIdempotencyKey(
      normalizedProviderRequestId,
    );

    initializeBrowserAppCheck();

    const callable = httpsCallable<
      CreateCustomerPaymentSessionInput,
      CreateCustomerPaymentSessionResult
    >(
      functions,
      CREATE_PAYMENT_SESSION_FUNCTION,
      {timeout: 30_000},
    );

    const response = await callable({
      providerRequestId: normalizedProviderRequestId,
      idempotencyKey,
    });

    return validateCheckoutResult(
      response.data,
      normalizedProviderRequestId,
    );
  } catch (error: unknown) {
    if (error instanceof WebAuthenticationError) {
      throw error;
    }

    throw new Error(paymentErrorMessage(error));
  }
}

export function redirectToCustomerPaymentCheckout(
  result: CreateCustomerPaymentSessionResult,
): void {
  const checkoutUrl = requirePayMongoCheckoutUrl(result.checkoutUrl);

  rememberCustomerPaymentReturn({
    paymentId: result.paymentId,
    providerRequestId: result.providerRequestId,
    bookingId: result.bookingId,
  });

  window.location.assign(checkoutUrl);
}

export function readCustomerPaymentReturnContext():
  CustomerPaymentReturnLookup | null {
  try {
    const raw = window.sessionStorage.getItem(
      PAYMENT_RETURN_STORAGE_KEY,
    );

    if (!raw) return null;

    const value = JSON.parse(raw) as Record<string, unknown>;
    const createdAt = value.createdAt;

    if (
      !isSafeDocumentId(value.paymentId) ||
      !isSafeDocumentId(value.providerRequestId) ||
      !isSafeDocumentId(value.bookingId) ||
      typeof createdAt !== "number" ||
      !Number.isFinite(createdAt) ||
      createdAt > Date.now() + 60_000 ||
      Date.now() - createdAt > PAYMENT_RETURN_MAX_AGE_MS
    ) {
      clearCustomerPaymentReturnContext();
      return null;
    }

    return {
      paymentId: value.paymentId,
      providerRequestId: value.providerRequestId,
      bookingId: value.bookingId,
    };
  } catch {
    clearCustomerPaymentReturnContext();
    return null;
  }
}

export function clearCustomerPaymentReturnContext(): void {
  try {
    window.sessionStorage.removeItem(
      PAYMENT_RETURN_STORAGE_KEY,
    );
  } catch {
    /* Return handling remains fail-closed when storage is unavailable. */
  }
}

function rememberCustomerPaymentReturn(
  lookup: CustomerPaymentReturnLookup,
): void {
  try {
    window.sessionStorage.setItem(
      PAYMENT_RETURN_STORAGE_KEY,
      JSON.stringify({
        ...lookup,
        createdAt: Date.now(),
      }),
    );
  } catch {
    /* Checkout remains usable when browser storage is unavailable. */
  }
}

function createPaymentIdempotencyKey(
  providerRequestId: string,
): string {
  const randomId = globalThis.crypto?.randomUUID?.();

  if (!randomId) {
    throw new Error(
      "Secure payment initialization is unavailable. Refresh the page and try again.",
    );
  }

  return ["customer-checkout", providerRequestId, randomId].join(":");
}

function normalizeProviderRequestId(value: string): string {
  const normalized = value.trim();

  if (!SAFE_PROVIDER_REQUEST_ID.test(normalized)) {
    throw new Error("The selected payment request is invalid.");
  }

  return normalized;
}

function validateCheckoutResult(
  value: CreateCustomerPaymentSessionResult,
  expectedProviderRequestId: string,
): CreateCustomerPaymentSessionResult {
  if (
    !value ||
    typeof value !== "object" ||
    !SAFE_PROVIDER_REQUEST_ID.test(value.paymentId) ||
    value.providerRequestId !== expectedProviderRequestId ||
    !SAFE_PROVIDER_REQUEST_ID.test(value.bookingId) ||
    typeof value.created !== "boolean"
  ) {
    throw new Error("The payment service returned an invalid response.");
  }

  return {
    paymentId: value.paymentId,
    providerRequestId: value.providerRequestId,
    bookingId: value.bookingId,
    checkoutUrl: requirePayMongoCheckoutUrl(value.checkoutUrl),
    created: value.created,
  };
}

function requirePayMongoCheckoutUrl(value: unknown): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 500) {
    throw new Error("The payment checkout URL is invalid.");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("The payment checkout URL is invalid.");
  }

  const hostname = url.hostname.toLowerCase();
  const isPayMongoHost =
    hostname === "paymongo.com" || hostname.endsWith(".paymongo.com");

  if (
    url.protocol !== "https:" ||
    !isPayMongoHost ||
    url.username ||
    url.password
  ) {
    throw new Error("The payment checkout URL is invalid.");
  }

  return url.toString();
}

function paymentErrorMessage(error: unknown): string {
  if (error instanceof WebAuthenticationError) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (normalizeCallableCode(error.code)) {
      case "unauthenticated":
        return "Please sign in again to continue.";

      case "permission-denied":
        return "You are not allowed to pay for this booking.";

      case "failed-precondition":
        return "This payment is no longer available. Refresh the booking to see its latest status.";

      case "invalid-argument":
        return "The payment request contains invalid information.";

      case "already-exists":
        return "A payment session already exists for this provider request. Refresh the page and try again.";

      case "resource-exhausted":
        return "Too many payment attempts were made. Please wait before trying again.";

      case "unavailable":
      case "deadline-exceeded":
        return "The payment service is temporarily unavailable. Please try again.";

      case "internal":
        return "The payment session could not be created safely.";

      default:
        return "We couldn't start the payment checkout. Please try again.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return SAFE_CLIENT_PAYMENT_ERRORS.has(error.message)
      ? error.message
      : "We couldn't start the payment checkout. Please try again.";
  }

  return "We couldn't start the payment checkout. Please try again.";
}

function normalizeCallableCode(code: string): string {
  return code
    .replace(/^functions\//u, "")
    .replace(/^functions:/u, "");
}

function isSafeDocumentId(value: unknown): value is string {
  return typeof value === "string" &&
    SAFE_PROVIDER_REQUEST_ID.test(value);
}
