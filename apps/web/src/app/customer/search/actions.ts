"use server";

import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters} from "@/lib/customer/providers/provider-query";
import type {SearchSuggestion} from "@/components/forms/search-input";

/** Same public visibility gates and safe projection as provider discovery. */
export async function loadMarketplaceSuggestionsAction(query: string, parameters: string = ""): Promise<SearchSuggestion[]> {
  const search = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (search.length < 2) return [];
  const params = new URLSearchParams(typeof parameters === "string" ? parameters.slice(0, 2048) : "");
  params.set("q", search);
  params.delete("cursor");
  const filters = parseProviderDiscoveryFilters(Object.fromEntries(params));
  const page = await getPublicProviderPage({...filters, cursor: null}, 6);
  return page.providers.map(provider => ({
    key: provider.id,
    label: provider.businessName,
    context: [provider.serviceType, provider.primaryCategory, provider.location].filter(Boolean).join(" · "),
    value: "/customer/providers/" + encodeURIComponent(provider.id),
  }));
}
