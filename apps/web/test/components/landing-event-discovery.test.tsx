import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchEventVenues: vi.fn(),
  getEventVenueDetails: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: mocks.push}),
  usePathname: () => "/",
}));
vi.mock("@/lib/customer/providers/provider-discovery-service", () => ({getPublicProviderPage: vi.fn().mockResolvedValue({providers: []})}));
vi.mock("@/app/customer/favorites/actions", () => ({setProviderFavoriteAction: vi.fn()}));
vi.mock("@/lib/customer/planning/event-venue-client", () => ({
  searchEventVenues: mocks.searchEventVenues,
  getEventVenueDetails: mocks.getEventVenueDetails,
}));

import {StartYourEventForm} from "@/components/landing/start-your-event-form";
import HomePage from "@/app/page";
import {NextRequest} from "next/server";
import {proxy} from "@/proxy";
import {ProviderEventContextPanel} from "@/components/customer/providers/provider-event-context-panel";
import {
  parseProviderDiscoveryFilters,
  providerDiscoveryHref,
} from "@/lib/customer/providers/provider-query";

const venueQuery = {
  eventVenueLabel: "Ormoc City Superdome",
  eventVenueAddress: "Ormoc City Superdome, Ormoc City, Leyte, Philippines",
  eventVenueCity: "Ormoc City",
  eventVenueProvince: "Leyte",
  eventVenuePlaceId: "ChIJ_superdome1234",
  eventVenueLat: "11.005",
  eventVenueLng: "124.608",
};

describe("public landing event discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchEventVenues.mockResolvedValue([{
      placeId: venueQuery.eventVenuePlaceId,
      mainText: venueQuery.eventVenueLabel,
      secondaryText: "Ormoc City, Leyte",
      fullAddress: venueQuery.eventVenueAddress,
    }]);
    mocks.getEventVenueDetails.mockResolvedValue({
      address: venueQuery.eventVenueAddress,
      city: venueQuery.eventVenueCity,
      province: venueQuery.eventVenueProvince,
      latitude: Number(venueQuery.eventVenueLat),
      longitude: Number(venueQuery.eventVenueLng),
    });
  });

  it("opens the general Provider marketplace when no filters are selected", () => {
    render(<StartYourEventForm />);
    fireEvent.click(screen.getByRole("button", {name: "Explore"}));
    expect(mocks.push).toHaveBeenCalledWith("/customer/providers");
    expect(screen.getByRole("button", {name: "Explore"}).closest("form")).toHaveAttribute("action", "/customer/providers");
  });

  it("hands off only non-empty event type and guest context", () => {
    render(<StartYourEventForm />);
    fireEvent.change(screen.getByLabelText("Event type"), {
      target: {value: "birthday"},
    });
    fireEvent.change(screen.getByLabelText("Guests"), {
      target: {value: "50"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Explore"}));
    expect(mocks.push).toHaveBeenCalledWith(
      "/customer/providers?eventType=birthday&guestCount=50",
    );
  });

  it("rejects a non-positive guest count without creating malformed URL state", () => {
    render(<StartYourEventForm />);
    fireEvent.change(screen.getByLabelText("Guests"), {
      target: {value: "0"},
    });
    const form = screen.getByRole("button", {name: "Explore"}).closest("form");
    if (!form) throw new Error("Expected the Start Your Event form.");
    fireEvent.submit(form);
    expect(screen.getByText(/whole number from 1/iu)).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("selects a real Places result and carries normalized event venue context", async () => {
    render(<StartYourEventForm />);
    fireEvent.change(screen.getByLabelText("Event type"), {target: {value: "birthday"}});
    fireEvent.change(screen.getByLabelText("Date"), {target: {value: "2099-09-20"}});
    fireEvent.change(screen.getByLabelText("Guests"), {target: {value: "100"}});
    fireEvent.change(screen.getByLabelText("Location"), {
      target: {value: "Ormoc Superdome"},
    });
    fireEvent.click(await screen.findByRole("option", {name: /Ormoc City Superdome/iu}));
    await waitFor(() => expect(
      document.querySelector('input[name="eventVenuePlaceId"]'),
    ).toHaveValue(venueQuery.eventVenuePlaceId));
    fireEvent.click(screen.getByRole("button", {name: "Explore"}));

    const href = mocks.push.mock.calls.at(-1)?.[0] as string;
    const url = new URL(href, "https://feasta.test");
    expect(url.pathname).toBe("/customer/providers");
    expect(url.searchParams.get("eventType")).toBe("birthday");
    expect(url.searchParams.get("eventDate")).toBe("2099-09-20");
    expect(url.searchParams.get("guestCount")).toBe("100");
    for (const [name, value] of Object.entries(venueQuery)) {
      expect(url.searchParams.get(name)).toBe(value);
    }
    const canonical = parseProviderDiscoveryFilters(Object.fromEntries(url.searchParams));
    expect(providerDiscoveryHref(canonical)).toBe(href);
    expect(canonical.eventContext).toBeUndefined();
    expect(proxy(new NextRequest(url)).headers.get("location")).toBeNull();
  });

  it("lets the Customer clear a selected venue before marketplace handoff", async () => {
    render(<StartYourEventForm />);
    fireEvent.change(screen.getByLabelText("Location"), {
      target: {value: "Ormoc Superdome"},
    });
    fireEvent.click(await screen.findByRole("option", {name: /Ormoc City Superdome/iu}));
    await waitFor(() => expect(
      document.querySelector('input[name="eventVenuePlaceId"]'),
    ).toHaveValue(venueQuery.eventVenuePlaceId));
    fireEvent.click(screen.getByRole("button", {name: "Clear event venue"}));
    fireEvent.click(screen.getByRole("button", {name: "Explore"}));
    expect(mocks.push).toHaveBeenLastCalledWith("/customer/providers");
  });

  it("keeps non-location discovery usable when Google Places fails", async () => {
    mocks.searchEventVenues.mockRejectedValueOnce(new Error(
      "Event venue search is temporarily unavailable. You can still explore without a location.",
    ));
    render(<StartYourEventForm />);
    fireEvent.change(screen.getByLabelText("Event type"), {
      target: {value: "wedding"},
    });
    fireEvent.change(screen.getByLabelText("Location"), {
      target: {value: "Unknown venue"},
    });
    expect(await screen.findByText(/temporarily unavailable/iu)).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Explore"}));
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/customer/providers?eventType=wedding",
    );
  });

  it("parses, validates, serializes, and visibly preserves full planning context", () => {
    const filters = parseProviderDiscoveryFilters({
      eventType: "wedding",
      eventDate: "2099-09-20",
      guestCount: "100",
      ...venueQuery,
    });
    expect(filters.planningContext).toEqual({
      eventType: "wedding",
      eventDate: "2099-09-20",
      guestCount: 100,
      eventVenue: {
        label: venueQuery.eventVenueLabel,
        address: venueQuery.eventVenueAddress,
        city: venueQuery.eventVenueCity,
        province: venueQuery.eventVenueProvince,
        placeId: venueQuery.eventVenuePlaceId,
        latitude: Number(venueQuery.eventVenueLat),
        longitude: Number(venueQuery.eventVenueLng),
      },
    });
    expect(providerDiscoveryHref(filters)).toContain("eventVenueLabel=Ormoc+City+Superdome");
    expect(parseProviderDiscoveryFilters({guestCount: "0"}).planningContext).toBeUndefined();

    render(<ProviderEventContextPanel filters={filters} />);
    expect(screen.getAllByText("Wedding").length).toBeGreaterThan(0);
    expect(screen.getByText("Sep 20, 2099")).toBeVisible();
    expect(screen.getByText("100 guests")).toBeVisible();
    expect(screen.getByText(/Ormoc City Superdome, Ormoc City, Leyte/iu)).toBeVisible();
    expect(screen.getByLabelText("Event venue")).toHaveValue(
      venueQuery.eventVenueAddress,
    );
    expect(screen.getByRole("link", {name: "Clear event details"})).toBeVisible();
  });

  it("keeps Start Planning anchored and uses the verified Provider onboarding route", () => {
    const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(page).toContain('href="#start-your-event"');
    expect(page).toContain('href="/become-a-provider"');
    expect(page).toContain("Become a Provider");
  });

  it("keeps the marketing page and opens public marketplace routes from its entry links", async () => {
    render(await HomePage());
    expect(screen.getByRole("button", {name: "Explore"})).toBeVisible();
    expect(screen.getAllByRole("link", {name: /How It Works/i}).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", {name: /About/i}).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", {name: "Browse Providers"})).toHaveAttribute("href", "/customer/providers");
    const birthday = screen.getByRole("heading", {name: "Birthday"}).closest("a");
    expect(birthday).toHaveAttribute("href", "/customer/providers?eventType=birthday");
    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("/customer/")) continue;
      const response = proxy(new NextRequest(new URL(href, "https://feasta.test")));
      expect(response.status, href).toBe(200);
      expect(response.headers.get("location"), href).toBeNull();
    }
  });
});
