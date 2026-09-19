import {
  createHash,
} from "node:crypto";

import {
  isApprovedProviderForOperations,
  isProviderOwnerAccountActive,
  parseMainEventStatus,
  parseProviderRequestStatus,
  PAYMENT_CURRENCY,
  PAYMENT_STATUSES,
  type MainEventStatus,
  type PaymentStatus,
} from "../shared/constants.js";

const PAYMENT_COMPATIBLE_MAIN_EVENT_STATUSES =
  new Set<MainEventStatus>([
    "pending_provider_approval",
    "needs_provider_replacement",
    "waiting_for_down_payment",
  ]);

const CHECKOUT_PAYMENT_STATUSES =
  new Set<PaymentStatus>([
    "pending",
    "processing",
    "failed",
    "expired",
  ]);

export function paymentIdForProviderRequest(
  providerRequestId: string,
): string {
  return `payment_${createHash("sha256")
    .update(
      `provider-request:${providerRequestId}`,
    )
    .digest("hex")
    .slice(0, 32)}`;
}

export function authoritativeAmountInCentavos(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const amountInCentavos =
    Math.round(value * 100);

  return Number.isSafeInteger(
    amountInCentavos,
  ) && amountInCentavos > 0
    ? amountInCentavos
    : null;
}

export function checkoutEligibilityReason(
  input: {
    providerRequest:
      Readonly<Record<string, unknown>>;
    mainEvent:
      Readonly<Record<string, unknown>>;
    payment?:
      Readonly<Record<string, unknown>> |
      null;
  },
): string | null {
  const requestStatus =
    parseProviderRequestStatus(
      input.providerRequest.status,
    );

  const mainEventStatus =
    parseMainEventStatus(
      input.mainEvent.status,
    );

  if (
    !mainEventStatus ||
    !PAYMENT_COMPATIBLE_MAIN_EVENT_STATUSES
      .has(mainEventStatus)
  ) {
    return "main_event_not_payment_eligible";
  }

  if (
    requestStatus !==
      "waiting_for_down_payment" &&
    requestStatus !==
      "payment_processing"
  ) {
    return "provider_request_not_payment_eligible";
  }

  if (!input.payment) {
    return requestStatus ===
      "waiting_for_down_payment"
      ? null
      : "provider_request_payment_state_mismatch";
  }

  const paymentStatus =
    parsePaymentStatus(
      input.payment.status,
    );

  if (
    !paymentStatus ||
    !CHECKOUT_PAYMENT_STATUSES.has(
      paymentStatus,
    )
  ) {
    return "payment_not_checkout_eligible";
  }

  if (
    requestStatus ===
      "payment_processing" &&
    (
      input.providerRequest
        .paymentStatus !== "processing" ||
      paymentStatus !== "processing"
    )
  ) {
    return "provider_request_payment_state_mismatch";
  }

  if (
    requestStatus ===
      "waiting_for_down_payment" &&
    (
      paymentStatus === "processing" ||
      input.providerRequest
        .paymentStatus === "processing"
    )
  ) {
    return "provider_request_payment_state_mismatch";
  }

  return null;
}

export function webhookLifecycleConflictReason(
  input: {
    providerRequestStatus: unknown;
    mainEventStatus: unknown;
    nextPaymentStatus: PaymentStatus;
  },
): string | null {
  if (input.nextPaymentStatus === "refunded") {
    return null;
  }

  const requestStatus =
    parseProviderRequestStatus(
      input.providerRequestStatus,
    );

  if (
    requestStatus !==
      "waiting_for_down_payment" &&
    requestStatus !==
      "payment_processing"
  ) {
    return "provider_request_lifecycle_conflict";
  }

  const mainEventStatus =
    parseMainEventStatus(
      input.mainEventStatus,
    );

  if (
    !mainEventStatus ||
    !PAYMENT_COMPATIBLE_MAIN_EVENT_STATUSES
      .has(mainEventStatus)
  ) {
    return "main_event_lifecycle_conflict";
  }

  return null;
}

export function canonicalPaymentLinkageReason(
  input: {
    paymentId: string;
    providerRequestId: string;
    mainEventId: string;
    customerId: string;
    providerId: string;
    payment:
      Readonly<Record<string, unknown>>;
    providerRequest:
      Readonly<Record<string, unknown>>;
    mainEvent:
      Readonly<Record<string, unknown>>;
  },
): string | null {
  const {
    paymentId,
    providerRequestId,
    mainEventId,
    customerId,
    providerId,
    payment,
    providerRequest,
    mainEvent,
  } = input;

  const requestLinkageReason =
    canonicalRequestLinkageReason({
      providerRequestId,
      mainEventId,
      customerId,
      providerId,
      providerRequest,
      mainEvent,
    });

  if (requestLinkageReason) {
    return requestLinkageReason;
  }

  if (
    paymentId !==
      paymentIdForProviderRequest(
        providerRequestId,
      ) ||
    payment.paymentId !== paymentId ||
    payment.providerRequestId !==
      providerRequestId ||
    payment.mainEventId !== mainEventId ||
    payment.bookingId !== mainEventId ||
    payment.customerId !== customerId ||
    payment.providerId !== providerId ||
    payment.paymentType !==
      "provider_down_payment" ||
    payment.gateway !== "paymongo" ||
    (
      providerRequest.paymentId !==
        undefined &&
      providerRequest.paymentId !== null &&
      providerRequest.paymentId !== paymentId
    )
  ) {
    return "canonical_linkage_mismatch";
  }

  const amountInCentavos =
    authoritativeAmountInCentavos(
      providerRequest.downPaymentAmount,
    );

  if (
    amountInCentavos === null ||
    payment.amountInCentavos !==
      amountInCentavos ||
    payment.amount !==
      providerRequest.downPaymentAmount
  ) {
    return "authoritative_amount_mismatch";
  }

  if (payment.currency !== PAYMENT_CURRENCY) {
    return "currency_mismatch";
  }

  return null;
}

export function canonicalRequestLinkageReason(
  input: {
    providerRequestId: string;
    mainEventId: string;
    customerId: string;
    providerId: string;
    providerRequest:
      Readonly<Record<string, unknown>>;
    mainEvent:
      Readonly<Record<string, unknown>>;
  },
): string | null {
  const {
    providerRequestId,
    mainEventId,
    customerId,
    providerId,
    providerRequest,
    mainEvent,
  } = input;

  if (
    providerRequest.providerRequestId !==
      providerRequestId ||
    providerRequest.mainEventId !==
      mainEventId ||
    providerRequest.bookingId !== mainEventId ||
    providerRequest.customerId !==
      customerId ||
    providerRequest.providerId !== providerId ||
    mainEvent.mainEventId !== mainEventId ||
    mainEvent.bookingId !== mainEventId ||
    mainEvent.customerId !== customerId ||
    !Array.isArray(
      mainEvent.providerRequestIds,
    ) ||
    !mainEvent.providerRequestIds.includes(
      providerRequestId,
    )
  ) {
    return "canonical_linkage_mismatch";
  }

  return null;
}

export function providerOperationalReason(
  providerId: string,
  provider:
    Readonly<Record<string, unknown>>,
  owner:
    Readonly<Record<string, unknown>>,
): string | null {
  return (
    isApprovedProviderForOperations(
      provider,
    ) &&
    isProviderOwnerAccountActive(
      providerId,
      owner,
    )
  )
    ? null
    : "provider_unavailable";
}

export function validStoredCheckoutReason(
  payment:
    Readonly<Record<string, unknown>>,
): string | null {
  const checkoutId =
    nonEmptyString(
      payment.paymongoCheckoutId,
    );

  const checkoutUrl =
    nonEmptyString(
      payment.checkoutUrl,
    );

  if (
    !checkoutId ||
    !checkoutId.startsWith("cs_") ||
    !checkoutUrl
  ) {
    return "checkout_session_missing";
  }

  try {
    const url = new URL(checkoutUrl);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (
        url.hostname !== "paymongo.com" &&
        !url.hostname.endsWith(
          ".paymongo.com",
        )
      )
    ) {
      return "checkout_url_invalid";
    }
  } catch {
    return "checkout_url_invalid";
  }

  return null;
}

function parsePaymentStatus(
  value: unknown,
): PaymentStatus | null {
  return PAYMENT_STATUSES.includes(
    value as PaymentStatus,
  )
    ? value as PaymentStatus
    : null;
}

function nonEmptyString(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim().length >= 3 &&
    value.length <= 500
    ? value.trim()
    : null;
}
