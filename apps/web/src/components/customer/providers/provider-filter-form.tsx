import {Search} from "lucide-react";
import Link from "next/link";

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

export function ProviderFilterForm({filters}: {filters: ProviderDiscoveryFilters}) {
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
    <section
      className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card"
      aria-label="Filter providers"
    >
      <form action="/customer/providers" method="get" role="search" className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto]">
          <Input
            type="search"
            name="q"
            defaultValue={filters.search}
            aria-label="Search approved providers"
            placeholder="Search by business, service, or location"
            minLength={2}
            maxLength={80}
          />
          <Button type="submit" className="w-full lg:w-auto">
            <Search aria-hidden="true" className="size-5" />
            Search
          </Button>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">
            Service type
            <Select name="service" defaultValue={filters.serviceType}>
              <option value="all">All service types</option>
              {PROVIDER_SERVICE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Category
            <Select name="category" defaultValue={filters.category}>
              <option value="all">All categories</option>
              {PROVIDER_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-words text-sm text-muted-foreground" aria-live="polite">
            {activeFilters.length > 0
              ? `Active filters: ${activeFilters.join(", ")}`
              : "Browse all approved public providers"}
          </p>
          <Button asChild variant="ghost" size="compact" className="w-full sm:w-auto">
            <Link href="/customer/providers">Clear filters</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
