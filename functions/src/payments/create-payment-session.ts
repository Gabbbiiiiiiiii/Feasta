import {
  createHash,
} from "node:crypto";

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
} from "firebase-functions/params";

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
  isApprovedProviderForOperations,
  isProviderOwnerAccountActive,
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
  createPayMongoCheckout,
} from "./paymongo-client.js";

const payMongoSecretKey = defineSecret(
  "PAYMONGO_SECRET_KEY",
);

export const createPaymentSession = onCall(
  {
    ...appCheckCallableOptions,
    secrets: [payMongoSecretKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    const user = requireAuth(request);

    await requireRole(user.uid, [
      USER_ROLES.customer,
    ]);

    await enforceCallableRateLimit(request, {
      scope: "createPaymentSession",
      limit: 5,
      windowSeconds: 10 * 60,
    });

    const input = requireObject(
      request.data,
    );

    const providerRequestId =
      requireString(
        input.providerRequestId,
        "providerRequestId",
        {
          minLength: 8,
          maxLength: 160,
        },
      );

    const clientKey = requireString(
      input.idempotencyKey,
      "idempotencyKey",
      {
        minLength: 8,
        maxLength: 200,
      },
    );

    const requestHash =
      createIdempotencyKey({
        operation:
          "createPaymentSession",

        actorId: user.uid,
        clientKey,

        payload: {
          providerRequestId,
        },
      });

    /*
     * One canonical down-payment record is
     * maintained for each provider request.
     *
     * A different client idempotency key cannot
     * accidentally create another payment record.
     */
    const paymentId =
      `payment_${createHash("sha256")
        .update(
          `provider-request:${providerRequestId}`,
        )
        .digest("hex")
        .slice(0, 32)}`;

    const paymentReference = db
      .collection("payments")
      .doc(paymentId);

    const providerRequestReference = db
      .collection("providerRequests")
      .doc(providerRequestId);

    const successUrl = trustedRedirectUrl(
      "PAYMENT_SUCCESS_URL",
    );

    const cancelUrl = trustedRedirectUrl(
      "PAYMENT_CANCEL_URL",
    );

    const foundation =
      await db.runTransaction(
        async (transaction) => {
          const [
            paymentSnapshot,
            providerRequestSnapshot,
          ] = await transaction.getAll(
            paymentReference,
            providerRequestReference,
          );

          if (
            !providerRequestSnapshot.exists
          ) {
            throw new HttpsError(
              "not-found",
              "The provider request was not found.",
            );
          }

          const providerRequest =
            providerRequestSnapshot.data() ??
            {};

          const bookingId = stringValue(
            providerRequest.mainEventId ??
              providerRequest.bookingId,
          );

          const customerId = stringValue(
            providerRequest.customerId,
          );

          const providerId = stringValue(
            providerRequest.providerId,
          );

          if (
            !bookingId ||
            !customerId ||
            !providerId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The provider-request linkage is invalid.",
            );
          }

          if (customerId !== user.uid) {
            throw new HttpsError(
              "permission-denied",
              "You do not own this provider request.",
            );
          }

          const existing =
            paymentSnapshot.exists
              ? paymentSnapshot.data() ?? {}
              : null;

          if (
            existing &&
            (
              existing.customerId !==
                user.uid ||
              existing.providerRequestId !==
                providerRequestId ||
              existing.bookingId !==
                bookingId ||
              existing.providerId !==
                providerId
            )
          ) {
            throw new HttpsError(
              "permission-denied",
              "Payment ownership is invalid.",
            );
          }

          if (
            existing &&
            typeof existing.checkoutUrl ===
              "string" &&
            existing.checkoutUrl.length > 0 &&
            existing.status === "processing"
          ) {
            return {
              created: false,
              bookingId,
              providerId,
              amountInCentavos:
                existing.amountInCentavos,
              checkoutUrl:
                existing.checkoutUrl,
            };
          }

          if (
            providerRequest.status !==
              "waiting_for_down_payment" &&
            !(
              providerRequest.status ===
                "payment_processing" &&
              existing?.status ===
                "processing"
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "This provider request is not awaiting payment.",
            );
          }

          const bookingReference = db
            .collection("mainEvents")
            .doc(bookingId);

          const providerReference = db
            .collection("providers")
            .doc(providerId);

          const [
            bookingSnapshot,
            providerSnapshot,
          ] = await transaction.getAll(
            bookingReference,
            providerReference,
          );

          if (!bookingSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "The main event was not found.",
            );
          }

          const booking =
            bookingSnapshot.data() ?? {};

          if (
            booking.customerId !==
              user.uid
          ) {
            throw new HttpsError(
              "permission-denied",
              "Main-event ownership is invalid.",
            );
          }

          if (!providerSnapshot.exists) {
            throw new HttpsError(
              "failed-precondition",
              "The provider was not found.",
            );
          }

          const provider =
            providerSnapshot.data() ?? {};

          const providerOwnerId = stringValue(
            provider.ownerId,
          );

          if (
            !providerOwnerId ||
            !isApprovedProviderForOperations(provider)
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The provider is unavailable.",
            );
          }

          const providerOwnerSnapshot =
            await transaction.get(
              db.collection("users")
                .doc(providerOwnerId),
            );

          if (
            !providerOwnerSnapshot.exists ||
            !isProviderOwnerAccountActive(
              providerId,
              providerOwnerSnapshot.data() ?? {},
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The provider owner account is unavailable.",
            );
          }

          const amount =
            providerRequest
              .downPaymentAmount;

          if (
            typeof amount !== "number" ||
            !Number.isFinite(amount) ||
            amount <= 0
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The provider-request payment amount is invalid.",
            );
          }

          const amountInCentavos =
            Math.round(amount * 100);

          if (
            !Number.isSafeInteger(
              amountInCentavos,
            ) ||
            amountInCentavos <= 0
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The payment amount cannot be processed.",
            );
          }

          if (existing) {
            if (
              existing.amountInCentavos !==
                amountInCentavos ||
              existing.currency !==
                PAYMENT_CURRENCY ||
              ![
                "pending",
                "failed",
                "expired",
                "processing",
              ].includes(existing.status)
            ) {
              throw new HttpsError(
                "failed-precondition",
                "Existing payment details are invalid.",
              );
            }

            return {
              created: false,
              bookingId,
              providerId,
              amountInCentavos,
              checkoutUrl: null,
            };
          }

          const payment = {
            paymentId,

            bookingId,
            mainEventId: bookingId,
            providerRequestId,

            customerId: user.uid,
            providerId,

            amount,
            amountInCentavos,
            currency: PAYMENT_CURRENCY,

            paymentType:
              "provider_down_payment",

            gateway: "paymongo",
            status: "pending",

            clientRequestHash:
              requestHash,

            paidAt: null,
            failedAt: null,
            expiredAt: null,
            refundedAt: null,

            checkoutUrl: null,
            paymongoCheckoutId: null,
            paymongoResourceId: null,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          };

          transaction.create(
            paymentReference,
            payment,
          );

          writeAuditLogInTransaction(
            transaction,
            {
              actorId: user.uid,
              actorRole: "customer",

              action: "payment.created",

              targetCollection:
                "payments",

              targetId: paymentId,

              after: {
                status: "pending",
                providerRequestId,
                amountInCentavos,
                currency:
                  PAYMENT_CURRENCY,
              },
            },
          );

          return {
            created: true,
            bookingId,
            providerId,
            amountInCentavos,
            checkoutUrl: null,
          };
        },
      );

    if (
      typeof foundation.checkoutUrl ===
        "string" &&
      foundation.checkoutUrl.length > 0
    ) {
      return {
        paymentId,
        providerRequestId,
        bookingId:
          foundation.bookingId,

        checkoutUrl:
          foundation.checkoutUrl,

        created: false,
      };
    }

    try {
      const checkout =
        await createPayMongoCheckout({
          secretKey:
            payMongoSecretKey.value(),

          idempotencyKey: paymentId,

          paymentId,

          bookingId:
            foundation.bookingId,

          providerRequestId,

          customerId: user.uid,

          amountInCentavos:
            foundation.amountInCentavos,

          currency:
            PAYMENT_CURRENCY,

          description:
            "FEASTA provider down payment",

          successUrl,
          cancelUrl,
        });

      await db.runTransaction(
        async (transaction) => {
          const [
            paymentSnapshot,
            providerRequestSnapshot,
          ] = await transaction.getAll(
            paymentReference,
            providerRequestReference,
          );

          if (
            !paymentSnapshot.exists ||
            !providerRequestSnapshot.exists
          ) {
            throw new HttpsError(
              "not-found",
              "The payment record is unavailable.",
            );
          }

          const currentPayment =
            paymentSnapshot.data() ?? {};

          const currentRequest =
            providerRequestSnapshot.data() ??
            {};

          if (
            currentPayment.customerId !==
              user.uid ||
            currentPayment
              .providerRequestId !==
              providerRequestId ||
            currentRequest.customerId !==
              user.uid
          ) {
            throw new HttpsError(
              "permission-denied",
              "Payment ownership is invalid.",
            );
          }

          if (
            currentPayment.status === "paid"
          ) {
            return;
          }

          if (
            ![
              "pending",
              "failed",
              "expired",
              "processing",
            ].includes(
              currentPayment.status,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Payment status is invalid.",
            );
          }

          if (
            currentRequest.status !==
              "waiting_for_down_payment" &&
            currentRequest.status !==
              "payment_processing"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Provider-request status is invalid.",
            );
          }

          transaction.update(
            paymentReference,
            {
              status: "processing",

              checkoutUrl:
                checkout.checkoutUrl,

              paymongoCheckoutId:
                checkout.id,

              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.update(
            providerRequestReference,
            {
              status:
                "payment_processing",

              paymentStatus:
                "processing",

              paymentId,

              updatedAt:
                serverTimestamp(),
            },
          );

          if (
            currentPayment.status !==
              "processing"
          ) {
            writeAuditLogInTransaction(
              transaction,
              {
                actorId: user.uid,
                actorRole: "customer",

                action:
                  "payment.status_changed",

                targetCollection:
                  "payments",

                targetId: paymentId,

                before: {
                  status:
                    currentPayment.status,
                },

                after: {
                  status: "processing",
                },

                metadata: {
                  providerRequestId,
                },
              },
            );
          }
        },
      );

      return {
        paymentId,
        providerRequestId,

        bookingId:
          foundation.bookingId,

        checkoutUrl:
          checkout.checkoutUrl,

        created: foundation.created,
      };
    } catch {
      await db
        .runTransaction(
          async (transaction) => {
            const [
              paymentSnapshot,
              providerRequestSnapshot,
            ] = await transaction.getAll(
              paymentReference,
              providerRequestReference,
            );

            if (
              !paymentSnapshot.exists ||
              !providerRequestSnapshot.exists
            ) {
              return;
            }

            const currentPayment =
              paymentSnapshot.data() ?? {};

            const currentRequest =
              providerRequestSnapshot.data() ??
              {};

            if (
              currentPayment.customerId !==
                user.uid ||
              currentPayment
                .providerRequestId !==
                providerRequestId ||
              currentRequest.customerId !==
                user.uid
            ) {
              return;
            }

            if (
              ![
                "pending",
                "processing",
              ].includes(
                currentPayment.status,
              )
            ) {
              return;
            }

            transaction.update(
              paymentReference,
              {
                status: "failed",
                failedAt:
                  serverTimestamp(),
                updatedAt:
                  serverTimestamp(),
              },
            );

            if (
              currentRequest.status ===
                "payment_processing"
            ) {
              transaction.update(
                providerRequestReference,
                {
                  status:
                    "waiting_for_down_payment",

                  paymentStatus:
                    "failed",

                  updatedAt:
                    serverTimestamp(),
                },
              );
            }

            writeAuditLogInTransaction(
              transaction,
              {
                actorId: "paymongo",
                actorRole: "system",

                action:
                  "payment.status_changed",

                targetCollection:
                  "payments",

                targetId: paymentId,

                before: {
                  status:
                    currentPayment.status,
                },

                after: {
                  status: "failed",
                },

                reason:
                  "checkout_creation_failed",

                metadata: {
                  providerRequestId,
                },
              },
            );
          },
        )
        .catch(() => undefined);

      throw new HttpsError(
        "unavailable",
        "Payment checkout could not be " +
          "created. Please try again.",
      );
    }
  },
);

function trustedRedirectUrl(
  name:
    | "PAYMENT_SUCCESS_URL"
    | "PAYMENT_CANCEL_URL",
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new HttpsError(
      "failed-precondition",
      `${name} is not configured.`,
    );
  }

  const url = new URL(value);

  if (
    url.protocol !== "https:" &&
    process.env.FUNCTIONS_EMULATOR !==
      "true"
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${name} must use HTTPS.`,
    );
  }

  return url.toString();
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}
