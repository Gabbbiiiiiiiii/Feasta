import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  MAIN_EVENT_STATUSES,
  type MainEventStatus,
  type ProviderRequestStatus,
} from "../shared/constants.js";
import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";
import {
  db,
} from "../shared/firestore.js";
import {
  createNotificationInTransaction,
} from "../shared/notifications.js";
import {
  logSecurityEvent,
} from "../shared/security-events.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  calculateMainEventRequestSummary,
} from "../provider-requests/recalculate-main-event-status.js";
import {
  parsePayMongoPaymentEvent,
  statusForPayMongoEvent,
  validateTrustedPaymentUpdate,
} from "./payment-security.js";

type WebhookResult = {
  duplicate: boolean;
  applied: boolean;
  reason?: string;
};

type ProviderRequestPaymentUpdate = {
  update: Record<string, unknown>;
  statusOverride?: ProviderRequestStatus;
};

export async function processPayMongoWebhook(
  rawBody: Buffer,
): Promise<WebhookResult> {
  const event =
    parsePayMongoPaymentEvent(rawBody);

  const nextStatus =
    statusForPayMongoEvent(event.eventType);

  const eventReference = db
    .collection("paymentWebhookEvents")
    .doc(event.eventId);

  const paymentReference = db
    .collection("payments")
    .doc(event.paymentId);

  const result = await db.runTransaction(
    async (transaction): Promise<WebhookResult> => {
      const [
        eventSnapshot,
        paymentSnapshot,
      ] = await transaction.getAll(
        eventReference,
        paymentReference,
      );

      if (eventSnapshot.exists) {
        return {
          duplicate: true,
          applied: false,
          reason: "webhook_already_processed",
        };
      }

      if (
        !paymentSnapshot.exists ||
        !nextStatus
      ) {
        const reason = nextStatus
          ? "payment_not_found"
          : "unsupported_event";

        transaction.set(
          eventReference,
          webhookRecord(
            event,
            "ignored",
            reason,
          ),
        );

        return {
          duplicate: false,
          applied: false,
          reason,
        };
      }

      const payment =
        paymentSnapshot.data() ?? {};

      const bookingId = readNonEmptyString(
        payment.mainEventId,
      ) ?? readNonEmptyString(
        payment.bookingId,
      );

      const providerRequestId =
        readNonEmptyString(
          payment.providerRequestId,
        );

      const providerId =
        readNonEmptyString(
          payment.providerId,
        );

      const customerId =
        readNonEmptyString(
          payment.customerId,
        );

      if (
        !bookingId ||
        !providerRequestId ||
        !providerId ||
        !customerId
      ) {
        transaction.set(
          eventReference,
          webhookRecord(
            event,
            "rejected",
            "invalid_payment_linkage",
          ),
        );

        return {
          duplicate: false,
          applied: false,
          reason: "invalid_payment_linkage",
        };
      }

      const bookingReference = db
        .collection("mainEvents")
        .doc(bookingId);

      const providerRequestReference = db
        .collection("providerRequests")
        .doc(providerRequestId);

      const providerReference = db
        .collection("providers")
        .doc(providerId);

      const [
        providerRequestSnapshot,
        bookingSnapshot,
        providerSnapshot,
      ] = await transaction.getAll(
        providerRequestReference,
        bookingReference,
        providerReference,
      );

      /*
       * This query is required because the main-event status depends on
       * all provider requests belonging to the event.
       *
       * It is executed before any transaction writes, which satisfies
       * Firestore transaction requirements.
       */
      const providerRequestsSnapshot =
        await transaction.get(
          db
            .collection("providerRequests")
            .where(
              "mainEventId",
              "==",
              bookingId,
            ),
        );

      const providerRequest =
        providerRequestSnapshot.data() ?? {};

      const booking =
        bookingSnapshot.data() ?? {};

      const provider =
        providerSnapshot.data() ?? {};

      if (
        !providerRequestSnapshot.exists ||
        !bookingSnapshot.exists ||
        !providerSnapshot.exists ||
        providerRequest.mainEventId !==
          bookingId ||
        providerRequest.customerId !==
          customerId ||
        providerRequest.providerId !==
          providerId ||
        booking.customerId !==
          customerId ||
        typeof provider.ownerId !==
          "string" ||
        provider.ownerId.length === 0
      ) {
        transaction.set(
          eventReference,
          webhookRecord(
            event,
            "rejected",
            "ownership_mismatch",
          ),
        );

        return {
          duplicate: false,
          applied: false,
          reason: "ownership_mismatch",
        };
      }

      const linkedPaymentId =
        readNonEmptyString(
          providerRequest.paymentId,
        );

      if (
        linkedPaymentId &&
        linkedPaymentId !== event.paymentId
      ) {
        transaction.set(
          eventReference,
          webhookRecord(
            event,
            "rejected",
            "provider_request_payment_mismatch",
          ),
        );

        return {
          duplicate: false,
          applied: false,
          reason:
            "provider_request_payment_mismatch",
        };
      }

      const validationReason =
        validateTrustedPaymentUpdate({
          currentStatus: payment.status,
          nextStatus,

          expectedAmountInCentavos:
            payment.amountInCentavos,

          actualAmountInCentavos:
            event.amountInCentavos,

          expectedCurrency:
            payment.currency,

          actualCurrency:
            event.currency,
        });

      if (validationReason) {
        const webhookStatus =
          validationReason ===
            "already_applied"
            ? "duplicate"
            : "rejected";

        transaction.set(
          eventReference,
          webhookRecord(
            event,
            webhookStatus,
            validationReason,
          ),
        );

        return {
          duplicate:
            validationReason ===
            "already_applied",

          applied: false,
          reason: validationReason,
        };
      }

      const timestamp =
        serverTimestamp();

      transaction.update(
        paymentReference,
        createPaymentUpdate(
          nextStatus,
          event.gatewayResourceId,
          event.eventId,
          timestamp,
        ),
      );

      const requestPaymentUpdate =
        createProviderRequestPaymentUpdate(
          nextStatus,
          event.paymentId,
          providerRequest,
          timestamp,
        );

      transaction.update(
        providerRequestReference,
        requestPaymentUpdate.update,
      );

      const currentMainEventStatus =
        parseMainEventStatus(
          booking.status,
        );

      const overrides =
        requestPaymentUpdate.statusOverride
          ? [
              {
                providerRequestId,
                status:
                  requestPaymentUpdate
                    .statusOverride,
              },
            ]
          : [];

      const mainEventSummary =
        calculateMainEventRequestSummary(
          providerRequestsSnapshot.docs,
          currentMainEventStatus,
          overrides,
        );

      transaction.update(
        bookingReference,
        {
          ...mainEventSummary,

          lastPaymentId:
            event.paymentId,

          lastPaymentStatus:
            nextStatus,

          lastPaymentUpdatedAt:
            timestamp,

          updatedAt:
            timestamp,
        },
      );

      const timelineReference =
        bookingReference
          .collection("timeline")
          .doc();

      transaction.set(
        timelineReference,
        {
          type:
            timelineTypeForStatus(
              nextStatus,
            ),

          message:
            timelineMessageForStatus(
              nextStatus,
            ),

          mainEventId: bookingId,
          providerRequestId,
          providerId,
          paymentId: event.paymentId,

          source: "paymongo_webhook",
          createdAt: timestamp,
        },
      );

      transaction.set(
        eventReference,
        webhookRecord(
          event,
          "processed",
          null,
          {
            mainEventId: bookingId,
            providerRequestId,
            providerId,
          },
        ),
      );

      writeAuditLogInTransaction(
        transaction,
        {
          actorId: "paymongo",
          actorRole: "system",

          action:
            "payment.status_changed",

          targetCollection: "payments",
          targetId: event.paymentId,

          source: "paymongo_webhook",

          before: {
            status: payment.status,
          },

          after: {
            status: nextStatus,
          },

          metadata: {
            eventId: event.eventId,
            eventType: event.eventType,
            mainEventId: bookingId,
            providerRequestId,
            providerId,
          },
        },
      );

      createNotificationInTransaction(
        transaction,
        {
          userId: customerId,

          title:
            customerNotificationTitle(
              nextStatus,
            ),

          message:
            customerNotificationMessage(
              nextStatus,
            ),

          type: "payment",
          relatedId: event.paymentId,
          relatedCollection: "payments",
        },
      );

      createNotificationInTransaction(
        transaction,
        {
          userId: provider.ownerId,

          title:
            providerNotificationTitle(
              nextStatus,
            ),

          message:
            providerNotificationMessage(
              nextStatus,
            ),

          type: "payment",
          relatedId: event.paymentId,
          relatedCollection: "payments",
        },
      );

      return {
        duplicate: false,
        applied: true,
      };
    },
  );

  logSecurityEvent({
    action: "payment_webhook",

    outcome: result.duplicate
      ? "replayed"
      : result.applied
        ? "succeeded"
        : "denied",

    actorUid: "paymongo",
    targetId: event.paymentId,
    correlationId: event.eventId,

    reasonCode:
      result.reason ??
      (
        result.applied
          ? "status_applied"
          : undefined
      ),

    metadata: {
      eventType: event.eventType,
    },
  });

  return result;
}

function createPaymentUpdate(
  status:
    NonNullable<
      ReturnType<
        typeof statusForPayMongoEvent
      >
    >,
  gatewayResourceId: string,
  webhookEventId: string,
  timestamp: ReturnType<
    typeof serverTimestamp
  >,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    status,
    paymongoStatus: status,

    paymongoResourceId:
      gatewayResourceId,

    lastWebhookEventId:
      webhookEventId,

    updatedAt: timestamp,
  };

  if (status === "paid") {
    update.paidAt = timestamp;
    update.failedAt = null;
    update.expiredAt = null;
  } else if (status === "failed") {
    update.failedAt = timestamp;
  } else if (status === "expired") {
    update.expiredAt = timestamp;
  } else if (status === "refunded") {
    update.refundedAt = timestamp;
  }

  return update;
}

function createProviderRequestPaymentUpdate(
  status:
    NonNullable<
      ReturnType<
        typeof statusForPayMongoEvent
      >
    >,
  paymentId: string,
  providerRequest:
    Record<string, unknown>,
  timestamp: ReturnType<
    typeof serverTimestamp
  >,
): ProviderRequestPaymentUpdate {
  if (status === "paid") {
    return {
      statusOverride: "confirmed",

      update: {
        status: "confirmed",
        paymentStatus: "paid",
        paymentId,

        paidAt: timestamp,

        confirmedAt:
          providerRequest.confirmedAt ??
          timestamp,

        failedAt: null,
        expiredAt: null,
        updatedAt: timestamp,
      },
    };
  }

  if (status === "failed") {
    return {
      statusOverride:
        "waiting_for_down_payment",

      update: {
        status:
          "waiting_for_down_payment",

        paymentStatus: "failed",
        paymentId,
        failedAt: timestamp,
        updatedAt: timestamp,
      },
    };
  }

  if (status === "expired") {
    return {
      statusOverride:
        "waiting_for_down_payment",

      update: {
        status:
          "waiting_for_down_payment",

        paymentStatus: "expired",
        paymentId,
        expiredAt: timestamp,
        updatedAt: timestamp,
      },
    };
  }

  /*
   * A refund changes the payment state, but it does not silently cancel
   * the provider request. Cancellation and recovery require a separate
   * administrative workflow with an explicit reason and audit record.
   */
  return {
    update: {
      paymentStatus: "refunded",
      paymentId,
      refundedAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function parseMainEventStatus(
  value: unknown,
): MainEventStatus {
  if (
    typeof value === "string" &&
    (
      MAIN_EVENT_STATUSES as
        readonly string[]
    ).includes(value)
  ) {
    return value as MainEventStatus;
  }

  return "pending_provider_approval";
}

function timelineTypeForStatus(
  status:
    NonNullable<
      ReturnType<
        typeof statusForPayMongoEvent
      >
    >,
): string {
  switch (status) {
    case "paid":
      return "payment_confirmed";

    case "failed":
      return "payment_failed";

    case "expired":
      return "payment_expired";

    case "refunded":
      return "payment_refunded";

    default:
      return "payment_updated";
  }
}

function timelineMessageForStatus(
  status:
    NonNullable<
      ReturnType<
        typeof statusForPayMongoEvent
      >
    >,
): string {
  switch (status) {
    case "paid":
      return (
        "The provider down payment " +
        "was successfully confirmed."
      );

    case "failed":
      return (
        "The provider down payment " +
        "failed and may be retried."
      );

    case "expired":
      return (
        "The payment session expired " +
        "and a new session may be created."
      );

    case "refunded":
      return (
        "The provider payment was " +
        "successfully refunded."
      );

    default:
      return "The provider payment was updated.";
  }
}

function customerNotificationTitle(
  status: string,
): string {
  return status === "paid"
    ? "Payment confirmed"
    : `Payment ${status}`;
}

function customerNotificationMessage(
  status: string,
): string {
  switch (status) {
    case "paid":
      return (
        "Your provider payment was " +
        "securely confirmed."
      );

    case "failed":
      return (
        "Your provider payment failed. " +
        "You may try again."
      );

    case "expired":
      return (
        "Your payment session expired. " +
        "You may create a new session."
      );

    case "refunded":
      return (
        "Your provider payment was " +
        "successfully refunded."
      );

    default:
      return `Your payment is now ${status}.`;
  }
}

function providerNotificationTitle(
  status: string,
): string {
  return status === "paid"
    ? "Payment received"
    : `Payment ${status}`;
}

function providerNotificationMessage(
  status: string,
): string {
  switch (status) {
    case "paid":
      return (
        "A payment for your provider " +
        "request was confirmed."
      );

    case "failed":
      return (
        "A payment for your provider " +
        "request failed."
      );

    case "expired":
      return (
        "A payment session for your " +
        "provider request expired."
      );

    case "refunded":
      return (
        "A payment for your provider " +
        "request was refunded."
      );

    default:
      return (
        "A provider request payment " +
        `is now ${status}.`
      );
  }
}

function readNonEmptyString(
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

function webhookRecord(
  event:
    ReturnType<
      typeof parsePayMongoPaymentEvent
    >,
  status: string,
  reason: string | null,
  linkage?: {
    mainEventId: string;
    providerRequestId: string;
    providerId: string;
  },
): Record<string, unknown> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    paymentId: event.paymentId,

    gatewayResourceId:
      event.gatewayResourceId,

    status,
    reason,

    ...(linkage ?? {}),

    processedAt:
      FieldValue.serverTimestamp(),
  };
}