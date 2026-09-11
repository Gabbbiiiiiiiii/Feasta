import {
  CalendarDays,
  Check,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

import {PROVIDER_EVENT_TYPES} from "@feasta/shared-types";

import type {PackageDiscoveryFilters} from "@/lib/customer/discovery/marketplace-types";
import {humanizeProviderValue} from "@/lib/customer/providers/provider-catalog";
import {PUBLIC_PACKAGE_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";

export function PackageFilterForm({
  filters,
}: {
  filters: PackageDiscoveryFilters;
}) {
  return (
    <section
      aria-labelledby="package-filter-title"
      className="rounded-[22px] border border-feasta-border-soft bg-white p-4 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:p-5"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-md">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
              <CalendarDays
                aria-hidden="true"
                className="size-4"
              />
            </span>

            <div>
              <h2
                id="package-filter-title"
                className="text-sm font-extrabold text-foreground"
              >
                What are you celebrating?
              </h2>

              <p className="mt-0.5 text-xs leading-5 text-feasta-text-secondary">
                Choose an event type to narrow available packages.
              </p>
            </div>
          </div>
        </div>

        <form
          action={PUBLIC_PACKAGE_MARKETPLACE_PATH}
          method="get"
          aria-label="Package event type filter"
          className="grid min-w-0 gap-2 sm:grid-cols-[minmax(14rem,20rem)_auto_auto]"
        >
          <label
            htmlFor="package-event-filter"
            className="sr-only"
          >
            Event type
          </label>

          <select
            id="package-event-filter"
            name="event"
            defaultValue={filters.eventType}
            className={[
              "h-11 min-w-0 rounded-xl",
              "border border-feasta-border-soft bg-feasta-canvas",
              "px-3 text-sm font-semibold text-foreground",
              "outline-none",
              "transition-[border-color,background-color,box-shadow]",
              "focus:border-primary/40 focus:bg-white",
              "focus:ring-4 focus:ring-primary/[0.07]",
            ].join(" ")}
          >
            <option value="all">
              All event types
            </option>

            {PROVIDER_EVENT_TYPES.map((eventType) => (
              <option
                key={eventType}
                value={eventType}
              >
                {humanizeProviderValue(eventType)}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className={[
              "inline-flex min-h-11 items-center justify-center gap-2",
              "rounded-xl bg-primary px-4",
              "text-sm font-bold text-primary-foreground",
              "transition-[background-color,transform]",
              "hover:-translate-y-0.5 hover:bg-primary-hover",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary focus-visible:ring-offset-2",
              "motion-reduce:transform-none",
            ].join(" ")}
          >
            <Check
              aria-hidden="true"
              className="size-4"
            />

            Apply
          </button>

          {filters.eventType !== "all" ? (
            <Link
              href={PUBLIC_PACKAGE_MARKETPLACE_PATH}
              className={[
                "inline-flex min-h-11 items-center justify-center gap-2",
                "rounded-xl px-4",
                "text-sm font-bold text-feasta-text-secondary",
                "transition-colors",
                "hover:bg-feasta-surface-soft hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
              ].join(" ")}
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
              />

              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {filters.eventType !== "all" ? (
        <div className="mt-4 border-t border-feasta-divider pt-4">
          <span className="inline-flex rounded-full border border-primary/15 bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong">
            {humanizeProviderValue(filters.eventType)}
          </span>
        </div>
      ) : null}
    </section>
  );
}
