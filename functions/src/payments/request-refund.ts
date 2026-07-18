import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {writeAuditLog} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireRole} from "../shared/authorization.js";
import {requireObject, requireString} from "../shared/validation.js";
import {createPayMongoRefund} from "./paymongo-client.js";

const payMongoSecretKey = defineSecret("PAYMONGO_SECRET_KEY");

export const requestPaymentRefund = onCall(
  {...appCheckCallableOptions, secrets: [payMongoSecretKey], timeoutSeconds: 30},
  async (request) => {
    const user = requireAuth(request);
    await requireRole(user.uid, [USER_ROLES.admin]);
    await enforceCallableRateLimit(request, {scope: "requestPaymentRefund", limit: 10, windowSeconds: 60 * 60});
    const input = requireObject(request.data);
    const paymentId = requireString(input.paymentId, "paymentId", {minLength: 1, maxLength: 128});
    const reason = requireString(input.reason, "reason", {minLength: 5, maxLength: 500});
    const payment = (await db.collection("payments").doc(paymentId).get()).data();
    if (!payment || payment.status !== "paid" || typeof payment.paymongoResourceId !== "string") {
      throw new HttpsError("failed-precondition", "Only a confirmed PayMongo payment can be refunded.");
    }
    if (!Number.isSafeInteger(payment.amountInCentavos) ||
        payment.amountInCentavos <= 0 || payment.currency !== "PHP") {
      throw new HttpsError(
        "failed-precondition",
        "The canonical payment amount or currency is invalid.",
      );
    }
    const key = createIdempotencyKey({operation: "requestPaymentRefund", actorId: user.uid, clientKey: input.idempotencyKey, payload: {paymentId, reason}});
    const execution = await executeIdempotently({
      key,
      operation: "requestPaymentRefund",
      actorId: user.uid,
      handler: async () => {
        const refund = await createPayMongoRefund({
          secretKey: payMongoSecretKey.value(), idempotencyKey: key,
          gatewayPaymentId: payment.paymongoResourceId,
          amountInCentavos: payment.amountInCentavos,
          reason: "others",
        });
        await writeAuditLog({
          actorId: user.uid,
          actorRole: "admin",
          action: "payment.refund_requested",
          targetCollection: "payments",
          targetId: paymentId,
          reason,
          metadata: {refundId: refund.id},
        });
        return {
          paymentId,
          refundId: refund.id,
          status: "paid",
          awaitingWebhook: true,
        };
      },
    });
    return {...execution.result, idempotentReplay: execution.replayed};
  },
);
