import {SummaryCard} from "@/components/data/summary-card";
import {TableLoadingSkeleton} from "@/components/feedback/application-states";
import {LoadingSkeleton} from "@/components/feedback/loading";

export default function CustomerBookingsLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      aria-label="Loading customer bookings"
      aria-busy="true"
    >
      <header className="grid gap-3 border-b border-border pb-6">
        <LoadingSkeleton className="h-4 w-36" label="Loading page category" />
        <LoadingSkeleton className="h-10 w-full max-w-sm" label="Loading page title" />
        <LoadingSkeleton className="h-5 w-full max-w-2xl" label="Loading page description" />
      </header>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading booking summary"
      >
        <SummaryCard label="Total bookings" loading />
        <SummaryCard label="Upcoming events" loading />
        <SummaryCard label="Awaiting providers" loading />
        <SummaryCard label="Awaiting payment" loading />
      </section>

      <section className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
        <LoadingSkeleton className="h-14 w-full" label="Loading booking search" />
        <LoadingSkeleton className="h-14 w-full max-w-sm" label="Loading booking status filter" />
      </section>

      <TableLoadingSkeleton caption="customer booking history" />
    </div>
  );
}
