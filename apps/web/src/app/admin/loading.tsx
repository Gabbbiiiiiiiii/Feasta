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
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Loading dashboard statistics"
      >
        <SummaryCard
          label="Platform revenue"
          loading
        />

        <SummaryCard
          label="Active users"
          loading
        />

        <SummaryCard
          label="Total bookings"
          loading
        />

        <SummaryCard
          label="Verification queue"
          loading
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="grid min-w-0 gap-4 rounded-card border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between gap-4">
            <LoadingSkeleton
              className="h-6 w-40"
              label="Loading revenue chart title"
            />

            <LoadingSkeleton
              className="h-10 w-28"
              label="Loading revenue range"
            />
          </div>

          <LoadingSkeleton
            className="h-72 w-full"
            label="Loading revenue chart"
          />
        </div>

        <div className="grid min-w-0 content-start gap-4 rounded-card border border-border bg-card p-5 shadow-card">
          <LoadingSkeleton
            className="h-6 w-36"
            label="Loading top providers title"
          />

          {Array.from(
            { length: 5 },
            (_, index) => (
              <div
                key={index}
                className="flex items-center gap-3"
              >
                <LoadingSkeleton
                  className="size-11 shrink-0 rounded-full"
                  label={`Loading provider ${index + 1}`}
                />

                <div className="grid min-w-0 flex-1 gap-2">
                  <LoadingSkeleton
                    className="h-4 w-3/4"
                    label="Loading provider name"
                  />

                  <LoadingSkeleton
                    className="h-3 w-1/2"
                    label="Loading provider information"
                  />
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DashboardPanelSkeleton
          title="Loading platform health"
        />

        <DashboardPanelSkeleton
          title="Loading recent activities"
        />
      </section>
    </div>
  );
}

function DashboardPanelSkeleton({
  title,
}: {
  title: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-4 rounded-card border border-border bg-card p-5 shadow-card">
      <LoadingSkeleton
        className="h-6 w-40"
        label={title}
      />

      {Array.from(
        { length: 4 },
        (_, index) => (
          <div
            key={index}
            className="grid gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
          >
            <LoadingSkeleton
              className="h-4 w-3/4"
              label="Loading dashboard record"
            />

            <LoadingSkeleton
              className="h-3 w-1/2"
              label="Loading dashboard detail"
            />
          </div>
        ),
      )}
    </div>
  );
}