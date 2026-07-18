import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {verifyPayMongoSignature} from "./payment-security.js";
import {processPayMongoWebhook} from "./process-webhook.js";
import {
  correlationIdFromHeaders,
  logSecurityEvent,
} from "../shared/security-events.js";

const payMongoWebhookSecret = defineSecret("PAYMONGO_WEBHOOK_SECRET");

export const payMongoWebhook = onRequest(
  {region: "asia-southeast1", secrets: [payMongoWebhookSecret], timeoutSeconds: 30},
  async (request, response) => {
    const correlationId = correlationIdFromHeaders(request.headers);
    if (request.method !== "POST") {
      response.status(405).set("Allow", "POST").json({error: "method_not_allowed"});
      return;
    }
    const rawBody = request.rawBody;
    const webhookSecret = payMongoWebhookSecret.value();
    if (!webhookSecret) {
      logSecurityEvent({
        action: "configuration_failure",
        outcome: "failed",
        targetId: "payMongoWebhook",
        correlationId,
        reasonCode: "webhook_secret_missing",
      });
      response.status(503).json({error: "service_unavailable"});
      return;
    }
    const valid = verifyPayMongoSignature({
      rawBody,
      signatureHeader: request.get("Paymongo-Signature") ?? undefined,
      secret: webhookSecret,
    });
    if (!valid) {
      logSecurityEvent({
        action: "payment_webhook",
        outcome: "denied",
        targetId: "paymongo",
        correlationId,
        reasonCode: "invalid_signature",
      });
      response.status(401).json({error: "invalid_signature"});
      return;
    }
    try {
      const result = await processPayMongoWebhook(rawBody);
      response.status(200).json({received: true, duplicate: result.duplicate, applied: result.applied});
    } catch {
      logSecurityEvent({
        action: "payment_webhook",
        outcome: "failed",
        targetId: "paymongo",
        correlationId,
        reasonCode: "invalid_or_failed_event",
      });
      // Never echo the payload or payment-sensitive gateway response.
      response.status(400).json({error: "invalid_event"});
    }
  },
);
