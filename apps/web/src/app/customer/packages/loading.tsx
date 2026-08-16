import {PackageDirectoryShell} from "@/components/customer/packages/package-directory-shell";

export default function CustomerPackagesLoading() {
  return (
    <PackageDirectoryShell>
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading packages"
        className="grid min-w-0 gap-5"
      >
        <span className="sr-only">Loading marketplace packages.</span>
        <div className="h-24 animate-pulse rounded-xl border border-[#E8C9BE] bg-white shadow-sm motion-reduce:animate-none" />
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4">
          {Array.from({length: 8}, (_, index) => (
            <div key={index} className="overflow-hidden rounded-xl border border-[#E8C9BE] bg-white shadow-sm">
              <div className="aspect-[16/9] animate-pulse bg-[#F6DCD3] motion-reduce:animate-none" />
              <div className="grid gap-3 p-4">
                <div className="h-5 w-4/5 animate-pulse rounded bg-[#E8C9BE] motion-reduce:animate-none" />
                <div className="h-4 w-3/5 animate-pulse rounded bg-[#F0D7CF] motion-reduce:animate-none" />
                <div className="h-16 animate-pulse rounded-[10px] bg-secondary motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PackageDirectoryShell>
  );
}
