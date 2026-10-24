import {normalizeProviderServiceArea} from "@feasta/shared-types";

import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";
import type {ProviderDiscoveryFilters, PublicProvider} from "./provider-types";

export type FitEvidence = "match" | "unknown" | "mismatch" | "not-requested";
export type ProviderBestFit = {
  provider: PublicProvider;
  availability: "available" | "unknown" | "unavailable";
  evidence: {service: FitEvidence; eventType: FitEvidence; capacity: FitEvidence; area: FitEvidence};
  /** Lexicographic score, not an additive or weighted confidence percentage. */
  score: readonly number[];
  explanations: readonly string[];
  recommended: boolean;
};

/**
 * Only accepts the existing authorized public projection and current server evidence.
 * Priority: availability tier, service, occasion, capacity, service area, canonical
 * page position. Match > unknown > documented mismatch; missing is never a match.
 * Budget is deliberately absent: Phase 2 must establish canonical multi-provider
 * package pricing and total-event allocation before it can supply price evidence.
 */
export function rankProviderBestFits(
  providers: readonly PublicProvider[],
  filters: ProviderDiscoveryFilters,
  currentAvailability: ReadonlyMap<string, CustomerProviderAvailability> = new Map(),
): ProviderBestFit[] {
  const selected = filters.categories?.length
    ? new Set(filters.categories)
    : filters.category !== "all" ? new Set([filters.category]) : null;
  const occasion = filters.planningContext?.eventType;
  const guests = filters.eventContext?.guestCount ?? filters.planningContext?.guestCount;
  const venue = filters.planningContext?.eventVenue;
  const area = venue ? normalizeProviderServiceArea(venue.city, venue.province) : null;
  const points = (state: FitEvidence) => state === "match" ? 2 : state === "mismatch" ? 0 : 1;
  const seen = new Set<string>();
  return providers.filter((provider) => {
    if (seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  }).map((provider, position) => {
    const result = filters.eventContext ? currentAvailability.get(provider.id) : undefined;
    const availability = result?.providerId === provider.id
      ? result.available ? "available" : "unavailable"
      : "unknown";
    const service: FitEvidence = !selected ? "not-requested"
      : !provider.primaryCategory ? "unknown"
      : selected.has(provider.primaryCategory) ? "match" : "mismatch";
    const eventType: FitEvidence = !occasion ? "not-requested"
      : !provider.eventTypes.length ? "unknown"
      : provider.eventTypes.includes(occasion) ? "match" : "mismatch";
    const minimum = provider.minimumGuests;
    const maximum = provider.maximumGuests;
    const validMin = minimum !== null && Number.isSafeInteger(minimum) && minimum >= 1;
    const validMax = maximum !== null && Number.isSafeInteger(maximum) && maximum >= 1;
    const capacity: FitEvidence = !guests ? "not-requested"
      : validMin && validMax && minimum > maximum ? "unknown"
      : (validMin && guests < minimum) || (validMax && guests > maximum) ? "mismatch"
      : validMin && validMax ? "match" : "unknown";
    const documentedAreas = provider.serviceAreas.flatMap((value) => {
      const documented = normalizeProviderServiceArea(value);
      return documented ? [documented.key] : [];
    });
    const areaEvidence: FitEvidence = !venue ? "not-requested"
      : !area || !documentedAreas.length ? "unknown"
      : documentedAreas.includes(area.key) ? "match" : "mismatch";
    const evidence = {service, eventType, capacity, area: areaEvidence};
    const explanations: string[] = [];
    if (availability === "available") explanations.push("Available for your selected schedule");
    if (service === "match") explanations.push("Matches your selected service");
    if (eventType === "match") explanations.push(`Supports ${occasion} events`);
    if (capacity === "match") explanations.push(`Accommodates ${guests!.toLocaleString("en-PH")} guests`);
    if (areaEvidence === "match") explanations.push("Serves your event area");
    return {
      provider, availability, evidence, explanations,
      score: [availability === "available" ? 2 : availability === "unknown" ? 1 : 0,
        points(service), points(eventType), points(capacity), points(areaEvidence), -position],
      // Keep known contradictions and unavailable providers in the canonical grid,
      // not in recommendations. Unknown details are explicitly preliminary.
      recommended: availability !== "unavailable" &&
        (!selected || service === "match") &&
        !Object.values(evidence).includes("mismatch") && explanations.length > 0,
    } satisfies ProviderBestFit;
  }).sort((left, right) => {
    for (let index = 0; index < left.score.length; index += 1) {
      const difference = right.score[index] - left.score[index];
      if (difference) return difference;
    }
    return 0;
  });
}
