"use client";

import {
  Check,
  ChevronDown,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import {useId, useState} from "react";

import {
  PROVIDER_CATEGORY_OPTIONS,
  PROVIDER_SERVICE_TYPE_OPTIONS,
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import type {ProviderDiscoveryFilters} from "@/lib/customer/providers/provider-types";
import {cn} from "@/lib/utils";

type FilterChip = {
  label: string;
  clearHref: string;
};

export function ProviderFilterForm({
  filters,
}: {
  filters: ProviderDiscoveryFilters;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const formId = useId();

  const activeFilters: FilterChip[] = [];

  if (filters.search) {
    activeFilters.push({
      label: `Search: ${filters.search}`,
      clearHref: buildFilterHref({
        ...filters,
        search: "",
        cursor: null,
      }),
    });
  }

  if (filters.serviceType !== "all") {
    activeFilters.push({
      label: providerServiceTypeLabel(filters.serviceType),
      clearHref: buildFilterHref({
        ...filters,
        serviceType: "all",
        cursor: null,
      }),
    });
  }

  if (filters.category !== "all") {
    activeFilters.push({
      label: providerCategoryLabel(filters.category),
      clearHref: buildFilterHref({
        ...filters,
        category: "all",
        cursor: null,
      }),
    });
  }

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <aside
      className="min-w-0 md:sticky md:top-[156px]"
      aria-label="Provider discovery filters"
    >
      <div className="overflow-hidden rounded-[22px] border border-feasta-border-soft bg-white shadow-[0_8px_28px_rgb(43_33_29/0.045)]">
        {/* ================================================================
            MOBILE TOGGLE
           ================================================================ */}

        <button
          type="button"
          className={[
            "flex min-h-14 w-full items-center gap-3 px-4 text-left",
            "font-extrabold text-foreground",
            "transition-colors duration-fast",
            "hover:bg-feasta-surface-soft",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-inset focus-visible:ring-primary",
            "md:hidden",
          ].join(" ")}
          aria-expanded={filtersOpen}
          aria-controls={formId}
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
            <SlidersHorizontal
              aria-hidden="true"
              className="size-4"
            />
          </span>

          <span className="flex-1">
            Filters
          </span>

          {hasActiveFilters ? (
            <span className="rounded-full bg-primary px-2 py-1 text-[11px] font-extrabold text-primary-foreground">
              {activeFilters.length}
            </span>
          ) : null}

          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-feasta-text-tertiary transition-transform duration-normal",
              filtersOpen && "rotate-180",
            )}
          />
        </button>

        {/* ================================================================
            DESKTOP HEADER
           ================================================================ */}

        <div className="hidden border-b border-feasta-divider p-5 md:block">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
              <SlidersHorizontal
                aria-hidden="true"
                className="size-[18px]"
              />
            </div>

            <div className="min-w-0">
              <h2 className="font-extrabold tracking-[-0.02em] text-foreground">
                Refine results
              </h2>

              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                Narrow providers using available marketplace filters.
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================
            FILTER FORM
           ================================================================ */}

        <form
          id={formId}
          action="/customer/providers"
          method="get"
          role="search"
          aria-describedby={`${formId}-status`}
          className={cn(
            "min-w-0 gap-5 border-t border-feasta-divider p-4 md:grid md:border-t-0 md:p-5",
            filtersOpen ? "grid" : "hidden",
          )}
        >
          {/* ============================================================
              SEARCH
             ============================================================ */}

          <label
            className="grid gap-2"
            htmlFor={`${formId}-search`}
          >
            <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-feasta-text-secondary">
              Search
            </span>

            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-feasta-text-tertiary"
              />

              <input
                id={`${formId}-search`}
                type="search"
                name="q"
                defaultValue={filters.search}
                aria-label="Search approved providers"
                placeholder="Provider or service"
                minLength={2}
                maxLength={80}
                className={[
                  "h-12 w-full rounded-xl",
                  "border border-feasta-border-soft bg-feasta-canvas",
                  "pl-10 pr-3",
                  "text-sm font-semibold text-foreground",
                  "outline-none",
                  "placeholder:text-feasta-text-tertiary",
                  "transition-[border-color,background-color,box-shadow]",
                  "focus:border-primary/40 focus:bg-white",
                  "focus:ring-4 focus:ring-primary/[0.07]",
                ].join(" ")}
              />
            </span>
          </label>

          {/* ============================================================
              SERVICE TYPE
             ============================================================ */}

          <fieldset>
            <legend className="text-xs font-extrabold uppercase tracking-[0.1em] text-feasta-text-secondary">
              Service type
            </legend>

            <div className="mt-2.5 grid gap-2">
              <FilterRadio
                name="service"
                value="all"
                label="All services"
                defaultChecked={filters.serviceType === "all"}
              />

              {PROVIDER_SERVICE_TYPE_OPTIONS.map((option) => (
                <FilterRadio
                  key={option.value}
                  name="service"
                  value={option.value}
                  label={option.label}
                  defaultChecked={filters.serviceType === option.value}
                />
              ))}
            </div>
          </fieldset>

          {/* ============================================================
              CATEGORY
             ============================================================ */}

          <label className="grid gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-feasta-text-secondary">
              Category
            </span>

            <div className="relative">
              <select
                name="category"
                defaultValue={filters.category}
                className={[
                  "h-12 w-full appearance-none rounded-xl",
                  "border border-feasta-border-soft bg-feasta-canvas",
                  "px-3 pr-10",
                  "text-sm font-semibold text-foreground",
                  "outline-none",
                  "transition-[border-color,background-color,box-shadow]",
                  "focus:border-primary/40 focus:bg-white",
                  "focus:ring-4 focus:ring-primary/[0.07]",
                ].join(" ")}
              >
                <option value="all">
                  All categories
                </option>

                {PROVIDER_CATEGORY_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>

              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-feasta-text-tertiary"
              />
            </div>
          </label>

          {/* ============================================================
              ACTIVE FILTERS
             ============================================================ */}

          {hasActiveFilters ? (
            <div className="border-t border-feasta-divider pt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-feasta-text-secondary">
                  Active filters
                </p>

                <Link
                  href="/customer/providers"
                  className={[
                    "inline-flex items-center gap-1.5",
                    "text-xs font-bold text-primary-strong",
                    "transition-colors duration-fast",
                    "hover:text-primary",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-offset-2",
                  ].join(" ")}
                >
                  <RotateCcw
                    aria-hidden="true"
                    className="size-3.5"
                  />

                  Clear all
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {activeFilters.map((filter) => (
                  <Link
                    key={`${filter.label}-${filter.clearHref}`}
                    href={filter.clearHref}
                    aria-label={`Remove filter ${filter.label}`}
                    className={[
                      "group inline-flex min-w-0 items-center gap-1.5",
                      "rounded-full border border-primary/15",
                      "bg-secondary px-3 py-2",
                      "text-xs font-bold text-primary-strong",
                      "transition-[border-color,background-color]",
                      "hover:border-primary/25 hover:bg-primary/10",
                      "focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary focus-visible:ring-offset-2",
                    ].join(" ")}
                  >
                    <span className="max-w-[170px] truncate">
                      {filter.label}
                    </span>

                    <X
                      aria-hidden="true"
                      className="size-3.5 shrink-0 opacity-65 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* ============================================================
              ACTIONS
             ============================================================ */}

          <div className="grid gap-2 border-t border-feasta-divider pt-5">
            <button
              type="submit"
              className={[
                "inline-flex min-h-11 w-full items-center justify-center",
                "gap-2 rounded-xl bg-primary px-4",
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
              <Check
                aria-hidden="true"
                className="size-4"
              />

              Apply filters
            </button>

            <Link
              href="/customer/providers"
              className={[
                "inline-flex min-h-10 w-full items-center justify-center",
                "gap-2 rounded-xl px-4",
                "text-sm font-bold text-feasta-text-secondary",
                "transition-colors duration-fast",
                "hover:bg-feasta-surface-soft hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
              ].join(" ")}
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
              />

              Reset filters
            </Link>
          </div>

          {/* ============================================================
              ACCESSIBLE STATUS
             ============================================================ */}

          <p
            id={`${formId}-status`}
            className="sr-only"
            aria-live="polite"
          >
            {hasActiveFilters
              ? `${activeFilters.length} provider filters are active.`
              : "No filters applied. Showing all approved public providers."}
          </p>
        </form>
      </div>
    </aside>
  );
}

/* ==========================================================================
   SERVICE TYPE RADIO
   ========================================================================== */

function FilterRadio({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label
      className={[
        "group relative flex min-h-11 cursor-pointer items-center gap-3",
        "rounded-xl border border-feasta-border-soft",
        "bg-feasta-canvas px-3",
        "transition-[border-color,background-color]",
        "hover:border-primary/20 hover:bg-feasta-surface-soft",
        "has-[:checked]:border-primary/25",
        "has-[:checked]:bg-secondary",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />

      <span
        aria-hidden="true"
        className={[
          "grid size-4 shrink-0 place-items-center rounded-full",
          "border border-feasta-border-strong bg-white",
          "transition-[border-color,background-color]",
          "peer-checked:border-primary peer-checked:bg-primary",
        ].join(" ")}
      >
        <span className="size-1.5 rounded-full bg-white opacity-0 peer-checked:opacity-100" />
      </span>

      <span className="text-sm font-semibold text-feasta-text-secondary transition-colors peer-checked:text-primary-strong">
        {label}
      </span>
    </label>
  );
}

/* ==========================================================================
   URL BUILDER

   This mirrors the provider query semantics used by the marketplace:
   q, service, category.

   Cursor is intentionally excluded when changing filters because a new
   filter combination should return to the beginning of the result set.
   ========================================================================== */

function buildFilterHref(
  filters: ProviderDiscoveryFilters,
): string {
  const parameters = new URLSearchParams();

  if (filters.search) {
    parameters.set("q", filters.search);
  }

  if (filters.serviceType !== "all") {
    parameters.set("service", filters.serviceType);
  }

  if (filters.category !== "all") {
    parameters.set("category", filters.category);
  }

  const query = parameters.toString();

  return query
    ? `/customer/providers?${query}`
    : "/customer/providers";
}
