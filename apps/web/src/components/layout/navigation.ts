import {
  Bell,
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
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import type {
  ProviderServiceType,
} from "@feasta/shared-types";

export type ShellRole =
  | "customer"
  | "provider"
  | "admin";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  section?: string;
};

export const roleHome:
Record<ShellRole, string> = {
  customer: "/customer",
  provider: "/provider",
  admin: "/admin",
};

export const roleLabels:
Record<ShellRole, string> = {
  customer: "Customer",
  provider: "Provider",
  admin: "Admin",
};

const customerNavigation:
readonly NavigationItem[] = [
  {
    label: "Home",
    href: "/customer",
    icon: House,
  },
  {
    label: "Event Services",
    href: "/customer/providers",
    icon: Store,
  },
  {
    label: "Bookings",
    href: "/customer/bookings",
    icon: CalendarDays,
  },
  {
    label: "Payments",
    href: "/customer/payments",
    icon: CreditCard,
  },
];

const providerBaseNavigation:
readonly NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/provider",
    icon: House,
  },
  {
    label: "Requests",
    href: "/provider/requests",
    icon: ClipboardList,
  },
];

const providerPackageNavigation:
NavigationItem = {
  label: "Packages",
  href: "/provider/packages",
  icon: PackageOpen,
};

const providerServiceNavigation:
NavigationItem = {
  label: "Services",
  href: "/provider/services",
  icon: Store,
};

const providerCommonNavigation:
readonly NavigationItem[] = [
  {
    label: "Verification",
    href: "/provider/verification",
    icon: FileCheck2,
  },
  {
    label: "Calendar",
    href: "/provider/calendar",
    icon: CalendarDays,
  },
];

const adminNavigation:
readonly NavigationItem[] = [
  {
    section: "Overview",
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    section: "Platform Operations",
    label: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    section: "Platform Operations",
    label: "Provider Verification",
    href: "/admin/providers",
    icon: ShieldCheck,
  },
  {
    section: "Platform Operations",
    label: "Bookings",
    href: "/admin/bookings",
    icon: CalendarDays,
  },
  {
    section: "Platform Operations",
    label: "Payments",
    href: "/admin/payments",
    icon: CreditCard,
  },
  {
    section: "Trust & Communications",
    label: "Reviews",
    href: "/admin/reviews",
    icon: MessageSquareText,
  },
  {
    section: "Trust & Communications",
    label: "Complaints",
    href: "/admin/complaints",
    icon: MessageSquareWarning,
  },
  {
    section: "Trust & Communications",
    label: "Announcements",
    href: "/admin/announcements",
    icon: Megaphone,
  },
  {
    section: "System & Insights",
    label: "Reports",
    href: "/admin/reports",
    icon: ChartNoAxesCombined,
  },
  {
    section: "System & Insights",
    label: "Audit Logs",
    href: "/admin/audit-logs",
    icon: ScrollText,
  },
  {
    section: "System & Insights",
    label: "Settings",
    href: "/admin/settings",
    icon: Settings2,
  },
];

/**
 * Static navigation remains available for callers and tests that do not
 * have provider context.
 *
 * Provider-aware application shells should use getRoleNavigation().
 */
export const roleNavigation: Record<
  ShellRole,
  readonly NavigationItem[]
> = {
  customer: customerNavigation,

  provider: [
    ...providerBaseNavigation,
    providerPackageNavigation,
    ...providerCommonNavigation,
  ],

  admin: adminNavigation,
};

export function getRoleNavigation(
  role: ShellRole,
  providerServiceType?: ProviderServiceType,
): readonly NavigationItem[] {
  if (role !== "provider") {
    return roleNavigation[role];
  }

 const catalogNavigation:
readonly NavigationItem[] =
  providerServiceType === "catering"
    ? [
        providerPackageNavigation,
      ]
    : providerServiceType === "addon"
      ? [
          providerServiceNavigation,
        ]
      : providerServiceType === "both"
        ? [
            providerPackageNavigation,
            providerServiceNavigation,
          ]
        : [
            providerPackageNavigation,
          ];

  return [
    ...providerBaseNavigation,
    ...catalogNavigation,
    ...providerCommonNavigation,
  ];
}

export const roleActions: Record<
  ShellRole,
  {
    notificationsHref: string;
    profileHref: string;
    announcementsHref?: string;
  }
> = {
  customer: {
    notificationsHref:
      "/customer/notifications",
    profileHref:
      "/customer/account",
  },

  provider: {
    notificationsHref:
      "/provider/notifications",
    profileHref:
      "/provider/account",
  },

  admin: {
    notificationsHref:
      "/admin/notifications",
    profileHref:
      "/admin/account",
    announcementsHref:
      "/admin/announcements",
  },
};

export const auxiliaryIcons = {
  Bell,
  CircleUserRound,
  Megaphone,
};

export function isNavigationItemActive(
  pathname: string,
  href: string,
) {
  const isRoleHome =
    href
      .split("/")
      .filter(Boolean)
      .length === 1;

  return (
    pathname === href ||
    (
      !isRoleHome &&
      pathname.startsWith(
        `${href}/`,
      )
    )
  );
}