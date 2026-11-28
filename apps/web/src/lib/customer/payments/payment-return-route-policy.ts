import {isSafeRelativeReturnTo} from "@/lib/security/policy";

// Proxy strips the incoming copy before generating this request-only header.
export const CUSTOMER_PAYMENT_RETURN_HEADER = "x-feasta-customer-payment-return";

export function isCustomerPaymentReturnPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1024 ||
    value.includes("#") || /[\u0000-\u001F\u007F]/u.test(value) ||
    !isSafeRelativeReturnTo(value)) return false;
  const queryIndex = value.indexOf("?");
  if (queryIndex === -1 || value.slice(0, queryIndex) !== "/customer/payments") return false;
  const query = new URLSearchParams(value.slice(queryIndex + 1));
  const kinds = query.getAll("payment");
  return kinds.length === 1 && ["success", "cancelled", "canceled"].includes(kinds[0]);
}
