"use server";

import {
  getProviderPayment,
  getProviderPaymentPage,
} from "@/lib/provider/payments/provider-payment-service";
import type {
  ProviderPaymentDetail,
  ProviderPaymentFilters,
  ProviderPaymentPage,
} from "@/lib/provider/payments/provider-payment-types";

export async function loadProviderPaymentsAction(
  filters: ProviderPaymentFilters,
): Promise<ProviderPaymentPage> {
  return await getProviderPaymentPage(filters);
}

export async function loadProviderPaymentAction(
  paymentId: string,
): Promise<ProviderPaymentDetail> {
  return await getProviderPayment(paymentId);
}
