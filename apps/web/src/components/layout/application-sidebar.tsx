"use client";

import {
  memo,
  useCallback,
  useMemo,
} from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Brand } from "@/components/layout/application-header";
import {
  getRoleNavigation,
  isNavigationItemActive,
  roleLabels,
  type NavigationItem,
  type ShellRole,
} from "@/components/layout/navigation";
import type {
  ProviderServiceType,
} from "@feasta/shared-types";
import { cn } from "@/lib/utils";

type ApplicationSidebarProps = {
  role: ShellRole;
  providerServiceType?: ProviderServiceType;
  collapsed: boolean;
  onCollapsedChange: (
    collapsed: boolean,
  ) => void;
};

type SidebarNavigationGroup = {
  label: string | null;
  items: NavigationItem[];
};

type SidebarNavigationItemProps = {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onPrefetch: (href: string) => void;
};

const SidebarNavigationItem = memo(
  function SidebarNavigationItem({
    label,
    href,
    icon: Icon,
    active,
    collapsed,
    onPrefetch,
  }: SidebarNavigationItemProps) {
    return (
      <li>
        <Link
          href={href}
          prefetch
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? label : undefined}
          title={collapsed ? label : undefined}
          onMouseEnter={() => onPrefetch(href)}
          onFocus={() => onPrefetch(href)}
          className={cn(
            "group relative flex h-13 items-center rounded-xl",
            "transition-colors duration-150",
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[#FF6500]/40",
            collapsed
              ? "justify-center px-2"
              : "gap-3 px-3",
            active
              ? "bg-[#FFF0E7] text-[#E95700]"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
          )}
        >
          {active && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-3 left-0",
                "w-0.75 rounded-r-full bg-[#FF6500]",
              )}
            />
          )}

          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              "transition-colors duration-150",
              active
                ? "bg-[#FFE3D2] text-[#FF6500]"
                : [
                    "text-slate-500",
                    "group-hover:bg-white",
                    "group-hover:text-[#FF6500]",
                  ],
            )}
          >
            <Icon
              aria-hidden="true"
              className="size-4.75"
              strokeWidth={1.9}
            />
          </span>

          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              collapsed && "sr-only",
            )}
          >
            {label}
          </span>
        </Link>
      </li>
    );
  },
);

function ApplicationSidebarComponent({
  role,
  providerServiceType,
  collapsed,
  onCollapsedChange,
}: ApplicationSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navigationGroups = useMemo(() => {
    const groups: SidebarNavigationGroup[] = [];

    for (
      const item of getRoleNavigation(
        role,
        providerServiceType,
      )
    ) {
      const sectionLabel = item.section ?? null;
      const currentGroup = groups.at(-1);

      if (
        !currentGroup ||
        currentGroup.label !== sectionLabel
      ) {
        groups.push({
          label: sectionLabel,
          items: [item],
        });

        continue;
      }

      currentGroup.items.push(item);
    }

    return groups;
  }, [
    role,
    providerServiceType,
  ]);

  const sidebarLabel = useMemo(
    () => `${roleLabels[role]} sidebar`,
    [role],
  );

  const handlePrefetch = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  const handleToggle = useCallback(() => {
    onCollapsedChange(!collapsed);
  }, [collapsed, onCollapsedChange]);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden",
        "border-r border-slate-200/80 bg-white",
        "transition-[width] duration-200 ease-out md:flex",
        collapsed
          ? "w-[var(--sidebar-collapsed)]"
          : "w-[var(--sidebar-expanded)]",
      )}
      aria-label={sidebarLabel}
    >
      <header
        className={cn(
          "flex h-18 shrink-0 items-center",
          "border-b border-slate-100",
          collapsed
            ? "justify-center px-3"
            : "px-5",
        )}
      >
        <div className="min-w-0">
          <Brand role={role} compact={collapsed} />
        </div>
      </header>

      <nav
        aria-label={`${roleLabels[role]} primary navigation`}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
      >
        <div
          className={cn(
            collapsed ? "space-y-2" : "space-y-5",
          )}
        >
          {navigationGroups.map((group, groupIndex) => {
            const headingId =
              `${role}-navigation-group-${groupIndex}`;

            return (
              <section
                key={`${group.label ?? "primary"}-${groupIndex}`}
                aria-labelledby={
                  group.label ? headingId : undefined
                }
              >
                {group.label ? (
                  <h2
                    id={headingId}
                    className={cn(
                      "mb-2 px-3 text-[0.6875rem] font-bold",
                      "uppercase tracking-[0.14em] text-slate-400",
                      collapsed && "sr-only",
                    )}
                  >
                    {group.label}
                  </h2>
                ) : null}

                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarNavigationItem
                      key={item.href}
                      label={item.label}
                      href={item.href}
                      icon={item.icon}
                      collapsed={collapsed}
                      active={isNavigationItemActive(
                        pathname,
                        item.href,
                      )}
                      onPrefetch={handlePrefetch}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </nav>

      <footer className="shrink-0 border-t border-slate-200/80 p-3">
        <button
          type="button"
          onClick={handleToggle}
          aria-label={
            collapsed
              ? "Expand sidebar"
              : "Collapse sidebar"
          }
          aria-expanded={!collapsed}
          className={cn(
            "flex h-11 w-full items-center rounded-xl",
            "text-sm font-medium text-slate-500",
            "transition-colors duration-150",
            "hover:bg-slate-100 hover:text-slate-900",
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[#FF6500]/40",
            collapsed
              ? "justify-center"
              : "gap-3 px-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen
              aria-hidden="true"
              className="size-4.75"
            />
          ) : (
            <PanelLeftClose
              aria-hidden="true"
              className="size-4.75"
            />
          )}

          {!collapsed && (
            <span>Collapse sidebar</span>
          )}
        </button>
      </footer>
    </aside>
  );
}

const ApplicationSidebar = memo(
  ApplicationSidebarComponent,
);

export {
  ApplicationSidebar,
  type ApplicationSidebarProps,
};
