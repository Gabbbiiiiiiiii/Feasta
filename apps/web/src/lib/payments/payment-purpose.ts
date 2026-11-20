import type {CustomerPaymentChoice, PaymentType} from "@feasta/shared-types";

/** Only explicit payment-record evidence identifies a full initial payment. */
export function formatPaymentPurpose(payment: {
  paymentType: PaymentType;
  paymentChoice?: CustomerPaymentChoice | null;
}): string {
  if (payment.paymentType === "provider_down_payment" && payment.paymentChoice === "full") {
    return "Full payment";
  }
  return {
    provider_down_payment: "Down payment",
    provider_balance: "Remaining balance",
    refund: "Refund",
    adjustment: "Payment adjustment",
  }[payment.paymentType];
}
