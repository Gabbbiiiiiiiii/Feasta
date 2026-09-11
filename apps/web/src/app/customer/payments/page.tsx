import {CustomerPaymentsClient} from "@/components/customer/payments/customer-payments-client";
import {getCustomerPaymentPage} from "@/lib/customer/payments/customer-payment-service";
import type {CustomerPaymentReturnKind} from "@/lib/customer/payments/customer-payment-types";
import {requireCustomer} from "@/lib/auth/session";

export default async function CustomerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  await requireCustomer();

  const paymentReturnKind = parsePaymentReturnKind(
    (await searchParams).payment,
  );

  const initialPage = await getCustomerPaymentPage({
    search: "",
    status: "all",
    pageSize: 10,
    cursor: null,
  });

  return (
    <CustomerPaymentsClient
      initialPage={initialPage}
      paymentReturnKind={paymentReturnKind}
    />
  );
}

function parsePaymentReturnKind(
  value: string | string[] | undefined,
): CustomerPaymentReturnKind | null {
  if (value === undefined) return null;
  if (value === "success") return "success";
  if (
    value === "cancelled" ||
    value === "canceled"
  ) {
    return "cancelled";
  }

  return "invalid";
}
