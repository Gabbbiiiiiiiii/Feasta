import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";
import type {ProviderDiscoveryFilters, ProviderDiscoveryPage, PublicProvider} from "@/lib/customer/providers/provider-types";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  checkMarketplaceAvailability: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: mocks.push}),
}));
vi.mock("@/app/customer/favorites/actions", () => ({
  setProviderFavoriteAction: vi.fn(),
}));
vi.mock("@/lib/customer/providers/marketplace-provider-availability-client", () => ({
  checkMarketplaceProviderAvailability: mocks.checkMarketplaceAvailability,
}));

import {MarketplaceSearch} from "@/components/customer/discovery/marketplace-search";
import {PublicPackageCard} from "@/components/customer/packages/public-package-card";
import {PackageDetail} from "@/components/customer/packages/package-detail";
import {ProviderEventContextPanel} from "@/components/customer/providers/provider-event-context-panel";
import {ProviderFilterForm} from "@/components/customer/providers/provider-filter-form";
import {ProviderPagination} from "@/components/customer/providers/provider-pagination";
import {ProviderResults} from "@/components/customer/providers/provider-results";
import {
  parseCustomerEventContext,
  type CustomerEventContext,
} from "@/lib/customer/planning/event-planning-context";
import {
  parseProviderDiscoveryFilters,
  providerDiscoveryHref,
} from "@/lib/customer/providers/provider-query";

const context: CustomerEventContext = {
  eventDate: "2026-09-10",
  eventTime: "18:00",
  eventEndTime: "22:00",
  guestCount: 100,
  serviceType: "catering",
};

const provider: PublicProvider = {
  id: "provider_12345678",
  businessName: "Maria's Catering",
  description: "Celebration catering",
  serviceType: "catering",
  primaryCategory: "catering_service",
  categories: ["catering_service"],
  location: "Ormoc City, Leyte",
  serviceAreas: ["Ormoc City"],
  eventTypes: ["wedding"],
  operatingDays: ["thursday"],
  bookingLeadTimeDays: 7,
  minimumGuests: 20,
  maximumGuests: 300,
  logoUrl: null,
  coverImageUrl: null,
  approvalLabel: "Approved",
};

const page: ProviderDiscoveryPage = {
  providers: [provider],
  previousCursor: "previous_cursor",
  nextCursor: "next_cursor",
  pageSize: 12,
};

function filters(eventContext: CustomerEventContext | null = null): ProviderDiscoveryFilters {
  return {
    search: "maria",
    serviceType: "catering",
    category: "catering_service",
    cursor: null,
    ...(eventContext ? {eventContext} : {}),
  };
}

describe("customer home event planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.setSystemTime(new Date("2026-08-28T04:00:00.000Z"));
  });

  it("renders first-class, labelled event planning controls", () => {
    render(<MarketplaceSearch />);
    expect(screen.getByLabelText("Service type")).toBeVisible();
    expect(screen.getByLabelText("Event date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Start time")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("End time")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Guests")).toHaveAttribute("type", "number");
    expect(screen.getByRole("searchbox", {name: /optional provider/iu})).toBeVisible();
  });

  it("blocks a past date with inline guidance", () => {
    render(<MarketplaceSearch />);
    fillHomeForm({eventDate: "2026-08-27"});
    fireEvent.click(screen.getByRole("button", {name: "Find available services"}));
    expect(screen.getByText("Choose today or a future event date.")).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("blocks an invalid time range", () => {
    render(<MarketplaceSearch />);
    fillHomeForm({eventEndTime: "17:00"});
    fireEvent.click(screen.getByRole("button", {name: "Find available services"}));
    expect(screen.getByText("End time must be later than start time.")).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("blocks a non-positive guest count", () => {
    render(<MarketplaceSearch />);
    fillHomeForm({guestCount: "0"});
    fireEvent.click(screen.getByRole("button", {name: "Find available services"}));
    expect(screen.getByText(/whole number from 1/iu)).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("navigates with normalized bookmarkable event context and optional search", () => {
    render(<MarketplaceSearch />);
    fillHomeForm();
    fireEvent.change(screen.getByRole("searchbox", {name: /optional provider/iu}), {
      target: {value: "  Maria   Catering  "},
    });
    fireEvent.click(screen.getByRole("button", {name: "Find available services"}));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    const href = mocks.push.mock.calls[0]?.[0] as string;
    expect(href).toContain("/customer/providers?");
    expect(href).toContain("eventDate=2026-09-10");
    expect(href).toContain("eventTime=18%3A00");
    expect(href).toContain("eventEndTime=22%3A00");
    expect(href).toContain("guestCount=100");
    expect(href).toContain("service=catering");
    expect(href).not.toContain("serviceType=");
    expect(href).toContain("q=Maria+Catering");
  });

  it("keeps the existing active-event summary separate from the new planning form", () => {
    const home = readFileSync(join(process.cwd(), "src/app/customer/page.tsx"), "utf8");
    const planning = readFileSync(join(process.cwd(), "src/components/customer/discovery/marketplace-search.tsx"), "utf8");
    expect(home).toContain("<MarketplaceSearch />");
    expect(home).toContain("<MarketplaceActiveEventStrip />");
    expect(planning).not.toContain("getCustomerBookingPage");
  });
});

describe("availability-aware marketplace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkMarketplaceAvailability.mockResolvedValue([
      availability(true),
    ]);
  });

  it("does not claim providers are available without valid event context", () => {
    render(<ProviderResults page={page} filters={filters()} authenticatedCustomer />);
    expect(screen.getByRole("heading", {name: "Marketplace providers"})).toBeVisible();
    expect(screen.queryByText("Available providers")).not.toBeInTheDocument();
    expect(screen.getByText("Choose your event date and details to check availability.")).toBeVisible();
    expect(mocks.checkMarketplaceAvailability).not.toHaveBeenCalled();
  });

  it("strictly parses valid context and rejects malformed URL values", () => {
    expect(parseCustomerEventContext({...context, guestCount: "100"})).toEqual(context);
    expect(parseCustomerEventContext({...context, eventDate: "2026-02-30", guestCount: "100"})).toBeNull();
    expect(parseCustomerEventContext({...context, eventEndTime: "17:00", guestCount: "100"})).toBeNull();
    expect(parseCustomerEventContext({...context, guestCount: "1.5"})).toBeNull();
  });

  it("renders a compact event summary with editable labelled fields", () => {
    render(<ProviderEventContextPanel filters={filters(context)} />);
    expect(screen.getByText("Sep 10, 2026")).toBeVisible();
    expect(screen.getByText(/6:00 PM–10:00 PM/iu)).toBeVisible();
    expect(screen.getByText("100 guests")).toBeVisible();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-10");
    expect(screen.getByRole("button", {name: "Update availability"})).toBeVisible();
  });

  it("updates event details while preserving canonical marketplace filters and restarting pagination", () => {
    render(<ProviderEventContextPanel filters={{
      ...filters(context),
      cursor: "stale_cursor",
    }} />);
    fireEvent.change(screen.getByLabelText("Date"), {target: {value: "2026-09-11"}});
    fireEvent.change(screen.getByLabelText("Start"), {target: {value: "19:00"}});
    fireEvent.change(screen.getByLabelText("End"), {target: {value: "23:00"}});
    fireEvent.change(screen.getByLabelText("Guests"), {target: {value: "120"}});

    const form = screen.getByRole("button", {name: "Update availability"}).closest("form");
    if (!form) throw new Error("Expected the event-context update form.");
    const values = Object.fromEntries(new FormData(form));
    const parameters = new URLSearchParams(values as Record<string, string>);
    expect(parameters.get("q")).toBe("maria");
    expect(parameters.get("service")).toBe("catering");
    expect(parameters.has("serviceType")).toBe(false);
    expect(parameters.get("category")).toBe("catering_service");
    expect(parameters.get("eventDate")).toBe("2026-09-11");
    expect(parameters.get("eventTime")).toBe("19:00");
    expect(parameters.get("eventEndTime")).toBe("23:00");
    expect(parameters.get("guestCount")).toBe("120");
    expect(parameters.has("cursor")).toBe(false);
    expect(parseProviderDiscoveryFilters(Object.fromEntries(parameters))).toMatchObject({
      search: "maria",
      serviceType: "catering",
      category: "catering_service",
      cursor: null,
      eventContext: {...context, eventDate: "2026-09-11", eventTime: "19:00", eventEndTime: "23:00", guestCount: 120},
    });
  });

  it("checks the visible page once and renders an available state", async () => {
    render(<ProviderResults page={page} filters={filters(context)} authenticatedCustomer />);
    await waitFor(() => expect(mocks.checkMarketplaceAvailability).toHaveBeenCalledTimes(1));
    expect(mocks.checkMarketplaceAvailability).toHaveBeenCalledWith([provider.id], context);
    expect(await screen.findByText("Available for your selected event.")).toBeVisible();
    expect(screen.getByLabelText("Available")).toBeVisible();
  });

  it.each([
    ["LEAD_TIME_NOT_MET", "Requires booking at least 7 days in advance."],
    ["BLOCKED_DATE", "Not available on this date."],
    ["TIME_CONFLICT", "Not available during the selected time."],
    ["GUEST_CAPACITY_EXCEEDED", "Guest count exceeds this provider's supported capacity."],
  ] as const)("renders customer-safe %s feedback and browsing-only behavior", async (reasonCode, message) => {
    mocks.checkMarketplaceAvailability.mockResolvedValueOnce([
      availability(false, reasonCode, message),
    ]);
    render(<ProviderResults page={page} filters={filters(context)} authenticatedCustomer />);
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByLabelText("Unavailable")).toBeVisible();
    expect(screen.getByText("Browsing only for this event")).toBeVisible();
    expect(screen.getByRole("link", {name: /view maria's catering public provider profile/iu})).toBeVisible();
  });

  it("prevents an older response from overwriting a newer event context", async () => {
    const first = deferred();
    const second = deferred();
    mocks.checkMarketplaceAvailability
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = render(<ProviderResults page={page} filters={filters(context)} authenticatedCustomer />);
    await waitFor(() => expect(mocks.checkMarketplaceAvailability).toHaveBeenCalledTimes(1));
    const newerContext = {...context, eventDate: "2026-09-11"};
    view.rerender(<ProviderResults page={page} filters={filters(newerContext)} authenticatedCustomer />);
    await waitFor(() => expect(mocks.checkMarketplaceAvailability).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve([availability(true)]));
    expect(await screen.findByText("Available for your selected event.")).toBeVisible();
    await act(async () => first.resolve([
      availability(false, "BLOCKED_DATE", "Not available on this date."),
    ]));
    expect(screen.queryByText("Not available on this date.")).not.toBeInTheDocument();
  });

  it("preserves event context through filters and pagination", () => {
    const href = providerDiscoveryHref(filters(context), "next_cursor");
    expect(href).toContain("q=maria");
    expect(href).toContain("service=catering");
    expect(href).toContain("category=catering_service");
    expect(href).toContain("cursor=next_cursor");
    expect(href).toContain("eventDate=2026-09-10");
    expect(href).toContain("guestCount=100");
    const filterView = render(<ProviderFilterForm filters={filters(context)} />);
    expect(filterView.container.querySelector('form input[name="eventDate"]')).toHaveValue("2026-09-10");
    expect(filterView.container.querySelector('form input[name="eventEndTime"]')).toHaveValue("22:00");
    render(<ProviderPagination page={page} filters={filters(context)} />);
    expect(screen.getByRole("link", {name: "Next"})).toHaveAttribute("href", expect.stringContaining("eventEndTime=22%3A00"));
  });

  it("carries event context from provider packages into package details", () => {
    render(<PublicPackageCard
      packageRecord={{
        id: "package_12345678",
        providerId: provider.id,
        providerName: provider.businessName,
        name: "Wedding feast",
        description: null,
        eventType: "wedding",
        price: 50_000,
        minimumGuests: 20,
        maximumGuests: 200,
        inclusions: [],
        imageUrl: null,
      }}
      marketplaceHref={providerDiscoveryHref(filters(context))}
    />);
    const link = screen.getByRole("link", {name: /view wedding feast package details/iu});
    expect(link).toHaveAttribute("href", expect.stringContaining("eventDate=2026-09-10"));
    expect(link).toHaveAttribute("href", expect.stringContaining("guestCount=100"));
  });

  it("carries package detail context into booking", () => {
    render(<PackageDetail
      detail={{
        packageRecord: {
          id: "package_12345678",
          providerId: provider.id,
          providerName: provider.businessName,
          name: "Wedding feast",
          description: "A complete event package.",
          eventType: "wedding",
          price: 50_000,
          minimumGuests: 20,
          maximumGuests: 200,
          inclusions: ["Buffet"],
          imageUrl: null,
        },
        provider,
        customization: {foods: [], decorations: [], furniture: [], services: []},
      }}
      eventContext={context}
    />);
    for (const link of screen.getAllByRole("link", {name: "Customize & request"})) {
      expect(link).toHaveAttribute("href", expect.stringContaining("/book?eventDate=2026-09-10"));
      expect(link).toHaveAttribute("href", expect.stringContaining("eventEndTime=22%3A00"));
      expect(link).toHaveAttribute("href", expect.stringContaining("guestCount=100"));
    }
  });

  it("keeps marketplace authority in the callable and out of client Firestore reads", () => {
    const client = readFileSync(join(
      process.cwd(),
      "src/lib/customer/providers/marketplace-provider-availability-client.ts",
    ), "utf8");
    expect(client).toContain("httpsCallable");
    expect(client).toContain("checkMarketplaceProviderAvailability");
    expect(client).not.toMatch(/firebase\/firestore|collection\(|getDocs\(|onSnapshot\(/u);
    expect(client).not.toMatch(/unavailableDates|ownerId|bookingId|customerId/u);
  });
});

function fillHomeForm(overrides: Partial<Record<"eventDate" | "eventTime" | "eventEndTime" | "guestCount", string>> = {}) {
  fireEvent.change(screen.getByLabelText("Service type"), {target: {value: "catering"}});
  fireEvent.change(screen.getByLabelText("Event date"), {target: {value: overrides.eventDate ?? "2026-09-10"}});
  fireEvent.change(screen.getByLabelText("Start time"), {target: {value: overrides.eventTime ?? "18:00"}});
  fireEvent.change(screen.getByLabelText("End time"), {target: {value: overrides.eventEndTime ?? "22:00"}});
  fireEvent.change(screen.getByLabelText("Guests"), {target: {value: overrides.guestCount ?? "100"}});
}

function availability(
  available: boolean,
  reasonCode: CustomerProviderAvailability["reasonCode"] = null,
  message = "Available for your selected event.",
): CustomerProviderAvailability {
  return {providerId: provider.id, available, reasonCode, message};
}

function deferred() {
  let resolve!: (value: readonly CustomerProviderAvailability[]) => void;
  const promise = new Promise<readonly CustomerProviderAvailability[]>((done) => {
    resolve = done;
  });
  return {promise, resolve};
}
