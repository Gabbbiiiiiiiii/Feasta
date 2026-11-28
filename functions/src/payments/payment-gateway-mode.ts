const SAFE_SANDBOX_ID = /^[A-Za-z0-9_-]{8,160}$/u;

export type PaymentGatewayMode = "paymongo" | "sandbox_mock";

export const SANDBOX_CHECKOUT_ORIGIN = "https://feasta-web.vercel.app";
export const SANDBOX_CHECKOUT_PATH = "/customer/payments/sandbox-checkout";
export const SANDBOX_CHECKOUT_ID_PREFIX = "cs_sandbox_";

export function getPaymentGatewayMode(): PaymentGatewayMode {
  return process.env.PAYMENT_GATEWAY_MODE?.trim().toLowerCase() === "sandbox_mock"
    ? "sandbox_mock"
    : "paymongo";
}

export function isSandboxMockPaymentMode(): boolean {
  return getPaymentGatewayMode() === "sandbox_mock";
}

export function buildSandboxCheckoutUrl(input: {
  paymentId: string;
  checkoutAttemptId?: string;
}): string {
  if (!SAFE_SANDBOX_ID.test(input.paymentId)) {
    throw new Error("Sandbox checkout paymentId is invalid.");
  }

  const url = new URL(SANDBOX_CHECKOUT_PATH, SANDBOX_CHECKOUT_ORIGIN);
  url.searchParams.set("paymentId", input.paymentId);

  if (input.checkoutAttemptId !== undefined) {
    if (!SAFE_SANDBOX_ID.test(input.checkoutAttemptId)) {
      throw new Error("Sandbox checkout attemptId is invalid.");
    }
    url.searchParams.set("attemptId", input.checkoutAttemptId);
  }

  return url.toString();
}

export function isValidSandboxCheckoutUrl(value: string): boolean {
  if (typeof value !== "string" || value.length < 10 || value.length > 500) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin !== SANDBOX_CHECKOUT_ORIGIN ||
    url.pathname !== SANDBOX_CHECKOUT_PATH
  ) {
    return false;
  }

  const paymentId = url.searchParams.get("paymentId");
  if (!paymentId || !SAFE_SANDBOX_ID.test(paymentId)) {
    return false;
  }

  const attemptId = url.searchParams.get("attemptId");
  if (attemptId !== null && !SAFE_SANDBOX_ID.test(attemptId)) {
    return false;
  }

  return true;
}
