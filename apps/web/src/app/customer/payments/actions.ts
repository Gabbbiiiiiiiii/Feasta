"use server";

import {
  getCustomerPaymentPage,
  getCustomerPaymentReceipt,
  getCustomerPaymentReturnDetails,
  isCustomerPaymentReceiptUnavailableError,
  isCustomerPaymentReturnUnavailableError,
} from "@/lib/customer/payments/customer-payment-service";
import type {
  CustomerPaymentFilters,
  CustomerPaymentPage,
  CustomerPaymentReceiptLoadResult,
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
export async function loadCustomerPaymentReceiptAction(
  paymentId: string,
): Promise<CustomerPaymentReceiptLoadResult> {
  await requireCustomer();

  try {
    return {
      status: "ready",

      receipt:
        await getCustomerPaymentReceipt(
          paymentId,
        ),
    };
  } catch (error: unknown) {
    if (
      isCustomerPaymentReceiptUnavailableError(
        error,
      )
    ) {
      return {
        status:
          "unavailable",
      };
    }

    throw error;
  }
}
