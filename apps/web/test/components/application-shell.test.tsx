import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/provider/packages",
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({replace: navigation.replace, refresh: navigation.refresh}),
}));

vi.mock("@/lib/auth/client-session", () => ({
  logoutWebSession: vi.fn().mockResolvedValue(undefined),
}));

import {ApplicationShell} from "@/components/layout/application-shell";
import {PageHeading} from "@/components/layout/page-heading";
import {roleNavigation} from "@/components/layout/navigation";
import {Button} from "@/components/ui/button";

describe("ApplicationShell", () => {
  it("renders role-specific navigation with an accessible active state", () => {
    render(
      <ApplicationShell role="provider" accountLabel="provider@feasta.test">
        <p>Provider content</p>
      </ApplicationShell>,
    );

    const desktopNav = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    const mobileNav = screen.getByRole("navigation", {
      name: "Provider mobile navigation",
    });
    expect(within(desktopNav).getByRole("link", {name: "Packages"})).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(desktopNav).getByRole("link", {name: "Dashboard"})).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(mobileNav).getByRole("link", {name: "Packages"})).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(desktopNav.closest("aside")).toHaveClass("md:flex");
    expect(mobileNav).toHaveClass("md:hidden");
    expect(mobileNav).toHaveClass(
      "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
    );
    expect(screen.getByRole("link", {name: "Notifications"})).toHaveAttribute(
      "href",
      "/provider/notifications",
    );
  });

  it("supports keyboard collapse and keeps labels available when compact", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell role="provider" accountLabel="provider@feasta.test">
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
      ).getByRole("link", {name: "Packages"}),
    ).toBeVisible();
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
    expect(roleNavigation.customer[0].href).toBe("/customer");
    expect(roleNavigation.provider[0].href).toBe("/provider");
    expect(roleNavigation.admin[0].href).toBe("/admin");
    expect(roleNavigation.customer.map((item) => item.href)).not.toContain(
      "/admin/users",
    );
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
