import {PageHeading} from "@/components/layout/page-heading";
import {LoadingSkeleton} from "@/components/feedback/loading";
import {ProviderPackageResultsSkeleton} from "./provider-package-results-skeleton";

export default function ProviderPackagesLoading() {
  return (
    <div
      className="grid min-w-0 gap-6"
      role="status"
      aria-label="Loading provider packages"
      aria-busy="true"
    >
      <PageHeading
        eyebrow="Provider management"
        title="Packages"
        description="Create and manage the packages customers can discover and book through FEASTA."
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["Total packages", "Published", "Drafts", "Archived"].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <LoadingSkeleton className="mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({length: 4}, (_, index) => (
          <LoadingSkeleton key={index} className="h-11 w-full" />
        ))}
      </div>
      <ProviderPackageResultsSkeleton />
    </div>
  );
}