import {SummaryCard} from "@/components/data/summary-card";
import {TableLoadingSkeleton} from "@/components/feedback/application-states";
import {LoadingSkeleton} from "@/components/feedback/loading";
import {PageHeading} from "@/components/layout/page-heading";

export default function CustomerPaymentsLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="My payments"
        title="Payments"
        description="Review your booking payments and securely continue an eligible checkout."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading payment summary">
        <SummaryCard label="Awaiting payment" loading />
        <SummaryCard label="Processing" loading />
        <SummaryCard label="Paid" loading />
        <SummaryCard label="Total paid" loading />
      </section>
      <LoadingSkeleton className="h-40 w-full rounded-card" label="Loading payment filters" />
      <TableLoadingSkeleton caption="customer payments" />
    </div>
  );
}