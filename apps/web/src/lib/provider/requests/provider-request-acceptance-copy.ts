import {unavailableProviderInitialPayment, type ProviderInitialPaymentPresentation} from "./provider-request-payment-presentation";

export type ProviderRequestPaymentPolicy =
  | "full_payment"
  | "deposit_then_balance";

export function providerRequestAcceptanceDescription(input: {
  initialPaymentPresentation?: ProviderInitialPaymentPresentation;
  paymentPolicy: ProviderRequestPaymentPolicy | null;
  amount: number;
  downPaymentAmount: number;
}): string {
  const payment = input.initialPaymentPresentation ?? unavailableProviderInitialPayment;
  if (payment.kind === "full") {
    return "The customer will be asked to pay the full amount after you accept. " + payment.explanation;
  }
  if (payment.kind === "minimum") {
    return "After you accept, the customer may choose the minimum deposit or full payment.";
  }
  return payment.explanation;

}

export class ProviderRequestActionError extends Error {
  readonly payoutSetupRequired: boolean;

  constructor(
    message: string,
    payoutSetupRequired = false,
  ) {
    super(message);
    this.name = "ProviderRequestActionError";
    this.payoutSetupRequired = payoutSetupRequired;
  }
}

export function providerRequestPreconditionError(
  message: string,
  reason: string | null,
): ProviderRequestActionError {
  if (
    isPayoutSetupAcceptanceReason(reason) ||
    message.includes("Complete payout setup")
  ) {
    return new ProviderRequestActionError(
      PAYOUT_SETUP_ACCEPTANCE_MESSAGE,
      true,
    );
  }

  return new ProviderRequestActionError(
    message ||
      "This request can no longer be changed.",
  );
}

export const PAYOUT_SETUP_ACCEPTANCE_MESSAGE =
  "Set up your payout account before accepting paid bookings.";

const PAYOUT_SETUP_REASONS = new Set([
  "payout_setup_not_ready",
  "payout_setup_missing",
  "payout_setup_invalid",
]);

export function isPayoutSetupAcceptanceReason(
  reason: string | null,
): boolean {
  return reason !== null && PAYOUT_SETUP_REASONS.has(reason);
}
