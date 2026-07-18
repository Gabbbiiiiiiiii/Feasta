type CheckoutSession = {id: string; checkoutUrl: string};

export async function createPayMongoCheckout(input: {
  secretKey: string;
  idempotencyKey: string;
  paymentId: string;
  bookingId: string;
  customerId: string;
  amountInCentavos: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const response = await payMongoRequest(input.secretKey, "/v1/checkout_sessions", {
    method: "POST",
    headers: {"Idempotency-Key": input.idempotencyKey},
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{
            amount: input.amountInCentavos,
            currency: input.currency,
            name: input.description,
            quantity: 1,
          }],
          payment_method_types: ["card", "gcash", "paymaya"],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          description: input.description,
          metadata: {
            payment_id: input.paymentId,
            booking_id: input.bookingId,
            customer_id: input.customerId,
          },
        },
      },
    }),
  });
  const data = asRecord(asRecord(response).data);
  const attributes = asRecord(data.attributes);
  const id = requireString(data.id, "PayMongo checkout ID");
  const checkoutUrl = requireHttpsUrl(attributes.checkout_url, "PayMongo checkout URL");
  return {id, checkoutUrl};
}

export async function createPayMongoRefund(input: {
  secretKey: string;
  idempotencyKey: string;
  gatewayPaymentId: string;
  amountInCentavos: number;
  reason: string;
}): Promise<{id: string}> {
  const response = await payMongoRequest(input.secretKey, "/v1/refunds", {
    method: "POST",
    headers: {"Idempotency-Key": input.idempotencyKey},
    body: JSON.stringify({data: {attributes: {
      amount: input.amountInCentavos,
      payment_id: input.gatewayPaymentId,
      reason: input.reason,
    }}}),
  });
  return {id: requireString(asRecord(asRecord(response).data).id, "PayMongo refund ID")};
}

async function payMongoRequest(secretKey: string, path: string, init: RequestInit): Promise<unknown> {
  if (!secretKey.startsWith("sk_")) {
    logSecurityEvent({
      action: "configuration_failure",
      outcome: "failed",
      targetId: "paymongo",
      reasonCode: "secret_key_missing_or_invalid",
    });
    throw new Error("PayMongo secret key is not configured.");
  }
  const response = await fetch(`https://api.paymongo.com${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    // Do not log or return PayMongo's payload; it can contain payment details.
    throw new Error(`PayMongo request failed with status ${response.status}.`);
  }
  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PayMongo response is invalid.");
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length < 3 || value.length > 500) throw new Error(`${name} is invalid.`);
  return value;
}

function requireHttpsUrl(value: unknown, name: string): string {
  const result = requireString(value, name);
  if (new URL(result).protocol !== "https:") throw new Error(`${name} is invalid.`);
  return result;
}
import {logSecurityEvent} from "../shared/security-events.js";

