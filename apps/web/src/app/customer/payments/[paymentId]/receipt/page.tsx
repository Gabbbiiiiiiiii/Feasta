import type {
  Metadata,
} from "next";

import {
  notFound,
} from "next/navigation";

import {
  CustomerPaymentReceiptView,
} from "@/components/customer/payments/customer-payment-receipt";

import type {
  CustomerPaymentReceipt,
} from "@/lib/customer/payments/customer-payment-types";

import {
  getCustomerPaymentReceipt,
  isCustomerPaymentReceiptUnavailableError,
} from "@/lib/customer/payments/customer-payment-service";

export const metadata: Metadata = {
  title: "Payment Receipt | FEASTA",
};

export default async function CustomerPaymentReceiptPage({
  params,
}: {
  params: Promise<{
    paymentId: string;
  }>;
}) {
  const {paymentId} =
    await params;

  const receipt =
    await loadCustomerReceipt(
      paymentId,
    );

  return (
    <CustomerPaymentReceiptView
      receipt={receipt}
    />
  );
}

async function loadCustomerReceipt(
  paymentId: string,
): Promise<CustomerPaymentReceipt> {
  try {
    return await getCustomerPaymentReceipt(
      paymentId,
    );
  } catch (error: unknown) {
    if (
      isCustomerPaymentReceiptUnavailableError(
        error,
      )
    ) {
      notFound();
    }

    throw error;
  }
}