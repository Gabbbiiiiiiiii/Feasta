import {
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
} from "@/lib/customer/providers/provider-types";

export function ProviderPagination({
  page,
  filters,
}: {
  page: ProviderDiscoveryPage;
  filters: ProviderDiscoveryFilters;
}) {
  if (!page.previousCursor && !page.nextCursor) {
    return null;
  }

  return (
    <nav
      aria-label="Provider results pagination"
      className="flex flex-col gap-4 rounded-[22px] border border-feasta-border-soft bg-white px-5 py-4 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div>
        <p
          className="text-sm font-bold text-foreground"
          aria-live="polite"
        >
          Continue exploring
        </p>

        <p className="mt-0.5 text-xs leading-5 text-feasta-text-secondary">
          Showing up to {page.pageSize} providers per page.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {page.previousCursor ? (
          <Link
            href={providerDiscoveryHref(
              filters,
              page.previousCursor,
            )}
            className={[
              "group inline-flex min-h-11 items-center justify-center",
              "gap-2 rounded-full border border-feasta-border-strong",
              "bg-white px-4",
              "text-sm font-bold text-foreground",
              "transition-[border-color,background-color,color,transform]",
              "duration-normal",
              "hover:-translate-y-0.5 hover:border-primary/30",
              "hover:bg-secondary hover:text-primary-strong",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary focus-visible:ring-offset-2",
              "motion-reduce:transform-none",
            ].join(" ")}
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4 transition-transform duration-normal group-hover:-translate-x-0.5 motion-reduce:transform-none"
            />

            Previous
          </Link>
        ) : null}

        {page.nextCursor ? (
          <Link
            href={providerDiscoveryHref(
              filters,
              page.nextCursor,
            )}
            className={[
              "group inline-flex min-h-11 items-center justify-center",
              "gap-2 rounded-full bg-primary px-5",
              "text-sm font-bold text-primary-foreground",
              "shadow-brand-soft",
              "transition-[transform,background-color,box-shadow]",
              "duration-normal",
              "hover:-translate-y-0.5 hover:bg-primary-hover",
              "hover:shadow-brand",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary focus-visible:ring-offset-2",
              "motion-reduce:transform-none",
            ].join(" ")}
          >
            Next

            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
            />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
