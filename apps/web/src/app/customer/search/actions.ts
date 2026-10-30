"use server";

import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters} from "@/lib/customer/providers/provider-query";

/** Uses the canonical marketplace visibility checks and public projection. */
export async function loadMarketplaceResultsAction(query: string, parameters: string = "") {
  const search = typeof query === "string" ? query.trim().slice(0, 80) : "";
  const params = new URLSearchParams(typeof parameters === "string" ? parameters.slice(0, 2048) : "");
  params.set("q", search);
  params.delete("cursor");
  const filters = parseProviderDiscoveryFilters(Object.fromEntries(params));
  return getPublicProviderPage({...filters, cursor: null});
}
