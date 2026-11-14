import {LoadingSkeleton} from "@/components/feedback/loading";
import {PageHeading} from "@/components/layout/page-heading";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProviderCalendarLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      role="status"
      aria-label="Loading provider calendar"
      aria-busy="true"
    >
      <PageHeading
        eyebrow="Provider operations"
        title="Calendar"
        description="Manage your business availability and review scheduled FEASTA events."
      />

      <div
        aria-hidden="true"
        className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.8fr)]"
      >
        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5">
            <div className="grid gap-2">
              <LoadingSkeleton className="h-7 w-36" />
              <LoadingSkeleton className="h-4 w-56 max-w-full" />
            </div>
            <div className="flex gap-2">
              <LoadingSkeleton className="size-10" />
              <LoadingSkeleton className="size-10" />
            </div>
          </div>

          <div className="p-2 sm:p-5">
            <div className="grid grid-cols-7 gap-1 border-b border-border pb-3">
              {weekdays.map((day) => (
                <div key={day} className="text-center text-xs font-bold text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 pt-2">
              {Array.from({length: 35}, (_, index) => (
                <div
                  key={index}
                  className="min-h-16 rounded-md border border-border/70 p-2 sm:min-h-24"
                >
                  <LoadingSkeleton className="size-6 rounded-full" />
                  {index % 4 === 0 ? (
                    <LoadingSkeleton className="mt-3 h-3 w-3/4" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="self-start rounded-card border border-border bg-card shadow-card">
          <div className="grid gap-3 border-b border-border p-5">
            <LoadingSkeleton className="h-4 w-28" />
            <LoadingSkeleton className="h-7 w-48 max-w-full" />
          </div>

          <div className="grid gap-5 p-5">
            <LoadingSkeleton className="h-5 w-28" />
            <div className="grid gap-3 rounded-lg border border-border p-4">
              {Array.from({length: 3}, (_, index) => (
                <LoadingSkeleton key={index} className="h-5 w-full" />
              ))}
            </div>
            <LoadingSkeleton className="h-10 w-full" />
            <LoadingSkeleton className="h-5 w-36" />
            <LoadingSkeleton className="h-28 w-full" />
          </div>
        </aside>
      </div>
    </div>
  );
}