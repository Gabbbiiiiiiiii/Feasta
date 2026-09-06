"use server";

import {
  getCustomerPaymentPage,
  getCustomerPaymentReturnDetails,
  isCustomerPaymentReturnUnavailableError,
} from "@/lib/customer/payments/customer-payment-service";
import type {
  CustomerPaymentFilters,
  CustomerPaymentPage,
  CustomerPaymentReturnLoadResult,
  CustomerPaymentReturnLookup,
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

export async function loadCustomerPaymentReturnAction(
  lookup: CustomerPaymentReturnLookup,
): Promise<CustomerPaymentReturnLoadResult> {
  await requireCustomer();

  try {
    return {
      status: "ready",
      payment:
        await getCustomerPaymentReturnDetails(lookup),
    };
  } catch (error: unknown) {
    if (
      isCustomerPaymentReturnUnavailableError(
        error,
      )
    ) {
      return {status: "unavailable"};
    }

    throw error;
  }
}
