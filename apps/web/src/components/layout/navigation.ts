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
  Settings2,
  ScrollText,
  PackageOpen,
  ShieldCheck,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ShellRole =
  | "customer"
  | "provider"
  | "admin";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
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

export const roleNavigation: Record<
  ShellRole,
  readonly NavigationItem[]
> = {
  customer: [
    {
      label: "Home",
      href: "/customer",
      icon: House,
    },
    {
      label: "Providers",
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
  ],

  provider: [
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
    {
      label: "Packages",
      href: "/provider/packages",
      icon: PackageOpen,
    },
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
  ],

  admin: [
    {
      label: "Dashboard",
      href: "/admin",
      icon: LayoutDashboard,
    },
    {
      label: "User Management",
      href: "/admin/users",
      icon: Users,
    },
    {
      label: "Provider Verification",
      href: "/admin/providers",
      icon: ShieldCheck,
    },
    {
      label: "Booking Monitoring",
      href: "/admin/bookings",
      icon: CalendarDays,
    },
    {
      label: "Payment Monitoring",
      href: "/admin/payments",
      icon: CreditCard,
    },
    {
      label: "Review Management",
      href: "/admin/reviews",
      icon: MessageSquareText,
    },
    {
      label: "Complaints",
      href: "/admin/complaints",
      icon: MessageSquareWarning,
    },
    {
      label: "Announcements",
      href: "/admin/announcements",
      icon: Megaphone,
    },
    {
      label: "Audit Logs",
      href: "/admin/audit-logs",
      icon: ScrollText,
    },
    {
      label: "Reports",
      href: "/admin/reports",
      icon: ChartNoAxesCombined,
    },
    {
      label: "Settings",
      href: "/admin/settings",
      icon: Settings2,
    },
  ],
};

export const roleActions: Record<
  ShellRole,
  {
    notificationsHref: string;
    profileHref: string;
    announcementsHref?: string;
  }
> = {
  customer: {
    notificationsHref: "/customer/notifications",
    profileHref: "/customer/account",
  },

  provider: {
    notificationsHref: "/provider/notifications",
    profileHref: "/provider/account",
  },

  admin: {
    notificationsHref: "/admin/notifications",
    profileHref: "/admin/account",
    announcementsHref: "/admin/announcements",
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
    href.split("/").filter(Boolean).length === 1;

  return (
    pathname === href ||
    (!isRoleHome && pathname.startsWith(`${href}/`))
  );
}