import {readFileSync} from "node:fs";
import {join} from "node:path";

import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import CustomerProvidersPage from "@/app/customer/providers/page";
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {getOptionalAccountContext} from "@/lib/auth/session";

import CustomerProvidersError from "@/app/customer/providers/error";
import {MarketplacePackageSection} from "@/components/customer/discovery/marketplace-package-section";
import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";
import {EventFinder} from "@/components/customer/layout/event-finder";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {
  isPublicProviderRecord,
  normalizePublicProvider,
  providerImageUrl,
} from "@/lib/customer/providers/provider-normalization";
import {
  parseProviderDirectoryReturnHref,
  parseProviderDiscoveryFilters,
  providerDiscoveryHref,
  providerProfileHref,
} from "@/lib/customer/providers/provider-query";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
  PublicProvider,
} from "@/lib/customer/providers/provider-types";

vi.mock("@/app/customer/favorites/actions", () => ({
  setProviderFavoriteAction: vi.fn(),
}));

vi.mock("@/lib/customer/providers/provider-discovery-service", () => ({getPublicProviderPage: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({getOptionalAccountContext: vi.fn()}));
vi.mock("@/lib/customer/favorites/customer-favorite-service", () => ({getCustomerFavoriteProviderIds: vi.fn()}));

vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn()})}));
vi.mock("@/lib/customer/planning/event-venue-client", () => ({searchEventVenues: vi.fn(), getEventVenueDetails: vi.fn()}));
beforeEach(() => window.sessionStorage.clear());

const owner = {
  role: "provider",
  providerId: "provider-one",
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
};

const publicRecord = {
  ownerId: "provider-owner",
  businessName: "Ana Events",
  description: "Event styling and coordination for celebrations.",
  providerServiceType: "addon",
  providerCategory: "event_coordinator",
  serviceCategories: ["event_coordinator", "decorator_event_stylist"],
  city: "Ormoc City",
  province: "Leyte",
  verificationStatus: "approved",
  publiclyVisible: true,
  isActive: true,
  isSuspended: false,
  isDeleted: false,
};

const provider: PublicProvider = {
  id: "provider-one",
  businessName: "Ana Events",
  description: "Event styling and coordination for celebrations.",
  serviceType: "addon",
  primaryCategory: "event_coordinator",
  categories: ["event_coordinator"],
  location: "Ormoc City, Leyte",
  serviceAreas: ["Ormoc City"],
  eventTypes: ["wedding"],
  operatingDays: ["monday", "saturday"],
  bookingLeadTimeDays: 7,
  minimumGuests: 50,
  maximumGuests: 200,
  logoUrl: null,
  coverImageUrl: null,
  approvalLabel: "Approved",
};

const emptyFilters: ProviderDiscoveryFilters = {
  search: "",
  serviceType: "all",
  category: "all",
  cursor: null,
};

function pageWith(providers: readonly PublicProvider[]): ProviderDiscoveryPage {
  return {
    providers,
    previousCursor: null,
    nextCursor: null,
    pageSize: 12,
  };
}

describe("customer marketplace provider policy", () => {
  it("enforces approved, public, active, unblocked provider records", () => {
    const linkedOwner = {...owner, providerId: "provider-one"};
    expect(isPublicProviderRecord("provider-one", publicRecord, linkedOwner)).toBe(true);
    expect(isPublicProviderRecord(
      "bad.id",
      publicRecord,
      {...linkedOwner, providerId: "bad.id"},
    )).toBe(false);

    for (const unsafeRecord of [
      {...publicRecord, verificationStatus: "pending"},
      {...publicRecord, publiclyVisible: false},
      {...publicRecord, isActive: false},
      {...publicRecord, isSuspended: true},
      {...publicRecord, isDeleted: true},
    ]) {
      expect(isPublicProviderRecord("provider-one", unsafeRecord, linkedOwner)).toBe(false);
    }
    expect(isPublicProviderRecord("provider-one", publicRecord, {...linkedOwner, accountStatus: "blocked"})).toBe(false);
    expect(isPublicProviderRecord("provider-one", publicRecord, {...linkedOwner, isBlocked: true})).toBe(false);
  });

  it("defensively normalizes incomplete legacy provider documents", () => {
    const normalized = normalizePublicProvider("provider-one", {
      ...publicRecord,
      ownerId: "provider-owner",
      description: undefined,
      city: undefined,
      province: undefined,
      serviceCategories: ["event_coordinator", "unknown", 14],
      bookingLeadTimeDays: "tomorrow",
    }, {...owner, providerId: "provider-one"});

    expect(normalized).toMatchObject({
      businessName: "Ana Events",
      description: null,
      location: null,
      categories: ["event_coordinator"],
      bookingLeadTimeDays: null,
    });
    expect(normalized).not.toHaveProperty("ownerId");
  });

  it("accepts only the established FEASTA Cloudinary media path", () => {
    const safeMedia = {
      ownerId: "provider-owner",
      logoPublicId: "feasta/providers/provider-owner/onboarding/logo",
      logoUrl: "https://res.cloudinary.com/feasta-test/image/upload/v1/feasta/providers/provider-owner/onboarding/logo.png",
    };
    expect(providerImageUrl(safeMedia, "logo")).toContain("res.cloudinary.com");
    expect(providerImageUrl({...safeMedia, logoUrl: "https://example.com/logo.png"}, "logo")).toBeNull();
    expect(providerImageUrl({...safeMedia, logoPublicId: "feasta/providers/other/onboarding/logo"}, "logo")).toBeNull();
  });
});

describe("customer marketplace search presentation", () => {
  it("renders the full marketplace page with canonical filtering and no permanent sidebar", async () => {
    vi.mocked(getOptionalAccountContext).mockResolvedValue(null);
    vi.mocked(getPublicProviderPage).mockResolvedValue(pageWith([provider]));
    render(await CustomerProvidersPage({searchParams: Promise.resolve({q: "ana", service: "addon", category: "event_coordinator"})}));
    expect(getPublicProviderPage).toHaveBeenCalledWith({search: "ana", serviceType: "addon", category: "event_coordinator", cursor: null});
    expect(screen.queryByText("Refine results")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("region", {name: "Marketplace introduction"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Marketplace providers", level: 1})).toBeVisible();
    expect(screen.getByRole("article", {name: /Ana Events/})).toBeVisible();
  });
  it("whitelists and bounds URL filters", () => {
    expect(parseProviderDiscoveryFilters({
      q: `  ${"a".repeat(100)}  `,
      service: "catering",
      category: "photographer",
      cursor: "safe_cursor-1",
      ownerId: "forged-owner",
      verificationStatus: "rejected",
    })).toEqual({
      search: "a".repeat(80),
      serviceType: "catering",
      category: "photographer",
      cursor: "safe_cursor-1",
    });
    expect(parseProviderDiscoveryFilters({service: "admin", category: "secret", cursor: "../bad"})).toEqual(emptyFilters);
    expect(parseProviderDiscoveryFilters({q: "x"})).toEqual(emptyFilters);
  });

  it("keeps canonical filters in pagination URLs and replaces stale cursors", () => {
    const filters: ProviderDiscoveryFilters = {
      search: "garden venue",
      serviceType: "addon",
      category: "venue_provider",
      cursor: "stale-cursor",
    };

    expect(providerDiscoveryHref(filters, "next-cursor")).toBe(
      "/customer/providers?q=garden+venue&service=addon&category=venue_provider&cursor=next-cursor",
    );
    expect(providerDiscoveryHref(filters)).not.toContain("cursor=");
  });

  it("canonicalizes local marketplace return paths and rejects unsafe destinations", () => {
    expect(parseProviderDirectoryReturnHref(
      "/customer/providers?q=food&q=ignored&service=catering&unknown=value",
    )).toBe("/customer/providers?q=food&service=catering");
    expect(parseProviderDirectoryReturnHref(
      "/customer/providers?category=venue_provider&cursor=safe_cursor-1",
    )).toBe(
      "/customer/providers?category=venue_provider&cursor=safe_cursor-1",
    );
    for (const unsafe of [
      "https://evil.test/customer/providers",
      "//evil.test/customer/providers",
      "/customer/providers/provider-one",
      "/customer/providers#results",
    ]) {
      expect(parseProviderDirectoryReturnHref(unsafe)).toBe(
        "/customer/providers",
      );
    }
    expect(providerProfileHref("bad.id", "/customer/providers?q=food"))
      .toBe("/customer/providers");
  });

  it("remounts URL-driven controls when canonical filter state changes", () => {
    const {rerender} = render(
      <EventFinder key="all" query="q=initial" onFind={() => {}} />,
    );
    fireEvent.change(
      screen.getByRole("searchbox", {name: "Search approved providers"}),
      {target: {value: "stale search"}},
    );

    const nextFilters: ProviderDiscoveryFilters = {
      search: "venue",
      serviceType: "addon",
      category: "venue_provider",
      cursor: null,
    };
    rerender(<EventFinder key="venue-addon" query={providerDiscoveryHref(nextFilters).split("?")[1]} onFind={() => {}} />);

    expect(screen.getByRole("searchbox", {name: "Search approved providers"})).toHaveValue("venue");
    expect(screen.getByRole("combobox", {name: "Provider Type"})).toHaveValue("addon");
    expect(screen.getByRole("combobox", {name: "Service Category"})).toHaveValue("venue_provider");
    expect(
      new FormData(screen.getByRole("search") as HTMLFormElement).has("cursor"),
    ).toBe(false);
  });

  it("renders accessible canonical filters and provider facts without fake metrics", () => {
    render(
      <>
        <EventFinder query="" onFind={() => {}} />
        <ProviderResults page={pageWith([provider])} filters={emptyFilters} />
      </>,
    );

    expect(screen.getByRole("searchbox", {name: "Search approved providers"})).toHaveAttribute("maxlength", "80");
    fireEvent.click(screen.getByText("More filters"));
    const serviceTypeFilter = screen.getByRole("combobox", {name: "Provider Type"});
    expect(serviceTypeFilter).toHaveTextContent("Catering");
    expect(serviceTypeFilter).toHaveTextContent("Event services");
    expect(serviceTypeFilter).toHaveTextContent("Catering and event services");
    expect(screen.getByRole("combobox", {name: "Service Category"})).toHaveTextContent("Venue Provider");
    expect(screen.getByRole("button", {name: "Find Services"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Ana Events"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Ana Events"}))
      .not.toHaveClass("line-clamp-2");
    expect(screen.getByText("Approved")).toBeVisible();
    expect(screen.getByText("Ormoc City, Leyte").tagName).toBe("SPAN");
    expect(screen.getByText("50–200 guests")).toBeVisible();
    expect(screen.getByText("7 days")).toBeVisible();
    expect(screen.getByRole("article", {name: /Ana Events/iu})).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("link", {
      name: "View Ana Events public provider profile",
    })).toHaveAttribute("href", "/customer/providers/provider-one");
    expect(screen.getByText("Ormoc City, Leyte")).toHaveClass("min-w-0", "break-words");
    expect(screen.queryByText("View services")).not.toBeInTheDocument();
    expect(screen.queryByText(/\brating\b|bookings completed|response time|starting at/iu)).not.toBeInTheDocument();
  });

  it("preserves canonical filtered and paginated context in provider-card links", () => {
    const filters: ProviderDiscoveryFilters = {
      search: "food station",
      serviceType: "catering",
      category: "catering_service",
      cursor: "safe_cursor-1",
    };
    render(<ProviderResults page={pageWith([provider])} filters={filters} />);

    const href = screen.getByRole("link", {
      name: "View Ana Events public provider profile",
    }).getAttribute("href");
    const profileUrl = new URL(href!, "https://feasta.test");
    expect(profileUrl.pathname).toBe("/customer/providers/provider-one");
    expect(profileUrl.searchParams.get("returnTo")).toBe(
      "/customer/providers?q=food+station&service=catering&category=catering_service&cursor=safe_cursor-1",
    );
  });

  it("keeps conditional provider capacity, lead time, and favorite controls on compact cards", () => {
    const {rerender} = render(<ProviderResults page={pageWith([{...provider, minimumGuests: null, maximumGuests: 100, bookingLeadTimeDays: 0}])} filters={emptyFilters} />);
    expect(screen.getByText("Up to 100 guests")).toBeVisible();
    expect(screen.getByText("0 days")).toBeVisible();
    expect(screen.getByText("Approved")).toBeVisible();
    expect(screen.getByRole("link", {name: /Add Ana Events to favorites/})).toBeVisible();
    rerender(<ProviderResults page={pageWith([{...provider, minimumGuests: null, maximumGuests: null, bookingLeadTimeDays: null}])} filters={emptyFilters} />);
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Lead time")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Ana Events"})).toBeVisible();
    expect(screen.getByText("Ormoc City, Leyte")).toBeVisible();
  });

  it("presents the compact introduction and results without a filter sidebar", () => {
    render(
      <ProviderDirectoryShell>
        <ProviderResults page={pageWith([provider])} filters={emptyFilters} />
      </ProviderDirectoryShell>,
    );

    expect(screen.getByText("FEASTA Marketplace")).toBeVisible();
    expect(screen.getByRole("heading", {
      level: 2,
      name: /Find services that fit your celebration/iu,
    })).toBeVisible();
    expect(screen.getByText(/Browse approved public providers/iu)).toBeVisible();

    expect(screen.queryByText("Refine results")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", {name: "Provider discovery filters"})).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {level: 1, name: "Marketplace providers"})).toBeVisible();
    expect(screen.getByRole("article", {name: /Ana Events/})).toBeVisible();
  });

  it("distinguishes empty, filtered-empty, and error states", () => {
    const {rerender} = render(<ProviderResults page={pageWith([])} filters={emptyFilters} />);
    expect(screen.getByText("No public providers yet.")).toBeVisible();

    rerender(<ProviderResults page={pageWith([])} filters={{...emptyFilters, search: "venue"}} />);
    expect(screen.getByText("No providers match those filters.")).toBeVisible();

    const reset = vi.fn();
    rerender(<CustomerProvidersError reset={reset} />);
    fireEvent.click(screen.getByRole("button", {name: /try again/iu}));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("does not render a package section when there are no canonical package records", () => {
    const {container} = render(<MarketplacePackageSection packages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("customer marketplace server query contracts", () => {
  const webRoot = process.cwd();
  const providerService = readFileSync(join(webRoot, "src/lib/customer/providers/provider-discovery-service.ts"), "utf8");
  const homeService = readFileSync(join(webRoot, "src/lib/customer/discovery/marketplace-home-service.ts"), "utf8");
  const homepage = readFileSync(join(webRoot, "src/app/customer/page.tsx"), "utf8");

  it("keeps provider reads server-only, bounded, deterministic, and cursor based", () => {
    expect(providerService).toMatch(/^import "server-only";/u);
    expect(providerService).toContain("PROVIDER_PAGE_SIZE = 12");
    expect(providerService).toContain("safePageSize + 1");
    expect(providerService).toContain("limitToLast(safePageSize + 1)");
    expect(providerService).toContain('orderBy("favoriteCount", "desc")');
    expect(providerService).toContain("FieldPath.documentId()");
    expect(providerService).toContain("startAfter(cursor.favoriteCount, cursor.providerId)");
    expect(providerService).toContain("endBefore(cursor.favoriteCount, cursor.providerId)");
  });

  it("constrains every provider query and rechecks bounded owner accounts", () => {
    for (const predicate of [
      '.where("verificationStatus", "==", "approved")',
      '.where("publiclyVisible", "==", true)',
      '.where("isActive", "==", true)',
      '.where("isSuspended", "==", false)',
      '.where("isDeleted", "==", false)',
    ]) expect(providerService).toContain(predicate);
    expect(providerService).toContain("await adminDb.getAll");
    expect(providerService).toContain("normalizePublicProvider");
    expect(providerService).not.toContain(".get().docs");
  });

  it("shows only bounded published package documents tied to approved providers", () => {
    expect(homeService).toMatch(/^import "server-only";/u);
    expect(homeService).toContain("HOMEPAGE_PROVIDER_LIMIT = 6");
    expect(homeService).toContain("HOMEPAGE_PACKAGE_LIMIT = 4");
    expect(homeService).toContain('.where("providerId", "in", providerIds)');
    expect(homeService).toContain('.where("status", "==", "published")');
    expect(homeService).toContain('.where("providerPubliclyVisible", "==", true)');
    expect(homeService).toContain(".limit(HOMEPAGE_PACKAGE_LIMIT)");
    expect(homepage).not.toMatch(/rating|five-star|top-rated|completed bookings|response time/iu);
    expect(homepage).not.toMatch(/const\s+(?:providers|packages)\s*=\s*\[/u);
  });

  it("includes responsive grids and reduced-motion loading behavior", () => {
    const providerResults = readFileSync(join(webRoot, "src/components/customer/providers/provider-results.tsx"), "utf8");
    const providerPage = readFileSync(join(webRoot, "src/app/customer/providers/page.tsx"), "utf8");
    const directoryShell = readFileSync(join(webRoot, "src/components/customer/providers/provider-directory-shell.tsx"), "utf8");
    const marketplaceHeader = readFileSync(join(webRoot, "src/components/customer/layout/customer-marketplace-header.tsx"), "utf8");
    const loading = readFileSync(join(webRoot, "src/app/customer/providers/loading.tsx"), "utf8");
    const globalStyles = readFileSync(join(webRoot, "src/app/globals.css"), "utf8");
    expect(providerResults).toContain(
      "grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]",
    );
    expect(globalStyles).toContain("--breakpoint-sm: 37.5rem");
    expect(globalStyles).toContain("--breakpoint-md: 64rem");
    expect(globalStyles).toContain("--breakpoint-lg: 80rem");
    expect(globalStyles).toContain("--breakpoint-xl: 96rem");
    expect(providerPage).not.toContain("ProviderFilterForm");
    expect(providerPage).not.toContain("md:grid-cols-[17rem_minmax(0,1fr)]");
    expect(loading).toContain("grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]");
    expect(directoryShell).toContain("sm:-mx-6");
    expect(directoryShell).toContain("lg:-mx-8");
    expect(directoryShell).not.toContain("lg:-mx-10");
    expect(marketplaceHeader).toContain("Open Event Finder");
    expect(marketplaceHeader).not.toContain("Search event services in Ormoc City");
    expect(loading).toContain("motion-reduce:animate-none");
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-label="Loading providers"');
  });
});
