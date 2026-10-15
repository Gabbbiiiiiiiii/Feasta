export type ProviderRequestPaymentPolicy =
  | "full_payment"
  | "deposit_then_balance";

export function providerRequestAcceptanceDescription(input: {
  paymentPolicy: ProviderRequestPaymentPolicy | null;
  amount: number;
  downPaymentAmount: number;
}): string {
  if (input.paymentPolicy === "deposit_then_balance") {
    return "The customer will be asked to complete the required down payment after you accept.";
  }

  if (input.paymentPolicy === "full_payment") {
    return "The customer will be asked to pay the full amount after you accept.";
  }

  if (
    input.downPaymentAmount > 0 &&
    input.downPaymentAmount < input.amount
  ) {
    return "The customer will be asked to complete the required down payment after you accept.";
  }

  if (input.downPaymentAmount > 0) {
    return "The customer will be asked to pay the full amount after you accept.";
  }

  return "This request will be confirmed after you accept it.";
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
