import {
  TableLoadingSkeleton,
} from "@/components/feedback/application-states";
import {
  LoadingSkeleton,
} from "@/components/feedback/loading";
import {
  SummaryCard,
} from "@/components/data/summary-card";
import {
  PageHeading,
} from "@/components/layout/page-heading";

export default function AdminPaymentsLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Payments"
        description="View payments, refunds, and provider payouts."
      />

            <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading payment statistics"
      >
        <SummaryCard
          label="Paid amount"
          supportingMetric="Amount retained after completed refunds"
          loading
        />

        <SummaryCard
          label="Pending payments"
          loading
        />

        <SummaryCard
          label="Failed payments"
          loading
        />



        <SummaryCard
          label="Refunded amount"
          loading
        />
      </section>

            <LoadingSkeleton
        className="h-64 w-full rounded-card"
        label="Loading provider payout issues"
      />

<LoadingSkeleton
        className="h-44 w-full rounded-card"
        label="Loading payment filters"
      />

      <TableLoadingSkeleton
        caption="Loading payment monitoring records"
      />
    </div>
  );
}
