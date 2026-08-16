import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {CustomerMarketplaceShell} from "@/components/customer/layout/customer-marketplace-shell";
import {CustomerMarketplaceHeader} from "@/components/customer/layout/customer-marketplace-header";
import {PublicProviderMarketplaceShell} from "@/components/customer/layout/public-provider-marketplace-shell";

let pathname = "/customer/providers";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/components/layout/notification-menu", () => ({
  NotificationMenu: () => (
    <a href="/customer/notifications" aria-label="Notifications">
      Notifications
    </a>
  ),
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Log out</button>,
}));

describe("customer marketplace header", () => {
  beforeEach(() => {
    pathname = "/customer/providers";
  });

  it("gives guests marketplace branding, canonical search, and safe auth links", () => {
    render(
      <CustomerMarketplaceHeader
        authReturnTo="/customer/providers?service=catering"
      />,
    );

    expect(screen.getByRole("link", {
      name: "FEASTA Marketplace home",
    })).toHaveAttribute("href", "/customer/providers");
    expect(screen.getByLabelText(
      "Event location. Marketplace results are not currently filtered by location.",
    )).toHaveTextContent("Provider-listed locations");
    expect(screen.getByRole("link", {name: "Event Services"}))
      .toHaveAttribute("href", "/customer/providers");
    expect(screen.getByRole("link", {name: "Event Services"}))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", {name: "Marketplace sections"}))
      .not.toHaveClass("hidden");
    expect(screen.queryByRole("link", {name: "Catering"}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: "Add-on Services"}))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Packages"}))
      .toHaveAttribute("href", "/customer/packages");
    expect(screen.getByRole("search", {
      name: "Marketplace provider search",
    })).toHaveAttribute("action", "/customer/providers");
    expect(screen.getByRole("searchbox", {
      name: "Search providers or services",
    })).toHaveAttribute("name", "q");
    expect(screen.getByRole("link", {name: "Log in"})).toHaveAttribute(
      "href",
      "/login?next=%2Fcustomer%2Fproviders%3Fservice%3Dcatering",
    );
    expect(screen.getByRole("link", {name: "Sign up"})).toHaveAttribute(
      "href",
      "/register?next=%2Fcustomer%2Fproviders%3Fservice%3Dcatering",
    );
    expect(screen.queryByRole("link", {name: /how it works/iu}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: /become a provider/iu}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: /favorites|map/iu}))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: /event plan/iu}))
      .not.toBeInTheDocument();
  });

  it("marks the real Packages destination active without changing search scope", () => {
    pathname = "/customer/packages";
    render(<CustomerMarketplaceHeader authReturnTo="/customer/packages?event=wedding" />);

    expect(screen.getByRole("link", {name: "Packages"}))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", {name: "Event Services"}))
      .not.toHaveAttribute("aria-current");
    expect(screen.getByRole("searchbox", {name: "Search providers or services"}))
      .toHaveAttribute("name", "q");
    expect(screen.getByRole("link", {name: "Log in"})).toHaveAttribute(
      "href",
      "/login?next=%2Fcustomer%2Fpackages%3Fevent%3Dwedding",
    );
  });

  it("shows authenticated customers only implemented account destinations", () => {
    render(<CustomerMarketplaceHeader accountLabel="customer@example.test" />);

    expect(screen.getByRole("navigation", {
      name: "Marketplace sections",
    })).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Event Services"}))
      .toHaveAttribute("href", "/customer/providers");
    expect(screen.getByRole("link", {name: "Event Services"}))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("menuitem", {name: "Bookings"}))
      .toHaveAttribute("href", "/customer/bookings");
    expect(screen.getAllByRole("link", {name: "Notifications"})[0])
      .toHaveAttribute("href", "/customer/notifications");
    expect(screen.getByRole("menuitem", {name: "Account settings"}))
      .toHaveAttribute("href", "/customer/account");
    expect(screen.queryByRole("link", {name: "Log in"}))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Favorites"}))
      .toHaveAttribute("href", "/customer/favorites");
    expect(screen.getByRole("menuitem", {name: "Favorites"}))
      .toHaveAttribute("href", "/customer/favorites");
    expect(screen.getByRole("link", {name: "Packages"}))
      .toHaveAttribute("href", "/customer/packages");
    expect(screen.queryByRole("link", {name: /event plan/iu}))
      .not.toBeInTheDocument();
  });

  it("keeps both public and authenticated shells off marketing navigation", () => {
    const {rerender} = render(
      <PublicProviderMarketplaceShell authReturnTo="/customer/providers">
        <p>Public marketplace content</p>
      </PublicProviderMarketplaceShell>,
    );

    expect(screen.getByText("Public marketplace content")).toBeVisible();
    expect(screen.getByRole("banner")).toHaveTextContent("FEASTA");
    expect(screen.queryByText("How It Works")).not.toBeInTheDocument();
    expect(screen.queryByText("Become a Provider")).not.toBeInTheDocument();

    rerender(
      <CustomerMarketplaceShell accountLabel="customer@example.test">
        <p>Authenticated marketplace content</p>
      </CustomerMarketplaceShell>,
    );

    expect(screen.getByText("Authenticated marketplace content")).toBeVisible();
    expect(screen.getByRole("navigation", {
      name: "Customer mobile navigation",
    })).toBeInTheDocument();
    expect(screen.queryByText("How It Works")).not.toBeInTheDocument();
  });
});
