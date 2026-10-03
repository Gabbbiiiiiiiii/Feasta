import {
  TableLoadingSkeleton,
} from "@/components/feedback/application-states";
import {
  LoadingSkeleton,
} from "@/components/feedback/loading";
import {
  SummaryCard,
} from "@/components/data/summary-card";

export default function AdminBookingsLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      aria-label="Loading Booking Monitoring"
      aria-busy="true"
    >
      <header className="grid gap-3 border-b border-border pb-6">
        <LoadingSkeleton
          className="h-4 w-32"
          label="Loading page category"
        />

        <LoadingSkeleton
          className="h-10 w-full max-w-md"
          label="Loading page title"
        />

        <LoadingSkeleton
          className="h-5 w-full max-w-2xl"
          label="Loading page description"
        />
      </header>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading booking statistics"
      >
        <SummaryCard
          label="Total bookings"
          loading
        />

        <SummaryCard
          label="Pending approval"
          loading
        />

        <SummaryCard
          label="Waiting for payment"
          loading
        />

        <SummaryCard
          label="Confirmed revenue"
          loading
        />
      </section>

      <section className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
        <LoadingSkeleton
          className="h-14 w-full"
          label="Loading booking search"
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LoadingSkeleton
            className="h-14 w-full"
            label="Loading booking status filter"
          />

          <LoadingSkeleton
            className="h-14 w-full"
            label="Loading payment status filter"
          />

          <LoadingSkeleton
            className="h-14 w-full"
            label="Loading event date filter"
          />
        </div>
      </section>

      <TableLoadingSkeleton
        caption="Loading Booking Monitoring records"
      />
    </div>
  );
}