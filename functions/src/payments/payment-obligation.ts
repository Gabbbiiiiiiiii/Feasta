import {
  createHash,
} from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

export const CUSTOMER_PAYMENT_CHOICES = [
  "minimum",
  "full",
  "remaining_balance",
] as const;

export type CustomerPaymentChoice =
  (typeof CUSTOMER_PAYMENT_CHOICES)[number];

export type InitialPaymentChoice =
  | "minimum"
  | "full";

export type InitialPaymentSelectionReason =
  | "initial_payment_choice_locked"
  | "invalid_initial_payment_selection"
  | "existing_payment_without_initial_selection";

export type ProviderPaymentObligationKind =
  | "initial"
  | "balance";

/*
 * paymentType is currently a compatibility projection.
 *
 * Existing payment consumers understand:
 * - provider_down_payment
 * - provider_balance
 *
 * The new paymentChoice and obligationKey fields
 * distinguish minimum versus full initial payment.
 */
export type ProviderPaymentCompatibilityType =
  | "provider_down_payment"
  | "provider_balance";

export type ProviderPaymentObligationKey =
  | "initial_minimum"
  | "initial_full"
  | "remaining_balance";

export type ProviderPaymentObligation = {
  schemaVersion: 1;

  paymentChoice:
    CustomerPaymentChoice;

  obligationKey:
    ProviderPaymentObligationKey;

  obligationKind:
    ProviderPaymentObligationKind;

  paymentType:
    ProviderPaymentCompatibilityType;

  amountInCentavos: number;
};

type FinancialSnapshot = {
  schemaVersion: 1;

  currency: "PHP";

  grossAmountInCentavos: number;

  requiredUpfrontAmountInCentavos:
    number;

  remainingBalanceInCentavos:
    number;
};

export function parseCustomerPaymentChoice(
  value: unknown,
): CustomerPaymentChoice | null {
  return (
    CUSTOMER_PAYMENT_CHOICES as
      readonly unknown[]
  ).includes(value)
    ? value as CustomerPaymentChoice
    : null;
}

export function parseInitialPaymentChoice(
  value: unknown,
): InitialPaymentChoice | null {
  const parsed =
    parseCustomerPaymentChoice(
      value,
    );

  return parsed === "minimum" ||
    parsed === "full"
    ? parsed
    : null;
}

export function initialPaymentSelectionReason(
  input: {
    providerRequestId: string;

    providerRequest:
      Readonly<
        Record<string, unknown>
      >;

    paymentChoice:
      InitialPaymentChoice;
  },
): InitialPaymentSelectionReason | null {
  const storedChoiceValue =
    input.providerRequest
      .initialPaymentChoice;

  const storedInitialPaymentId =
    input.providerRequest
      .initialPaymentId;

  const currentPaymentId =
    input.providerRequest
      .paymentId;

  const choiceAbsent =
    storedChoiceValue ===
      undefined ||
    storedChoiceValue === null;

  const initialIdAbsent =
    storedInitialPaymentId ===
      undefined ||
    storedInitialPaymentId ===
      null;

  const currentIdAbsent =
    currentPaymentId ===
      undefined ||
    currentPaymentId === null;

  if (
    choiceAbsent &&
    initialIdAbsent
  ) {
    return currentIdAbsent
      ? null
      : "existing_payment_without_initial_selection";
  }

  if (
    choiceAbsent ||
    initialIdAbsent
  ) {
    return "invalid_initial_payment_selection";
  }

  const storedChoice =
    parseInitialPaymentChoice(
      storedChoiceValue,
    );

  if (
    !storedChoice ||
    typeof storedInitialPaymentId !==
      "string" ||
    typeof currentPaymentId !==
      "string"
  ) {
    return "invalid_initial_payment_selection";
  }

  const expectedStoredPaymentId =
    paymentIdForProviderRequestChoice(
      input.providerRequestId,
      storedChoice,
    );

  if (
    storedInitialPaymentId !==
      expectedStoredPaymentId ||
    currentPaymentId !==
      storedInitialPaymentId
  ) {
    return "invalid_initial_payment_selection";
  }

  return storedChoice ===
    input.paymentChoice
    ? null
    : "initial_payment_choice_locked";
}

export function paymentIdForProviderRequestChoice(
  providerRequestId: string,
  paymentChoice:
    CustomerPaymentChoice,
): string {
  const normalizedId =
    providerRequestId.trim();

  if (
    normalizedId.length < 8 ||
    normalizedId.length > 160
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The provider request identifier is invalid.",
    );
  }

  return `payment_${createHash("sha256")
    .update(
      [
        "provider-request",
        normalizedId,
        "payment-choice",
        paymentChoice,
        "v1",
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32)}`;
}

export function providerPaymentObligationForChoice(
  input: {
    financialSnapshot: unknown;

    paymentChoice:
      CustomerPaymentChoice;
  },
): ProviderPaymentObligation {
  const snapshot =
    parseFinancialSnapshot(
      input.financialSnapshot,
    );

  switch (input.paymentChoice) {
    case "minimum": {
      /*
       * Minimum is meaningful only when the
       * required initial payment is a proper
       * partial amount.
       *
       * A full-payment request should expose
       * "full", not two equivalent buttons.
       */
      if (
        snapshot
          .requiredUpfrontAmountInCentavos <=
          0 ||
        snapshot
          .requiredUpfrontAmountInCentavos >=
          snapshot
            .grossAmountInCentavos
      ) {
        throw unavailableChoice();
      }

      return {
        schemaVersion: 1,

        paymentChoice:
          "minimum",

        obligationKey:
          "initial_minimum",

        obligationKind:
          "initial",

        /*
         * Compatibility type only.
         * paymentChoice is authoritative for
         * minimum versus full.
         */
        paymentType:
          "provider_down_payment",

        amountInCentavos:
          snapshot
            .requiredUpfrontAmountInCentavos,
      };
    }

    case "full":
      return {
        schemaVersion: 1,

        paymentChoice:
          "full",

        obligationKey:
          "initial_full",

        obligationKind:
          "initial",

        /*
         * Keep the old payment type during the
         * migration. New consumers must inspect
         * paymentChoice / obligationKey.
         */
        paymentType:
          "provider_down_payment",

        amountInCentavos:
          snapshot
            .grossAmountInCentavos,
      };

    case "remaining_balance": {
      if (
        snapshot
          .remainingBalanceInCentavos <=
        0
      ) {
        throw unavailableChoice();
      }

      return {
        schemaVersion: 1,

        paymentChoice:
          "remaining_balance",

        obligationKey:
          "remaining_balance",

        obligationKind:
          "balance",

        paymentType:
          "provider_balance",

        amountInCentavos:
          snapshot
            .remainingBalanceInCentavos,
      };
    }
  }
}

function parseFinancialSnapshot(
  value: unknown,
): FinancialSnapshot {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidSnapshot();
  }

  const data =
    value as
      Record<string, unknown>;

  if (
    data.schemaVersion !== 1 ||
    data.currency !== "PHP"
  ) {
    throw invalidSnapshot();
  }

  const grossAmountInCentavos =
    positiveCentavos(
      data.grossAmountInCentavos,
    );

  const requiredUpfrontAmountInCentavos =
    nonNegativeCentavos(
      data
        .requiredUpfrontAmountInCentavos,
    );

  const remainingBalanceInCentavos =
    nonNegativeCentavos(
      data.remainingBalanceInCentavos,
    );

  if (
    requiredUpfrontAmountInCentavos >
      grossAmountInCentavos ||
    remainingBalanceInCentavos >
      grossAmountInCentavos ||
    requiredUpfrontAmountInCentavos +
      remainingBalanceInCentavos !==
      grossAmountInCentavos
  ) {
    throw invalidSnapshot();
  }

  return {
    schemaVersion: 1,
    currency: "PHP",

    grossAmountInCentavos,

    requiredUpfrontAmountInCentavos,

    remainingBalanceInCentavos,
  };
}

function positiveCentavos(
  value: unknown,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0
  ) {
    throw invalidSnapshot();
  }

  return value as number;
}

function nonNegativeCentavos(
  value: unknown,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0
  ) {
    throw invalidSnapshot();
  }

  return value as number;
}

function invalidSnapshot(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The provider-request financial snapshot is invalid.",
  );
}

function unavailableChoice(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The selected payment option is not available.",
  );
}
