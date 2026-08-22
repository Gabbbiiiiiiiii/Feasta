import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/provider/packages",
  prefetch: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    prefetch: navigation.prefetch,
    replace: navigation.replace,
    refresh: navigation.refresh,
  }),
}));

vi.mock("@/lib/auth/client-session", () => ({
  logoutWebSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  "@/components/layout/notification-menu",
  () => ({
    NotificationMenu: ({
      role,
    }: {
      role: "customer" | "provider" | "admin";
    }) => (
      <button
        type="button"
        aria-label="Notifications"
        data-role={role}
      >
        Notifications
      </button>
    ),
  }),
);

import {ApplicationShell} from "@/components/layout/application-shell";
import {PageHeading} from "@/components/layout/page-heading";
import {
  getRoleNavigation,
  roleNavigation,
  type ProviderNavigationContext,
} from "@/components/layout/navigation";
import {Button} from "@/components/ui/button";

const approvedCateringProvider: ProviderNavigationContext = {
  kind: "profile",
  providerServiceType: "catering",
  verificationStatus: "approved",
  isActive: true,
  isSuspended: false,
  isDeleted: false,
};

describe("ApplicationShell", () => {
  it("builds catalog navigation from the provider service type", () => {
  const catering =
    getRoleNavigation(
      "provider",
      approvedCateringProvider,
    );

  expect(
    catering.some(
      (item) =>
        item.kind === "link" &&
        item.href ===
        "/provider/packages",
    ),
  ).toBe(true);

  expect(
    catering.some(
      (item) =>
        item.kind === "link" &&
        item.href ===
        "/provider/services",
    ),
  ).toBe(false);

  const addon =
    getRoleNavigation(
      "provider",
      {
        ...approvedCateringProvider,
        providerServiceType: "addon",
      },
    );

  expect(
    addon.some(
      (item) =>
        item.kind === "link" &&
        item.href ===
        "/provider/packages",
    ),
  ).toBe(false);

  expect(
    addon.some(
      (item) =>
        item.kind === "link" &&
        item.href ===
        "/provider/services",
    ),
  ).toBe(true);

  const both =
    getRoleNavigation(
      "provider",
      {
        ...approvedCateringProvider,
        providerServiceType: "both",
      },
    );

  expect(
    both.some(
      (item) =>
        item.kind === "link" &&
        item.href ===
        "/provider/packages",
    ),
  ).toBe(true);

  expect(
    both.some(
      (item) =>
        item.kind === "link" &&
        item.href ===
        "/provider/services",
    ),
  ).toBe(true);
});
  it("renders role-specific navigation with an accessible active state", () => {
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedCateringProvider}
      >
        <p>Provider content</p>
      </ApplicationShell>,
    );

    const desktopNav = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    const mobileNav = screen.getByRole("navigation", {
      name: "Provider mobile navigation",
    });
    expect(within(desktopNav).getByRole("link", {name: "Packages / Catalog"})).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(desktopNav).getByRole("link", {name: "Dashboard"})).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(mobileNav).getAllByRole("link")).toHaveLength(3);
    expect(within(mobileNav).getByRole("button", {
      name: "More provider navigation",
    })).toBeVisible();
    expect(desktopNav.closest("aside")).toHaveClass("md:flex");
    expect(mobileNav).toHaveClass("md:hidden");
    expect(mobileNav).toHaveClass(
      "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
    );
    expect(
      screen.getByRole("button", {
        name: "Notifications",
      }),
    ).toHaveAttribute(
      "data-role",
      "provider",
    );
  });

  it("supports keyboard collapse and keeps labels available when compact", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedCateringProvider}
      >
        <p>Provider content</p>
      </ApplicationShell>,
    );
    const collapse = screen.getByRole("button", {name: "Collapse sidebar"});
    collapse.focus();
    await user.keyboard("{Enter}");

    const expand = screen.getByRole("button", {name: "Expand sidebar"});
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Provider sidebar")).toHaveClass(
      "w-[var(--sidebar-collapsed)]",
    );
    expect(
      within(
        screen.getByRole("navigation", {name: "Provider primary navigation"}),
      ).getByRole("link", {name: "Packages / Catalog"}),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("navigation", {name: "Provider primary navigation"}),
      ).getByRole("link", {name: "Bookings"}),
    ).toHaveAttribute("href", "/provider/bookings");
    expect(
      within(
        screen.getByRole("navigation", {name: "Provider primary navigation"}),
      ).getByRole("link", {name: "Availability"}),
    ).toHaveAttribute("href", "/provider/availability");
    expect(
      within(
        screen.getByRole("navigation", {name: "Provider primary navigation"}),
      ).getByRole("link", {name: "Payments"}),
    ).toHaveAttribute("href", "/provider/payments");
  });

  it("places a skip link first and exposes one semantic main region", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell role="customer" accountLabel="customer@feasta.test">
        <p>Customer content</p>
      </ApplicationShell>,
    );
    await user.tab();
    const skipLink = screen.getByRole("link", {name: "Skip to main content"});
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByText("Customer content")).toBeVisible();
  });

  it("keeps each role navigation configuration separate", () => {
    expect(roleNavigation.customer[0]).toMatchObject({
      label: "Home",
      href: "/customer",
    });

    expect(roleNavigation.customer[1]).toMatchObject({
      label: "Event Services",
      href: "/customer/providers",
    });

    expect(roleNavigation.provider).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "link",
        href: "/provider/verification",
      }),
    ]));

    expect(roleNavigation.admin[0]).toMatchObject({
      kind: "link",
      href: "/admin",
    });
  });

  it("closes the account disclosure with Escape and restores focus", async () => {
    const user = userEvent.setup();
    render(<ApplicationShell role="provider" accountLabel="provider@feasta.test"><p>Provider content</p></ApplicationShell>);
    const summary = screen.getByText("Open account menu").closest("summary");
    expect(summary).not.toBeNull();
    summary!.focus();
    const details = summary!.closest("details")!;
    details.open = true;
    expect(details).toHaveAttribute("open");
    await user.keyboard("{Escape}");
    expect(details).not.toHaveAttribute("open");
    expect(summary).toHaveFocus();
  });
});

describe("PageHeading", () => {
  it("uses one h1 and stacks long actions responsively", () => {
    render(
      <PageHeading
        title="A deliberately long administration page title that needs to wrap"
        description="Supporting content remains readable at narrow widths and large text sizes."
        actions={<Button>Review provider application</Button>}
      />,
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /deliberately long administration page title/,
      }),
    ).toHaveClass("break-words");
    expect(screen.getByRole("button", {name: "Review provider application"}).parentElement).toHaveClass(
      "flex-col",
      "sm:flex-row",
    );
  });
});
