export default function CustomerFavoritesLoading() {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading favorite providers"
      className="grid min-w-0 gap-6"
    >
      <div className="grid gap-3">
        <div className="h-3 w-36 animate-pulse rounded bg-skeleton motion-reduce:animate-none" />
        <div className="h-10 w-full max-w-md animate-pulse rounded bg-skeleton motion-reduce:animate-none" />
        <div className="h-5 w-full max-w-xl animate-pulse rounded bg-skeleton motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
        {Array.from({length: 3}, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-80 animate-pulse rounded-xl border border-border bg-card shadow-card motion-reduce:animate-none"
          />
        ))}
      </div>
      <span className="sr-only">Loading favorite providers.</span>
    </section>
  );
}
