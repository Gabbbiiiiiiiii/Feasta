export function MarketplaceHomeLoading() {
  return (
    <div className="grid gap-10" aria-busy="true" aria-label="Loading marketplace">
      <section className="grid gap-4" aria-label="Loading provider categories">
        <div className="h-8 w-72 max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({length: 8}, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-card border border-border bg-card shadow-card motion-reduce:animate-none" />
          ))}
        </div>
      </section>
      <section className="grid gap-4" aria-label="Loading approved providers">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({length: 6}, (_, index) => (
            <div key={index} className="h-96 animate-pulse rounded-card border border-border bg-card shadow-card motion-reduce:animate-none" />
          ))}
        </div>
      </section>
    </div>
  );
}
