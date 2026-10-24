import type {CustomerPaymentChoice} from "@feasta/shared-types";

/** A partial upfront amount can include a package deposit and full-upfront add-ons. */
export function hasPartialUpfrontPayment(input: {
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
      return "minimum payment";
    case "remaining_balance":
      return "remaining balance";
    case "full":
      return "full payment";
  }
}
