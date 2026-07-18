import {createHmac, timingSafeEqual} from "node:crypto";

import {
  isPaymentStatusTransitionAllowed,
  PAYMENT_CURRENCY,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "../shared/constants.js";

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

export type PayMongoPaymentEvent = {
  eventId: string;
  eventType: string;
  paymentId: string;
  gatewayResourceId: string;
  amountInCentavos: number;
  currency: string;
};

export function verifyPayMongoSignature(input: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
  nowSeconds?: number;
}): boolean {
  if (!input.signatureHeader || input.secret.length < 16) return false;
  const parts = Object.fromEntries(input.signatureHeader.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator > 0 ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] : ["", ""];
  }));
  const timestamp = Number(parts.t);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_WEBHOOK_AGE_SECONDS) {
    return false;
  }
  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody.toString("utf8")}`)
    .digest("hex");
  return [parts.te, parts.li].some((candidate) => secureEqual(expected, candidate));
}

export function parsePayMongoPaymentEvent(rawBody: Buffer): PayMongoPaymentEvent {
  const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
  const root = requireRecord(payload, "payload");
  const event = requireRecord(root.data, "data");
  const eventAttributes = requireRecord(event.attributes, "event attributes");
  const resource = requireRecord(eventAttributes.data, "event resource");
  const attributes = requireRecord(resource.attributes, "resource attributes");
  const metadata = requireRecord(attributes.metadata, "payment metadata");
  const eventId = requireString(event.id, "event id");
  const eventType = requireString(eventAttributes.type, "event type");
  const paymentId = requireString(metadata.payment_id, "payment metadata id");
  const gatewayResourceId = requireString(resource.id, "gateway resource id");
  const amountInCentavos = attributes.amount;
  const currency = requireString(attributes.currency, "currency").toUpperCase();
  if (typeof amountInCentavos !== "number" ||
      !Number.isSafeInteger(amountInCentavos) || amountInCentavos <= 0) {
    throw new Error("Webhook amount is invalid.");
  }
  return {eventId, eventType, paymentId, gatewayResourceId, amountInCentavos, currency};
}

export function statusForPayMongoEvent(eventType: string): PaymentStatus | null {
  switch (eventType) {
    case "checkout_session.payment.paid":
    case "payment.paid": return "paid";
    case "payment.failed":
    case "payment_intent.payment_failed": return "failed";
    case "checkout_session.expired": return "expired";
    case "payment.refunded": return "refunded";
    default: return null;
  }
}

export function validateTrustedPaymentUpdate(input: {
  currentStatus: unknown;
  nextStatus: PaymentStatus;
  expectedAmountInCentavos: unknown;
  actualAmountInCentavos: number;
  expectedCurrency: unknown;
  actualCurrency: string;
}): string | null {
  if (!PAYMENT_STATUSES.includes(input.currentStatus as PaymentStatus)) return "invalid_current_status";
  if (!isPaymentStatusTransitionAllowed(input.currentStatus as PaymentStatus, input.nextStatus)) {
    return input.currentStatus === input.nextStatus ? "already_applied" : "invalid_transition";
  }
  if (input.expectedAmountInCentavos !== input.actualAmountInCentavos) return "amount_mismatch";
  if (input.expectedCurrency !== PAYMENT_CURRENCY || input.actualCurrency !== PAYMENT_CURRENCY) {
    return "currency_mismatch";
  }
  return null;
}

function secureEqual(expected: string, candidate: string | undefined): boolean {
  if (!candidate) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(candidate, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} is invalid.`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new Error(`${name} is invalid.`);
  }
  return value.trim();
}
