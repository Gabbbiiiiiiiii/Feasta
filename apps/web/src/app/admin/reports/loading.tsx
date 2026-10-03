import {
  SummaryCard,
} from "@/components/data/summary-card";
import {
  LoadingSkeleton,
} from "@/components/feedback/loading";
import {
  PageHeading,
} from "@/components/layout/page-heading";

export default function AdminReportsLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Reports and Insights"
        description="Review booking activity, provider participation, and provider-associated payment volume using bounded operational data."
      />
      <LoadingSkeleton
        className="h-48 w-full rounded-card"
        label="Loading report controls"
      />
      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading executive report metrics"
      >
        {[
          "Total bookings",
          "Confirmed bookings",
          "Completed events",
          "Cancellation rate",
          "Active customers",
          "Active providers",
          "Confirmed payment volume",
          "Average paid payment",
        ].map((label) => (
          <SummaryCard key={label} label={label} loading />
        ))}
      </section>
    </div>
  );
}