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
        title="Payment Monitoring"
        description="Monitor Customer payments, Provider payout health, reconciliation cases, transaction issues, and refund eligibility."
      />

            <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Loading payment statistics"
      >
        <SummaryCard
          label="Customer collected"
          loading
        />

        <SummaryCard
          label="Pending / Processing"
          loading
        />

        <SummaryCard
          label="Failed payments"
          loading
        />

        <SummaryCard
          label="Failed payouts"
          loading
        />

        <SummaryCard
          label="Reconciliation cases"
          loading
        />

        <SummaryCard
          label="Refunded amount"
          loading
        />
      </section>

            <LoadingSkeleton
        className="h-64 w-full rounded-card"
        label="Loading finance attention"
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