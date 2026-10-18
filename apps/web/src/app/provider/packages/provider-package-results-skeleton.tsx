import {LoadingSkeleton} from "@/components/feedback/loading";

export function ProviderPackageResultsSkeleton() {
  return (
    <section
      role="status"
      aria-label="Loading package results"
      aria-busy="true"
      className="grid grid-cols-1 gap-3 xl:grid-cols-2"
    >
      {Array.from({length: 4}, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card"
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <LoadingSkeleton className="h-32 w-full shrink-0 sm:w-36" />
            <div className="grid flex-1 content-start gap-3">
              <LoadingSkeleton className="h-5 w-2/3" />
              <LoadingSkeleton className="h-4 w-full" />
              <LoadingSkeleton className="h-4 w-4/5" />
              <LoadingSkeleton className="h-6 w-1/3" />
            </div>
          </div>
          <div className="flex gap-3 border-t border-border pt-3">
            <LoadingSkeleton className="h-9 flex-1" />
            <LoadingSkeleton className="h-9 flex-1" />
          </div>
        </div>
      ))}
    </section>
  );
}