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
        description="Monitor customer payments, refunds, and provider payouts."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading payment statistics"
      >
        <SummaryCard label="Net customer payments" loading />
        <SummaryCard label="Pending payments" loading />
        <SummaryCard label="Failed payments" loading />
        <SummaryCard label="Refunded amount" loading />
      </section>

      <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
        <div className="flex gap-6 border-b border-border px-5 py-3">
          <LoadingSkeleton
            className="h-6 w-36"
            label="Loading Customer payments tab"
          />
          <LoadingSkeleton
            className="h-6 w-36"
            label="Loading Provider payouts tab"
          />
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          <LoadingSkeleton
            className="h-28 w-full rounded-xl"
            label="Loading payment filters"
          />

          <TableLoadingSkeleton
            caption="Loading payment monitoring records"
          />
        </div>
      </div>
    </div>
  );
}
