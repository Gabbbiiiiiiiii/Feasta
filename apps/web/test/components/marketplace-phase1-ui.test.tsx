import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it, vi} from "vitest";

import {MarketplaceProviderSection} from "@/components/customer/discovery/marketplace-provider-section";
import {PackageDetail} from "@/components/customer/packages/package-detail";
import {ProviderLogoCard} from "@/components/customer/providers/provider-logo-card";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import type {PublicPackageDetail} from "@/lib/customer/discovery/marketplace-types";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
  PublicProvider,
} from "@/lib/customer/providers/provider-types";
import {TEST_SERVICE_CATEGORY_OPTIONS} from "../fixtures/service-category-options";

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn(), refresh: vi.fn()}),
}));
vi.mock("@/app/customer/favorites/actions", () => ({
  setProviderFavoriteAction: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const eventContext = {
  eventDate: "2026-09-10",
  eventTime: "18:00",
  eventEndTime: "22:00",
  guestCount: 100,
  serviceType: "catering" as const,
};

function provider(overrides: Partial<PublicProvider> = {}): PublicProvider {
  return {
    id: "provider-one",
    businessName: "Ana Events",
    description: "Event styling and coordination for celebrations.",
    serviceType: "addon",
    primaryCategory: "event_coordinator",
    categories: ["event_coordinator"],
    location: "Ormoc City, Leyte",
    serviceAreas: ["Ormoc City"],
    eventTypes: ["wedding"],
    operatingDays: ["monday"],
    bookingLeadTimeDays: 7,
    minimumGuests: 50,
    maximumGuests: 200,
    logoUrl: null,
    coverImageUrl: null,
    approvalLabel: "Approved",
    ...overrides,
  };
}

function pageWith(records: readonly PublicProvider[]): ProviderDiscoveryPage {
  return {
    providers: records,
    previousCursor: null,
    nextCursor: null,
    pageSize: 12,
  };
}

const filters: ProviderDiscoveryFilters = {
  search: "maria",
  serviceType: "catering",
  category: "all",
  cursor: "stale_cursor",
  eventContext,
};

function packageDetail(description: string): PublicPackageDetail {
  return {
    packageRecord: {
      id: "package-one",
      providerId: "provider-one",
      providerName: "Ana Events",
      name: "Garden Celebration",
      description,
      eventType: "wedding",
      price: 45000,
      imageUrl: null,
      minimumGuests: 50,
      maximumGuests: 150,
      inclusions: [],
    },
    provider: provider(),
    customization: {
      foods: [],
      decorations: [],
      furniture: [],
      services: [],
    },
  };
}

describe("phase 1 marketplace industry selector", () => {
  it("filters through the current discovery query and marks the selected category", () => {
    const {rerender} = render(
      <ProviderResults
        page={pageWith([provider()])}
        filters={filters}
        serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );

    const nav = screen.getByRole("navigation", {name: "Provider industries"});
    const allServices = within(nav).getByRole("link", {name: "All services"});
    const photography = within(nav).getByRole("link", {name: "Photography"});

    expect(allServices).toHaveAttribute("aria-current", "page");
    expect(photography).not.toHaveAttribute("aria-current");
    expect(photography).toHaveAttribute("href", providerDiscoveryHref({
      ...filters,
      category: "photographer",
      cursor: null,
    }));
    expect(photography.getAttribute("href")).toContain("service=catering");
    expect(photography.getAttribute("href")).toContain("q=maria");
    expect(photography.getAttribute("href")).toContain("eventDate=2026-09-10");
    expect(photography.getAttribute("href")).not.toContain("cursor=");
    expect(screen.getByText("50–200 guests")).toBeVisible();
    expect(screen.getByText("7 days")).toBeVisible();

    allServices.focus();
    expect(allServices).toHaveFocus();

    rerender(
      <ProviderResults
        page={pageWith([provider()])}
        filters={{...filters, category: "photographer", cursor: null}}
        serviceCategoryOptions={TEST_SERVICE_CATEGORY_OPTIONS}
      />,
    );
    const updatedNav = screen.getByRole("navigation", {name: "Provider industries"});
    expect(within(updatedNav).getByRole("link", {name: "Photography"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(updatedNav).getByRole("link", {name: "All services"}))
      .not.toHaveAttribute("aria-current");
  });

  it("omits discontinued industries and keeps category controls keyboard operable", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "scrollLeft", "get").mockReturnValue(40);
    const scrollBy = vi.fn();
    const originalScrollBy = HTMLElement.prototype.scrollBy;
    HTMLElement.prototype.scrollBy = scrollBy;

    const options = TEST_SERVICE_CATEGORY_OPTIONS.map((option) =>
      option.code === "photographer"
        ? {...option, status: "discontinued" as const}
        : option,
    );
    render(
      <ProviderResults
        page={pageWith([])}
        filters={filters}
        serviceCategoryOptions={options}
      />,
    );

    const nav = screen.getByRole("navigation", {name: "Provider industries"});
    expect(within(nav).queryByRole("link", {name: "Photography"})).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", {name: "Venue Provider"})).toBeVisible();
    expect(screen.getByText("No providers match those filters.")).toBeVisible();
    expect(screen.getByText("Or choose another industry above.")).toBeVisible();

    const nextCategories = screen.getByRole("button", {
      name: "Show more service categories",
    });
    nextCategories.focus();
    expect(nextCategories).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({
      left: expect.any(Number),
    }));
    const scrolledLeft = scrollBy.mock.calls.at(-1)?.[0]?.left;
    expect(scrolledLeft).toBeGreaterThan(0);
    HTMLElement.prototype.scrollBy = originalScrollBy;
  });
});

describe("phase 1 provider logo card", () => {
  it("prefers a logo, falls back to cover, and stays safe when both are missing", () => {
    const logo = "https://res.cloudinary.com/feasta-test/image/upload/v1/logo.png";
    const cover = "https://res.cloudinary.com/feasta-test/image/upload/v1/cover.png";
    const {rerender} = render(
      <ProviderLogoCard
        provider={provider({logoUrl: logo, coverImageUrl: cover})}
      />,
    );
    expect(screen.getByRole("img", {name: "Ana Events logo"})).toHaveAttribute("src", logo);

    rerender(
      <ProviderLogoCard provider={provider({logoUrl: null, coverImageUrl: cover})} />,
    );
    expect(screen.getByRole("img", {name: "Ana Events cover image"})).toHaveAttribute("src", cover);

    rerender(<ProviderLogoCard provider={provider({logoUrl: null, coverImageUrl: null})} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Ana Events"})).toBeVisible();
    expect(screen.getByText("Approved")).toBeVisible();
  });

  it("uses logo cards in the marketplace provider section", () => {
    render(
      <MarketplaceProviderSection
        providers={[
          provider({
            logoUrl: "https://res.cloudinary.com/feasta-test/image/upload/v1/logo.png",
          }),
          provider({
            id: "provider-two",
            businessName: "No Logo Catering",
            logoUrl: null,
            coverImageUrl: null,
          }),
        ]}
        favoriteProviderIds={new Set(["provider-one"])}
      />,
    );

    expect(screen.getByRole("img", {name: "Ana Events logo"})).toBeVisible();
    expect(screen.queryByRole("img", {name: "No Logo Catering logo"})).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "No Logo Catering"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Remove Ana Events from favorites"})).toBeVisible();
  });
});

describe("phase 1 expandable package description", () => {
  it("keeps a short description visible without a toggle", () => {
    render(<PackageDetail detail={packageDetail("A short public description.")} />);
    expect(screen.getByText("A short public description.")).toBeVisible();
    expect(screen.queryByRole("button", {name: /read more|show less/iu})).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", {name: "Customize & request"})[0])
      .toHaveAttribute("href", "/customer/packages/package-one/book");
  });

  it("expands and collapses a long description from the keyboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(180);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(48);

    const description = "A long public package description that needs more than three lines.";
    render(<PackageDetail detail={packageDetail(description)} />);

    const paragraph = screen.getByText(description);
    expect(paragraph).toHaveClass("line-clamp-3");
    const readMore = screen.getByRole("button", {name: "Read More"});
    expect(readMore).toHaveAttribute("aria-expanded", "false");
    expect(readMore).toHaveAttribute("aria-controls", paragraph.id);

    readMore.focus();
    await user.keyboard("{Enter}");
    expect(paragraph).not.toHaveClass("line-clamp-3");
    const showLess = screen.getByRole("button", {name: "Show Less"});
    expect(showLess).toHaveAttribute("aria-expanded", "true");
    expect(showLess).toHaveFocus();

    await user.keyboard(" ");
    expect(screen.getByRole("button", {name: "Read More"})).toHaveAttribute("aria-expanded", "false");
    expect(paragraph).toHaveClass("line-clamp-3");
    expect(screen.getByText(description)).toBeVisible();
  });
});
