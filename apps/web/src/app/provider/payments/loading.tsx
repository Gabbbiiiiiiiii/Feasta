import {PageHeading} from "@/components/layout/page-heading";

export default function ProviderPaymentsLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <PageHeading
        eyebrow="Provider finance"
        title="Booking Payments"
        description="Track customer payments associated with your FEASTA booking requests."
      />

      <p className="sr-only" role="status">Loading booking payments</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {["Paid", "Processing", "Failed", "Refunded"].map((label) => (
          <section
            key={label}
            className="min-h-32 animate-pulse rounded-card border border-border bg-card p-5 shadow-card motion-reduce:animate-none"
          >
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="mt-4 h-8 w-28 rounded bg-muted" />
          </section>
        ))}
      </div>

      <section
        className="min-h-72 animate-pulse rounded-card border border-border bg-card p-5 shadow-card motion-reduce:animate-none"
        aria-hidden="true"
      >
        <div className="h-10 w-full rounded bg-muted" />
        <div className="mt-4 h-52 w-full rounded bg-muted" />
      </section>
    </div>
  );
}
