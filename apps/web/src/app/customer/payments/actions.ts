"use server";

import {
  getCustomerPaymentPage,
} from "@/lib/customer/payments/customer-payment-service";
import type {
  CustomerPaymentFilters,
  CustomerPaymentPage,
} from "@/lib/customer/payments/customer-payment-types";
import {
  requireCustomer,
} from "@/lib/auth/session";

export async function loadCustomerPaymentsAction(
  filters: CustomerPaymentFilters,
): Promise<CustomerPaymentPage> {
  await requireCustomer();

  return getCustomerPaymentPage(filters);
}