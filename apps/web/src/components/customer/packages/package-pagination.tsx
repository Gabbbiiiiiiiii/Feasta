import {
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

import {packageDiscoveryHref} from "@/lib/customer/discovery/package-query";
import type {
  PackageDiscoveryFilters,
  PackageDiscoveryPage,
} from "@/lib/customer/discovery/marketplace-types";

export function PackagePagination({
  page,
  filters,
}: {
  page: PackageDiscoveryPage;
  filters: PackageDiscoveryFilters;
}) {
  if (!page.previousCursor && !page.nextCursor) {
    return null;
  }

  return (
    <nav
      aria-label="Package results pagination"
      className="flex flex-col gap-4 rounded-[22px] border border-feasta-border-soft bg-white px-5 py-4 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div>
        <p className="text-sm font-bold text-foreground">
          Continue exploring
        </p>

        <p className="mt-0.5 text-xs leading-5 text-feasta-text-secondary">
          Showing up to {page.pageSize} public packages per page.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {page.previousCursor ? (
          <Link
            href={packageDiscoveryHref(
              filters,
              page.previousCursor,
            )}
            className={[
              "group inline-flex min-h-11 items-center justify-center",
              "gap-2 rounded-full border border-feasta-border-strong",
              "bg-white px-4 text-sm font-bold text-foreground",
              "transition-[border-color,background-color,color,transform]",
              "hover:-translate-y-0.5 hover:border-primary/30",
              "hover:bg-secondary hover:text-primary-strong",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary focus-visible:ring-offset-2",
              "motion-reduce:transform-none",
            ].join(" ")}
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
            />

            Previous
          </Link>
        ) : null}

        {page.nextCursor ? (
          <Link
            href={packageDiscoveryHref(
              filters,
              page.nextCursor,
            )}
            className={[
              "group inline-flex min-h-11 items-center justify-center",
              "gap-2 rounded-full bg-primary px-5",
              "text-sm font-bold text-white",
              "shadow-[0_7px_18px_rgb(255_99_51/0.16)]",
              "transition-[transform,background-color,box-shadow]",
              "hover:-translate-y-0.5 hover:bg-primary-hover",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary focus-visible:ring-offset-2",
              "motion-reduce:transform-none",
            ].join(" ")}
          >
            Next

            <ArrowRight
              aria-hidden="true"
              className="size-4"
            />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}