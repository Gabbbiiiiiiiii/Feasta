import {
  parseInitialPaymentChoice,
  paymentIdForProviderRequestChoice,
} from "./payment-obligation.js";
import {
  currentPaymentIdForProviderRequest,
} from "./payment-lifecycle.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type ProviderRequestPaymentReadPlan = {
  mode:
    "legacy" | "p5";

  paymentIds:
    readonly string[];

  initialPaymentId:
    string | null;

  remainingBalancePaymentId:
    string | null;

  currentPaymentId:
    string;
};

/**
 * Determines which payment documents must be read in order
 * to resolve the complete trusted payment state.
 *
 * P5 requests never derive history from paymentId alone.
 * paymentId is only the compatibility/current-attempt pointer.
 */
export function providerRequestPaymentReadPlan(
  providerRequestId:
    string,

  providerRequest:
    UnknownRecord,
): ProviderRequestPaymentReadPlan {
  const p5 =
    hasP5PaymentIdentity(
      providerRequest,
    );

  if (!p5) {
    const paymentId =
      currentPaymentIdForProviderRequest(
        providerRequestId,
        providerRequest,
      );

    if (!paymentId) {
      throw paymentSetInvalid();
    }

    return {
      mode:
        "legacy",

      paymentIds:
        [paymentId],

      initialPaymentId:
        null,

      remainingBalancePaymentId:
        null,

      currentPaymentId:
        paymentId,
    };
  }

  const initialChoice =
    parseInitialPaymentChoice(
      providerRequest
        .initialPaymentChoice,
    );

  if (!initialChoice) {
    throw paymentSetInvalid();
  }

  const expectedInitialPaymentId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      initialChoice,
    );

  if (
    providerRequest
      .initialPaymentId !==
      expectedInitialPaymentId
  ) {
    throw paymentSetInvalid();
  }

  const expectedBalancePaymentId =
    paymentIdForProviderRequestChoice(
      providerRequestId,
      "remaining_balance",
    );

  const storedBalancePaymentId =
    optionalPaymentId(
      providerRequest
        .remainingBalancePaymentId,
    );

  if (
    storedBalancePaymentId &&
    (
      initialChoice !== "minimum" ||
      storedBalancePaymentId !==
        expectedBalancePaymentId
    )
  ) {
    throw paymentSetInvalid();
  }

  const currentPaymentId =
    requiredPaymentId(
      providerRequest.paymentId,
    );

  if (
    currentPaymentId !==
      expectedInitialPaymentId &&
    currentPaymentId !==
      storedBalancePaymentId
  ) {
    throw paymentSetInvalid();
  }

  return {
    mode:
      "p5",

    paymentIds:
      storedBalancePaymentId
        ? [
            expectedInitialPaymentId,
            storedBalancePaymentId,
          ]
        : [
            expectedInitialPaymentId,
          ],

    initialPaymentId:
      expectedInitialPaymentId,

    remainingBalancePaymentId:
      storedBalancePaymentId,

    currentPaymentId,
  };
}

export function providerRequestInitialPaymentId(
  providerRequestId:
    string,

  providerRequest:
    UnknownRecord,
): string {
  const plan =
    providerRequestPaymentReadPlan(
      providerRequestId,
      providerRequest,
    );

  return plan.initialPaymentId ??
    plan.currentPaymentId;
}

function hasP5PaymentIdentity(
  providerRequest:
    UnknownRecord,
): boolean {
  return (
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
      undefined
  );
}

function optionalPaymentId(
  value:
    unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return requiredPaymentId(
    value,
  );
}

function requiredPaymentId(
  value:
    unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^payment_[a-f0-9]{32}$/u
      .test(value)
  ) {
    throw paymentSetInvalid();
  }

  return value;
}

function paymentSetInvalid(): Error {
  return new Error(
    "The provider-request payment set is invalid.",
  );
}
