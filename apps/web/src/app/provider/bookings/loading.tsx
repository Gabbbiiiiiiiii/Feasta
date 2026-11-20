import {LoadingSkeleton} from "@/components/feedback/loading";
import {PageHeading} from "@/components/layout/page-heading";

const bookingTabs = [
  "Active events",
  "Waiting for Payment",
  "Past Bookings",
  "All Bookings",
];

const tableColumns = [
  "Customer",
  "Event",
  "Date & Time",
  "Payment",
  "Status",
  "Action",
];

export default function ProviderBookingsLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      role="status"
      aria-label="Loading provider bookings"
      aria-busy="true"
    >
      <PageHeading
        title="My Bookings"
        description="View your active events, payments, and past bookings."
      />

      <div
        aria-hidden="true"
        className="grid min-w-0 gap-6"
      >
        <section className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="flex min-w-0 gap-3">
            <LoadingSkeleton className="h-14 min-w-0 flex-1 rounded-xl" />
            <LoadingSkeleton className="h-14 w-24 shrink-0 rounded-xl" />
          </div>

          <LoadingSkeleton className="h-3 w-full max-w-[33rem]" />

          <div className="flex items-center justify-between gap-3">
            <LoadingSkeleton className="h-4 w-32" />
            <LoadingSkeleton className="h-11 w-28 rounded-xl" />
          </div>
        </section>

        <section className="rounded-card border border-border bg-card p-3 shadow-card">
          <div className="flex flex-wrap gap-2">
            {bookingTabs.map((tab, index) => (
              <div
                key={tab}
                className="rounded-xl border border-border p-1"
              >
                <LoadingSkeleton
                  className={
                    index === 1
                      ? "h-10 w-36 max-w-full"
                      : "h-10 w-24 max-w-full"
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <LoadingSkeleton className="h-4 w-full max-w-[44rem]" />

        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-6 gap-4 border-b border-border bg-muted/50 px-4 py-4">
                {tableColumns.map((column) => (
                  <span
                    key={column}
                    className="text-sm font-semibold text-foreground"
                  >
                    {column}
                  </span>
                ))}
              </div>

              {Array.from({length: 3}, (_, row) => (
                <div
                  key={row}
                  className="grid grid-cols-6 items-center gap-4 border-b border-border/70 px-4 py-5 last:border-b-0"
                >
                  <LoadingSkeleton className="h-5 w-4/5" />
                  <LoadingSkeleton className="h-5 w-3/4" />
                  <div className="grid gap-2">
                    <LoadingSkeleton className="h-4 w-4/5" />
                    <LoadingSkeleton className="h-3 w-1/2" />
                  </div>
                  <LoadingSkeleton className="h-7 w-full rounded-full" />
                  <LoadingSkeleton className="h-7 w-full rounded-full" />
                  <LoadingSkeleton className="h-5 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          <LoadingSkeleton className="h-4 w-16" />
          <div className="flex gap-2">
            <LoadingSkeleton className="h-12 w-28 rounded-xl" />
            <LoadingSkeleton className="h-12 w-20 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
