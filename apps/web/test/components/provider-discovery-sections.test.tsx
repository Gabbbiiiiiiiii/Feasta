import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {ProviderResults} from "@/components/customer/providers/provider-results";
import {providerDiscoverySections} from "@/lib/customer/providers/provider-discovery-sections";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";
import {parseProviderDiscoveryFilters, providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {ProviderDiscoveryFilters, ProviderDiscoveryPage, PublicProvider} from "@/lib/customer/providers/provider-types";

vi.mock("@/app/customer/favorites/actions", () => ({setProviderFavoriteAction: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

const filters: ProviderDiscoveryFilters = {search: "", serviceType: "all", category: "all", cursor: null};
function providers(count: number): PublicProvider[] {
  return Array.from({length: count}, (_, index) => ({
    id: `provider-${index}`, businessName: `Provider ${index}`, description: null,
    serviceType: "addon", primaryCategory: null, categories: [], location: "Ormoc City, Leyte",
    serviceAreas: [], eventTypes: [], operatingDays: [], bookingLeadTimeDays: 7,
    minimumGuests: 50, maximumGuests: 200, logoUrl: null, coverImageUrl: null, approvalLabel: "Approved",
  }));
}
function page(records: readonly PublicProvider[]): ProviderDiscoveryPage {
  return {providers: records, previousCursor: null, nextCursor: null, pageSize: 12};
}

describe("provider discovery groups within the complete marketplace listing", () => {
  it("omits discovery rows for small datasets without repeating or hiding cards", () => {
    const records = providers(2).map((provider) => ({...provider, favoriteCount: 10}));
    render(<ProviderResults page={page(records)} filters={filters} />);
    expect(screen.getByRole("heading", {name: "Marketplace providers"})).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("heading", {name: "Popular Providers"})).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "Suggested for your event"})).not.toBeInTheDocument();
  });

  it("omits empty groups, unsubstantiated recommendations, and popularity", () => {
    const result = providerDiscoverySections(page(providers(8)), filters);
    expect(result.sections).toEqual([]);
    expect(result.remaining).toHaveLength(8);
    render(<ProviderResults page={page([])} filters={filters} />);
    expect(screen.getByRole("heading", {name: "No public providers yet."})).toBeVisible();
    expect(screen.queryByText("Recommended for You")).not.toBeInTheDocument();
  });

  it.each([
    {category: "photographer" as const},
    {serviceType: "addon" as const},
    {search: "events"},
  ])("suggests only from the already-filtered result set for %j", (context) => {
    const records = providers(8);
    const result = providerDiscoverySections(page(records), {...filters, ...context});
    expect(result.sections.map((section) => section.title)).toEqual(["Suggested for your event"]);
    expect(result.sections[0].providers).toEqual(records.slice(0, 4));
    expect(result.sections[0].href).toBeUndefined();
    expect(result.remaining).toEqual(records.slice(4));
  });

  it("does not treat a saved location or date as matching or availability evidence", () => {
    const context = parseProviderDiscoveryFilters({eventDate: "2099-09-10", eventVenueCity: "Ormoc City", eventVenueLabel: "Ormoc City, Leyte"});
    expect(context.planningContext).toBeDefined();
    expect(providerDiscoverySections(page(providers(8)), context).sections).toEqual([]);
  });

  it("uses positive valid favorite counts and preserves the canonical query order", () => {
    const counts = [9, 4, 0, null, undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
    const records = providers(counts.length).map((provider, index) => ({...provider, favoriteCount: counts[index]}));
    render(<ProviderResults page={page(records)} filters={filters} />);
    const popular = screen.getByRole("region", {name: "Popular Providers"});
    expect(within(popular).getAllByRole("article").map((card) => within(card).getByRole("heading").textContent))
      .toEqual(["Provider 0", "Provider 1"]);
    expect(within(popular).queryByRole("link", {name: /See all/})).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(records.length);
    expect(screen.getByText("9").closest("p")).toHaveTextContent("Showing 9 providers on this page.");
  });

  it("requires more than one saved provider to create a popularity row", () => {
    const records = providers(8);
    records[0].favoriteCount = 1;
    expect(providerDiscoverySections(page(records), filters).sections).toEqual([]);
  });

  it("groups canonical primary categories and keeps every card and favorite control exactly once", () => {
    const categories = ["event_coordinator", "photographer", "venue_provider"] as const;
    const records = providers(12).map((provider, index) => ({...provider,
      primaryCategory: categories[Math.floor(index / 4)], categories: ["photographer" as const],
    }));
    render(<ProviderResults page={page(records)} filters={filters} authenticatedCustomer favoriteProviderIds={new Set(["provider-0"])} />);
    const completeListing = screen.getByRole("region", {name: "Marketplace providers"});
    expect(within(completeListing).getAllByRole("article")).toHaveLength(12);
    for (const provider of records) {
      expect(screen.getAllByRole("article", {name: `${provider.businessName}, approved event service provider`})).toHaveLength(1);
      expect(screen.getByRole("link", {name: `View ${provider.businessName} public provider profile`}))
        .toHaveAttribute("href", `/customer/providers/${provider.id}`);
    }
    expect(screen.getByRole("button", {name: /Remove Provider 0 from favorites/})).toBeVisible();
    expect(screen.getAllByText("Approved")).toHaveLength(12);
    expect(screen.getByRole("heading", {name: "More providers"})).toBeVisible();
    const categoryLinks = screen.getAllByRole("link", {name: /See all .* providers/});
    expect(categoryLinks).toHaveLength(2);
    const photography = screen.getByRole("region", {name: "Photographer"});
    expect(within(photography).getAllByRole("article")).toHaveLength(4);
    expect(within(photography).queryByRole("article", {name: /^Provider 0,/})).not.toBeInTheDocument();
    expect(within(photography).getByRole("link", {name: "See all Photographer providers"}))
      .toHaveAttribute("href", "/customer/providers?category=photographer");
  });

  it("carries planning context through canonical category links and resets pagination", () => {
    const context = parseProviderDiscoveryFilters({eventDate: "2099-09-10", eventVenueCity: "Ormoc City", eventVenueLabel: "Ormoc City, Leyte"});
    const records = providers(8).map((provider, index) => ({...provider,
      primaryCategory: index < 4 ? "photographer" as const : "venue_provider" as const,
    }));
    const result = providerDiscoverySections(page(records), context);
    expect(result.sections[0].href).toBe(providerDiscoveryHref({...context, category: "photographer", cursor: null}));
    expect(result.sections[0].href).toContain("eventDate=2099-09-10");
    expect(result.sections[0].href).not.toContain("cursor=");
  });

  it("leaves subsequent pages in canonical order without repeated discovery rows", () => {
    const records = providers(8).map((provider) => ({...provider, favoriteCount: 1}));
    expect(providerDiscoverySections(page(records), {...filters, cursor: "next-cursor"})).toEqual({sections: [], remaining: records});
    expect(providerDiscoverySections({...page(records), previousCursor: "previous"}, filters)).toEqual({sections: [], remaining: records});
  });

  it("uses the existing public eligibility boundary and safely exposes only valid aggregate counts", () => {
    const records = providers(8).flatMap((provider, index) => {
      const normalized = normalizePublicProvider(provider.id, {
        ownerId: `owner-${index}`, businessName: provider.businessName, providerServiceType: "addon",
        verificationStatus: index === 7 ? "pending" : "approved", publiclyVisible: index !== 6,
        isActive: true, isSuspended: false, isDeleted: false, favoriteCount: index < 2 ? 5 : "invalid",
      }, {role: "provider", providerId: provider.id, accountStatus: "active"});
      return normalized ? [normalized] : [];
    });
    render(<ProviderResults page={page(records)} filters={filters} />);
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.queryByRole("article", {name: /^Provider 6,/})).not.toBeInTheDocument();
    expect(screen.queryByRole("article", {name: /^Provider 7,/})).not.toBeInTheDocument();
    expect(records[0].favoriteCount).toBe(5);
    expect(records[2].favoriteCount).toBeNull();
    expect(records[0]).not.toHaveProperty("ownerId");
    expect(screen.getByRole("region", {name: "Popular Providers"})).toBeVisible();
  });
});
