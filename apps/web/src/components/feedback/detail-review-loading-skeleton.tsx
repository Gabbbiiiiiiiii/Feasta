function SkeletonBar({className}: {className: string}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-skeleton motion-reduce:animate-none ${className}`}
    />
  );
}

export function DetailReviewLoadingSkeleton({
  label = "Loading details…",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
    >
      <span className="sr-only">{label}</span>

      {/* Left column skeleton: Event Overview + Customer */}
      <div className="grid gap-5">
        <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
          <SkeletonBar className="h-3.5 w-28" />
          <div className="grid gap-4 border-b border-border/70 pb-5 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="grid gap-2">
                <SkeletonBar className="h-3 w-20" />
                <SkeletonBar className="h-5 w-28" />
                <SkeletonBar className="h-5 w-20 rounded-md" />
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="h-4 w-5/6" />
            <div className="mt-1 flex gap-3">
              <SkeletonBar className="h-3.5 w-24" />
              <SkeletonBar className="h-3.5 w-24" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
          <SkeletonBar className="h-3.5 w-20" />
          <div className="flex items-center gap-3.5">
            <SkeletonBar className="size-11 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2">
              <SkeletonBar className="h-5 w-40" />
              <div className="flex flex-wrap gap-4">
                <SkeletonBar className="h-4 w-48" />
                <SkeletonBar className="h-4 w-32" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right column skeleton: Net earning + Package + Payment terms */}
      <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="grid gap-2.5 rounded-xl border border-border/80 bg-secondary/45 p-4">
          <div className="flex items-center justify-between gap-2">
            <SkeletonBar className="h-3 w-28" />
            <SkeletonBar className="h-5 w-24 rounded-full" />
          </div>
          <SkeletonBar className="h-8 w-32" />
          <SkeletonBar className="h-3.5 w-44" />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <SkeletonBar className="h-5 w-40" />
            <SkeletonBar className="h-6 w-24 rounded-md" />
          </div>
          <SkeletonBar className="h-3.5 w-48" />
          <SkeletonBar className="mt-1 h-10 w-full rounded-xl" />
        </div>

        <div className="grid gap-2.5 border-t border-border pt-4">
          <SkeletonBar className="h-3.5 w-28" />
          <div className="flex items-center justify-between gap-2">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-4 w-16" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-4 w-16" />
          </div>
          <SkeletonBar className="mt-1 h-3.5 w-36" />
          <SkeletonBar className="h-3.5 w-full" />
          <SkeletonBar className="mt-2 h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
