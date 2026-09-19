import {getProviderPaymentPage} from "@/lib/provider/payments/provider-payment-service";
import type {ProviderPaymentFilter} from "@/lib/provider/payments/provider-payment-types";

import {ProviderPaymentsClient} from "./provider-payments-client";

type ProviderPaymentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const paymentFilters: readonly ProviderPaymentFilter[] = [
  "all",
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
  "refunded",
];

export default async function ProviderPaymentsPage({
  searchParams,
}: ProviderPaymentsPageProps) {
  const values = await searchParams;
  const requestedStatus = Array.isArray(values.status)
    ? values.status[0]
    : values.status;
  const status = paymentFilters.includes(
    requestedStatus as ProviderPaymentFilter,
  )
    ? requestedStatus as ProviderPaymentFilter
    : "all";
  const initialFilters = {
    status,
    pageSize: 10,
    cursor: null,
  } as const;
  const initialPage = await getProviderPaymentPage(initialFilters);

  return (
    <ProviderPaymentsClient
      initialFilters={initialFilters}
      initialPage={initialPage}
    />
  );
}
