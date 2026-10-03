import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {EventFinder} from "@/components/customer/layout/event-finder";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {roleNavigation} from "@/components/layout/navigation";
import {PageHeading} from "@/components/layout/page-heading";
import type {
  ProviderDiscoveryFilters,
  ProviderDiscoveryPage,
} from "@/lib/customer/providers/provider-types";

vi.mock("@/app/customer/favorites/actions", () => ({
  setProviderFavoriteAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn()})}));
vi.mock("@/lib/customer/planning/event-venue-client", () => ({searchEventVenues: vi.fn(), getEventVenueDetails: vi.fn()}));

const filters: ProviderDiscoveryFilters = {
  search: "",
  serviceType: "all",
  category: "all",
  cursor: null,
};

const emptyPage: ProviderDiscoveryPage = {
  providers: [],
  previousCursor: null,
  nextCursor: null,
  pageSize: 12,
};

describe("representative application screens", () => {
  it("uses the shared discovery controls and an honest empty result state", () => {
    render(
      <>
        <PageHeading
          eyebrow="Discovery"
          title="Find event providers"
          description="Search approved public providers."
        />
        <EventFinder query="" onFind={() => {}} />
        <ProviderResults page={emptyPage} filters={filters} />
      </>,
    );

    expect(screen.getByRole("heading", {level: 1, name: "Find event providers"})).toBeInTheDocument();
    fireEvent.click(screen.getByText("More filters"));
    expect(screen.getByRole("searchbox", {name: "Search approved providers"})).toBeInTheDocument();
    expect(screen.getByRole("combobox", {name: "Provider Type"})).toBeInTheDocument();
    expect(screen.getByRole("combobox", {name: "Service Category"})).toBeInTheDocument();
    expect(screen.getByText("No public providers yet.")).toBeInTheDocument();
  });

  it("exposes provider verification within the protected provider shell", () => {
    expect(roleNavigation.provider).toEqual(expect.arrayContaining([
      expect.objectContaining({label: "Verification", href: "/provider/verification"}),
    ]));
  });
});
