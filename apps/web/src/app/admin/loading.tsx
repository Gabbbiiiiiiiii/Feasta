import {
  LoadingSkeleton,
} from "@/components/feedback/loading";
import {
  SummaryCard,
} from "@/components/data/summary-card";

export default function AdminDashboardLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      aria-label="Loading Admin Dashboard"
      aria-busy="true"
    >
      <header className="grid gap-3 border-b border-border pb-6">
        <LoadingSkeleton
          className="h-4 w-36"
          label="Loading dashboard category"
        />

        <LoadingSkeleton
          className="h-10 w-full max-w-md"
          label="Loading dashboard title"
        />

        <LoadingSkeleton
          className="h-5 w-full max-w-xl"
          label="Loading dashboard description"
        />
      </header>

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Loading dashboard statistics"
      >
        <SummaryCard label="Total users" loading />
        <SummaryCard label="Total bookings" loading />
        <SummaryCard label="Pending provider verifications" loading />
        <SummaryCard label="Open complaints" loading />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
        <div className="grid min-w-0 content-start gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <LoadingSkeleton
              className="h-6 w-48"
              label="Loading provider performance title"
            />
            <LoadingSkeleton
              className="h-9 w-32"
              label="Loading report action"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <LoadingSkeleton
                key={index}
                className="h-24 w-full rounded-xl"
                label={`Loading provider summary card ${index + 1}`}
              />
            ))}
          </div>

          <div className="grid gap-3">
            {Array.from({ length: 5 }, (_, index) => (
              <LoadingSkeleton
                key={index}
                className="h-14 w-full rounded-xl"
                label={`Loading top provider row ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4 rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
          <LoadingSkeleton
            className="h-6 w-36"
            label="Loading recent activities title"
          />

          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <LoadingSkeleton
                className="size-9 shrink-0 rounded-full"
                label={`Loading activity icon ${index + 1}`}
              />

              <div className="grid min-w-0 flex-1 gap-2">
                <LoadingSkeleton
                  className="h-4 w-3/4"
                  label="Loading activity action"
                />
                <LoadingSkeleton
                  className="h-3 w-1/2"
                  label="Loading activity detail"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
