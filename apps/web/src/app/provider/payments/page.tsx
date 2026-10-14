import {getProviderFinanceOverview} from "@/lib/provider/payments/provider-finance-service";
import {getProviderPaymentPage} from "@/lib/provider/payments/provider-payment-service";
import type {ProviderPaymentFilter} from "@/lib/provider/payments/provider-payment-types";

import {ProviderPaymentsClient} from "./provider-payments-client";
import Link from "next/link";
import {Button} from "@/components/ui/button";

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
  const [
    initialPage,
    initialFinance,
  ] = await Promise.all([
    getProviderPaymentPage(initialFilters),
    getProviderFinanceOverview(),
  ]);

  return (
    <div className="grid gap-6">
      <nav aria-label="Payment settings" className="flex flex-wrap gap-2">
        {[["Refund Policy", "/provider/refund-policy"], ["Tax Profile", "/provider/tax-profile"], ["Financial Statements", "/provider/payments/statements"]].map(([label, href]) =>
          <Button key={href} asChild variant="secondary" size="compact"><Link href={href}>{label}</Link></Button>)}
      </nav>
    <ProviderPaymentsClient
      initialFilters={initialFilters}
      initialPage={initialPage}
      initialFinance={initialFinance}
    />
    </div>
  );
}
