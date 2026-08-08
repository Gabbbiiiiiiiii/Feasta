"use client";

import {ChevronDown, Search, SlidersHorizontal} from "lucide-react";
import Link from "next/link";
import {useId, useState} from "react";

import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {
  PROVIDER_CATEGORY_OPTIONS,
  PROVIDER_SERVICE_TYPE_OPTIONS,
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import type {ProviderDiscoveryFilters} from "@/lib/customer/providers/provider-types";
import {cn} from "@/lib/utils";

export function ProviderFilterForm({filters}: {filters: ProviderDiscoveryFilters}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const formId = useId();
  const activeFilters = [
    filters.search ? `Search: ${filters.search}` : null,
    filters.serviceType !== "all"
      ? `Service: ${providerServiceTypeLabel(filters.serviceType)}`
      : null,
    filters.category !== "all"
      ? `Category: ${providerCategoryLabel(filters.category)}`
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <aside className="min-w-0 lg:sticky lg:top-20" aria-label="Provider filters">
      <div className="overflow-hidden rounded-xl border border-[#E8C9BE] bg-white shadow-[0_4px_18px_rgba(92,45,29,0.06)]">
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-black text-[#2E1C17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C4471C] lg:hidden"
          aria-expanded={filtersOpen}
          aria-controls={formId}
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <SlidersHorizontal aria-hidden="true" className="size-5 text-[#B23A16]" />
          <span className="flex-1">Filter event services</span>
          <ChevronDown
            aria-hidden="true"
            className={cn("size-5 transition-transform", filtersOpen && "rotate-180")}
          />
        </button>

        <div className="hidden border-b border-[#F0DED7] p-4 lg:block">
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="size-4 text-[#B23A16]" />
            <h2 className="font-black text-[#2E1C17]">Filter event services</h2>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[#78645D]">
            Narrow the directory using approved marketplace fields.
          </p>
        </div>

        <form
          id={formId}
          action="/customer/providers"
          method="get"
          role="search"
          aria-describedby={`${formId}-status`}
          className={cn(
            "min-w-0 gap-4 border-t border-[#F0DED7] p-4 lg:grid lg:border-t-0",
            filtersOpen ? "grid" : "hidden",
          )}
        >
          <label className="grid gap-2 text-sm font-bold text-[#3B2822]" htmlFor={`${formId}-search`}>
            Provider search
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-[#9A776B]"
              />
              <Input
                id={`${formId}-search`}
                className="min-h-12 border-[#DDBCB1] bg-[#FFFCFA] py-2.5 pl-10 text-sm"
                type="search"
                name="q"
                defaultValue={filters.search}
                aria-label="Search approved providers"
                placeholder="Business, service, or location"
                minLength={2}
                maxLength={80}
              />
            </span>
          </label>

          <label className="grid gap-2 text-sm font-bold text-[#3B2822]">
            Service type
            <Select
              className="min-h-12 border-[#DDBCB1] bg-[#FFFCFA] py-2.5 text-sm"
              name="service"
              defaultValue={filters.serviceType}
            >
              <option value="all">All service types</option>
              {PROVIDER_SERVICE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-[#3B2822]">
            Category
            <Select
              className="min-h-12 border-[#DDBCB1] bg-[#FFFCFA] py-2.5 text-sm"
              name="category"
              defaultValue={filters.category}
            >
              <option value="all">All categories</option>
              {PROVIDER_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>

          <div className="grid gap-2 border-t border-[#F0DED7] pt-4">
            <Button type="submit" size="compact" className="w-full bg-[#C4471C] hover:bg-[#A93612]">
              Apply filters
            </Button>
            <Button asChild variant="ghost" size="compact" className="w-full text-[#9C3515]">
              <Link href="/customer/providers">Clear filters</Link>
            </Button>
          </div>

          <p
            id={`${formId}-status`}
            className="break-words rounded-lg bg-[#FFF2EC] px-3 py-2.5 text-xs leading-5 text-[#70584F]"
            aria-live="polite"
          >
            {activeFilters.length > 0
              ? `Active filters: ${activeFilters.join(", ")}`
              : "No filters applied. Showing all approved public providers."}
          </p>
        </form>
      </div>
    </aside>
  );
}
