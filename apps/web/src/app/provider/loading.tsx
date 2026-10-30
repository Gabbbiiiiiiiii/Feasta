"use client";

import {usePathname} from "next/navigation";
import ProviderPackagesLoading from "./packages/loading";
import {LoadingSkeleton} from "@/components/feedback/loading";
import {ListLoadingSkeleton} from "@/components/feedback/application-states";

// Shared provider fallback. Route-specific pages may use their own skeletons.
export default function ProviderLoading() {
  const pathname = usePathname();

  if (
    pathname === "/provider/packages" ||
    pathname?.startsWith("/provider/packages/")
  ) {
    return <ProviderPackagesLoading />;
  }
  return (
    <div
      className="grid min-w-0 gap-6"
      role="status"
      aria-label="Loading provider workspace"
      aria-busy="true"
    >
      <div className="grid gap-3" aria-hidden="true">
        <LoadingSkeleton className="h-9 w-48 max-w-full" />
        <LoadingSkeleton className="h-5 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({length: 4}, (_, index) => (
          <section
            key={index}
            className="grid gap-4 rounded-card border border-border bg-card p-5 shadow-card"
          >
            <LoadingSkeleton className="h-4 w-28" />
            <LoadingSkeleton className="h-8 w-20" />
          </section>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2" aria-hidden="true">
        <ListLoadingSkeleton count={3} />
        <ListLoadingSkeleton count={3} />
      </div>
    </div>
  );
}
