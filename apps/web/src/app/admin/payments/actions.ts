"use server";

import {
  getAdminPaymentDetails,
  getAdminPaymentPage,
} from "@/lib/admin/payments/admin-payment-service";
import type {
  AdminPaymentDetailsResult,
  AdminPaymentFilters,
  AdminPaymentPage,
} from "@/lib/admin/payments/admin-payment-types";

export async function loadAdminPaymentsAction(
  filters: AdminPaymentFilters,
): Promise<AdminPaymentPage> {
  return getAdminPaymentPage(filters);
}

export async function loadAdminPaymentDetailsAction(
  paymentId: string,
): Promise<AdminPaymentDetailsResult> {
  return getAdminPaymentDetails(paymentId);
}