import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {assertHydration} from "../helpers/assert-hydration";
import {parseProviderDiscoveryFilters, providerProfileHref} from "@/lib/customer/providers/provider-query";

import {PackageFilterForm} from "@/components/customer/packages/package-filter-form";
import {PackagePagination} from "@/components/customer/packages/package-pagination";
import {PackageResults} from "@/components/customer/packages/package-results";
import {PublicPackageCard} from "@/components/customer/packages/public-package-card";
import type {
  PackageDiscoveryFilters,
  PackageDiscoveryPage,
  PublicPackage,
} from "@/lib/customer/discovery/marketplace-types";
import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
import {
  packageDiscoveryHref,
  parsePackageDirectoryReturnHref,
  parsePackageDiscoveryFilters,
} from "@/lib/customer/discovery/package-query";

const filters: PackageDiscoveryFilters = {
  eventType: "wedding",
  cursor: null,
};

const packageRecord: PublicPackage = {
  id: "package-one",
  providerId: "provider-one",
  providerName: "A Very Long FEASTA Catering Provider Name",
  name: "An Extensive Wedding Celebration Package Name That Wraps Safely",
  description: "A real published package description for customer comparison.",
  eventType: "wedding",
  price: 45000,
  imageUrl: "https://images.example.test/package.webp",
  minimumGuests: 50,
  maximumGuests: 150,
  inclusions: ["Buffet menu", "Event styling", "Service staff"],
};

describe("customer package marketplace", () => {
  it("keeps card destinations stable across midnight while query validation still rejects past dates", async () => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-05T15:59:59Z"));
    const href = "/customer/providers?eventDate=2026-09-05&eventTime=10%3A00&eventEndTime=12%3A00&guestCount=50";
    const profile = providerProfileHref("provider-one", href);
    let links: string[] = [];
    try {
      await assertHydration(<PublicPackageCard packageRecord={packageRecord} marketplaceHref={href} />, (container) => {
        links = Array.from(container.querySelectorAll("a"), (link) => link.getAttribute("href") ?? "");
        vi.setSystemTime(new Date("2026-09-05T16:00:01Z"));
      }, (container) => {
        expect(Array.from(container.querySelectorAll("a"), (link) => link.getAttribute("href") ?? "")).toEqual(links);
        expect(providerProfileHref("provider-one", href)).toBe(profile);
        expect(parseProviderDiscoveryFilters({eventDate: "2026-09-05", eventTime: "10:00", eventEndTime: "12:00", guestCount: "50"}).eventContext).toBeUndefined();
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it("parses only canonical event filters and bounded cursors", () => {
    expect(parsePackageDiscoveryFilters({
      event: ["wedding", "birthday"],
      cursor: "safe_cursor-1",
    })).toEqual({eventType: "wedding", cursor: "safe_cursor-1"});
    expect(parsePackageDiscoveryFilters({
      event: "unsupported",
      cursor: "../document/path",
    })).toEqual({eventType: "all", cursor: null});
    expect(packageDiscoveryHref(filters, "next_cursor")).toBe(
      "/customer/packages?event=wedding&cursor=next_cursor",
    );
    expect(packageDiscoveryHref(filters)).toBe(
      "/customer/packages?event=wedding",
    );
    expect(parsePackageDirectoryReturnHref(
      "/customer/packages?event=wedding&unknown=value",
    )).toBe("/customer/packages?event=wedding");
    expect(parsePackageDirectoryReturnHref("https://evil.test/customer/packages"))
      .toBe("/customer/packages");
  });

  it("normalizes only public package fields with bounded customer details", () => {
    const raw = {
      providerId: "provider-one",
      name: "Wedding package",
      description: "Published package",
      eventType: "wedding",
      price: 45000,
      imageUrl: "https://images.example.test/package.webp",
      minimumGuests: 50,
      maximumGuests: 150,
      foodInclusions: ["Buffet menu"],
      serviceInclusions: ["Service staff"],
      internalNotes: "never public",
      downPaymentPercentage: 30,
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
      status: "published",
      isDeleted: false,
    };
    const normalized = normalizePublicPackage(
      "package-one",
      raw,
      new Map([["provider-one", "Ana Events"]]),
    );
    expect(normalized).toMatchObject({
      name: "Wedding package",
      minimumGuests: 50,
      maximumGuests: 150,
      inclusions: ["Buffet menu", "Service staff"],
    });
    expect(normalized).not.toHaveProperty("internalNotes");
    expect(normalized).not.toHaveProperty("downPaymentPercentage");
    for (const hidden of [
      {...raw, isActive: false},
      {...raw, isPublished: false},
      {...raw, providerPubliclyVisible: false},
      {...raw, status: "draft"},
      {...raw, isDeleted: true},
    ]) {
      expect(normalizePublicPackage(
        "package-one",
        hidden,
        new Map([["provider-one", "Ana Events"]]),
      )).toBeNull();
    }
    expect(normalizePublicPackage("package-one", raw, new Map())).toBeNull();
  });

  it("renders real package fields and a canonical provider link without fake claims", () => {
    render(
      <PublicPackageCard
        compactPreview
        packageRecord={packageRecord}
        marketplaceHref="/customer/packages?event=wedding"
      />,
    );
    expect(screen.getByRole("heading", {name: packageRecord.name}))
      .toHaveClass("break-words");
    expect(screen.getByRole("link", {name: packageRecord.providerName}))
      .toHaveAttribute(
        "href",
        "/customer/providers/provider-one?returnTo=%2Fcustomer%2Fpackages%3Fevent%3Dwedding",
      );
    expect(screen.getByAltText(
      `${packageRecord.name} package from ${packageRecord.providerName}`,
    )).toBeInTheDocument();
    expect(screen.getByText("50–150 guests")).toBeVisible();
    expect(screen.getByText("Buffet menu")).toBeVisible();
    expect(screen.queryByText(packageRecord.description!)).not.toBeInTheDocument();
    expect(screen.getAllByText("Wedding")).toHaveLength(1);
    expect(screen.queryByText(/rating|available near you|best seller|discount/iu))
      .not.toBeInTheDocument();
    expect(screen.getByRole("article").querySelector("a button, button a"))
      .toBeNull();
  });

  it("renders empty results and filter submissions without stale cursors", () => {
    const emptyPage: PackageDiscoveryPage = {
      packages: [],
      previousCursor: null,
      nextCursor: null,
      pageSize: 12,
    };
    render(
      <>
        <PackageFilterForm filters={filters} />
        <PackageResults page={emptyPage} filters={filters} />
      </>,
    );
    const form = screen.getByRole("form", {name: "Package event type filter"});
    expect(form).toHaveAttribute("action", "/customer/packages");
    expect(new FormData(form as HTMLFormElement).has("cursor")).toBe(false);
    expect(screen.getByRole("heading", {name: "No packages match this event type."}))
      .toBeVisible();
  });

  it("keeps inclusion summaries, event details, price, and navigation within a compact card", () => {
    render(<PackageResults filters={filters} page={{packages: [{...packageRecord, imageUrl: null, inclusions: [...packageRecord.inclusions, "Venue setup"]}], previousCursor: null, nextCursor: null, pageSize: 12}} />);
    expect(screen.getByRole("article")).toHaveClass("relative");
    expect(screen.getByText("Package image")).toBeVisible();
    // One event badge on the card; the results header also shows the active filter.
    expect(screen.getByRole("article")).not.toHaveTextContent("EventWedding");
    expect(screen.getByRole("article").parentElement).toHaveClass("grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]");
    expect(screen.getByText("50–150 guests")).toBeVisible();
    expect(screen.getByText("Buffet menu")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Event styling")).toBeVisible();
    expect(screen.getByText("+2 more")).toBeVisible();
    expect(screen.queryByText("Service staff")).not.toBeInTheDocument();
    expect(screen.queryByText("Venue setup")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Price: ₱45,000")).toBeVisible();
    expect(screen.getByRole("link", {name: `View ${packageRecord.name} package details`})).toHaveAttribute("href", "/customer/packages/package-one");
    expect(screen.getByText("View package")).toBeVisible();
    expect(screen.queryByText(packageRecord.description!)).not.toBeInTheDocument();
  });

  it("keeps the existing provider-profile card presentation", () => {
    render(<PublicPackageCard packageRecord={packageRecord} marketplaceHref="/customer/providers" showProvider={false} headingLevel="h3" />);
    expect(screen.getByText(packageRecord.description!)).toBeVisible();
    expect(screen.getAllByText("Wedding")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it.each([0, 1, 2, 5])("summarizes %s inclusions without inventing a remainder", (count) => {
    const inclusions = ["Buffet menu", "Event styling", "Service staff", "Venue setup", "Lighting"].slice(0, count);
    render(<PublicPackageCard compactPreview packageRecord={{...packageRecord, inclusions}} marketplaceHref="/customer/packages" />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(Math.min(count, 2));
    if (count > 2) expect(screen.getByText(`+${count - 2} more`)).toBeVisible();
    else expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it("preserves filters in previous and next pagination links", () => {
    render(
      <PackagePagination
        filters={filters}
        page={{
          packages: [packageRecord],
          previousCursor: "previous_cursor",
          nextCursor: "next_cursor",
          pageSize: 12,
        }}
      />,
    );
    expect(screen.getByRole("link", {name: /previous/iu})).toHaveAttribute(
      "href",
      "/customer/packages?event=wedding&cursor=previous_cursor",
    );
    expect(screen.getByRole("link", {name: /next/iu})).toHaveAttribute(
      "href",
      "/customer/packages?event=wedding&cursor=next_cursor",
    );
  });
});
