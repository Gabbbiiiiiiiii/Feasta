import {readFileSync} from "node:fs";
import {join} from "node:path";

import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import CustomerProvidersError from "@/app/customer/providers/error";
import {MarketplacePackageSection} from "@/components/customer/discovery/marketplace-package-section";
import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";
import {ProviderFilterForm} from "@/components/customer/providers/provider-filter-form";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {
  isPublicProviderRecord,
  normalizePublicProvider,
  providerImageUrl,
} from "@/lib/customer/providers/provider-normalization";
import {parseProviderDiscoveryFilters} from "@/lib/customer/providers/provider-query";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
  PublicProvider,
} from "@/lib/customer/providers/provider-types";

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

  it("renders accessible canonical filters and provider facts without fake metrics", () => {
    render(
      <>
        <ProviderFilterForm filters={emptyFilters} />
        <ProviderResults page={pageWith([provider])} filters={emptyFilters} />
      </>,
    );

    expect(screen.getByRole("searchbox", {name: "Search approved providers"})).toHaveAttribute("maxlength", "80");
    expect(screen.getByRole("combobox", {name: "Service type"})).toHaveTextContent("Catering and event services");
    expect(screen.getByRole("combobox", {name: "Category"})).toHaveTextContent("Venue Provider");
    expect(screen.getByRole("button", {name: "Apply filters"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Ana Events"})).toBeVisible();
    expect(screen.getByText("Approved")).toBeVisible();
    expect(screen.getByText("Ormoc City, Leyte").tagName).toBe("SPAN");
    expect(screen.getByText("50–200 guests")).toBeVisible();
    expect(screen.getByText("7 days")).toBeVisible();
    expect(screen.queryByText("View services")).not.toBeInTheDocument();
    expect(screen.queryByText(/\brating\b|bookings completed|response time|starting at/iu)).not.toBeInTheDocument();
  });

  it("presents the Ormoc City directory heading and a usable mobile filter toggle", () => {
    render(
      <ProviderDirectoryShell>
        <ProviderFilterForm filters={emptyFilters} />
      </ProviderDirectoryShell>,
    );

    expect(screen.getByText("FEASTA MARKETPLACE")).toBeVisible();
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Event services in Ormoc City",
    })).toBeVisible();
    expect(screen.getByLabelText("Service area: Ormoc City, Leyte")).toBeVisible();

    const toggle = screen.getByRole("button", {name: "Filter event services"});
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("distinguishes empty, filtered-empty, and error states", () => {
    const {rerender} = render(<ProviderResults page={pageWith([])} filters={emptyFilters} />);
    expect(screen.getByText("No providers found")).toBeVisible();

    rerender(<ProviderResults page={pageWith([])} filters={{...emptyFilters, search: "venue"}} />);
    expect(screen.getByText("No matching results")).toBeVisible();

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
    const providerFilters = readFileSync(join(webRoot, "src/components/customer/providers/provider-filter-form.tsx"), "utf8");
    const loading = readFileSync(join(webRoot, "src/app/customer/providers/loading.tsx"), "utf8");
    expect(providerResults).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(providerResults).toContain("2xl:grid-cols-4");
    expect(providerPage).toContain("lg:grid-cols-[15.5rem_minmax(0,1fr)]");
    expect(providerFilters).toContain("lg:sticky lg:top-20");
    expect(loading).toContain("motion-reduce:animate-none");
    expect(loading).toContain('aria-label="Loading providers"');
  });
});
