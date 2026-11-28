import {createHash, randomUUID} from "node:crypto";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {requireObject, requireString} from "../shared/validation.js";
import {
  buildSandboxCheckoutUrl,
  isSandboxMockPaymentMode,
  SANDBOX_CHECKOUT_ID_PREFIX,
} from "./payment-gateway-mode.js";
import type {createPayMongoCheckout} from "./paymongo-client.js";
import {processPayMongoWebhook} from "./process-webhook.js";

export type SandboxMockCheckoutOutcome = "paid" | "failed";
export type SandboxMockPaymentMethod = "gcash" | "paymaya" | "card";

export type CompleteSandboxMockCheckoutResult = {
  paymentId: string;
  bookingId: string;
  providerRequestId: string;
  outcome: SandboxMockCheckoutOutcome;
  applied: boolean;
  duplicate: boolean;
};

type CreateCheckoutInput = Parameters<typeof createPayMongoCheckout>[0];
type CreateCheckoutOutput = Awaited<ReturnType<typeof createPayMongoCheckout>>;

const ALLOWED_METHODS = new Set<SandboxMockPaymentMethod>([
  "gcash",
  "paymaya",
  "card",
]);
const ALLOWED_OUTCOMES = new Set<SandboxMockCheckoutOutcome>([
  "paid",
  "failed",
]);

export async function createSandboxMockCheckout(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutOutput> {
  const digest = createHash("sha256")
    .update(`sandbox_checkout:${input.idempotencyKey}:${input.paymentId}`)
    .digest("hex");

  const id = `${SANDBOX_CHECKOUT_ID_PREFIX}${digest.slice(0, 24)}`;
  const checkoutUrl = buildSandboxCheckoutUrl({
    paymentId: input.paymentId,
    checkoutAttemptId: input.checkoutAttemptId,
  });

  return {
    id,
    checkoutUrl,
    paymentIds: [],
    paymentIntentIds: [],
  };
}

export const completeSandboxMockCheckout = onCall(
  {
    ...appCheckCallableOptions,
    maxInstances: 20,
    memory: "256MiB",
    concurrency: 80,
    timeoutSeconds: 30,
  },
  async (request) => {
    const user = requireAuth(request);

    await requireRole(user.uid, [USER_ROLES.customer]);

    await enforceCallableRateLimit(request, {
      scope: "completeSandboxMockCheckout",
      limit: 15,
      windowSeconds: 10 * 60,
    });

    const input = requireObject(request.data);
    rejectUnknownFields(input, [
      "paymentId",
      "outcome",
      "paymentMethod",
    ]);

    const paymentId = requireString(input.paymentId, "paymentId", {
      minLength: 8,
      maxLength: 160,
    });

    const rawOutcome = requireString(input.outcome, "outcome", {
      minLength: 4,
      maxLength: 16,
    });

    if (!ALLOWED_OUTCOMES.has(rawOutcome as SandboxMockCheckoutOutcome)) {
      throw new HttpsError(
        "invalid-argument",
        "outcome must be paid or failed.",
      );
    }

    const rawMethod = input.paymentMethod === undefined
      ? "gcash"
      : requireString(input.paymentMethod, "paymentMethod", {
          minLength: 4,
          maxLength: 16,
        });

    if (!ALLOWED_METHODS.has(rawMethod as SandboxMockPaymentMethod)) {
      throw new HttpsError(
        "invalid-argument",
        "paymentMethod must be gcash, paymaya, or card.",
      );
    }

    return completeSandboxMockCheckoutForCustomer({
      customerId: user.uid,
      paymentId,
      outcome: rawOutcome as SandboxMockCheckoutOutcome,
      paymentMethod: rawMethod as SandboxMockPaymentMethod,
    });
  },
);

export async function completeSandboxMockCheckoutForCustomer(input: {
  customerId: string;
  paymentId: string;
  outcome: SandboxMockCheckoutOutcome;
  paymentMethod: SandboxMockPaymentMethod;
}): Promise<CompleteSandboxMockCheckoutResult> {
  if (!isSandboxMockPaymentMode()) {
    throw new HttpsError(
      "failed-precondition",
      "Sandbox mock checkout is disabled.",
    );
  }

  const paymentRef = db.collection("payments").doc(input.paymentId);
  const [paymentSnapshot, attemptsSnapshot] = await Promise.all([
    paymentRef.get(),
    paymentRef.collection("checkoutAttempts").get(),
  ]);

  if (!paymentSnapshot.exists) {
    throw new HttpsError("not-found", "The payment record could not be found.");
  }

  const payment = paymentSnapshot.data() ?? {};
  const ownerId = nonEmptyString(payment.customerId);
  if (!ownerId || ownerId !== input.customerId) {
    throw new HttpsError(
      "permission-denied",
      "You are not allowed to complete this payment.",
    );
  }

  const bookingId = nonEmptyString(payment.mainEventId) ??
    nonEmptyString(payment.bookingId);
  const providerRequestId = nonEmptyString(payment.providerRequestId);
  const amountInCentavos = payment.amountInCentavos;
  const currency = nonEmptyString(payment.currency)?.toUpperCase();

  if (
    !bookingId ||
    !providerRequestId ||
    typeof amountInCentavos !== "number" ||
    !Number.isSafeInteger(amountInCentavos) ||
    amountInCentavos <= 0 ||
    currency !== "PHP"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The payment record is incomplete or invalid.",
    );
  }

  const currentAttemptId = nonEmptyString(payment.currentCheckoutAttemptId);
  const currentAttemptDoc = currentAttemptId
    ? attemptsSnapshot.docs.find((doc) => doc.id === currentAttemptId)
    : undefined;
  const currentAttempt = currentAttemptDoc?.data();

  const checkoutId = nonEmptyString(currentAttempt?.paymongoCheckoutId) ??
    nonEmptyString(payment.paymongoCheckoutId);

  if (!checkoutId || !checkoutId.startsWith(SANDBOX_CHECKOUT_ID_PREFIX)) {
    throw new HttpsError(
      "failed-precondition",
      "This payment is not linked to an active sandbox checkout session.",
    );
  }

  const currentStatus = nonEmptyString(payment.status);
  if (currentStatus === "paid" && input.outcome === "paid") {
    return {
      paymentId: input.paymentId,
      bookingId,
      providerRequestId,
      outcome: "paid",
      applied: false,
      duplicate: true,
    };
  }

  const allowedCurrentStatuses = input.outcome === "paid"
    ? new Set(["pending", "processing", "failed"])
    : new Set(["pending", "processing"]);

  if (!currentStatus || !allowedCurrentStatuses.has(currentStatus)) {
    throw new HttpsError(
      "failed-precondition",
      "This payment can no longer be updated from sandbox checkout.",
    );
  }

  const payload = buildSyntheticSandboxWebhookPayload({
    paymentId: input.paymentId,
    bookingId,
    providerRequestId,
    customerId: input.customerId,
    checkoutId,
    checkoutAttemptId: currentAttemptDoc?.id ?? null,
    amountInCentavos,
    outcome: input.outcome,
    paymentMethod: input.paymentMethod,
  });

  const webhookResult = await processPayMongoWebhook(
    Buffer.from(JSON.stringify(payload), "utf8"),
  );

  logSecurityEvent({
    action: "sandbox_mock_checkout_completed",
    outcome: webhookResult.applied || webhookResult.duplicate ? "allowed" : "denied",
    actorUid: input.customerId,
    targetId: input.paymentId,
    reasonCode: webhookResult.reason ?? input.outcome,
    metadata: {
      checkoutId,
      outcome: input.outcome,
      paymentMethod: input.paymentMethod,
      applied: webhookResult.applied,
      duplicate: webhookResult.duplicate,
    },
  });

  if (!webhookResult.applied && !webhookResult.duplicate) {
    throw new HttpsError(
      "failed-precondition",
      "The sandbox payment could not be applied.",
      {reason: webhookResult.reason ?? "sandbox_payment_rejected"},
    );
  }

  return {
    paymentId: input.paymentId,
    bookingId,
    providerRequestId,
    outcome: input.outcome,
    applied: webhookResult.applied,
    duplicate: webhookResult.duplicate,
  };
}

export function buildSyntheticSandboxWebhookPayload(input: {
  paymentId: string;
  bookingId: string;
  providerRequestId: string;
  customerId: string;
  checkoutId: string;
  checkoutAttemptId: string | null;
  amountInCentavos: number;
  outcome: SandboxMockCheckoutOutcome;
  paymentMethod: SandboxMockPaymentMethod;
}): Record<string, unknown> {
  const metadata: Record<string, string> = {
    payment_id: input.paymentId,
    booking_id: input.bookingId,
    provider_request_id: input.providerRequestId,
    customer_id: input.customerId,
    feasta_sandbox_mode: "sandbox_mock",
    feasta_sandbox_method: input.paymentMethod,
    ...(input.checkoutAttemptId
      ? {feasta_checkout_attempt_id: input.checkoutAttemptId}
      : {}),
  };

  if (input.outcome === "paid") {
    const digest = createHash("sha256")
      .update(`sandbox_paid:${input.paymentId}:${input.checkoutId}`)
      .digest("hex");
    const eventId = `evt_sandbox_paid_${digest.slice(0, 24)}`;
    const gatewayPaymentId = `pay_sandbox_${digest.slice(0, 24)}`;
    const paymentIntentId = `pi_sandbox_${digest.slice(0, 24)}`;
    const paidAtSeconds = Math.floor(Date.now() / 1000);

    return {
      data: {
        id: eventId,
        type: "event",
        attributes: {
          type: "checkout_session.payment.paid",
          livemode: false,
          data: {
            id: input.checkoutId,
            type: "checkout_session",
            attributes: {
              metadata,
              payment_intent: {
                id: paymentIntentId,
                type: "payment_intent",
              },
              payments: [
                {
                  id: gatewayPaymentId,
                  type: "payment",
                  attributes: {
                    status: "paid",
                    amount: input.amountInCentavos,
                    currency: "PHP",
                    payment_intent_id: paymentIntentId,
                    paid_at: paidAtSeconds,
                    fee: 0,
                    source: {
                      type: input.paymentMethod,
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };
  }

  const nonce = randomUUID().replace(/-/gu, "").slice(0, 20);
  const eventId = `evt_sandbox_failed_${nonce}`;
  const gatewayPaymentId = `pay_sandbox_fail_${nonce}`;
  const paymentIntentId = `pi_sandbox_fail_${nonce}`;

  return {
    data: {
      id: eventId,
      type: "event",
      attributes: {
        type: "payment.failed",
        livemode: false,
        data: {
          id: gatewayPaymentId,
          type: "payment",
          attributes: {
            status: "failed",
            amount: input.amountInCentavos,
            currency: "PHP",
            payment_intent_id: paymentIntentId,
            metadata,
          },
        },
      },
    },
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);
  if (Object.keys(input).some((field) => !allowed.has(field))) {
    throw new HttpsError(
      "invalid-argument",
      "The sandbox payment request contains unsupported fields.",
    );
  }
}
