import {ApplicationEmptyState} from "@/components/feedback/application-states";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
} from "@/lib/customer/providers/provider-types";

import {ProviderCard} from "./provider-card";

export function ProviderResults({
  page,
  filters,
}: {
  page: ProviderDiscoveryPage;
  filters: ProviderDiscoveryFilters;
}) {
  const filtered = filters.search.length > 0 ||
    filters.serviceType !== "all" ||
    filters.category !== "all";
  if (page.providers.length === 0) {
    return (
      <section className="rounded-card border border-border bg-card shadow-card" aria-label="Provider results">
        <ApplicationEmptyState kind={filtered ? "search" : "providers"} />
      </section>
    );
  }
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-labelledby="provider-results-title">
      <h2 id="provider-results-title" className="sr-only">Approved provider results</h2>
      {page.providers.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} />
      ))}
    </section>
  );
}
