import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";

export default function CustomerProvidersLoading() {
  return (
    <ProviderDirectoryShell>
      <div
        className="grid min-w-0 items-start gap-5 md:grid-cols-[15.5rem_minmax(0,1fr)] md:gap-6"
        role="status"
        aria-busy="true"
        aria-label="Loading providers"
      >
        <span className="sr-only">Loading marketplace providers.</span>
        <div className="h-16 animate-pulse rounded-xl border border-[#E8C9BE] bg-white shadow-sm motion-reduce:animate-none md:h-[28rem]" />
        <section className="grid min-w-0 gap-4" aria-label="Loading provider results">
          <div className="grid gap-2">
            <div className="h-3 w-28 animate-pulse rounded-full bg-[#F0D7CF] motion-reduce:animate-none" />
            <div className="h-7 w-56 max-w-full animate-pulse rounded-lg bg-[#E8C9BE] motion-reduce:animate-none" />
          </div>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
            {Array.from({length: 8}, (_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-xl border border-[#E8C9BE] bg-white shadow-sm"
              >
                <div className="aspect-[16/10] animate-pulse bg-[#F6DCD3] motion-reduce:animate-none" />
                <div className="grid gap-3 p-4">
                  <div className="h-5 w-4/5 animate-pulse rounded bg-[#E8C9BE] motion-reduce:animate-none" />
                  <div className="h-4 w-3/5 animate-pulse rounded bg-[#F0D7CF] motion-reduce:animate-none" />
                  <div className="h-16 animate-pulse rounded-lg bg-[#FFF0E9] motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ProviderDirectoryShell>
  );
}
