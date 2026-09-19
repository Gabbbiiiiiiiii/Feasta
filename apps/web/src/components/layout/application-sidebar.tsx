"use client";

import {
  memo,
  useCallback,
  useMemo,
} from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Brand } from "@/components/layout/application-header";
import {
  getRoleNavigation,
  groupNavigationItems,
  isNavigationItemActive,
  roleLabels,
  type NavigationDisabledItem,
  type NavigationLinkItem,
  type ProviderNavigationContext,
  type ShellRole,
} from "@/components/layout/navigation";
import { cn } from "@/lib/utils";

type ApplicationSidebarProps = {
  role: ShellRole;
  providerContext?: ProviderNavigationContext;
  collapsed: boolean;
  onCollapsedChange: (
    collapsed: boolean,
  ) => void;
};

type SidebarNavigationItemProps = {
  item: NavigationLinkItem;
  active: boolean;
  collapsed: boolean;
  onPrefetch: (href: string) => void;
};

const SidebarNavigationItem = memo(
  function SidebarNavigationItem({
    item,
    active,
    collapsed,
    onPrefetch,
  }: SidebarNavigationItemProps) {
    const Icon = item.icon;

    return (
      <li>
        <Link
          href={item.href}
          prefetch
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? item.label : undefined}
          title={collapsed ? item.label : undefined}
          onMouseEnter={() => onPrefetch(item.href)}
          onFocus={() => onPrefetch(item.href)}
          className={cn(
            "group relative flex h-13 items-center rounded-xl",
            "transition-colors duration-150",
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-primary/40",
            collapsed
              ? "justify-center px-2"
              : "gap-3 px-3",
            active
              ? "bg-primary-tint text-primary-strong"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
          )}
        >
          {active && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-3 left-0",
                "w-0.75 rounded-r-full bg-primary",
              )}
            />
          )}

          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              "transition-colors duration-150",
              active
                ? "bg-primary-tint-strong text-primary"
                : [
                    "text-slate-500",
                    "group-hover:bg-white",
                    "group-hover:text-primary",
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
            {item.label}
          </span>
        </Link>
      </li>
    );
  },
);

const SidebarDisabledNavigationItem = memo(
  function SidebarDisabledNavigationItem({
    item,
    collapsed,
  }: {
    item: NavigationDisabledItem;
    collapsed: boolean;
  }) {
    const Icon = item.icon;
    const accessibleLabel = `${item.label} - ${item.disabledReason}`;

    return (
      <li>
        <div
          aria-disabled="true"
          aria-label={accessibleLabel}
          title={collapsed ? accessibleLabel : undefined}
          className={cn(
            "flex h-13 cursor-not-allowed items-center rounded-xl text-slate-400",
            collapsed ? "justify-center px-2" : "gap-3 px-3",
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400">
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
            {item.label}
          </span>

          <span
            className={cn(
              "rounded-full bg-slate-100 px-2 py-0.5 text-[0.625rem] font-semibold text-slate-500",
              collapsed && "sr-only",
            )}
          >
            {item.disabledReason}
          </span>
        </div>
      </li>
    );
  },
);

function ApplicationSidebarComponent({
  role,
  providerContext,
  collapsed,
  onCollapsedChange,
}: ApplicationSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navigationGroups = useMemo(() => {
    return groupNavigationItems(
      getRoleNavigation(role, providerContext),
    );
  }, [
    role,
    providerContext,
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
                    item.kind === "link" ? (
                      <SidebarNavigationItem
                        key={item.href}
                        item={item}
                        collapsed={collapsed}
                        active={isNavigationItemActive(
                          pathname,
                          item,
                        )}
                        onPrefetch={handlePrefetch}
                      />
                    ) : (
                      <SidebarDisabledNavigationItem
                        key={`${item.section}-${item.label}`}
                        item={item}
                        collapsed={collapsed}
                      />
                    )
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
            "focus-visible:ring-2 focus-visible:ring-primary/40",
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
