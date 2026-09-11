import {PageHeading} from "@/components/layout/page-heading";

export default function ProviderAvailabilityLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <PageHeading
        title="Availability & Scheduling"
        description="Control when your business can accept event bookings and configure your booking capacity."
      />

      <p className="sr-only" role="status">
        Loading availability settings
      </p>

      <div
        className="grid min-w-0 gap-5 lg:grid-cols-2"
        aria-hidden="true"
      >
        {["Operating days", "Lead time", "Daily capacity", "Event capacity"]
          .map((label) => (
            <section
              key={label}
              className="min-h-56 animate-pulse rounded-card border border-border bg-card p-5 shadow-card motion-reduce:animate-none sm:p-6"
            >
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="mt-3 h-4 w-3/4 rounded bg-muted" />
            </section>
          ))}
      </div>
    </div>
  );
}
