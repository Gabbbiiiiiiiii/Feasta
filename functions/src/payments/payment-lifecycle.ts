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

import {
  parseCustomerPaymentChoice,
  paymentIdForProviderRequestChoice,
  providerPaymentObligationForChoice,
  type CustomerPaymentChoice,
} from "./payment-obligation.js";

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

export function currentPaymentIdForProviderRequest(
  providerRequestId: string,
  providerRequest:
    Readonly<Record<string, unknown>>,
): string | null {
  const storedPaymentId =
    providerRequest.paymentId;

  /*
   * Historical provider requests did not have
   * a trusted payment pointer before checkout.
   *
   * Preserve their deterministic legacy ID.
   */
  if (
    storedPaymentId === undefined ||
    storedPaymentId === null
  ) {
    return paymentIdForProviderRequest(
      providerRequestId,
    );
  }

  if (
    typeof storedPaymentId !== "string"
  ) {
    return null;
  }

  const normalized =
    storedPaymentId.trim();

  /*
   * Both legacy and P5 payment IDs use the
   * payment_<32 hex characters> format.
   */
  if (
    !/^payment_[a-f0-9]{32}$/u.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
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
    paymentChoice?: CustomerPaymentChoice;
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

  if ((input.payment?.paymentChoice ?? input.paymentChoice) === "remaining_balance") {
    if (mainEventStatus !== "confirmed") return "main_event_not_payment_eligible";
    if (requestStatus !== "confirmed") return "provider_request_not_payment_eligible";
    if (!input.payment) return null;
    const status = parsePaymentStatus(input.payment.status);
    return status && CHECKOUT_PAYMENT_STATUSES.has(status)
      ? null : "payment_not_checkout_eligible";
  }

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
    paymentChoice?: unknown;
  },
): string | null {
  if (input.nextPaymentStatus === "refunded") {
    return null;
  }

  const requestStatus =
    parseProviderRequestStatus(
      input.providerRequestStatus,
    );

  const paymentChoice =
    parseCustomerPaymentChoice(
      input.paymentChoice,
    );

  /*
   * A remaining-balance payment belongs to an already
   * confirmed provider request.
   *
   * Its webhook may change financial settlement state,
   * but must never move the booking back into the
   * initial down-payment lifecycle.
   */
  if (
    paymentChoice ===
      "remaining_balance"
  ) {
    if (
      requestStatus !==
      "confirmed"
    ) {
      return "provider_request_lifecycle_conflict";
    }

    const balanceMainEventStatus =
      parseMainEventStatus(
        input.mainEventStatus,
      );

    if (
      balanceMainEventStatus !==
        "confirmed"
    ) {
      return "main_event_lifecycle_conflict";
    }

    return null;
  }

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

  const hasP5PaymentIdentity =
    payment.paymentChoice !== undefined ||
    payment.obligationKey !== undefined ||
    payment.obligationKind !== undefined;

  let expectedPaymentId: string;
  let expectedPaymentType: string;
  let expectedAmountInCentavos: number;
  let expectedAmount: number;

  if (hasP5PaymentIdentity) {
    const paymentChoice =
      parseCustomerPaymentChoice(
        payment.paymentChoice,
      );

    if (!paymentChoice) {
      return "canonical_linkage_mismatch";
    }

    let obligation:

      ReturnType<
        typeof providerPaymentObligationForChoice
      >;

    try {
      obligation =
        providerPaymentObligationForChoice(
          {
            financialSnapshot:
              providerRequest
                .financialSnapshot,

            paymentChoice,
          },
        );
    } catch {
      return "authoritative_amount_mismatch";
    }

    expectedPaymentId =
      paymentIdForProviderRequestChoice(
        providerRequestId,
        paymentChoice,
      );

    expectedPaymentType =
      obligation.paymentType;

    expectedAmountInCentavos =
      obligation.amountInCentavos;

    expectedAmount =
      obligation.amountInCentavos /
      100;

    if (
      payment.paymentChoice !==
        paymentChoice ||
      payment.obligationKey !==
        obligation.obligationKey ||
      payment.obligationKind !==
        obligation.obligationKind
    ) {
      return "canonical_linkage_mismatch";
    }

    /*
     * New P5 requests persist immutable payment-history identity.
     *
     * Older P5 records may predate those fields, so generic
     * payment linkage must continue validating their server-issued
     * obligation identity from the immutable financial snapshot.
     *
     * Once any new history field is present, however, the complete
     * immutable selection must be coherent.
     */
    const hasImmutableP5PaymentHistory =
      providerRequest
        .initialPaymentChoice !==
        undefined ||
      providerRequest
        .initialPaymentId !==
        undefined ||
      providerRequest
        .remainingBalancePaymentId !==
        undefined ||
      providerRequest
        .settlementSchemaVersion !==
        undefined;

    if (hasImmutableP5PaymentHistory) {
      const initialChoiceForP5 =
        parseCustomerPaymentChoice(
          providerRequest
            .initialPaymentChoice,
        );

      if (
        initialChoiceForP5 !==
          "minimum" &&
        initialChoiceForP5 !==
          "full"
      ) {
        return "canonical_linkage_mismatch";
      }

      const expectedInitialPaymentIdForP5 =
        paymentIdForProviderRequestChoice(
          providerRequestId,
          initialChoiceForP5,
        );

      const expectedBalancePaymentIdForP5 =
        paymentIdForProviderRequestChoice(
          providerRequestId,
          "remaining_balance",
        );

      if (
        providerRequest
          .initialPaymentId !==
          expectedInitialPaymentIdForP5
      ) {
        return "canonical_linkage_mismatch";
      }

      const storedBalancePaymentIdForP5 =
        providerRequest
          .remainingBalancePaymentId;

      if (
        storedBalancePaymentIdForP5 !==
          undefined &&
        storedBalancePaymentIdForP5 !==
          null &&
        (
          initialChoiceForP5 !==
            "minimum" ||
          storedBalancePaymentIdForP5 !==
            expectedBalancePaymentIdForP5
        )
      ) {
        return "canonical_linkage_mismatch";
      }

      if (
        paymentChoice ===
          "remaining_balance"
      ) {
        if (
          initialChoiceForP5 !==
            "minimum" ||
          storedBalancePaymentIdForP5 !==
            expectedPaymentId
        ) {
          return "canonical_linkage_mismatch";
        }
      }
      else if (
        paymentChoice !==
          initialChoiceForP5 ||
        expectedPaymentId !==
          expectedInitialPaymentIdForP5
      ) {
        return "canonical_linkage_mismatch";
      }

      /*
       * paymentId may point to either the immutable initial
       * obligation or the later balance obligation.
       */
      const storedCurrentPaymentIdForP5 =
        providerRequest.paymentId;

      if (
        typeof storedCurrentPaymentIdForP5 !==
          "string" ||
        (
          storedCurrentPaymentIdForP5 !==
            expectedInitialPaymentIdForP5 &&
          storedCurrentPaymentIdForP5 !==
            storedBalancePaymentIdForP5
        )
      ) {
        return "canonical_linkage_mismatch";
      }
    }
  } else {
    expectedPaymentId =
      paymentIdForProviderRequest(
        providerRequestId,
      );

    expectedPaymentType =
      "provider_down_payment";

    const legacyAmountInCentavos =
      authoritativeAmountInCentavos(
        providerRequest
          .downPaymentAmount,
      );

    if (
      legacyAmountInCentavos ===
      null
    ) {
      return "authoritative_amount_mismatch";
    }

    expectedAmountInCentavos =
      legacyAmountInCentavos;

    if (
      typeof providerRequest
        .downPaymentAmount !==
      "number"
    ) {
      return "authoritative_amount_mismatch";
    }

    expectedAmount =
      providerRequest
        .downPaymentAmount;
  }

  if (
    paymentId !==
      expectedPaymentId ||
    payment.paymentId !==
      paymentId ||
    payment.providerRequestId !==
      providerRequestId ||
    payment.mainEventId !==
      mainEventId ||
    payment.bookingId !==
      mainEventId ||
    payment.customerId !==
      customerId ||
    payment.providerId !==
      providerId ||
    payment.paymentType !==
      expectedPaymentType ||
    payment.gateway !==
      "paymongo" ||
    (
      !hasP5PaymentIdentity &&
      providerRequest.paymentId !==
        undefined &&
      providerRequest.paymentId !==
        null &&
      providerRequest.paymentId !==
        paymentId
    )
  ) {
    return "canonical_linkage_mismatch";
  }

  if (
    payment.amountInCentavos !==
      expectedAmountInCentavos ||
    payment.amount !==
      expectedAmount
  ) {
    return "authoritative_amount_mismatch";
  }

  if (
    payment.currency !==
      PAYMENT_CURRENCY
  ) {
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
