import {fireEvent, render, screen, within} from "@testing-library/react";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {CustomerMarketplaceShell} from "@/components/customer/layout/customer-marketplace-shell";
import {CustomerMarketplaceHeader} from "@/components/customer/layout/customer-marketplace-header";
import {PublicProviderMarketplaceShell} from "@/components/customer/layout/public-provider-marketplace-shell";
import {PROVIDER_CATEGORY_OPTIONS} from "@/lib/customer/providers/provider-catalog";

let pathname = "/customer/providers";
let query = new URLSearchParams();

vi.mock("next/navigation", () => ({
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
    pathname = "/customer/providers";
    query = new URLSearchParams();
  });

  it("uses the approved desktop information architecture and safe event-location semantics", () => {
    render(<CustomerMarketplaceHeader authReturnTo="/customer/providers?service=catering" />);

    expect(screen.getByRole("link", {name: "FEASTA home"}))
      .toHaveAttribute("href", "/customer");
    const location = screen.getByLabelText("Event location: Ormoc City, Leyte");
    expect(location).toHaveTextContent("Event location");
    expect(location).toHaveTextContent("Ormoc City, Leyte");
    expect(location).not.toHaveTextContent("Provider-listed locations");
    expect(location).not.toHaveTextContent(/GPS|current location/iu);

    const marketplaceNavigation = screen.getByRole("navigation", {name: "Marketplace sections"});
    expect(within(marketplaceNavigation).getByRole("link", {name: "Event Services"}))
      .toHaveAttribute("href", "/customer/providers");
    expect(within(marketplaceNavigation).getByRole("link", {name: "Event Services"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(marketplaceNavigation).getByRole("link", {name: "Packages"}))
      .toHaveAttribute("href", "/customer/packages");
    expect(within(marketplaceNavigation).getByText("Categories")).toBeVisible();
    expect(within(marketplaceNavigation).queryByRole("link", {name: "Home"}))
      .not.toBeInTheDocument();
    expect(within(marketplaceNavigation).queryByText("Messages")).not.toBeInTheDocument();
    expect(within(marketplaceNavigation).queryByText("My Bookings")).not.toBeInTheDocument();
    expect(within(marketplaceNavigation).queryByText("Saved")).not.toBeInTheDocument();

    expect(screen.getByRole("link", {name: "Log in"})).toHaveAttribute(
      "href",
      "/login?next=%2Fcustomer%2Fproviders%3Fservice%3Dcatering",
    );
  });

  it("builds Categories from the authoritative catalog and canonical marketplace query", () => {
    query = new URLSearchParams("category=photographer");
    render(<CustomerMarketplaceHeader />);

    const categories = screen.getByText("Categories").closest("summary");
    expect(categories).toHaveAttribute("aria-current", "page");
    const menu = screen.getByRole("menu", {name: "Event service categories"});
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(PROVIDER_CATEGORY_OPTIONS.length);
    expect(within(menu).getByRole("menuitem", {name: "Photographer"}))
      .toHaveAttribute("href", "/customer/providers?category=photographer");
    expect(within(menu).getByRole("menuitem", {name: "Photographer"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("menuitem", {name: "Venue Provider"}))
      .toHaveAttribute("href", "/customer/providers?category=venue_provider");
    expect(document.body.innerHTML).not.toContain("/customer/categories");
  });

  it("keeps marketplace search behavior and moves the visible focus treatment to the rounded parent", () => {
    render(<CustomerMarketplaceHeader />);

    const search = screen.getByRole("search", {name: "Search event services"});
    const input = screen.getByRole("searchbox", {name: "Search event services"});
    expect(search).toHaveAttribute("action", "/customer/providers");
    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveAttribute("placeholder", "Search event services");
    expect(input.parentElement).toHaveClass(
      "rounded-full",
      "focus-within:border-primary/45",
      "focus-within:ring-2",
      "duration-200",
    );
    expect(input).toHaveClass("focus-visible:ring-0");
    expect(screen.getByRole("button", {name: "Search marketplace"}))
      .toHaveClass("focus-visible:ring-2");
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
    expect(within(mobileNavigation).getByRole("link", {name: "Home"}))
      .toHaveAttribute("href", "/customer");
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
