"use server";

import {
  getProviderFinanceOverview,
} from "@/lib/provider/payments/provider-finance-service";
import type {
  ProviderFinanceOverview,
} from "@/lib/provider/payments/provider-finance-types";

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

export async function loadProviderFinanceOverviewAction():
Promise<ProviderFinanceOverview> {
  return await getProviderFinanceOverview();
}