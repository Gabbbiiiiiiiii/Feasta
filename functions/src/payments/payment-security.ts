import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  isPaymentStatusTransitionAllowed,
  PAYMENT_CURRENCY,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "../shared/constants.js";
import {
  parsePayMongoRefundResource,
  type PayMongoRefundResource,
} from "./paymongo-client.js";

import {gatewayPaidAtMillis} from "./checkout-attempt-domain.js";

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

export type GatewayPaymentEvidence = {
  id: string;
  paymentIntentId: string | null;
  gatewayPaidAtMs: number | null;
};

export type PayMongoPaymentEvent = {
  kind: "payment";
  eventId: string;
  eventType: string;
  paymentId: string;
  gatewayResourceId: string;
  amountInCentavos: number;
  currency: string;
  checkoutAttemptId: string | null;
  checkoutId: string | null;
  paymentIntentId: string | null;
  paymentIds: string[];
  paymentIntentIds: string[];
  successfulPayments: GatewayPaymentEvidence[];
};

export type PayMongoRefundEvent = {
  kind: "refund";
  eventId: string;
  eventType: string;
  paymentId: string;
  refundOperationId: string;
  refund: PayMongoRefundResource;
};

export type PayMongoWebhookEvent =
  | PayMongoPaymentEvent
  | PayMongoRefundEvent;

export function verifyPayMongoSignature(input: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
  nowSeconds?: number;
}): boolean {
  if (
    !input.signatureHeader ||
    input.secret.length < 16
  ) {
    return false;
  }

  const signatureParts =
    input.signatureHeader.split(",");

  const parts = Object.fromEntries(
    signatureParts.map((part) => {
      const separator = part.indexOf("=");

      if (separator <= 0) {
        return ["", ""];
      }

      return [
        part.slice(0, separator).trim(),
        part.slice(separator + 1).trim(),
      ];
    }),
  );

  const timestamp = Number(parts.t);

  const now =
    input.nowSeconds ??
    Math.floor(Date.now() / 1_000);

  if (
    !Number.isInteger(timestamp) ||
    Math.abs(now - timestamp) >
      MAX_WEBHOOK_AGE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac(
    "sha256",
    input.secret,
  )
    .update(
      `${timestamp}.${
        input.rawBody.toString("utf8")
      }`,
    )
    .digest("hex");

  return [parts.te, parts.li].some(
    (candidate) =>
      secureEqual(expected, candidate),
  );
}

export function parsePayMongoPaymentEvent(
  rawBody: Buffer,
): PayMongoPaymentEvent {
  const event = parsePayMongoWebhookEvent(rawBody);
  if (event.kind !== "payment") {
    throw new Error("Webhook payment resource is invalid.");
  }
  return event;
}

export function parsePayMongoWebhookEvent(
  rawBody: Buffer,
): PayMongoWebhookEvent {
  const payload = JSON.parse(
    rawBody.toString("utf8"),
  ) as unknown;

  const root = requireRecord(
    payload,
    "payload",
  );

  const event = requireRecord(
    root.data,
    "data",
  );

  const eventAttributes = requireRecord(
    event.attributes,
    "event attributes",
  );

  const resource = requireRecord(
    eventAttributes.data,
    "event resource",
  );

  const attributes = requireRecord(
    resource.attributes,
    "resource attributes",
  );

  const resourceType = requireString(resource.type, "resource type");
  const eventId = requireString(event.id, "event id");
  const eventType = requireString(eventAttributes.type, "event type");
  if ((eventType === "payment.paid" && resourceType !== "payment") ||
    (eventType === "checkout_session.payment.paid" && resourceType !== "checkout_session")) {
    throw new Error("Gateway event resource type mismatch.");
  }

  if (resourceType === "refund") {
    const refund = parsePayMongoRefundResource({data: resource});
    return {
      kind: "refund",
      eventId,
      eventType,
      paymentId: requireString(
        refund.metadata.feasta_payment_id,
        "refund payment metadata id",
      ),
      refundOperationId: requireString(
        refund.metadata.feasta_refund_operation_id,
        "refund operation metadata id",
      ),
      refund,
    };
  }

  const metadata = requireRecord(
    attributes.metadata,
    "payment metadata",
  );

  const paymentId = requireString(
    metadata.payment_id,
    "payment metadata id",
  );

  let gatewayResourceId = requireString(
    resource.id,
    "gateway resource id",
  );

  let amountInCentavos =
    attributes.amount;

  let currencyValue = attributes.currency;
  const successfulPayments: GatewayPaymentEvidence[] = [];
  const paymentIds = new Set<string>();
  const paymentIntentIds = new Set<string>();
  if (resourceType === "payment") paymentIds.add(gatewayResourceId);
  const checkoutId = resourceType === "checkout_session" ? gatewayResourceId : null;
  let paymentIntentId = resourceType === "payment_intent" ? gatewayResourceId :
    optionalGatewayId(attributes.payment_intent_id);
  if (resourceType === "checkout_session") {
    const intent = attributes.payment_intent && typeof attributes.payment_intent === "object" ?
      attributes.payment_intent as Record<string, unknown> : {};
    paymentIntentId = typeof attributes.payment_intent === "string" ?
      optionalGatewayId(attributes.payment_intent) : optionalGatewayId(intent.id);
    const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
    for (const value of payments) {
      const item = requireRecord(value, "checkout payment");
      const attrs = requireRecord(item.attributes, "payment attributes");
      const id = optionalGatewayId(item.id);
      if (item.type !== "payment" || !id?.startsWith("pay_")) {
        throw new Error("Invalid checkout payment identity.");
      }
      paymentIds.add(id);
      const intentId = optionalGatewayId(attrs.payment_intent_id);
      if (intentId) paymentIntentIds.add(intentId);
    }
    const paid = payments.map((value) => requireRecord(value, "checkout payment"))
      .filter((value) => requireRecord(value.attributes, "payment attributes").status === "paid");
    if (eventType === "checkout_session.payment.paid") {
      if (paid.length === 0) throw new Error("Checkout payment evidence missing.");
      const first = requireRecord(paid[0].attributes, "payment attributes");
      amountInCentavos = first.amount;
      currencyValue = first.currency;
      gatewayResourceId = requireString(paid[0].id, "payment id");
      for (const value of paid) {
        const data = requireRecord(value.attributes, "payment attributes");
        if (value.type !== "payment" || data.amount !== amountInCentavos ||
          data.currency !== currencyValue) {
          throw new Error("Checkout payment relationship is invalid.");
        }
        successfulPayments.push(paymentEvidence(value.id, data));
      }
    } else if (amountInCentavos === undefined && currencyValue === undefined &&
      intent.attributes !== undefined) {
      // Preserve resource-level amount/currency for non-success notifications.
      // An expanded intent is an optional fallback, never a settlement proof.
      const intentAttributes = requireRecord(intent.attributes, "payment intent attributes");
      amountInCentavos = intentAttributes.amount;
      currencyValue = intentAttributes.currency;
    }
  } else if (resourceType === "payment" && eventType === "payment.paid") {
    if (attributes.status !== undefined && attributes.status !== "paid") {
      throw new Error("Payment success status is invalid.");
    }
    successfulPayments.push(paymentEvidence(resource.id, attributes));
  }
  const currency = requireString(currencyValue, "currency").toUpperCase();

  if (
    typeof amountInCentavos !== "number" ||
    !Number.isSafeInteger(
      amountInCentavos,
    ) ||
    amountInCentavos <= 0
  ) {
    throw new Error(
      "Webhook amount is invalid.",
    );
  }

  if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
  return {
    kind: "payment",
    eventId,
    eventType,
    paymentId,
    gatewayResourceId,
    amountInCentavos,
    currency,
    checkoutAttemptId: optionalGatewayId(metadata.feasta_checkout_attempt_id),
    checkoutId,
    paymentIntentId,
    paymentIds: [...paymentIds],
    paymentIntentIds: [...paymentIntentIds],
    successfulPayments,
  };
}

function optionalGatewayId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const id = requireString(value, "gateway relationship id");
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(id)) throw new Error("Invalid gateway relationship id.");
  return id;
}

function paymentEvidence(id: unknown, data: Record<string, unknown>): GatewayPaymentEvidence {
  const paymentId = optionalGatewayId(id);
  if (!paymentId?.startsWith("pay_")) throw new Error("Invalid gateway payment id.");
  return {id: paymentId, paymentIntentId: optionalGatewayId(data.payment_intent_id),
    gatewayPaidAtMs: gatewayPaidAtMillis(data.paid_at)};
}

export function statusForPayMongoEvent(
  eventType: string,
): PaymentStatus | null {
  switch (eventType) {
    case "checkout_session.payment.paid":
    case "payment.paid":
      return "paid";

    case "payment.failed":
    case "payment_intent.payment_failed":
      return "failed";

    case "checkout_session.expired":
      return "expired";

    case "payment.refunded":
      return "refunded";

    default:
      return null;
  }
}

export function validateTrustedPaymentUpdate(
  input: {
    currentStatus: unknown;
    nextStatus: PaymentStatus;
    expectedAmountInCentavos: unknown;
    actualAmountInCentavos: number;
    expectedCurrency: unknown;
    actualCurrency: string;
    allowFailedToPaidRecovery?: boolean;
  },
): string | null {
  if (input.expectedAmountInCentavos !== input.actualAmountInCentavos) return "amount_mismatch";
  if (input.expectedCurrency !== PAYMENT_CURRENCY ||
    input.actualCurrency !== PAYMENT_CURRENCY) return "currency_mismatch";
  if (
    !PAYMENT_STATUSES.includes(
      input.currentStatus as PaymentStatus,
    )
  ) {
    return "invalid_current_status";
  }

  const currentStatus =
    input.currentStatus as PaymentStatus;

  if (
    !isPaymentStatusTransitionAllowed(
      currentStatus,
      input.nextStatus,
    ) &&
    !(
      input.allowFailedToPaidRecovery ===
        true &&
      currentStatus === "failed" &&
      input.nextStatus === "paid"
    )
  ) {
    return currentStatus === input.nextStatus
      ? "already_applied"
      : "invalid_transition";
  }

  return null;
}

function secureEqual(
  expected: string,
  candidate: string | undefined,
): boolean {
  if (!candidate) {
    return false;
  }

  const left = Buffer.from(
    expected,
    "utf8",
  );

  const right = Buffer.from(
    candidate,
    "utf8",
  );

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${name} is invalid.`,
    );
  }

  return value as Record<string, unknown>;
}

function requireString(
  value: unknown,
  name: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 256
  ) {
    throw new Error(
      `${name} is invalid.`,
    );
  }

  return value.trim();
}
