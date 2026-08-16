import {
  Search,
  SearchX,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import Link from "next/link";

import {
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
} from "@/lib/customer/providers/provider-types";

import {ProviderCard} from "./provider-card";

export function ProviderResults({
  page,
  filters,
  favoriteProviderIds = new Set<string>(),
  authenticatedCustomer = false,
}: {
  page: ProviderDiscoveryPage;
  filters: ProviderDiscoveryFilters;
  favoriteProviderIds?: ReadonlySet<string>;
  authenticatedCustomer?: boolean;
}) {
  const filtered =
    filters.search.length > 0 ||
    filters.serviceType !== "all" ||
    filters.category !== "all";

  const activeFilterLabels = [
    filters.search
      ? `"${filters.search}"`
      : null,
    filters.serviceType !== "all"
      ? providerServiceTypeLabel(filters.serviceType)
      : null,
    filters.category !== "all"
      ? providerCategoryLabel(filters.category)
      : null,
  ].filter((value): value is string => value !== null);

  /* ======================================================================
     EMPTY STATE
     ====================================================================== */

  if (page.providers.length === 0) {
    return (
      <section
        aria-label="Provider results"
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
              <Store
                aria-hidden="true"
                className="size-6"
              />
            )}
          </span>

          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Marketplace results
          </p>

          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground">
            {filtered
              ? "No providers match those filters."
              : "No public providers yet."}
          </h2>

          <p className="mt-3 max-w-sm text-sm leading-6 text-feasta-text-secondary">
            {filtered
              ? "Try broadening your search or removing one of the active filters."
              : "Approved public event providers will appear here when they become available."}
          </p>

          {filtered ? (
            <Link
              href="/customer/providers"
              className={[
                "mt-6 inline-flex min-h-11 items-center justify-center",
                "gap-2 rounded-full bg-primary px-5",
                "text-sm font-bold text-white",
                "shadow-[0_7px_18px_rgb(255_99_51/0.16)]",
                "transition-[transform,background-color]",
                "duration-normal",
                "hover:-translate-y-0.5 hover:bg-primary-hover",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "motion-reduce:transform-none",
              ].join(" ")}
            >
              <Search
                aria-hidden="true"
                className="size-4"
              />

              View all providers
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  const marketplaceHref = providerDiscoveryHref(
    filters,
    filters.cursor,
  );

  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="provider-results-title"
    >
      {/* ================================================================
          RESULT HEADER
         ================================================================ */}

      <header className="rounded-[22px] border border-feasta-border-soft bg-white p-5 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Marketplace results
            </p>

            <h2
              id="provider-results-title"
              className="mt-1.5 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
            >
              Available providers
            </h2>

            <p
              className="mt-2 text-sm text-feasta-text-secondary"
              aria-live="polite"
            >
              Showing{" "}
              <span className="font-bold text-foreground">
                {page.providers.length}
              </span>{" "}
              {page.providers.length === 1
                ? "provider"
                : "providers"}{" "}
              on this page.
            </p>
          </div>

          {filtered ? (
            <div className="flex items-center gap-2 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
              <SlidersHorizontal
                aria-hidden="true"
                className="size-4 shrink-0 text-primary-strong"
              />

              <span className="text-xs font-semibold text-feasta-text-secondary">
                Filtered results
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
              <Store
                aria-hidden="true"
                className="size-4 shrink-0 text-primary-strong"
              />

              <span className="text-xs font-semibold text-feasta-text-secondary">
                All public providers
              </span>
            </div>
          )}
        </div>

        {/* Active filter summary */}
        {activeFilterLabels.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-feasta-divider pt-4">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full border border-primary/15 bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {/* ================================================================
          PROVIDER GRID
         ================================================================ */}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {page.providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            marketplaceHref={marketplaceHref}
            favoriteState={{
              authenticated: authenticatedCustomer,
              favorited: favoriteProviderIds.has(
                provider.id,
              ),
            }}
          />
        ))}
      </div>
    </section>
  );
}