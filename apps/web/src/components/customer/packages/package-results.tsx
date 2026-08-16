import {
  CalendarDays,
  PackageSearch,
  SearchX,
} from "lucide-react";
import Link from "next/link";

import {
  packageDiscoveryHref,
} from "@/lib/customer/discovery/package-query";
import type {
  PackageDiscoveryFilters,
  PackageDiscoveryPage,
} from "@/lib/customer/discovery/marketplace-types";
import {humanizeProviderValue} from "@/lib/customer/providers/provider-catalog";
import {PUBLIC_PACKAGE_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";

import {PublicPackageCard} from "./public-package-card";

export function PackageResults({
  page,
  filters,
}: {
  page: PackageDiscoveryPage;
  filters: PackageDiscoveryFilters;
}) {
  const filtered = filters.eventType !== "all";

  if (page.packages.length === 0) {
    return (
      <section
        aria-labelledby="package-empty-title"
        className="relative grid min-h-[360px] place-items-center overflow-hidden rounded-[26px] border border-feasta-border-soft bg-white px-6 py-12 text-center shadow-[0_8px_28px_rgb(43_33_29/0.035)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-primary/[0.045] blur-3xl"
        />

        <div className="relative grid max-w-md justify-items-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary-strong">
            {filtered ? (
              <SearchX
                aria-hidden="true"
                className="size-6"
              />
            ) : (
              <PackageSearch
                aria-hidden="true"
                className="size-6"
              />
            )}
          </span>

          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Marketplace packages
          </p>

          <h2
            id="package-empty-title"
            className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
          >
            {filtered
              ? "No packages match this event type."
              : "No public packages yet."}
          </h2>

          <p className="mt-3 max-w-sm text-sm leading-6 text-feasta-text-secondary">
            {filtered
              ? "Try another event type or return to all available packages."
              : "Published packages from verified providers will appear here when they become available."}
          </p>

          <Link
            href={
              filtered
                ? PUBLIC_PACKAGE_MARKETPLACE_PATH
                : "/customer/providers"
            }
            className={[
              "mt-6 inline-flex min-h-11 items-center justify-center",
              "rounded-full bg-primary px-5",
              "text-sm font-bold text-white",
              "shadow-[0_7px_18px_rgb(255_99_51/0.16)]",
              "transition-[transform,background-color]",
              "hover:-translate-y-0.5 hover:bg-primary-hover",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary focus-visible:ring-offset-2",
              "motion-reduce:transform-none",
            ].join(" ")}
          >
            {filtered
              ? "View all packages"
              : "Explore event services"}
          </Link>
        </div>
      </section>
    );
  }

  const marketplaceHref = packageDiscoveryHref(
    filters,
    filters.cursor,
  );

  return (
    <section
      aria-labelledby="package-results-title"
      className="grid min-w-0 gap-5"
    >
      <header className="rounded-[22px] border border-feasta-border-soft bg-white p-5 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Marketplace results
            </p>

            <h2
              id="package-results-title"
              className="mt-1.5 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
            >
              Available packages
            </h2>

            <p
              className="mt-2 text-sm text-feasta-text-secondary"
              aria-live="polite"
            >
              Showing{" "}
              <span className="font-bold text-foreground">
                {page.packages.length}
              </span>{" "}
              {page.packages.length === 1
                ? "package"
                : "packages"}{" "}
              on this page.
            </p>
          </div>

          {filtered ? (
            <div className="flex items-center gap-2 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
              <CalendarDays
                aria-hidden="true"
                className="size-4 text-primary-strong"
              />

              <span className="text-xs font-bold text-primary-strong">
                {humanizeProviderValue(
                  filters.eventType,
                )}
              </span>
            </div>
          ) : (
            <div className="rounded-xl bg-feasta-canvas px-3.5 py-2.5 text-xs font-semibold text-feasta-text-secondary">
              All event types
            </div>
          )}
        </div>
      </header>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {page.packages.map((packageRecord) => (
          <PublicPackageCard
            key={packageRecord.id}
            packageRecord={packageRecord}
            marketplaceHref={marketplaceHref}
            headingLevel="h3"
          />
        ))}
      </div>
    </section>
  );
}