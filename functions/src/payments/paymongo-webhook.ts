import {
  defineSecret,
} from "firebase-functions/params";
import {
  HttpsError,
  onRequest,
} from "firebase-functions/v2/https";

import {
  FUNCTION_REGION,
} from "../shared/constants.js";
import {
  correlationIdFromHeaders,
  logSecurityEvent,
} from "../shared/security-events.js";
import {
  verifyPayMongoSignature,
} from "./payment-security.js";
import {
  processPayMongoWebhook,
} from "./process-webhook.js";

const payMongoWebhookSecret = defineSecret(
  "PAYMONGO_WEBHOOK_SECRET",
);

export const payMongoWebhook = onRequest(
  {
    region: FUNCTION_REGION,
    invoker: "public",
    secrets: [
      payMongoWebhookSecret,
    ],
    timeoutSeconds: 30,
  },
  async (request, response) => {
    const correlationId =
      correlationIdFromHeaders(
        request.headers,
      );

    if (request.method !== "POST") {
      response
        .status(405)
        .set("Allow", "POST")
        .json({
          error: "method_not_allowed",
        });

      return;
    }

    const rawBody = request.rawBody;

    const webhookSecret =
      payMongoWebhookSecret.value();

    if (!webhookSecret) {
      logSecurityEvent({
        action:
          "configuration_failure",
        outcome: "failed",
        targetId:
          "payMongoWebhook",
        correlationId,
        reasonCode:
          "webhook_secret_missing",
      });

      response.status(503).json({
        error:
          "service_unavailable",
      });

      return;
    }

    const valid =
      verifyPayMongoSignature({
        rawBody,

        signatureHeader:
          request.get(
            "Paymongo-Signature",
          ) ?? undefined,

        secret: webhookSecret,
      });

    if (!valid) {
      logSecurityEvent({
        action: "payment_webhook",
        outcome: "denied",
        targetId: "paymongo",
        correlationId,
        reasonCode:
          "invalid_signature",
      });

      response.status(401).json({
        error: "invalid_signature",
      });

      return;
    }

    try {
      const result =
        await processPayMongoWebhook(
          rawBody,
        );

      response.status(200).json({
        received: true,
        duplicate: result.duplicate,
        applied: result.applied,
      });
    } catch (error) {
      logSecurityEvent({
        action: "payment_webhook",
        outcome: "failed",
        targetId: "paymongo",
        correlationId,
        reasonCode: safeWebhookFailureReason(error),
      });

      // Never expose payment payloads.
      response.status(400).json({
        error: "invalid_event",
      });
    }
  },
);

function safeWebhookFailureReason(error: unknown): string {
  if (error instanceof HttpsError) {
    const reason = error.details && typeof error.details === "object"
      ? (error.details as Record<string, unknown>).reason
      : null;
    if (typeof reason === "string" && /^[A-Z0-9_:-]{1,80}$/u.test(reason)) {
      return reason.toLowerCase();
    }
  }
  if (error instanceof Error &&
    (error.message.includes("refund payment metadata id") ||
      error.message.includes("refund operation metadata id"))) {
    return "missing_refund_metadata";
  }
  return "invalid_or_failed_event";
}
