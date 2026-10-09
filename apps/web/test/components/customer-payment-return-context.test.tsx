import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("firebase/app", () => ({
  FirebaseError: class FirebaseError extends Error {},
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(),
}));

vi.mock("@/lib/auth/client-session", () => ({
  WebAuthenticationError: class WebAuthenticationError extends Error {},
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: {},
  functions: {},
  initializeBrowserAppCheck: vi.fn(),
}));

import {
  clearCustomerPaymentReturnContext,
  readCustomerPaymentReturnContext,
  redirectToCustomerPaymentCheckout,
} from "@/lib/customer/payments/customer-payment-client";

const PAYMENT_RETURN_STORAGE_KEY = "feasta.customer.payment-return.v1";
const lookup = {
  paymentId: "payment_context_12345678",
};

describe("customer payment return context", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/customer/payments");
  });

  it("resolves URL correlation without origin-local storage", () => {
    window.history.replaceState({}, "", `/customer/payments?payment=success&ref=${lookup.paymentId}`);
    expect(readCustomerPaymentReturnContext()).toEqual(lookup);
  });

  it("resolves cancelled correlation without changing transaction state", () => {
    window.history.replaceState({}, "", `/customer/payments?payment=cancelled&ref=${lookup.paymentId}`);
    expect(readCustomerPaymentReturnContext()).toEqual(lookup);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("fails closed for invalid URL correlation rather than using stale storage", () => {
    window.sessionStorage.setItem(PAYMENT_RETURN_STORAGE_KEY, JSON.stringify({...lookup, createdAt: Date.now()}));
    window.history.replaceState({}, "", "/customer/payments?payment=success&ref=invalid");
    expect(readCustomerPaymentReturnContext()).toBeNull();
  });

  it("retains valid same-tab context across return-page rechecks", () => {
    window.sessionStorage.setItem(
      PAYMENT_RETURN_STORAGE_KEY,
      JSON.stringify({...lookup, createdAt: Date.now()}),
    );

    expect(readCustomerPaymentReturnContext()).toEqual(lookup);
    expect(readCustomerPaymentReturnContext()).toEqual(lookup);
    expect(
      window.sessionStorage.getItem(PAYMENT_RETURN_STORAGE_KEY),
    ).not.toBeNull();
  });

  it("clears malformed context while failing closed", () => {
    window.sessionStorage.setItem(
      PAYMENT_RETURN_STORAGE_KEY,
      "not-json",
    );

    expect(readCustomerPaymentReturnContext()).toBeNull();
    expect(
      window.sessionStorage.getItem(PAYMENT_RETURN_STORAGE_KEY),
    ).toBeNull();
  });

  it("clears expired context while failing closed", () => {
    window.sessionStorage.setItem(
      PAYMENT_RETURN_STORAGE_KEY,
      JSON.stringify({
        ...lookup,
        createdAt: Date.now() - (4 * 60 * 60 * 1000) - 1,
      }),
    );

    expect(readCustomerPaymentReturnContext()).toBeNull();
    expect(
      window.sessionStorage.getItem(PAYMENT_RETURN_STORAGE_KEY),
    ).toBeNull();
  });

  it("supports explicit clearing after a definitive unavailable result", () => {
    window.sessionStorage.setItem(
      PAYMENT_RETURN_STORAGE_KEY,
      JSON.stringify({...lookup, createdAt: Date.now()}),
    );

    clearCustomerPaymentReturnContext();

    expect(readCustomerPaymentReturnContext()).toBeNull();
  });

  it("rejects an untrusted checkout URL before storing return context or navigating", () => {
    expect(() => redirectToCustomerPaymentCheckout({
      paymentId: lookup.paymentId,
      providerRequestId: "request_context_12345678",
      bookingId: "booking_context_12345678",
      checkoutUrl: "https://attacker.example/checkout",
      created: true,
    })).toThrow("The payment checkout URL is invalid.");

    expect(readCustomerPaymentReturnContext()).toBeNull();
  });
});
