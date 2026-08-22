import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/provider",
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({prefetch: navigation.prefetch}),
}));

vi.mock("@/lib/auth/client-session", () => ({
  logoutWebSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/layout/notification-menu", () => ({
  NotificationMenu: () => <button type="button">Notifications menu</button>,
}));

import {ApplicationShell} from "@/components/layout/application-shell";
import {
  getRoleNavigation,
  groupNavigationItems,
  isNavigationItemActive,
  type NavigationLinkItem,
  type ProviderNavigationContext,
} from "@/components/layout/navigation";

type ProviderProfileNavigationContext = Extract<
  ProviderNavigationContext,
  {kind: "profile"}
>;

const approvedProvider: ProviderProfileNavigationContext = {
  kind: "profile",
  providerServiceType: "catering",
  verificationStatus: "approved",
  isActive: true,
  isSuspended: false,
  isDeleted: false,
};

function providerContext(
  overrides: Partial<ProviderProfileNavigationContext>,
): ProviderProfileNavigationContext {
  return {...approvedProvider, ...overrides};
}

function hrefs(context?: ProviderNavigationContext): string[] {
  return getRoleNavigation("provider", context)
    .filter((item): item is NavigationLinkItem => item.kind === "link")
    .map((item) => item.href);
}

describe("provider navigation configuration", () => {
  it("uses only canonical provider service capabilities", () => {
    expect(hrefs(approvedProvider)).toContain("/provider/packages");
    expect(hrefs(approvedProvider)).not.toContain("/provider/services");

    expect(hrefs(providerContext({providerServiceType: "addon"})))
      .toContain("/provider/services");
    expect(hrefs(providerContext({providerServiceType: "addon"})))
      .not.toContain("/provider/packages");

    const both = hrefs(providerContext({providerServiceType: "both"}));
    expect(both).toContain("/provider/packages");
    expect(both).toContain("/provider/services");
  });

  it("does not assume catering when provider context is missing", () => {
    expect(hrefs()).not.toContain("/provider/packages");
    expect(hrefs()).not.toContain("/provider/services");
    expect(hrefs({kind: "no-profile"})).not.toContain("/provider/packages");
    expect(hrefs({kind: "no-profile"})).not.toContain("/provider/services");
  });

  it("groups the approved provider workspace into the target sections", () => {
    const groups = groupNavigationItems(
      getRoleNavigation("provider", providerContext({providerServiceType: "both"})),
    );

    expect(groups.map((group) => group.label)).toEqual([
      null,
      "BOOKINGS",
      "SERVICES",
      "COMMUNICATION",
      "BUSINESS",
      "ACCOUNT",
    ]);
  });

  it("represents unfinished features only as disabled items", () => {
    const navigationItems = getRoleNavigation("provider", approvedProvider);
    const disabled = navigationItems.filter((item) => item.kind === "disabled");

    expect(disabled.map((item) => item.label)).toEqual([
      "Messages",
      "Reviews",
    ]);
    expect(disabled.every((item) => item.disabledReason === "Coming soon"))
      .toBe(true);
    expect(disabled.every((item) => !("href" in item))).toBe(true);
    expect(hrefs(approvedProvider)).toContain("/provider/business-profile");
  });

  it("restricts navigation according to canonical provider state", () => {
    for (const verificationStatus of ["draft", "resubmission_required"] as const) {
      const draftHrefs = hrefs(providerContext({verificationStatus}));
      expect(draftHrefs).toEqual([
        "/provider/packages",
        "/provider/notifications",
        "/provider/verification",
        "/provider/account",
      ]);
    }

    for (const verificationStatus of [
      "submitted",
      "under_review",
      "rejected",
      "suspended",
    ] as const) {
      expect(hrefs(providerContext({verificationStatus}))).toEqual([
        "/provider/notifications",
        "/provider/verification",
        "/provider/account",
      ]);
    }

    expect(hrefs(providerContext({isActive: false}))).toEqual([
      "/provider/notifications",
      "/provider/verification",
      "/provider/account",
    ]);
    expect(hrefs(approvedProvider)).toContain("/provider/requests");
  });

  it("keeps active matching exact for the dashboard and nested for owned routes", () => {
    expect(isNavigationItemActive("/provider", "/provider")).toBe(true);
    expect(isNavigationItemActive("/provider/requests", "/provider")).toBe(false);
    expect(isNavigationItemActive("/provider/requests/example", "/provider/requests"))
      .toBe(true);
  });

  it("treats verification and status routes as one navigation destination", () => {
    const verification = getRoleNavigation("provider", approvedProvider).find(
      (item): item is NavigationLinkItem =>
        item.kind === "link" && item.label === "Verification",
    );

    expect(verification).toBeDefined();
    expect(verification?.href).toBe("/provider/verification");
    expect(isNavigationItemActive("/provider", verification!)).toBe(false);
    expect(isNavigationItemActive("/provider/verification", verification!)).toBe(true);
    expect(isNavigationItemActive(
      "/provider/verification?stage=review",
      verification!,
    )).toBe(true);
    expect(isNavigationItemActive(
      "/provider/verification/history",
      verification!,
    )).toBe(true);
    expect(isNavigationItemActive("/provider/status", verification!)).toBe(true);
    expect(isNavigationItemActive("/provider/status/history", verification!)).toBe(true);
  });

  it("only enables routes that exist in the provider application", () => {
    const existingRoutes = new Set([
      "/provider",
      "/provider/requests",
      "/provider/bookings",
      "/provider/calendar",
      "/provider/availability",
      "/provider/payments",
      "/provider/business-profile",
      "/provider/packages",
      "/provider/services",
      "/provider/notifications",
      "/provider/verification",
      "/provider/status",
      "/provider/account",
    ]);

    for (const serviceType of ["catering", "addon", "both"] as const) {
      for (const href of hrefs(providerContext({providerServiceType: serviceType}))) {
        expect(existingRoutes.has(href), href).toBe(true);
      }
    }
  });
});

describe("provider navigation rendering", () => {
  it("marks only Dashboard active on the provider home route", () => {
    navigation.pathname = "/provider";
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedProvider}
      >
        Provider content
      </ApplicationShell>,
    );

    const desktop = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    expect(within(desktop).getByRole("link", {name: "Dashboard"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(desktop).getByRole("link", {name: "Verification"}))
      .not.toHaveAttribute("aria-current");
  });

  it("renders sections, disabled states, and the correct active route", () => {
    navigation.pathname = "/provider/requests/example";
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={providerContext({providerServiceType: "both"})}
      >
        Provider content
      </ApplicationShell>,
    );

    const desktop = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    for (const section of [
      "BOOKINGS",
      "SERVICES",
      "COMMUNICATION",
      "BUSINESS",
      "ACCOUNT",
    ]) {
      expect(within(desktop).getByRole("heading", {name: section})).toBeVisible();
    }

    expect(within(desktop).getByRole("link", {name: "Booking Requests"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(desktop).getByRole("link", {name: "Dashboard"}))
      .not.toHaveAttribute("aria-current");

    expect(within(desktop).getByRole("link", {name: "Bookings"}))
      .toHaveAttribute("href", "/provider/bookings");
    expect(within(desktop).getByRole("link", {name: "Availability"}))
      .toHaveAttribute("href", "/provider/availability");
    expect(within(desktop).getByRole("link", {name: "Payments"}))
      .toHaveAttribute("href", "/provider/payments");
    expect(within(desktop).queryByText("Payments & Earnings"))
      .not.toBeInTheDocument();
    expect(within(desktop).getAllByText("Coming soon")).toHaveLength(2);
  });

  it("keeps bookings and booking requests as distinct active routes", () => {
    const items = getRoleNavigation("provider", approvedProvider);
    const bookings = items.find(
      (item): item is NavigationLinkItem =>
        item.kind === "link" && item.href === "/provider/bookings",
    );
    const requests = items.find(
      (item): item is NavigationLinkItem =>
        item.kind === "link" && item.href === "/provider/requests",
    );

    expect(bookings).toBeDefined();
    expect(requests).toBeDefined();
    expect(isNavigationItemActive("/provider/bookings", bookings!)).toBe(true);
    expect(isNavigationItemActive("/provider/bookings/history", bookings!)).toBe(true);
    expect(isNavigationItemActive("/provider/bookings", requests!)).toBe(false);
  });

  it("keeps availability distinct and active for nested workspace routes", () => {
    const items = getRoleNavigation("provider", approvedProvider);
    const availability = items.find(
      (item): item is NavigationLinkItem =>
        item.kind === "link" && item.href === "/provider/availability",
    );
    const calendar = items.find(
      (item): item is NavigationLinkItem =>
        item.kind === "link" && item.href === "/provider/calendar",
    );

    expect(availability).toBeDefined();
    expect(isNavigationItemActive("/provider/availability", availability!)).toBe(true);
    expect(isNavigationItemActive("/provider/availability/rules", availability!))
      .toBe(true);
    expect(isNavigationItemActive("/provider/availability/rules", calendar!))
      .toBe(false);
  });

  it("keeps Payments distinct and active for nested workspace routes", () => {
    const items = getRoleNavigation("provider", approvedProvider);
    const payments = items.find(
      (item): item is NavigationLinkItem =>
        item.kind === "link" && item.href === "/provider/payments",
    );
    const availability = items.find(
      (item): item is NavigationLinkItem =>
        item.kind === "link" && item.href === "/provider/availability",
    );

    expect(payments).toBeDefined();
    expect(payments?.label).toBe("Payments");
    expect(isNavigationItemActive("/provider/payments", payments!)).toBe(true);
    expect(isNavigationItemActive("/provider/payments/history", payments!)).toBe(true);
    expect(isNavigationItemActive("/provider/payments/history", availability!))
      .toBe(false);
  });

  it("uses a small mobile bar and an accessible complete navigation drawer", async () => {
    navigation.pathname = "/provider";
    const user = userEvent.setup();
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={providerContext({providerServiceType: "both"})}
      >
        Provider content
      </ApplicationShell>,
    );

    const mobile = screen.getByRole("navigation", {
      name: "Provider mobile navigation",
    });
    expect(within(mobile).getAllByRole("link")).toHaveLength(3);

    const more = within(mobile).getByRole("button", {
      name: "More provider navigation",
    });
    more.focus();
    await user.keyboard("{Enter}");

    const complete = screen.getByRole("navigation", {
      name: "Provider complete mobile navigation",
    });
    expect(within(complete).getByRole("link", {name: "Packages / Catalog"}))
      .toBeVisible();
    expect(within(complete).getByRole("link", {name: "Bookings"}))
      .toHaveAttribute("href", "/provider/bookings");
    expect(within(complete).getByRole("link", {name: "Availability"}))
      .toHaveAttribute("href", "/provider/availability");
    expect(within(complete).getByRole("link", {name: "Payments"}))
      .toHaveAttribute("href", "/provider/payments");
    expect(within(complete).getByRole("link", {name: "Business Profile"}))
      .toHaveAttribute("href", "/provider/business-profile");
    expect(within(complete).getByText("Messages").closest("a")).toBeNull();
    expect(within(complete).getByText("Messages").closest("[aria-disabled='true']"))
      .toHaveAttribute("aria-label", "Messages - Coming soon");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", {
      name: "Provider complete mobile navigation",
    })).not.toBeInTheDocument();
    expect(more).toHaveFocus();

    await user.click(more);
    const reopened = screen.getByRole("navigation", {
      name: "Provider complete mobile navigation",
    });
    const preventDocumentNavigation = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("click", preventDocumentNavigation);
    await user.click(within(reopened).getByRole("link", {
      name: "Notifications",
    }));
    document.removeEventListener("click", preventDocumentNavigation);
    expect(screen.queryByRole("navigation", {
      name: "Provider complete mobile navigation",
    })).not.toBeInTheDocument();
  });

  it("marks Availability active in desktop and mobile More navigation", async () => {
    navigation.pathname = "/provider/availability/rules";
    const user = userEvent.setup();
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedProvider}
      >
        Availability workspace
      </ApplicationShell>,
    );

    const desktop = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    expect(within(desktop).getByRole("link", {name: "Availability"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(desktop).getByRole("link", {name: "Calendar"}))
      .not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", {
      name: "More provider navigation",
    }));
    const complete = screen.getByRole("navigation", {
      name: "Provider complete mobile navigation",
    });
    expect(within(complete).getByRole("link", {name: "Availability"}))
      .toHaveAttribute("aria-current", "page");
  });

  it("marks Payments active in desktop and mobile More navigation", async () => {
    navigation.pathname = "/provider/payments/history";
    const user = userEvent.setup();
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedProvider}
      >
        Payment history
      </ApplicationShell>,
    );

    const desktop = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    expect(within(desktop).getByRole("link", {name: "Payments"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(desktop).getByRole("link", {name: "Availability"}))
      .not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", {
      name: "More provider navigation",
    }));
    const complete = screen.getByRole("navigation", {
      name: "Provider complete mobile navigation",
    });
    const payments = within(complete).getByRole("link", {name: "Payments"});
    expect(payments).toHaveAttribute("aria-current", "page");

    const preventDocumentNavigation = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("click", preventDocumentNavigation);
    await user.click(payments);
    document.removeEventListener("click", preventDocumentNavigation);
    expect(screen.queryByRole("navigation", {
      name: "Provider complete mobile navigation",
    })).not.toBeInTheDocument();
  });

  it("marks nested Business Profile routes active and closes More on selection", async () => {
    navigation.pathname = "/provider/business-profile/media";
    const user = userEvent.setup();
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedProvider}
      >
        Business profile workspace
      </ApplicationShell>,
    );

    const desktop = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    expect(within(desktop).getByRole("link", {name: "Business Profile"}))
      .toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", {
      name: "More provider navigation",
    }));
    const complete = screen.getByRole("navigation", {
      name: "Provider complete mobile navigation",
    });
    const businessProfile = within(complete).getByRole("link", {
      name: "Business Profile",
    });
    expect(businessProfile).toHaveAttribute("aria-current", "page");
    expect(within(complete).getByText("Messages").closest("a")).toBeNull();
    expect(within(complete).getByText("Reviews").closest("a")).toBeNull();

    const preventDocumentNavigation = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("click", preventDocumentNavigation);
    await user.click(businessProfile);
    document.removeEventListener("click", preventDocumentNavigation);
    expect(screen.queryByRole("navigation", {
      name: "Provider complete mobile navigation",
    })).not.toBeInTheDocument();
  });

  it("marks Bookings active in desktop and More navigation and closes More on selection", async () => {
    navigation.pathname = "/provider/bookings/history";
    const user = userEvent.setup();
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedProvider}
      >
        Booking history
      </ApplicationShell>,
    );

    const desktop = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    expect(within(desktop).getByRole("link", {name: "Bookings"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(desktop).getByRole("link", {name: "Booking Requests"}))
      .not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", {
      name: "More provider navigation",
    }));
    const complete = screen.getByRole("navigation", {
      name: "Provider complete mobile navigation",
    });
    const bookings = within(complete).getByRole("link", {name: "Bookings"});
    expect(bookings).toHaveAttribute("aria-current", "page");

    const preventDocumentNavigation = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("click", preventDocumentNavigation);
    await user.click(bookings);
    document.removeEventListener("click", preventDocumentNavigation);
    expect(screen.queryByRole("navigation", {
      name: "Provider complete mobile navigation",
    })).not.toBeInTheDocument();
  });

  it("marks Verification active on status routes in desktop and mobile navigation", async () => {
    navigation.pathname = "/provider/status";
    const user = userEvent.setup();
    render(
      <ApplicationShell
        role="provider"
        accountLabel="provider@feasta.test"
        providerContext={approvedProvider}
      >
        Provider status
      </ApplicationShell>,
    );

    const desktop = screen.getByRole("navigation", {
      name: "Provider primary navigation",
    });
    expect(within(desktop).getByRole("link", {name: "Verification"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(desktop).getByRole("link", {name: "Dashboard"}))
      .not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", {
      name: "More provider navigation",
    }));
    const mobile = screen.getByRole("navigation", {
      name: "Provider complete mobile navigation",
    });
    expect(within(mobile).getByRole("link", {name: "Verification"}))
      .toHaveAttribute("aria-current", "page");
    expect(within(mobile).getByRole("link", {name: "Dashboard"}))
      .not.toHaveAttribute("aria-current");
  });
});
