import userEvent from "@testing-library/user-event";
import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {renderToString} from "react-dom/server";
import {hydrateRoot} from "react-dom/client";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {CustomerMarketplaceShell} from "@/components/customer/layout/customer-marketplace-shell";
import {CustomerMarketplaceHeader} from "@/components/customer/layout/customer-marketplace-header";
import {PublicProviderMarketplaceShell} from "@/components/customer/layout/public-provider-marketplace-shell";
import {PROVIDER_CATEGORY_OPTIONS} from "@/lib/customer/providers/provider-catalog";

const mocks = vi.hoisted(() => ({push: vi.fn(), searchEventVenues: vi.fn(), getEventVenueDetails: vi.fn()}));

vi.mock("@/lib/customer/planning/event-venue-client", () => ({
  searchEventVenues: mocks.searchEventVenues,
  getEventVenueDetails: mocks.getEventVenueDetails,
}));
vi.mock("@/components/customer/providers/customer-login-modal", () => ({
  CustomerLoginModal: ({open, returnTo, initialMode}: {open: boolean; returnTo: string; initialMode: string}) =>
    open ? <div role="dialog" aria-label="Customer login" data-mode={initialMode} data-return-to={returnTo} /> : null,
}));

let pathname = "/customer/providers";
let query = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: mocks.push}),
  usePathname: () => pathname,
  useSearchParams: () => query,
}));

vi.mock("@/components/layout/notification-menu", () => ({
  NotificationMenu: () => (
    <a href="/customer/notifications" aria-label="Notifications">
      Notifications
    </a>
  ),
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign Out</button>,
}));

describe("customer marketplace header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchEventVenues.mockResolvedValue([]);
    pathname = "/customer/providers";
    query = new URLSearchParams();
  });

  it("centers marketplace links beside an accessible search icon and preserves guest actions", () => {
    query = new URLSearchParams("service=catering");
    render(<CustomerMarketplaceHeader authReturnTo="/customer/providers?service=catering" />);
    expect(screen.getByRole("link", {name: "FEASTA home"})).toHaveAttribute("href", "/customer/providers");
    expect(screen.queryByLabelText("Event location: Ormoc City, Leyte")).not.toBeInTheDocument();
    expect(screen.getByRole("img", {name: "Feasta"})).toHaveAttribute("src", expect.stringContaining("feasta_logo.svg"));
    const nav = screen.getByRole("navigation", {name: "Marketplace sections"});
    expect(nav).toHaveClass("justify-center");
    expect(nav).not.toHaveClass("hidden");
    const headerGrid = nav.parentElement;
    expect(headerGrid).toBe(screen.getByRole("link", {name: "FEASTA home"}).parentElement);
    expect(headerGrid).toBe(screen.getByRole("navigation", {name: "Guest marketplace account"}).parentElement);
    expect(headerGrid).toHaveClass("md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]", "md:grid-rows-[4rem_auto]");
    expect(nav).toHaveClass("col-span-full", "row-start-2", "md:col-start-2", "md:row-start-1", "md:border-t-0");
    expect(document.getElementById("marketplace-event-finder")).toHaveClass("col-span-full", "row-start-3", "md:row-start-2");
    expect(within(nav).getByRole("link", {name: "Event Services"})).toHaveAttribute("href", "/customer/providers");
    expect(within(nav).getByRole("link", {name: "Event Services"})).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", {name: "Packages"})).toHaveAttribute("href", "/customer/packages");
    expect(within(nav).queryByText("Categories")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", {name: "Search event services"})).not.toBeInTheDocument();
    const trigger = within(nav).getByRole("button", {name: "Open Event Finder"});
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveClass("focus-visible:ring-2");
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("search", {name: "Event Finder"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Sign up"}));
    expect(screen.getByRole("dialog", {name: "Customer login"})).toHaveAttribute("data-mode", "register");
    fireEvent.click(screen.getByRole("button", {name: "Log in"}));
    expect(screen.getByRole("dialog", {name: "Customer login"})).toHaveAttribute("data-return-to", "/customer/providers?service=catering");
  });

  it("opens with the keyboard, exposes labeled fields, and closes on Escape with focus returned", async () => {
    const user = userEvent.setup();
    render(<CustomerMarketplaceHeader />);
    const trigger = screen.getByRole("button", {name: "Open Event Finder"});
    trigger.focus();
    await user.keyboard("{Enter}");
    const finder = screen.getByRole("search", {name: "Event Finder"});
    expect(finder).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(finder).queryByLabelText("Service Type")).not.toBeInTheDocument();
    expect(within(finder).getByRole("option", {name: "What service do you need?"})).toHaveValue("all");
    expect(within(finder).getByRole("combobox", {name: "Location"})).toHaveAttribute("placeholder", "Ormoc City, Leyte");
    expect(within(finder).getByLabelText("Event Date")).toHaveAttribute("type", "date");
    expect(within(finder).getByText("Select event date")).toBeVisible();
    expect(within(finder).getByRole("combobox", {name: "Service Category"})).toHaveValue("all");
    await user.tab();
    expect(within(finder).getByRole("combobox", {name: "Location"})).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("search", {name: "Event Finder"})).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it.each(["guest", "customer"] as const)("hydrates deterministic %s header markup without attribute warnings", async (account) => {
    query = new URLSearchParams("category=photographer&eventDate=2099-09-10");
    const tree = account === "guest"
      ? <PublicProviderMarketplaceShell authReturnTo="/customer/providers"><p>Marketplace</p></PublicProviderMarketplaceShell>
      : <CustomerMarketplaceHeader accountLabel="customer-account" accountFirstName="Gabriel" accountLastName="Santos" />;
    const markup = renderToString(tree);
    expect(renderToString(tree)).toBe(markup);
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.appendChild(container);
    const guestMarkup = account === "guest"
      ? within(container).getByRole("navigation", {name: "Guest marketplace account"}).outerHTML
      : null;
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, tree, {onRecoverableError}); });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(warnings).not.toHaveBeenCalled();
      if (guestMarkup) {
        expect(within(container).getByRole("navigation", {name: "Guest marketplace account"}).outerHTML).toBe(guestMarkup);
      } else {
        expect(within(container).getByLabelText("Open customer account menu")).toBeVisible();
      }
      expect(within(container).getByRole("button", {name: "Open Event Finder"})).toHaveAttribute("aria-expanded", "false");
      expect(within(container).queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      errors.mockRestore();
      warnings.mockRestore();
    }
  });

  it("uses the real category catalog and preserves drafts when toggled closed", () => {
    query = new URLSearchParams("category=photographer");
    render(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    const selector = screen.getByRole("combobox", {name: "Service Category"});
    expect(within(selector).getAllByRole("option").map((option) => option.getAttribute("value")))
      .toEqual(["all", ...PROVIDER_CATEGORY_OPTIONS.map((option) => option.value)]);
    expect(selector).toHaveValue("photographer");
    expect(screen.getByRole("link", {name: "Event Services"})).toHaveAttribute("aria-current", "page");
    fireEvent.change(selector, {target: {value: "venue_provider"}});
    fireEvent.click(screen.getByRole("button", {name: "Close Event Finder"}));
    expect(screen.queryByRole("search", {name: "Event Finder"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    expect(screen.getByRole("combobox", {name: "Service Category"})).toHaveValue("venue_provider");
  });

  it("submits canonical category and date state, preserves existing filters, and resets pagination", () => {
    query = new URLSearchParams("q=flowers&service=addon&cursor=old_page&eventType=wedding&guestCount=50");
    render(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    fireEvent.change(screen.getByLabelText("Event Date"), {target: {value: "2099-09-10"}});
    fireEvent.change(screen.getByRole("combobox", {name: "Service Category"}), {target: {value: "photographer"}});
    fireEvent.click(screen.getByRole("button", {name: "Find Services"}));
    const url = new URL(mocks.push.mock.calls[0][0], "https://feasta.test");
    expect(url.pathname).toBe("/customer/providers");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "flowers", service: "addon", category: "photographer", eventType: "wedding", guestCount: "50", eventDate: "2099-09-10",
    });
    expect(url.searchParams.has("eventTime")).toBe(false);
    expect(screen.queryByRole("search", {name: "Event Finder"})).not.toBeInTheDocument();
  });

  it("reuses real venue selection and clears it without retaining stale URL coordinates", async () => {
    mocks.searchEventVenues.mockResolvedValue([{
      placeId: "ChIJ_superdome1234", mainText: "Ormoc City Superdome", secondaryText: "Ormoc City, Leyte", fullAddress: "Superdome, Ormoc City, Leyte",
    }]);
    mocks.getEventVenueDetails.mockResolvedValue({address: "Superdome, Ormoc City, Leyte", city: "Ormoc City", province: "Leyte", latitude: 11.005, longitude: 124.608});
    const view = render(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    fireEvent.change(screen.getByRole("combobox", {name: "Location"}), {target: {value: "Superdome"}});
    fireEvent.click(await screen.findByRole("option", {name: /Ormoc City Superdome/}));
    await waitFor(() => expect(screen.getByText(/Event venue selected:/)).toBeVisible());
    fireEvent.click(screen.getByRole("button", {name: "Find Services"}));
    query = new URL(mocks.push.mock.calls[0][0], "https://feasta.test").searchParams;
    expect(query.get("eventVenuePlaceId")).toBe("ChIJ_superdome1234");
    expect(query.get("eventVenueLat")).toBe("11.005");
    expect(query.get("eventVenueLng")).toBe("124.608");
    view.rerender(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    expect(screen.getByRole("combobox", {name: "Location"})).toHaveValue("Superdome, Ormoc City, Leyte");
    fireEvent.click(screen.getByRole("button", {name: "Clear event venue"}));
    fireEvent.click(screen.getByRole("button", {name: "Find Services"}));
    expect(mocks.push).toHaveBeenLastCalledWith("/customer/providers");
  });

  it("preserves an existing complete availability context when the date changes", () => {
    query = new URLSearchParams("eventDate=2099-09-10&eventTime=18%3A00&eventEndTime=22%3A00&guestCount=100&category=photographer");
    render(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    expect(screen.getByLabelText("Event Date")).toHaveValue("2099-09-10");
    fireEvent.change(screen.getByLabelText("Event Date"), {target: {value: "2099-09-11"}});
    fireEvent.click(screen.getByRole("button", {name: "Find Services"}));
    const url = new URL(mocks.push.mock.calls[0][0], "https://feasta.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({eventDate: "2099-09-11", eventTime: "18:00", eventEndTime: "22:00", guestCount: "100", category: "photographer"});
  });

  it("keeps keyword and provider-service filtering available in More filters", () => {
    render(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    const more = screen.getByText("More filters");
    expect(more.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(more);
    expect(screen.getByRole("option", {name: "All provider types"})).toHaveValue("all");
    expect(screen.getByRole("option", {name: "Catering provider"})).toHaveValue("catering");
    fireEvent.change(screen.getByRole("searchbox", {name: "Search approved providers"}), {target: {value: "garden venue"}});
    fireEvent.change(screen.getByRole("combobox", {name: "Provider Type"}), {target: {value: "addon"}});
    fireEvent.change(screen.getByRole("combobox", {name: "Service Category"}), {target: {value: "venue_provider"}});
    fireEvent.click(screen.getByRole("button", {name: "Find Services"}));
    expect(mocks.push).toHaveBeenCalledWith("/customer/providers?q=garden+venue&service=addon&category=venue_provider");
  });

  it("clears discovery filters and pagination while preserving event planning context", () => {
    query = new URLSearchParams("q=garden&service=addon&category=venue_provider&cursor=old&eventDate=2099-09-10&eventTime=18%3A00&eventEndTime=22%3A00&guestCount=100");
    render(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    expect(screen.getByText("More filters").closest("details")).toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", {name: "Clear filters"}));
    const url = new URL(mocks.push.mock.calls[0][0], "https://feasta.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({eventDate: "2099-09-10", eventTime: "18:00", eventEndTime: "22:00", guestCount: "100"});
  });

  it("resets disclosure and defaults after route or URL navigation", () => {
    const view = render(<CustomerMarketplaceHeader />);
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    query = new URLSearchParams("category=venue_provider&eventDate=2099-09-12");
    view.rerender(<CustomerMarketplaceHeader />);
    expect(screen.queryByRole("search", {name: "Event Finder"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Open Event Finder"}));
    expect(screen.getByRole("combobox", {name: "Service Category"})).toHaveValue("venue_provider");
    expect(screen.getByLabelText("Event Date")).toHaveValue("2099-09-12");
    pathname = "/customer/packages";
    query = new URLSearchParams();
    view.rerender(<CustomerMarketplaceHeader />);
    expect(screen.getByRole("link", {name: "Packages"})).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("search", {name: "Event Finder"})).not.toBeInTheDocument();
  });

  it("uses trusted profile names, keeps utility favorites, and avoids duplicate menu destinations", () => {
    render(
      <CustomerMarketplaceHeader
        accountLabel="customer-account"
        accountFirstName="Sophia"
        accountLastName="Ranalan"
        accountEmail="sophiaranalan16@gmail.com"
      />,
    );

    expect(screen.getByText("Sophia")).toBeVisible();
    const accountSummary = screen.getByLabelText("Open customer account menu");
    fireEvent.click(accountSummary);
    expect(screen.getByText("Sophia R.")).toBeVisible();
    expect(screen.getByText("sophiaranalan16@gmail.com")).toBeVisible();
    expect(screen.getByRole("link", {name: "Favorites"}))
      .toHaveAttribute("href", "/customer/favorites");
    expect(screen.getAllByRole("link", {name: "Favorites"})).toHaveLength(1);
    expect(screen.getByRole("menuitem", {name: "Account Settings"}))
      .toHaveAttribute("href", "/customer/account");
    expect(screen.getByRole("menuitem", {name: "My Bookings"}))
      .toHaveAttribute("href", "/customer/bookings");
    expect(screen.getByRole("menuitem", {name: "Messages"}))
      .toHaveAttribute("href", "/customer/messages");
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.indexOf(screen.getByRole("menuitem", {name: "Messages"})))
      .toBe(menuItems.indexOf(screen.getByRole("menuitem", {name: "My Bookings"})) + 1);
    expect(screen.getByRole("button", {name: "Sign Out"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Notifications"}))
      .toHaveAttribute("href", "/customer/notifications");
    expect(screen.getByLabelText("Open customer account menu")).not.toHaveTextContent(
      "sophiaranalan16@gmail.com",
    );
    accountSummary.focus();
    fireEvent.keyDown(accountSummary, {key: "Escape"});
    expect(accountSummary.closest("details")).not.toHaveAttribute("open");
    expect(accountSummary).toHaveFocus();
  });

  it("derives profile identity through the trusted customer layout instead of hardcoding it", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/customer/layout.tsx"), "utf8");
    const header = readFileSync(join(
      process.cwd(),
      "src/components/customer/layout/customer-marketplace-header.tsx",
    ), "utf8");
    expect(layout).toContain("loadAccountManagementProfile");
    expect(layout).toContain("accountFirstName: profile?.firstName");
    expect(header).not.toContain("Sophia");
  });

  it("marks Packages active and keeps public and authenticated shells responsive", () => {
    pathname = "/customer/packages/package_12345678";
    const {rerender} = render(
      <PublicProviderMarketplaceShell authReturnTo="/customer/packages">
        <p>Public marketplace content</p>
      </PublicProviderMarketplaceShell>,
    );

    expect(screen.getByRole("link", {name: "Packages"}))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Public marketplace content")).toBeVisible();

    rerender(
      <CustomerMarketplaceShell accountLabel="customer@example.test">
        <p>Authenticated marketplace content</p>
      </CustomerMarketplaceShell>,
    );
    expect(screen.getByText("Authenticated marketplace content")).toBeVisible();
    const mobileNavigation = screen.getByRole("navigation", {name: "Customer mobile navigation"});
    expect(within(mobileNavigation).queryByRole("link", {name: "Home"}))
      .not.toBeInTheDocument();
    expect(within(mobileNavigation).getByRole("link", {name: "Event Services"}))
      .toHaveAttribute("href", "/customer/providers");
    expect(within(mobileNavigation).getByRole("link", {name: "Packages"}))
      .toHaveAttribute("href", "/customer/packages");
    expect(within(mobileNavigation).getByRole("link", {name: "Bookings"}))
      .toHaveAttribute("href", "/customer/bookings");
    expect(within(mobileNavigation).getByRole("link", {name: "Favorites"}))
      .toHaveAttribute("href", "/customer/favorites");
  });
});
