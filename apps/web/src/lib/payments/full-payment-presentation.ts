import type {CustomerPaymentChoice} from "@feasta/shared-types";

/**
 * Historical deposit terms stay visible when a frozen upfront amount is a
 * partial share of the recorded total. New full-payment records use the
 * complete amount and are presented as Full Payment.
 */
export function isHistoricalDepositTerms(input: {
  amount: number;
  upfrontAmount: number;
}): boolean {
  return input.amount > 0 &&
    input.upfrontAmount > 0 &&
    input.upfrontAmount < input.amount;
}

export function customerPaymentChoiceActionLabel(
  choice: CustomerPaymentChoice,
): string {
  switch (choice) {
    case "minimum":
      return "minimum";
    case "remaining_balance":
      return "remaining balance";
    case "full":
      return "full payment";
  }
}
