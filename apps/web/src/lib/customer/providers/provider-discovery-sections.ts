import {PROVIDER_CATEGORY_OPTIONS} from "./provider-catalog";
import {providerDiscoveryHref} from "./provider-query";
import type {ProviderDiscoveryFilters, ProviderDiscoveryPage, PublicProvider} from "./provider-types";

type ProviderDiscoverySection = {
  id: string;
  title: string;
  description: string;
  providers: readonly PublicProvider[];
  href?: string;
};

/** Partition the already-authorized page, retaining every provider exactly once. */
export function providerDiscoverySections(page: ProviderDiscoveryPage, filters: ProviderDiscoveryFilters) {
  const sections: ProviderDiscoverySection[] = [];
  let remaining = page.providers;

  // Small datasets and subsequent pages work better as the canonical simple grid.
  if (remaining.length < 6 || filters.cursor || page.previousCursor) {
    return {sections, remaining};
  }

  function addSection(section: Omit<ProviderDiscoverySection, "providers">, candidates: readonly PublicProvider[]) {
    // At most two short rows, with at least two providers left in the main grid.
    const providers = candidates.slice(0, Math.min(4, remaining.length - 2));
    if (sections.length >= 2 || providers.length < 2) return;
    sections.push({...section, providers});
    const selectedIds = new Set(providers.map((provider) => provider.id));
    remaining = remaining.filter((provider) => !selectedIds.has(provider.id));
  }

  // These filters are applied by getPublicProviderPage. A saved date or location
  // alone is planning context, not evidence that the providers match or are free.
  if (filters.category !== "all" || filters.serviceType !== "all" || filters.search) {
    addSection({
      id: "suggested",
      title: "Suggested for your event",
      description: "A selection from your current service and search filters.",
    }, remaining);
    return {sections, remaining};
  }

  // Preserve the server's favoriteCount descending order and deterministic ties.
  // Missing, invalid, and zero counts cannot establish popularity.
  addSection({
    id: "popular",
    title: "Popular Providers",
    description: "Providers on this page saved by customers.",
  }, remaining.filter((provider) =>
    Number.isSafeInteger(provider.favoriteCount) && (provider.favoriteCount ?? 0) > 0,
  ));

  const categories = PROVIDER_CATEGORY_OPTIONS.map((category) => ({
    ...category,
    // The canonical category query uses providerCategory, not serviceCategories.
    providers: remaining.filter((provider) => provider.primaryCategory === category.value),
  })).filter((category) => category.providers.length >= 2 && category.providers.length < remaining.length)
    .sort((left, right) => right.providers.length - left.providers.length);

  for (const category of categories) {
    addSection({
      id: `category-${category.value}`,
      title: category.label,
      description: "Explore providers on this page in this service category.",
      href: providerDiscoveryHref({...filters, category: category.value, cursor: null}),
    }, category.providers);
  }

  return {sections, remaining};
}
