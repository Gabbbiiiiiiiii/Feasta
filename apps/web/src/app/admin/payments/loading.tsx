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
        description="View customer payments, provider payouts, refunds, and payment issues."
      />

            <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Loading payment statistics"
      >
        <SummaryCard
          label="Currently paid amount"
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
          label="Failed provider payouts"
          loading
        />

        <SummaryCard
          label="Payments to review"
          loading
        />

        <SummaryCard
          label="Refunded amount"
          loading
        />
      </section>

            <LoadingSkeleton
        className="h-64 w-full rounded-card"
        label="Loading payment issues"
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