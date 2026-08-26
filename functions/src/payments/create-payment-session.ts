import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
} from "firebase-functions/params";

import {
  calculateMainEventRequestSummary,
} from "../provider-requests/recalculate-main-event-status.js";
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
  parseMainEventStatus,
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
  authoritativeAmountInCentavos,
  canonicalPaymentLinkageReason,
  canonicalRequestLinkageReason,
  checkoutEligibilityReason,
  paymentIdForProviderRequest,
  providerOperationalReason,
  validStoredCheckoutReason,
} from "./payment-lifecycle.js";
import {
  createPayMongoCheckout,
  payMongoFailureCertainty,
  type PayMongoFailureCertainty,
} from "./paymongo-client.js";

const payMongoSecretKey = defineSecret(
  "PAYMONGO_SECRET_KEY",
);

type CheckoutCreator =
  typeof createPayMongoCheckout;

type PaymentSessionResult = {
  paymentId: string;
  providerRequestId: string;
  bookingId: string;
  checkoutUrl: string;
  created: boolean;
};

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

    rejectUnknownFields(input, [
      "providerRequestId",
      "idempotencyKey",
    ]);

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

    return createPaymentSessionForCustomer({
      customerId: user.uid,
      providerRequestId,
      clientKey,
      secretKey:
        payMongoSecretKey.value(),
      successUrl: trustedRedirectUrl(
        "PAYMENT_SUCCESS_URL",
      ),
      cancelUrl: trustedRedirectUrl(
        "PAYMENT_CANCEL_URL",
      ),
    });
  },
);

export async function createPaymentSessionForCustomer(
  input: {
    customerId: string;
    providerRequestId: string;
    clientKey: string;
    secretKey: string;
    successUrl: string;
    cancelUrl: string;
    createCheckout?: CheckoutCreator;
  },
): Promise<PaymentSessionResult> {
  const {
    customerId,
    providerRequestId,
  } = input;

  const createCheckout =
    input.createCheckout ??
    createPayMongoCheckout;

  const requestHash =
    createIdempotencyKey({
      operation:
        "createPaymentSession",
      actorId: customerId,
      clientKey: input.clientKey,
      payload: {
        providerRequestId,
      },
    });

  const paymentId =
    paymentIdForProviderRequest(
      providerRequestId,
    );

  const paymentReference = db
    .collection("payments")
    .doc(paymentId);

  const providerRequestReference = db
    .collection("providerRequests")
    .doc(providerRequestId);

  const foundation = await db.runTransaction(
    async (transaction) => {
      const [
        paymentSnapshot,
        providerRequestSnapshot,
      ] = await transaction.getAll(
        paymentReference,
        providerRequestReference,
      );

      if (!providerRequestSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The provider request was not found.",
        );
      }

      const providerRequest =
        providerRequestSnapshot.data() ?? {};

      const bookingId = stringValue(
        providerRequest.mainEventId,
      );

      const linkedBookingId = stringValue(
        providerRequest.bookingId,
      );

      const requestCustomerId = stringValue(
        providerRequest.customerId,
      );

      const providerId = stringValue(
        providerRequest.providerId,
      );

      if (
        !bookingId ||
        linkedBookingId !== bookingId ||
        !requestCustomerId ||
        !providerId
      ) {
        throw invalidLinkage();
      }

      if (requestCustomerId !== customerId) {
        throw new HttpsError(
          "permission-denied",
          "You do not own this provider request.",
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

      if (!providerSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "The provider was not found.",
        );
      }

      const booking =
        bookingSnapshot.data() ?? {};

      const provider =
        providerSnapshot.data() ?? {};

      if (
        canonicalRequestLinkageReason({
          providerRequestId,
          mainEventId: bookingId,
          customerId,
          providerId,
          providerRequest,
          mainEvent: booking,
        })
      ) {
        throw invalidLinkage();
      }

      const providerOwnerId = stringValue(
        provider.ownerId,
      );

      if (!providerOwnerId) {
        throw providerUnavailable();
      }

      const providerOwnerSnapshot =
        await transaction.get(
          db.collection("users")
            .doc(providerOwnerId),
        );

      if (
        !providerOwnerSnapshot.exists ||
        providerOperationalReason(
          providerId,
          provider,
          providerOwnerSnapshot.data() ?? {},
        )
      ) {
        throw providerUnavailable();
      }

      const existing =
        paymentSnapshot.exists
          ? paymentSnapshot.data() ?? {}
          : null;

      if (
        checkoutEligibilityReason({
          providerRequest,
          mainEvent: booking,
          payment: existing,
        })
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This provider request is not awaiting payment.",
        );
      }

      const amountInCentavos =
        authoritativeAmountInCentavos(
          providerRequest
            .downPaymentAmount,
        );

      if (amountInCentavos === null) {
        throw new HttpsError(
          "failed-precondition",
          "The provider-request payment amount is invalid.",
        );
      }

      if (existing) {
        if (
          canonicalPaymentLinkageReason({
            paymentId,
            providerRequestId,
            mainEventId: bookingId,
            customerId,
            providerId,
            payment: existing,
            providerRequest,
            mainEvent: booking,
          })
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Existing payment details are invalid.",
          );
        }

        if (existing.status === "processing") {
          if (
            providerRequest.paymentId !==
              paymentId ||
            validStoredCheckoutReason(
              existing,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The existing checkout session is invalid.",
            );
          }

          return {
            created: false,
            bookingId,
            providerId,
            amountInCentavos,
            checkoutUrl:
              existing.checkoutUrl as string,
          };
        }

        return {
          created: false,
          bookingId,
          providerId,
          amountInCentavos,
          checkoutUrl: null,
        };
      }

      transaction.create(
        paymentReference,
        {
          paymentId,
          bookingId,
          mainEventId: bookingId,
          providerRequestId,
          customerId,
          providerId,
          amount:
            providerRequest
              .downPaymentAmount,
          amountInCentavos,
          currency: PAYMENT_CURRENCY,
          paymentType:
            "provider_down_payment",
          gateway: "paymongo",
          status: "pending",
          checkoutCreationStatus:
            "pending",
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
        },
      );

      writeAuditLogInTransaction(
        transaction,
        {
          actorId: customerId,
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

  if (foundation.checkoutUrl) {
    return {
      paymentId,
      providerRequestId,
      bookingId: foundation.bookingId,
      checkoutUrl:
        foundation.checkoutUrl,
      created: false,
    };
  }

  let checkout:
    Awaited<ReturnType<CheckoutCreator>>;

  try {
    checkout = await createCheckout({
      secretKey: input.secretKey,
      idempotencyKey: paymentId,
      paymentId,
      bookingId:
        foundation.bookingId,
      providerRequestId,
      customerId,
      amountInCentavos:
        foundation.amountInCentavos,
      currency: PAYMENT_CURRENCY,
      description:
        "FEASTA provider down payment",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
  } catch (error) {
    const recoveredCheckoutUrl =
      await recordCheckoutFailure({
        customerId,
        providerRequestId,
        paymentId,
        certainty:
          payMongoFailureCertainty(error),
      });

    if (recoveredCheckoutUrl) {
      return {
        paymentId,
        providerRequestId,
        bookingId:
          foundation.bookingId,
        checkoutUrl:
          recoveredCheckoutUrl,
        created: false,
      };
    }

    throw checkoutUnavailable();
  }

  try {
    const storedCheckoutUrl =
      await persistCheckout({
        customerId,
        providerRequestId,
        paymentId,
        bookingId:
          foundation.bookingId,
        providerId:
          foundation.providerId,
        amountInCentavos:
          foundation.amountInCentavos,
        checkout,
      });

    return {
      paymentId,
      providerRequestId,
      bookingId:
        foundation.bookingId,
      checkoutUrl:
        storedCheckoutUrl,
      created: foundation.created,
    };
  } catch {
    const recoveredCheckoutUrl =
      await recordCheckoutFailure({
        customerId,
        providerRequestId,
        paymentId,
        certainty: "ambiguous",
      });

    if (recoveredCheckoutUrl) {
      return {
        paymentId,
        providerRequestId,
        bookingId:
          foundation.bookingId,
        checkoutUrl:
          recoveredCheckoutUrl,
        created: false,
      };
    }

    throw checkoutUnavailable();
  }
}

async function persistCheckout(
  input: {
    customerId: string;
    providerRequestId: string;
    paymentId: string;
    bookingId: string;
    providerId: string;
    amountInCentavos: number;
    checkout: {
      id: string;
      checkoutUrl: string;
    };
  },
): Promise<string> {
  const paymentReference = db
    .collection("payments")
    .doc(input.paymentId);

  const requestReference = db
    .collection("providerRequests")
    .doc(input.providerRequestId);

  const bookingReference = db
    .collection("mainEvents")
    .doc(input.bookingId);

  return db.runTransaction(
    async (transaction) => {
      const [
        paymentSnapshot,
        requestSnapshot,
        bookingSnapshot,
        providerSnapshot,
      ] = await transaction.getAll(
        paymentReference,
        requestReference,
        bookingReference,
        db.collection("providers")
          .doc(input.providerId),
      );

      if (
        !paymentSnapshot.exists ||
        !requestSnapshot.exists ||
        !bookingSnapshot.exists ||
        !providerSnapshot.exists
      ) {
        throw new HttpsError(
          "not-found",
          "The payment record is unavailable.",
        );
      }

      const payment =
        paymentSnapshot.data() ?? {};
      const providerRequest =
        requestSnapshot.data() ?? {};
      const booking =
        bookingSnapshot.data() ?? {};
      const provider =
        providerSnapshot.data() ?? {};

      const providerOwnerId =
        stringValue(provider.ownerId);

      if (!providerOwnerId) {
        throw providerUnavailable();
      }

      const providerOwnerSnapshot =
        await transaction.get(
          db.collection("users")
            .doc(providerOwnerId),
        );

      const providerRequestsSnapshot =
        await transaction.get(
          db.collection("providerRequests")
            .where(
              "mainEventId",
              "==",
              input.bookingId,
            ),
        );

      if (
        canonicalPaymentLinkageReason({
          paymentId: input.paymentId,
          providerRequestId:
            input.providerRequestId,
          mainEventId: input.bookingId,
          customerId: input.customerId,
          providerId: input.providerId,
          payment,
          providerRequest,
          mainEvent: booking,
        })
      ) {
        throw invalidLinkage();
      }

      if (
        payment.amountInCentavos !==
          input.amountInCentavos ||
        validStoredCheckoutReason({
          paymongoCheckoutId:
            input.checkout.id,
          checkoutUrl:
            input.checkout.checkoutUrl,
        }) ||
        providerOperationalReason(
          input.providerId,
          provider,
          providerOwnerSnapshot.data() ?? {},
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Payment eligibility changed while checkout was created.",
        );
      }

      if (
        checkoutEligibilityReason({
          providerRequest,
          mainEvent: booking,
          payment,
        })
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Payment eligibility changed while checkout was created.",
        );
      }

      if (payment.status === "processing") {
        if (!validStoredCheckoutReason(payment)) {
          return payment.checkoutUrl as string;
        }
      }

      const currentMainEventStatus =
        parseMainEventStatus(
          booking.status,
        );

      if (!currentMainEventStatus) {
        throw new HttpsError(
          "failed-precondition",
          "The main-event status is invalid.",
        );
      }

      const summary =
        calculateMainEventRequestSummary(
          providerRequestsSnapshot.docs,
          currentMainEventStatus,
          [{
            providerRequestId:
              input.providerRequestId,
            status: "payment_processing",
          }],
        );

      const timestamp =
        serverTimestamp();

      transaction.update(
        paymentReference,
        {
          status: "processing",
          checkoutCreationStatus:
            "created",
          checkoutCreationUncertainAt:
            null,
          checkoutUrl:
            input.checkout.checkoutUrl,
          paymongoCheckoutId:
            input.checkout.id,
          failedAt: null,
          updatedAt: timestamp,
        },
      );

      transaction.update(
        requestReference,
        {
          status:
            "payment_processing",
          paymentStatus:
            "processing",
          paymentId: input.paymentId,
          updatedAt: timestamp,
        },
      );

      transaction.update(
        bookingReference,
        {
          ...summary,
          updatedAt: timestamp,
        },
      );

      if (payment.status !== "processing") {
        writeAuditLogInTransaction(
          transaction,
          {
            actorId: input.customerId,
            actorRole: "customer",
            action:
              "payment.status_changed",
            targetCollection:
              "payments",
            targetId: input.paymentId,
            before: {
              status: payment.status,
            },
            after: {
              status: "processing",
            },
            metadata: {
              providerRequestId:
                input.providerRequestId,
            },
          },
        );
      }

      return input.checkout.checkoutUrl;
    },
  );
}

async function recordCheckoutFailure(
  input: {
    customerId: string;
    providerRequestId: string;
    paymentId: string;
    certainty: PayMongoFailureCertainty;
  },
): Promise<string | null> {
  const paymentReference = db
    .collection("payments")
    .doc(input.paymentId);

  const requestReference = db
    .collection("providerRequests")
    .doc(input.providerRequestId);

  return db.runTransaction(
    async (transaction) => {
      const [
        paymentSnapshot,
        requestSnapshot,
      ] = await transaction.getAll(
        paymentReference,
        requestReference,
      );

      if (
        !paymentSnapshot.exists ||
        !requestSnapshot.exists
      ) {
        return null;
      }

      const payment =
        paymentSnapshot.data() ?? {};
      const providerRequest =
        requestSnapshot.data() ?? {};

      if (
        payment.customerId !==
          input.customerId ||
        payment.providerRequestId !==
          input.providerRequestId ||
        providerRequest.customerId !==
          input.customerId ||
        (
          providerRequest.paymentId &&
          providerRequest.paymentId !==
            input.paymentId
        )
      ) {
        return null;
      }

      if (
        payment.status === "processing" &&
        !validStoredCheckoutReason(payment)
      ) {
        return payment.checkoutUrl as string;
      }

      if (
        payment.status === "paid" ||
        payment.status === "refunded"
      ) {
        return null;
      }

      const timestamp =
        serverTimestamp();

      if (
        input.certainty === "not_sent" &&
        payment.status === "pending" &&
        !payment.checkoutUrl &&
        !payment.paymongoCheckoutId &&
        providerRequest.status ===
          "waiting_for_down_payment"
      ) {
        transaction.update(
          paymentReference,
          {
            checkoutCreationStatus:
              "not_sent",
            updatedAt: timestamp,
          },
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId: "paymongo",
            actorRole: "system",
            action:
              "payment.checkout_not_sent",
            targetCollection:
              "payments",
            targetId: input.paymentId,
            before: {
              checkoutCreationStatus:
                payment.checkoutCreationStatus ??
                "pending",
            },
            after: {
              checkoutCreationStatus:
                "not_sent",
            },
            reason:
              "checkout_not_sent",
            metadata: {
              providerRequestId:
                input.providerRequestId,
            },
          },
        );

        return null;
      }

      transaction.update(
        paymentReference,
        {
          checkoutCreationStatus:
            "unknown",
          checkoutCreationUncertainAt:
            timestamp,
          updatedAt: timestamp,
        },
      );

      writeAuditLogInTransaction(
        transaction,
        {
          actorId: "paymongo",
          actorRole: "system",
          action:
            "payment.checkout_outcome_unknown",
          targetCollection:
            "payments",
          targetId: input.paymentId,
          reason:
            "checkout_creation_ambiguous",
          metadata: {
            providerRequestId:
              input.providerRequestId,
          },
        },
      );

      return null;
    },
  ).catch(() => null);
}

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

function invalidLinkage(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The provider-request linkage is invalid.",
  );
}

function providerUnavailable(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The provider is unavailable.",
  );
}

function checkoutUnavailable(): HttpsError {
  return new HttpsError(
    "unavailable",
    "Payment checkout could not be " +
      "created. Please try again.",
  );
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);

  if (
    Object.keys(input).some(
      (field) => !allowed.has(field),
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The payment request contains unsupported fields.",
    );
  }
}
