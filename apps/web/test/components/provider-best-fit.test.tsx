import {describe, expect, it} from "vitest";
import {rankProviderBestFits} from "@/lib/customer/providers/provider-best-fit";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";
import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";

import {provider, filters} from "../fixtures/provider-best-fit";
const fit = (record: PublicProvider = provider, context = filters) => rankProviderBestFits([record], context)[0];

describe("explainable page-scoped best fit", () => {
  it("matches selected services with OR semantics and canonical primary-category compatibility", () => {
    const catering = {...provider, id: "provider_0002", primaryCategory: "catering_service"};
    const unrelated = {...provider, id: "provider_0003", primaryCategory: "videographer"};
    const ranked = rankProviderBestFits([provider, catering, unrelated, provider], filters);
    expect(ranked.map((item) => item.evidence.service)).toEqual(["match", "match", "mismatch"]);
    expect(ranked.filter((item) => item.recommended)).toHaveLength(2);
    expect(fit(provider, {...filters, categories: undefined, category: "photographer"}).recommended).toBe(true);
    expect(fit(provider, {...filters, categories: [], category: "all"}).evidence.service).toBe("not-requested");
    expect(fit({...provider, primaryCategory: null}).evidence.service).toBe("unknown");
  });

  it("uses evidence tiers and no popularity weights; ties retain canonical page order", () => {
    const unknown = {...provider, id: "provider_0002", favoriteCount: 999};
    const unavailable = {...provider, id: "provider_0003"};
    const evidence = new Map<string, CustomerProviderAvailability>([
      [provider.id, {providerId: provider.id, available: true, reasonCode: null, message: "Available"}],
      [unavailable.id, {providerId: unavailable.id, available: false, reasonCode: "LEAD_TIME_NOT_MET", message: "Lead time not met"}],
    ]);
    const ranked = rankProviderBestFits([unavailable, unknown, provider], filters, evidence);
    expect(ranked.map((item) => item.availability)).toEqual(["available", "unknown", "unavailable"]);
    expect(ranked[2].recommended).toBe(false);
    expect(ranked[0].explanations).toContain("Available for your selected schedule");
    expect(rankProviderBestFits([unknown, provider], filters).map((item) => item.provider.id)).toEqual([unknown.id, provider.id]);
    expect(fit().availability).toBe("unknown");
    expect(fit().explanations).not.toContain("Available for your selected schedule");
  });

  it("distinguishes occasion matches, unknown fields and explicit contradictions", () => {
    expect(fit().evidence.eventType).toBe("match");
    expect(fit({...provider, eventTypes: []}).evidence.eventType).toBe("unknown");
    expect(fit({...provider, eventTypes: ["wedding"]}).recommended).toBe(false);
    const unknown = {...provider, id: "provider_0002", eventTypes: []};
    expect(rankProviderBestFits([unknown, provider], filters)[0].provider.id).toBe(provider.id);
  });

  it.each([[49, "mismatch"], [50, "match"], [100, "match"], [101, "mismatch"]])("evaluates %s guests at inclusive bounds", (guestCount, expected) => {
    expect(fit(provider, {...filters, eventContext: {...filters.eventContext!, guestCount}}).evidence.capacity).toBe(expected);
  });

  it("never confirms a capacity match from partial, missing or invalid bounds", () => {
    for (const [minimumGuests, maximumGuests] of [[null, null], [50, null], [null, 100], [101, 50], [NaN, Infinity]]) {
      expect(fit({...provider, minimumGuests, maximumGuests}).evidence.capacity).toBe("unknown");
    }
  });

  it("matches documented service-area aliases, not provider addresses or arbitrary substrings", () => {
    expect(fit({...provider, serviceAreas: ["City of Ormoc"]}).evidence.area).toBe("match");
    expect(fit({...provider, serviceAreas: []}).evidence.area).toBe("unknown");
    expect(fit({...provider, serviceAreas: ["Baybay City, Leyte"]}).evidence.area).toBe("mismatch");
    expect(fit({...provider, serviceAreas: ["near Ormoc City"]}).evidence.area).toBe("unknown");
  });

  it("ignores budget and date-only availability assumptions; does not mutate inputs or cursors", () => {
    const before = JSON.stringify({provider, filters});
    const withNoBudget = {...filters, planningContext: {...filters.planningContext, budgetMin: undefined, budgetMax: undefined}};
    expect(fit().score).toEqual(fit(provider, withNoBudget).score);
    expect(fit(provider, {...filters, eventContext: null}).availability).toBe("unknown");
    expect(fit(provider, {...filters, categories: undefined, eventContext: null, planningContext: {budgetMax: 15000}}).recommended).toBe(false);
    expect(JSON.stringify({provider, filters})).toBe(before);
    expect(fit().explanations.join(" ")).not.toMatch(/budget|price|perfect/i);
  });
});

it("keeps criterion priority lexicographic and ignores evidence for other providers or incomplete schedules", () => {
  const occasion = {...provider, id: "provider_occasion", minimumGuests: null, maximumGuests: null, serviceAreas: []};
  const capacity = {...provider, id: "provider_capacity", eventTypes: [], serviceAreas: []};
  const area = {...provider, id: "provider_area", eventTypes: [], minimumGuests: null, maximumGuests: null};
  const ranked = rankProviderBestFits([area, capacity, occasion], filters);
  expect(ranked.map((fit) => fit.provider.id)).toEqual([occasion.id, capacity.id, area.id]);
  const confirmation: CustomerProviderAvailability = {providerId: provider.id, available: true, reasonCode: null, message: "Available"};
  expect(rankProviderBestFits([provider], {...filters, eventContext: null}, new Map([[provider.id, confirmation]]))[0].availability).toBe("unknown");
  expect(rankProviderBestFits([provider], filters, new Map([[provider.id, {...confirmation, providerId: "someone_else"}]]))[0].availability).toBe("unknown");
});
