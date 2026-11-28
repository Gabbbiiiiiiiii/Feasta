import {
  TableLoadingSkeleton,
} from "@/components/feedback/application-states";
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
        title="Reports"
        description="Generate, export to PDF, and print structured FEASTA administrative reports."
      />

      <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
        <div className="flex gap-6 border-b border-border px-5 py-3">
          {[
            "FEASTA Service Fees",
            "Fee Withdrawals",
            "Bookings & Cancellations",
            "Provider Performance",
            "Users Directory",
          ].map((label) => (
            <LoadingSkeleton
              key={label}
              className="h-6 w-32"
              label={`Loading ${label} tab`}
            />
          ))}
        </div>

        <div className="grid gap-5 p-4 sm:p-5">
          <LoadingSkeleton
            className="h-24 w-full rounded-xl"
            label="Loading report filters"
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((slot) => (
              <LoadingSkeleton
                key={slot}
                className="h-20 w-full rounded-xl"
                label="Loading summary metric"
              />
            ))}
          </div>
          <TableLoadingSkeleton caption="Loading report table" />
        </div>
      </div>
    </div>
  );
}
