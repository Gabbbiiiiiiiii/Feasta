import type {CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";
import {customerBookingPlanningQuery} from "@/lib/customer/planning/event-planning-context";
import {providerDiscoveryHref} from "./provider-query";
import {cateringPackageServiceTierLabel, CATERING_PACKAGE_SERVICE_TIERS} from "@/lib/catering/catering-service-tier";
import type {ProviderBestFit} from "./provider-best-fit";
import type {PublicProviderDetail} from "./provider-detail-types";
import type {ProviderDiscoveryFilters} from "./provider-types";

export type BudgetOffer = {
  key: string;
  category: string;
  provider: string;
  name: string;
  href: string;
  cents: number;
  imageUrl?: string | null;
  eventListItem?: CustomerPackageEventListItem;
};

export function budgetOffers(
  details: readonly PublicProviderDetail[],
  fits: readonly ProviderBestFit[],
  filters: ProviderDiscoveryFilters,
  categories: readonly string[],
): BudgetOffer[] {
  const event = filters.eventContext;
  const occasion = filters.planningContext?.eventType;
  if (!event || !occasion) return [];
  const available = new Map(fits.filter((fit) => fit.availability === "available" && fit.evidence.area === "match" &&
    fit.evidence.capacity !== "mismatch").map((fit) => [fit.provider.id, fit]));
  const offers: BudgetOffer[] = [];
  for (const {provider, packages, services} of details) {
    const fit = available.get(provider.id);
    if (!fit) continue;
    function add(category: string, id: string, name: string, price: number, quantity: number, href: string, imageUrl = provider.coverImageUrl ?? provider.logoUrl, eventListItem?: CustomerPackageEventListItem) {
      const cents = Math.round(price * 100) * quantity;
      if (!categories.includes(category) || !Number.isSafeInteger(cents) || cents <= 0) return;
      offers.push({key: JSON.stringify([provider.id, id]), category, provider: provider.businessName, name, href, cents, imageUrl, eventListItem});
    }
    for (const pkg of packages) {
      if (!(pkg.occasionMatchIds ?? [pkg.eventType]).includes(occasion) ||
        pkg.minimumGuests === null || pkg.maximumGuests === null ||
        event.guestCount < pkg.minimumGuests || event.guestCount > pkg.maximumGuests) continue;
      const category = pkg.serviceCategoryCode ?? "catering_service";
      if (!provider.categories.some((code) => code === category) && provider.primaryCategory !== category) continue;
      const query = new URLSearchParams(customerBookingPlanningQuery(event, filters.planningContext));
      query.set("returnTo", providerDiscoveryHref(filters));
      const planHref = () => `/customer/packages/${encodeURIComponent(pkg.id)}/plan?${query}`;
      const eventListItem = {
        type: "package" as const,
        packageId: pkg.id,
        providerId: provider.id,
        packageName: pkg.name,
        providerName: provider.businessName,
        price: pkg.price,
        imageUrl: pkg.imageUrl,
        packageHref: `/customer/packages/${encodeURIComponent(pkg.id)}`,
      };
      if (pkg.pricingModel) {
        for (const tier of CATERING_PACKAGE_SERVICE_TIERS) {
          const option = pkg.serviceOptions?.[tier];
          query.set("serviceTier", tier);
          if (option) add(category, `package:${pkg.id}:${tier}`, `${pkg.name} · ${cateringPackageServiceTierLabel(tier)}`,
            option.price, pkg.pricingModel === "per_pax" ? event.guestCount : 1, planHref(), pkg.imageUrl ?? undefined, eventListItem);
        }
      } else if (pkg.price !== null) add(category, `package:${pkg.id}`, pkg.name, pkg.price, 1, planHref(), pkg.imageUrl ?? undefined, eventListItem);
    }
    if (fit.evidence.eventType !== "match") continue;
    for (const service of services ?? []) {
      if (!service.category || service.price === undefined ||
        (service.pricingType !== "fixed" && service.pricingType !== "per_guest")) continue;
      add(service.category, `service:${service.id}`, service.name, service.price,
        service.pricingType === "per_guest" ? event.guestCount : 1,
        `/customer/providers/${encodeURIComponent(provider.id)}?${new URLSearchParams({returnTo: providerDiscoveryHref(filters)})}`);
    }
  }
  return offers.sort((left, right) => left.cents - right.cents || left.key.localeCompare(right.key));
}

// With one offer per category and independent prices, the cheapest offer in each
// category dominates its alternatives. Taking those in price order maximizes coverage.
export function chooseBudgetOffers(offers: readonly BudgetOffer[], cap: number): Map<string, BudgetOffer> {
  const chosen = new Map<string, BudgetOffer>();
  let remaining = cap;
  for (const offer of [...offers].sort((left, right) => left.cents - right.cents)) {
    if (chosen.has(offer.category) || offer.cents > remaining) continue;
    chosen.set(offer.category, offer);
    remaining -= offer.cents;
  }
  return chosen;
}
