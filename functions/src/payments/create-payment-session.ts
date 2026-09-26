import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
} from "firebase-functions/params";
import {requireActiveProviderRequest, requireProviderRequestDocuments}
  from "../provider-requests/provider-request-relationship-integrity.js";
import {createDurableCheckout} from "./checkout-attempts.js";

import {
  areAllAssignedProvidersAccepted,
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
  canonicalPaymentLinkageReason,
  canonicalRequestLinkageReason,
  checkoutEligibilityReason,
  paymentIdForProviderRequest,
  providerOperationalReason,
  validStoredCheckoutReason,
} from "./payment-lifecycle.js";
import {
  initialPaymentSelectionReason,
  parseCustomerPaymentChoice,
  paymentIdForProviderRequestChoice,
  providerPaymentObligationForChoice,
  type InitialPaymentChoice,
  type CustomerPaymentChoice,
} from "./payment-obligation.js";
import {
  initialPaymentReservationSettlementUpdate,
  providerRequestSettlementUpdateForPaymentOutcome,
} from "./payment-settlement.js";
import {readTrustedProviderRequestPaymentSetInTransaction}
  from "./provider-request-payment-reader.js";
import {
  createPayMongoCheckout,
  payMongoFailureCertainty,
  type PayMongoFailureCertainty,
} from "./paymongo-client.js";
import {
  legacyActiveCancellationRequestId,
} from "../cancellations/refund-cancellation-domain.js";
import {
  classifyProviderRequestRefundPolicyEvidence,
  requireRefundEligibilityState,
} from "../bookings/booking-refund-policy.js";

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
      "paymentChoice",
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

    const paymentChoice =
      parseCustomerPaymentChoice(
        input.paymentChoice,
      );

    if (!paymentChoice) {
      throw new HttpsError(
        "invalid-argument",
        "paymentChoice must be minimum, full, or remaining_balance.",
      );
    }

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
      paymentChoice,
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
    paymentChoice:
      CustomerPaymentChoice;
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
    paymentChoice,
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
        paymentChoice,
      },
    });

  const paymentId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      paymentChoice,
    );

  const alternatePaymentChoice:
    InitialPaymentChoice =
      paymentChoice !== "full"
        ? "full"
        : "minimum";

  const alternatePaymentId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      alternatePaymentChoice,
    );

  /*
   * Historical checkout identity is read only as
   * a migration guard. New checkout identity is
   * always payment-choice specific.
   */
  const legacyPaymentId =
    paymentIdForProviderRequest(
      providerRequestId,
    );

  const paymentReference = db
    .collection("payments")
    .doc(paymentId);

  const alternatePaymentReference = db
    .collection("payments")
    .doc(alternatePaymentId);

  const legacyPaymentReference = db
    .collection("payments")
    .doc(legacyPaymentId);

  const providerRequestReference = db
    .collection("providerRequests")
    .doc(providerRequestId);

  const foundation = await db.runTransaction(
    async (transaction) => {
      const [
        paymentSnapshot,
        alternatePaymentSnapshot,
        legacyPaymentSnapshot,
        providerRequestSnapshot,
      ] = await transaction.getAll(
        paymentReference,
        alternatePaymentReference,
        legacyPaymentReference,
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

      const cancellationEvidence =
        classifyProviderRequestRefundPolicyEvidence(
          providerRequest,
        );

      if (cancellationEvidence.status === "invalid") {
        throw invalidLinkage();
      }

      const activeCancellationRequestId =
        cancellationEvidence.status === "policy_backed"
          ? requireRefundEligibilityState(providerRequest)
            .activeCancellationRequestId
          : legacyActiveCancellationRequestId(providerRequest);

      if (activeCancellationRequestId !== null) {
        throw new HttpsError(
          "failed-precondition",
          "Payment checkout is locked by an active cancellation request.",
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

      const providerRequestsSnapshot =
        await transaction.get(
          db.collection("providerRequests")
            .where("mainEventId", "==", bookingId),
        );

      const provider =
        providerSnapshot.data() ?? {};

      const relationships = requireProviderRequestDocuments({
        mainEventId: bookingId, mainEvent: booking, requests: providerRequestsSnapshot.docs,
      });
      requireActiveProviderRequest(relationships, providerRequestId);

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

      let selectingInitialPayment = false;
      if (paymentChoice !== "remaining_balance") {
        const selectionReason =
        initialPaymentSelectionReason({
          providerRequestId,
          providerRequest,
          paymentChoice,
        });

      if (selectionReason) {
        throw new HttpsError(
          "failed-precondition",
          selectionReason ===
            "initial_payment_choice_locked"
            ? "A different initial payment option has already been selected."
            : "The existing initial payment requires reconciliation.",
        );
      }

      /*
       * A historical payment record can represent
       * money that may already have reached the
       * gateway even when the request never stored
       * its old payment pointer. Never start a P5
       * initial payment beside such a record.
       */
      if (
        alternatePaymentSnapshot.exists ||
        legacyPaymentSnapshot.exists
      ) {
        throw new HttpsError(
          "failed-precondition",
          "An existing initial payment must be resolved before another option can be selected.",
        );
      }

      selectingInitialPayment =
        (
          providerRequest
            .initialPaymentChoice ===
            undefined ||
          providerRequest
            .initialPaymentChoice === null
        ) &&
        (
          providerRequest
            .initialPaymentId ===
            undefined ||
          providerRequest
            .initialPaymentId === null
        ) &&
        (
          providerRequest
            .paymentId ===
            undefined ||
          providerRequest
            .paymentId === null
        );

      /*
       * Selection and payment document are created
       * atomically. Any orphaned or missing side of
       * that pair fails closed.
       */
      if (
        paymentSnapshot.exists ===
          selectingInitialPayment
      ) {
        throw invalidLinkage();
      }
      } else {
        const paymentSet = await readTrustedProviderRequestPaymentSetInTransaction({
          transaction, providerRequestId, providerRequest,
          mainEventId: bookingId, customerId, providerId, mainEvent: booking,
          invalid: () => { throw invalidLinkage(); },
        });
        if (paymentSet.mode !== "p5" ||
          providerRequest.settlementSchemaVersion !== 1 ||
          providerRequest.settlementStatus !== paymentSet.settlement.status ||
          providerRequest.outstandingAmountInCentavos !==
            paymentSet.settlement.outstandingAmountInCentavos ||
          providerRequest.grossSettledAmountInCentavos !==
            paymentSet.settlement.grossSettledAmountInCentavos ||
          providerRequest.initialPaymentChoice !== "minimum" ||
          !paymentSet.settlement.settledPaymentIds.includes(
            paymentSet.plan.initialPaymentId ?? "",
          ) ||
          paymentSet.settlement.outstandingAmountInCentavos <= 0 ||
          // An already reserved pending/processing balance resumes its durable attempt.
          !(paymentSet.settlement.status === "deposit_settled" ||
            (paymentSnapshot.exists &&
              paymentSet.settlement.status === "balance_payment_processing")) ||
          paymentSnapshot.exists !== (paymentSet.plan.remainingBalancePaymentId !== null) ||
          (paymentSnapshot.exists && providerRequest.paymentId !== paymentId) ||
          alternatePaymentSnapshot.exists || legacyPaymentSnapshot.exists
        ) {
          throw invalidLinkage();
        }
        const balanceObligation = providerPaymentObligationForChoice({
          financialSnapshot: providerRequest.financialSnapshot, paymentChoice,
        });
        if (balanceObligation.amountInCentavos !==
          paymentSet.settlement.outstandingAmountInCentavos) throw invalidLinkage();
      }

      const obligation =
        providerPaymentObligationForChoice({
          financialSnapshot:
            providerRequest
              .financialSnapshot,

          paymentChoice,
        });

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
          paymentChoice,
        })
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This provider request is not awaiting payment.",
        );
      }

      const currentMainEventStatus =
        parseMainEventStatus(booking.status);

      if (!currentMainEventStatus) {
        throw new HttpsError(
          "failed-precondition",
          "The main-event status is invalid.",
        );
      }

      const providerRequestSummary =
        calculateMainEventRequestSummary(
          relationships.activeRequests,
          currentMainEventStatus,
        );

      if (
        !areAllAssignedProvidersAccepted(
          providerRequestSummary,
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Down payment is unavailable until every " +
          "assigned provider has accepted the booking request.",
        );
      }


      const amountInCentavos =
        obligation.amountInCentavos;

      if (existing) {
        if (existing.reconciliationRequired) {
          throw new HttpsError("failed-precondition", "Payment requires reconciliation.");
        }
        if (existing.status === "processing" && providerRequest.paymentId !== paymentId) {
          throw invalidLinkage();
        }
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

        if (existing.status === "processing" && existing.attemptSchemaVersion !== 1) {
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

        if (existing.attemptSchemaVersion !== 1) {
          throw new HttpsError("failed-precondition",
            "Legacy checkout history requires reconciliation before another dispatch.");
        }
        return {
          created: false,
          bookingId,
          providerId,
          amountInCentavos,
          checkoutUrl: null,
        };
      }

      if (selectingInitialPayment) {
        const selectionTimestamp =
          serverTimestamp();

        const initialSettlementUpdate =
          initialPaymentReservationSettlementUpdate({
            financialSnapshot:
              providerRequest
                .financialSnapshot,

            timestamp:
              selectionTimestamp,
          });

        transaction.update(
          providerRequestReference,
          {
            initialPaymentChoice:
              paymentChoice,

            initialPaymentId:
              paymentId,

            /*
             * The current-payment pointer is
             * reserved before gateway dispatch.
             * This blocks the alternate initial
             * choice even during ambiguous calls.
             */
            paymentId,

            initialPaymentSelectedAt:
              selectionTimestamp,

            /*
             * Settlement identity and financial progress are
             * reserved in the same transaction as the immutable
             * initial payment choice.
             */
            ...initialSettlementUpdate,

            updatedAt:
              selectionTimestamp,
          },
        );
      }

      if (paymentChoice === "remaining_balance") {
        const timestamp = serverTimestamp();
        transaction.update(providerRequestReference, {
          remainingBalancePaymentId: paymentId,
          paymentId,
          paymentStatus: "pending",
          ...providerRequestSettlementUpdateForPaymentOutcome({
            providerRequestId,
            providerRequest: {...providerRequest, remainingBalancePaymentId: paymentId},
            paymentId, paymentStatus: "pending", timestamp,
          }),
          updatedAt: timestamp,
        });
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
            amountInCentavos /
            100,

          amountInCentavos,

          currency:
            PAYMENT_CURRENCY,

          obligationSchemaVersion:
            obligation.schemaVersion,

          paymentChoice:
            obligation.paymentChoice,

          obligationKey:
            obligation.obligationKey,

          obligationKind:
            obligation.obligationKind,

          paymentType:
            obligation.paymentType,

          gateway: "paymongo",
          status: "pending",
          checkoutCreationStatus:
            "pending",
          attemptSchemaVersion: 1,
          attemptCount: 0,
          currentCheckoutAttemptId: null,
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

            paymentChoice:
              obligation.paymentChoice,

            obligationKey:
              obligation.obligationKey,

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
    checkout = await createDurableCheckout({
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
        paymentChoice === "full"
          ? "FEASTA provider full payment"
          : paymentChoice === "remaining_balance"
            ? "FEASTA provider remaining balance"
            : "FEASTA provider minimum payment",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    }, createCheckout);
  } catch (error) {
    if (error instanceof HttpsError && error.code === "failed-precondition") throw error;
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

      if (payment.paymentChoice === "remaining_balance") {
        const evidence = classifyProviderRequestRefundPolicyEvidence(providerRequest);
        if (evidence.status === "invalid" ||
          (evidence.status === "policy_backed"
            ? requireRefundEligibilityState(providerRequest).activeCancellationRequestId
            : legacyActiveCancellationRequestId(providerRequest)) !== null) throw invalidLinkage();
        const paymentSet = await readTrustedProviderRequestPaymentSetInTransaction({
          transaction, providerRequestId: input.providerRequestId, providerRequest,
          mainEventId: input.bookingId, customerId: input.customerId,
          providerId: input.providerId, mainEvent: booking,
          invalid: () => { throw invalidLinkage(); },
        });
        if (paymentSet.mode !== "p5" ||
          paymentSet.currentPaymentId !== input.paymentId ||
          !paymentSet.settlement.settledPaymentIds.includes(
            paymentSet.plan.initialPaymentId ?? "",
          ) ||
          paymentSet.settlement.outstandingAmountInCentavos !== input.amountInCentavos) {
          throw invalidLinkage();
        }
      }

      if (payment.attemptSchemaVersion === 1) {
        if (payment.reconciliationRequired ||
          typeof payment.currentCheckoutAttemptId !== "string") {
          throw new HttpsError("failed-precondition", "Payment requires reconciliation.");
        }
        const attempt = (await transaction.get(paymentReference.collection("checkoutAttempts")
          .doc(payment.currentCheckoutAttemptId))).data();
        if (!attempt || attempt.paymongoCheckoutId !== input.checkout.id ||
          attempt.resolution !== "outstanding") {
          throw new HttpsError("failed-precondition", "Checkout attempt is no longer current.");
        }
      }

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

      const relationships = requireProviderRequestDocuments({
        mainEventId: input.bookingId, mainEvent: booking, requests: providerRequestsSnapshot.docs,
      });
      requireActiveProviderRequest(relationships, input.providerRequestId);

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

      const providerRequestSummary =
        calculateMainEventRequestSummary(
          relationships.activeRequests,
          currentMainEventStatus,
        );

      if (
        !areAllAssignedProvidersAccepted(
          providerRequestSummary,
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Payment eligibility changed while checkout was created.",
        );
      }

      const summary =
        payment.paymentChoice === "remaining_balance" ? null : calculateMainEventRequestSummary(
          relationships.activeRequests,
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
            payment.paymentChoice === "remaining_balance" ? "confirmed" : "payment_processing",
          paymentStatus:
            "processing",
          paymentId: input.paymentId,
          ...(payment.paymentChoice === "remaining_balance"
            ? providerRequestSettlementUpdateForPaymentOutcome({
              providerRequestId: input.providerRequestId, providerRequest,
              paymentId: input.paymentId, paymentStatus: "processing", timestamp,
            }) : {}),
          updatedAt: timestamp,
        },
      );

      if (summary) transaction.update(
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

      if (payment.paymentChoice === "remaining_balance") {
        const evidence = classifyProviderRequestRefundPolicyEvidence(providerRequest);
        if (evidence.status === "invalid" || providerRequest.status !== "confirmed" ||
          (evidence.status === "policy_backed"
            ? requireRefundEligibilityState(providerRequest).activeCancellationRequestId
            : legacyActiveCancellationRequestId(providerRequest)) !== null) return null;
        const booking = await transaction.get(db.collection("mainEvents").doc(payment.mainEventId));
        if (booking.data()?.status !== "confirmed") return null;
      }

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
        providerRequest.status === (payment.paymentChoice === "remaining_balance"
          ? "confirmed" : "waiting_for_down_payment")
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
