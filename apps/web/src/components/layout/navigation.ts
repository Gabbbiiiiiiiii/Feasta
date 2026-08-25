import {
  Bell,
  Building2,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  CircleUserRound,
  ClipboardList,
  CreditCard,
  FileCheck2,
  House,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  MessageSquareWarning,
  PackageOpen,
  ScrollText,
  Settings2,
  ShieldCheck,
  Star,
  Store,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import type {
  ProviderServiceType,
  ProviderVerificationStatus,
} from "@feasta/shared-types";

export type ShellRole = "customer" | "provider" | "admin";

type NavigationItemBase = {
  label: string;
  icon: LucideIcon;
  section?: string;
};

export type NavigationLinkItem = NavigationItemBase & {
  kind: "link";
  href: string;
  activeRouteAliases?: readonly string[];
};

export type NavigationDisabledItem = NavigationItemBase & {
  kind: "disabled";
  disabledReason: "Coming soon";
};

export type NavigationItem = NavigationLinkItem | NavigationDisabledItem;

export type ProviderNavigationContext =
  | {kind: "identity-limited"}
  | {kind: "no-profile"}
  | {
    kind: "profile";
    providerServiceType: ProviderServiceType;
    verificationStatus: ProviderVerificationStatus;
    isActive: boolean;
    isSuspended: boolean;
    isDeleted: boolean;
  };

export type NavigationGroup = {
  label: string | null;
  items: NavigationItem[];
};

export const roleHome: Record<ShellRole, string> = {
  customer: "/customer",
  provider: "/provider",
  admin: "/admin",
};

export const roleLabels: Record<ShellRole, string> = {
  customer: "Customer",
  provider: "Provider",
  admin: "Admin",
};

const customerNavigation: readonly NavigationItem[] = [
  {kind: "link", label: "Home", href: "/customer", icon: House},
  {kind: "link", label: "Event Services", href: "/customer/providers", icon: Store},
  {kind: "link", label: "Bookings", href: "/customer/bookings", icon: CalendarDays},
  {kind: "link", label: "Payments", href: "/customer/payments", icon: CreditCard},
];

const providerDashboardNavigation: NavigationLinkItem = {
  kind: "link",
  label: "Dashboard",
  href: "/provider",
  icon: House,
};

const providerBookingNavigation: readonly NavigationItem[] = [
  {
    kind: "link",
    section: "BOOKINGS",
    label: "Booking Requests",
    href: "/provider/requests",
    icon: ClipboardList,
  },
  {
    kind: "link",
    section: "BOOKINGS",
    label: "Bookings",
    href: "/provider/bookings",
    icon: CalendarDays,
  },
  {
    kind: "link",
    section: "BOOKINGS",
    label: "Calendar",
    href: "/provider/calendar",
    icon: CalendarDays,
  },
];

const providerPackageNavigation: NavigationLinkItem = {
  kind: "link",
  section: "SERVICES",
  label: "Packages / Catalog",
  href: "/provider/packages",
  icon: PackageOpen,
};

const providerServiceNavigation: NavigationLinkItem = {
  kind: "link",
  section: "SERVICES",
  label: "Event Services",
  href: "/provider/services",
  icon: Store,
};

const providerCommunicationNavigation: readonly NavigationItem[] = [
  {
    kind: "link",
    section: "COMMUNICATION",
    label: "Messages",
    href: "/provider/messages",
    icon: MessageSquareText,
  },
  {
    kind: "link",
    section: "COMMUNICATION",
    label: "Notifications",
    href: "/provider/notifications",
    icon: Bell,
  },
];

const providerBusinessNavigation: readonly NavigationItem[] = [
  {
    kind: "link",
    section: "BUSINESS",
    label: "Availability",
    href: "/provider/availability",
    icon: CalendarClock,
  },
  {
    kind: "link",
    section: "BUSINESS",
    label: "Payments",
    href: "/provider/payments",
    icon: WalletCards,
  },
  {
    kind: "link",
    section: "BUSINESS",
    label: "Reviews",
    href: "/provider/reviews",
    icon: Star,
  },
  {
    kind: "link",
    section: "BUSINESS",
    label: "Business Profile",
    href: "/provider/business-profile",
    icon: Building2,
  },
];

const providerVerificationNavigation: NavigationLinkItem = {
  kind: "link",
  section: "ACCOUNT",
  label: "Verification",
  href: "/provider/verification",
  activeRouteAliases: ["/provider/status"],
  icon: FileCheck2,
};

const providerAccountNavigation: NavigationLinkItem = {
  kind: "link",
  section: "ACCOUNT",
  label: "Account & Settings",
  href: "/provider/account",
  icon: Settings2,
};

const providerRestrictedNavigation: readonly NavigationItem[] = [
  providerCommunicationNavigation[1],
  providerVerificationNavigation,
  providerAccountNavigation,
];

const adminNavigation: readonly NavigationItem[] = [
  {kind: "link", section: "Overview", label: "Dashboard", href: "/admin", icon: LayoutDashboard},
  {kind: "link", section: "Platform Operations", label: "Users", href: "/admin/users", icon: Users},
  {kind: "link", section: "Platform Operations", label: "Provider Verification", href: "/admin/providers", icon: ShieldCheck},
  {kind: "link", section: "Platform Operations", label: "Bookings", href: "/admin/bookings", icon: CalendarDays},
  {kind: "link", section: "Platform Operations", label: "Payments", href: "/admin/payments", icon: CreditCard},
  {kind: "link", section: "Trust & Communications", label: "Reviews", href: "/admin/reviews", icon: MessageSquareText},
  {kind: "link", section: "Trust & Communications", label: "Complaints", href: "/admin/complaints", icon: MessageSquareWarning},
  {kind: "link", section: "Trust & Communications", label: "Announcements", href: "/admin/announcements", icon: Megaphone},
  {kind: "link", section: "System & Insights", label: "Reports", href: "/admin/reports", icon: ChartNoAxesCombined},
  {kind: "link", section: "System & Insights", label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText},
  {kind: "link", section: "System & Insights", label: "Settings", href: "/admin/settings", icon: Settings2},
];

/** Static navigation for callers without provider context. */
export const roleNavigation: Record<ShellRole, readonly NavigationItem[]> = {
  customer: customerNavigation,
  provider: providerRestrictedNavigation,
  admin: adminNavigation,
};

export function getRoleNavigation(
  role: ShellRole,
  providerContext?: ProviderNavigationContext,
): readonly NavigationItem[] {
  if (role !== "provider") return roleNavigation[role];
  if (providerContext?.kind === "identity-limited") {
    return [
      providerDashboardNavigation,
      providerAccountNavigation,
    ];
  }
  if (!providerContext || providerContext.kind === "no-profile") {
    return roleNavigation.provider;
  }

  const catalogNavigation = getProviderCatalogNavigation(
    providerContext.providerServiceType,
  );

  if (
    providerContext.verificationStatus === "draft" ||
    providerContext.verificationStatus === "resubmission_required"
  ) {
    return [
      ...catalogNavigation,
      providerCommunicationNavigation[1],
      providerVerificationNavigation,
      providerAccountNavigation,
    ];
  }

  const operational =
    providerContext.verificationStatus === "approved" &&
    providerContext.isActive &&
    !providerContext.isSuspended &&
    !providerContext.isDeleted;

  if (!operational) {
    return [
      providerCommunicationNavigation[1],
      providerVerificationNavigation,
      providerAccountNavigation,
    ];
  }

  return [
    providerDashboardNavigation,
    ...providerBookingNavigation,
    ...catalogNavigation,
    ...providerCommunicationNavigation,
    ...providerBusinessNavigation,
    providerVerificationNavigation,
    providerAccountNavigation,
  ];
}

function getProviderCatalogNavigation(
  providerServiceType: ProviderServiceType,
): readonly NavigationItem[] {
  if (providerServiceType === "catering") return [providerPackageNavigation];
  if (providerServiceType === "addon") return [providerServiceNavigation];
  return [providerPackageNavigation, providerServiceNavigation];
}

export function groupNavigationItems(
  navigation: readonly NavigationItem[],
): readonly NavigationGroup[] {
  const groups: NavigationGroup[] = [];

  for (const item of navigation) {
    const sectionLabel = item.section ?? null;
    const currentGroup = groups.at(-1);

    if (!currentGroup || currentGroup.label !== sectionLabel) {
      groups.push({label: sectionLabel, items: [item]});
      continue;
    }

    currentGroup.items.push(item);
  }

  return groups;
}

export const roleActions: Record<
  ShellRole,
  {notificationsHref: string; profileHref: string; announcementsHref?: string}
> = {
  customer: {notificationsHref: "/customer/notifications", profileHref: "/customer/account"},
  provider: {notificationsHref: "/provider/notifications", profileHref: "/provider/account"},
  admin: {
    notificationsHref: "/admin/notifications",
    profileHref: "/admin/account",
    announcementsHref: "/admin/announcements",
  },
};

export const auxiliaryIcons = {Bell, CircleUserRound, Megaphone};

export function isNavigationItemActive(
  pathname: string,
  target: string | NavigationLinkItem,
) {
  const normalizedPathname = pathname.split(/[?#]/u, 1)[0] || "/";
  const routes = typeof target === "string"
    ? [target]
    : [target.href, ...(target.activeRouteAliases ?? [])];

  return routes.some((route) => {
    const isRoleHome = route.split("/").filter(Boolean).length === 1;
    return normalizedPathname === route ||
      (!isRoleHome && normalizedPathname.startsWith(`${route}/`));
  });
}
