import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";

export default function CustomerProvidersLoading() {
  return (
    <ProviderDirectoryShell>
      <div
        className="grid min-w-0 gap-5"
        role="status"
        aria-busy="true"
        aria-label="Loading providers"
      >
        <span className="sr-only">Loading marketplace providers.</span>
        <section className="grid min-w-0 gap-4" aria-label="Loading provider results">
          <div className="grid gap-2">
            <div className="h-3 w-28 animate-pulse rounded-full bg-primary-tint motion-reduce:animate-none" />
            <div className="h-7 w-56 max-w-full animate-pulse rounded-lg bg-primary-tint-strong motion-reduce:animate-none" />
          </div>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,12.5rem),1fr))] gap-3">
            {Array.from({length: 8}, (_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-xl border border-feasta-border-strong bg-white shadow-sm"
              >
                <div className="aspect-[4/3] animate-pulse bg-primary-tint motion-reduce:animate-none" />
                <div className="grid gap-3 p-4">
                  <div className="h-5 w-4/5 animate-pulse rounded bg-primary-tint-strong motion-reduce:animate-none" />
                  <div className="h-4 w-3/5 animate-pulse rounded bg-primary-tint motion-reduce:animate-none" />
                  <div className="h-16 animate-pulse rounded-lg bg-primary-tint motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ProviderDirectoryShell>
  );
}
