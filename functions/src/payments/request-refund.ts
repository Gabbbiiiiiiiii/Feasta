import {
  defineSecret,
} from "firebase-functions/params";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";
import {
  requireAuth,
} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  PAYMENT_CURRENCY,
  USER_ROLES,
} from "../shared/constants.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  db,
} from "../shared/firestore.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  requireObject,
  requireString,
} from "../shared/validation.js";
import {
  createPayMongoRefund,
} from "./paymongo-client.js";

const payMongoSecretKey = defineSecret(
  "PAYMONGO_SECRET_KEY",
);

export const requestPaymentRefund = onCall(
  {
    ...appCheckCallableOptions,
    secrets: [payMongoSecretKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    const user = requireAuth(request);

    await requireRole(user.uid, [
      USER_ROLES.admin,
    ]);

    await enforceCallableRateLimit(request, {
      scope: "requestPaymentRefund",
      limit: 10,
      windowSeconds: 60 * 60,
    });

    const input = requireObject(
      request.data,
    );

    const paymentId = requireString(
      input.paymentId,
      "paymentId",
      {
        minLength: 1,
        maxLength: 128,
      },
    );

    const reason = requireString(
      input.reason,
      "reason",
      {
        minLength: 5,
        maxLength: 500,
      },
    );

    const clientIdempotencyKey =
      requireString(
        input.idempotencyKey,
        "idempotencyKey",
        {
          minLength: 8,
          maxLength: 200,
        },
      );

    const paymentReference = db
      .collection("payments")
      .doc(paymentId);

    const paymentSnapshot =
      await paymentReference.get();

    if (!paymentSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "The payment could not be found.",
      );
    }

    const payment =
      paymentSnapshot.data() ?? {};

    validateRefundablePayment(payment);

    const providerRequestId =
      requireStoredString(
        payment.providerRequestId,
        "Payment provider request",
      );

    const mainEventId =
      readStoredString(
        payment.mainEventId,
      ) ??
      requireStoredString(
        payment.bookingId,
        "Payment main event",
      );

    const customerId =
      requireStoredString(
        payment.customerId,
        "Payment customer",
      );

    const providerId =
      requireStoredString(
        payment.providerId,
        "Payment provider",
      );

    const gatewayPaymentId =
      requireStoredString(
        payment.paymongoResourceId,
        "PayMongo payment",
      );

    const amountInCentavos =
      requirePaymentAmount(
        payment.amountInCentavos,
      );

    const providerRequestReference = db
      .collection("providerRequests")
      .doc(providerRequestId);

    const mainEventReference = db
      .collection("mainEvents")
      .doc(mainEventId);

    const [
      providerRequestSnapshot,
      mainEventSnapshot,
    ] = await db.getAll(
      providerRequestReference,
      mainEventReference,
    );

    if (
      !providerRequestSnapshot.exists ||
      !mainEventSnapshot.exists
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The payment booking linkage " +
          "is incomplete.",
      );
    }

    const providerRequest =
      providerRequestSnapshot.data() ?? {};

    const mainEvent =
      mainEventSnapshot.data() ?? {};

    validatePaymentLinkage({
      paymentId,
      mainEventId,
      providerRequestId,
      customerId,
      providerId,
      providerRequest,
      mainEvent,
    });

    const executionKey =
      createIdempotencyKey({
        operation:
          "requestPaymentRefund",

        actorId: user.uid,

        clientKey:
          clientIdempotencyKey,

        payload: {
          paymentId,
          reason,
        },
      });

    /*
     * This key deliberately depends only on the payment.
     *
     * Two administrators or two different client request keys therefore
     * cannot create two PayMongo refunds for the same payment.
     */
    const gatewayIdempotencyKey =
      `feasta-refund-${paymentId}`;

    const execution =
      await executeIdempotently({
        key: executionKey,

        operation:
          "requestPaymentRefund",

        actorId: user.uid,

        handler: async () => {
          const refund =
            await createPayMongoRefund({
              secretKey:
                payMongoSecretKey.value(),

              idempotencyKey:
                gatewayIdempotencyKey,

              gatewayPaymentId,
              amountInCentavos,
              reason: "others",
            });

          await db.runTransaction(
            async (transaction) => {
              const currentPaymentSnapshot =
                await transaction.get(
                  paymentReference,
                );

              if (
                !currentPaymentSnapshot.exists
              ) {
                throw new HttpsError(
                  "not-found",
                  "The payment no longer exists.",
                );
              }

              const currentPayment =
                currentPaymentSnapshot.data() ??
                {};

              const currentStatus =
                currentPayment.status;

              /*
               * The webhook can arrive before this transaction finishes.
               * Therefore both paid and refunded are valid here.
               */
              if (
                currentStatus !== "paid" &&
                currentStatus !== "refunded"
              ) {
                throw new HttpsError(
                  "failed-precondition",
                  "The payment is no longer " +
                    "eligible for a refund.",
                );
              }

              if (
                currentPayment
                  .providerRequestId !==
                  providerRequestId ||
                (
                  currentPayment.mainEventId ??
                  currentPayment.bookingId
                ) !== mainEventId ||
                currentPayment.customerId !==
                  customerId ||
                currentPayment.providerId !==
                  providerId
              ) {
                throw new HttpsError(
                  "failed-precondition",
                  "The payment linkage changed " +
                    "during the refund request.",
                );
              }

              const timestamp =
                serverTimestamp();

              transaction.update(
                paymentReference,
                {
                  refundStatus:
                    currentStatus ===
                      "refunded"
                      ? "completed"
                      : "requested",

                  refundId: refund.id,
                  refundReason: reason,

                  refundRequestedBy:
                    user.uid,

                  refundRequestedAt:
                    timestamp,

                  updatedAt: timestamp,
                },
              );

              writeAuditLogInTransaction(
                transaction,
                {
                  actorId: user.uid,
                  actorRole: "admin",

                  action:
                    "payment.refund_requested",

                  targetCollection:
                    "payments",

                  targetId: paymentId,
                  reason,

                  before: {
                    status:
                      currentPayment.status,

                    refundStatus:
                      currentPayment
                        .refundStatus ??
                      null,
                  },

                  after: {
                    status:
                      currentPayment.status,

                    refundStatus:
                      currentStatus ===
                        "refunded"
                        ? "completed"
                        : "requested",

                    refundId: refund.id,
                  },

                  metadata: {
                    refundId: refund.id,
                    mainEventId,
                    providerRequestId,
                    providerId,
                    customerId,
                  },
                },
              );
            },
          );

          return {
            paymentId,
            mainEventId,
            providerRequestId,
            refundId: refund.id,

            status:
              "refund_requested",

            awaitingWebhook: true,
          };
        },
      });

    return {
      ...execution.result,

      idempotentReplay:
        execution.replayed,
    };
  },
);

function validateRefundablePayment(
  payment: Record<string, unknown>,
): void {
  if (payment.status !== "paid") {
    throw new HttpsError(
      "failed-precondition",
      "Only a confirmed payment can " +
        "be refunded.",
    );
  }

  if (
    payment.gateway !== "paymongo" ||
    typeof payment.paymongoResourceId !==
      "string" ||
    payment.paymongoResourceId
      .trim()
      .length === 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The confirmed PayMongo payment " +
        "linkage is invalid.",
    );
  }

  if (
    payment.currency !==
      PAYMENT_CURRENCY
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The payment currency is invalid.",
    );
  }

  if (
    payment.refundStatus ===
      "requested" ||
    payment.refundStatus ===
      "processing" ||
    payment.refundStatus ===
      "completed"
  ) {
    throw new HttpsError(
      "already-exists",
      "A refund has already been " +
        "requested for this payment.",
    );
  }
}

function validatePaymentLinkage(
  input: {
    paymentId: string;
    mainEventId: string;
    providerRequestId: string;
    customerId: string;
    providerId: string;

    providerRequest:
      Record<string, unknown>;

    mainEvent:
      Record<string, unknown>;
  },
): void {
  if (
    input.providerRequest.mainEventId !==
      input.mainEventId ||
    input.providerRequest.customerId !==
      input.customerId ||
    input.providerRequest.providerId !==
      input.providerId ||
    input.mainEvent.customerId !==
      input.customerId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The payment, provider request, " +
        "and main event do not match.",
    );
  }

  const linkedPaymentId =
    readStoredString(
      input.providerRequest.paymentId,
    );

  if (
    linkedPaymentId &&
    linkedPaymentId !== input.paymentId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider request is linked " +
        "to another payment.",
    );
  }

  if (
    input.providerRequest.status !==
      "confirmed" ||
    input.providerRequest
      .paymentStatus !== "paid"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only a confirmed, paid provider " +
        "request can be refunded.",
    );
  }
}

function requirePaymentAmount(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The canonical payment amount " +
        "is invalid.",
    );
  }

  return value;
}

function readStoredString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return null;
  }

  return value.trim();
}

function requireStoredString(
  value: unknown,
  fieldName: string,
): string {
  const result =
    readStoredString(value);

  if (!result) {
    throw new HttpsError(
      "failed-precondition",
      `${fieldName} linkage is invalid.`,
    );
  }

  return result;
}
