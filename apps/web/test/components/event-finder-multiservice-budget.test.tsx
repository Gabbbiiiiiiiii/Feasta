import {describe, expect, it} from "vitest";

import {
  parseProviderDiscoveryFilters,
  providerDiscoveryHref,
  parseProviderDirectoryReturnHref,
} from "@/lib/customer/providers/provider-query";

describe("Event Finder multi-service and budget contract", () => {
  it("preserves multiple service categories and a planning budget", () => {
    const filters = parseProviderDiscoveryFilters({
      categories: "catering_service,photographer",
      budgetMin: "1000",
      budgetMax: "15000",
      eventType: "birthday",
    }, "");

    expect(filters.category).toBe("all");
    expect(filters.categories).toEqual([
      "catering_service",
      "photographer",
    ]);

    expect(filters.planningContext).toMatchObject({
      budgetMin: 1000,
      budgetMax: 15000,
      eventType: "birthday",
    });

    const href = providerDiscoveryHref(filters);

    expect(href).toContain(
      "categories=catering_service%2Cphotographer",
    );
    expect(href).toContain("budgetMin=1000");
    expect(href).toContain("budgetMax=15000");

    const returnHref = parseProviderDirectoryReturnHref(href);

    const parsed = parseProviderDiscoveryFilters(
      Object.fromEntries(
        new URL(
          returnHref,
          "https://feasta.test",
        ).searchParams,
      ),
      "",
    );

    expect(parsed.categories).toEqual(filters.categories);
    expect(parsed.planningContext).toMatchObject(
      filters.planningContext ?? {},
    );
  });

  it("rejects invalid budgets and deduplicates category values", () => {
    const filters = parseProviderDiscoveryFilters({
      budgetMin: "-1",
      budgetMax: "999999999",
      categories: Array(31).fill("photographer").join(","),
    }, "");

    expect(filters.planningContext).toBeUndefined();
    expect(filters.categories).toBeUndefined();
    expect(filters.category).toBe("photographer");
  });
});
it("canonicalizes duplicate, malformed, and reordered category URL values", () => {
  const filters = parseProviderDiscoveryFilters({categories: "photographer,<script>,catering_service,photographer", category: "videographer", cursor: "bad!"}, "");
  expect(filters.categories).toEqual(["catering_service", "photographer"]);
  expect(filters.category).toBe("all");
  expect(filters.cursor).toBeNull();
  expect(providerDiscoveryHref(filters)).toBe("/customer/providers?categories=catering_service%2Cphotographer");
  const single = parseProviderDiscoveryFilters({categories: "photographer,photographer", category: "videographer"});
  expect(providerDiscoveryHref(single)).toBe("/customer/providers?category=photographer");
  expect(parseProviderDiscoveryFilters({categories: "x".repeat(1025)}).categories).toBeUndefined();
});
