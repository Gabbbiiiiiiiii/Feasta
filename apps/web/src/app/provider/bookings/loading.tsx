import {TableLoadingSkeleton} from "@/components/feedback/application-states";
import {PageHeading} from "@/components/layout/page-heading";
import {SummaryCard} from "@/components/data";

export default function ProviderBookingsLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <PageHeading
        title="Bookings"
        description="Manage accepted, confirmed, upcoming, in-progress, and completed event bookings."
      />
      <section
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Loading booking summary"
      >
        {[
          "Pending Requests",
          "Awaiting Payment",
          "Confirmed / Upcoming",
          "In Progress",
          "Completed",
        ].map((label) => (
          <SummaryCard key={label} label={label} loading />
        ))}
      </section>
      <TableLoadingSkeleton caption="Provider booking results" />
    </div>
  );
}
