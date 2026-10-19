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
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const search = query.toString();
  await requireCustomer({
    returnTo: `/customer/payments${search ? `?${search}` : ""}`,
  });

  const paymentReturnKind = parsePaymentReturnKind(
    params.payment,
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
