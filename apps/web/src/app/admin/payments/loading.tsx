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
        description="Monitor booking payments, PayMongo activity, transaction issues, and refund eligibility."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading payment statistics"
      >
        <SummaryCard
          label="Confirmed Payment Volume"
          loading
        />

        <SummaryCard
          label="Pending / Processing"
          loading
        />

        <SummaryCard
          label="Failed / Expired"
          loading
        />

        <SummaryCard
          label="Refunded Amount"
          loading
        />
      </section>

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