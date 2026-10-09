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
  compact: boolean;
  onPrefetch: (href: string) => void;
};

const SidebarNavigationItem = memo(
  function SidebarNavigationItem({
    item,
    active,
    collapsed,
    compact,
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
            "group relative flex items-center",
            "transition-colors duration-150",
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-feasta-sidebar-indicator",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-feasta-sidebar",
            compact ? "h-10 rounded-lg" : "h-13 rounded-xl",
            collapsed
              ? "justify-center px-2"
              : compact
                ? "gap-2.5 px-2.5"
                : "gap-3 px-3",
            active
              ? "bg-feasta-sidebar-active text-primary-strong"
              : "text-feasta-sidebar-foreground hover:bg-secondary hover:text-feasta-sidebar-foreground",
          )}
        >
          {active && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 w-0.75 rounded-r-full bg-feasta-sidebar-indicator",
                compact ? "inset-y-2" : "inset-y-3",
              )}
            />
          )}

          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-lg",
              "transition-colors duration-150",
              compact ? "size-7" : "size-9",
              active
                ? "text-feasta-sidebar-indicator"
                : [
                    "text-feasta-text-secondary",
                    "group-hover:bg-secondary",
                    "group-hover:text-feasta-sidebar-foreground",
                  ],
            )}
          >
            <Icon
              aria-hidden="true"
              className={compact ? "size-4" : "size-4.75"}
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
    compact,
  }: {
    item: NavigationDisabledItem;
    collapsed: boolean;
    compact: boolean;
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
            "flex cursor-not-allowed items-center text-feasta-sidebar-muted/55",
            compact ? "h-10 rounded-lg" : "h-13 rounded-xl",
            collapsed
              ? "justify-center px-2"
              : compact
                ? "gap-2.5 px-2.5"
                : "gap-3 px-3",
          )}
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-lg text-feasta-sidebar-muted/55",
              compact ? "size-7" : "size-9",
            )}
          >
            <Icon
              aria-hidden="true"
              className={compact ? "size-4" : "size-4.75"}
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
              "rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-semibold text-feasta-sidebar-muted",
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

  const compact = role === "admin" || role === "provider";

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
        "border-r border-border bg-feasta-sidebar text-feasta-sidebar-foreground",
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
          "border-b border-border",
          collapsed
            ? "justify-center px-3"
            : "px-5",
        )}
      >
        <div className="min-w-0 rounded-lg bg-white px-2 py-1">
          <Brand
            role={role}
            compact={collapsed}
            className="focus-visible:ring-feasta-sidebar-indicator focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          />
        </div>
      </header>

      <nav
        aria-label={`${roleLabels[role]} primary navigation`}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          compact ? "px-2.5 py-3" : "px-3 py-4",
        )}
      >
        <div
          className={cn(
            collapsed
              ? "space-y-2"
              : compact
                ? "space-y-3"
                : "space-y-5",
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
                      "font-bold uppercase text-feasta-sidebar-muted",
                      compact
                        ? "mb-1 px-2.5 text-[0.6875rem] tracking-[0.08em]"
                        : "mb-2 px-3 text-[0.6875rem] tracking-[0.14em]",
                      collapsed && "sr-only",
                    )}
                  >
                    {group.label}
                  </h2>
                ) : null}

                <ul className={compact ? "space-y-0.5" : "space-y-1"}>
                  {group.items.map((item) => (
                    item.kind === "link" ? (
                      <SidebarNavigationItem
                        key={item.href}
                        item={item}
                        collapsed={collapsed}
                        compact={compact}
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
                        compact={compact}
                      />
                    )
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </nav>

      <footer
        className={cn(
          "shrink-0 border-t border-border",
          compact ? "p-2" : "p-3",
        )}
      >
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
            "flex w-full items-center",
            "text-sm font-medium text-feasta-sidebar-muted",
            "transition-colors duration-150",
            "hover:bg-secondary hover:text-feasta-sidebar-foreground",
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-feasta-sidebar-indicator",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-feasta-sidebar",
            compact ? "h-10 rounded-lg" : "h-11 rounded-xl",
            collapsed
              ? "justify-center"
              : compact
                ? "gap-2.5 px-2.5"
                : "gap-3 px-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen
              aria-hidden="true"
              className={compact ? "size-4" : "size-4.75"}
            />
          ) : (
            <PanelLeftClose
              aria-hidden="true"
              className={compact ? "size-4" : "size-4.75"}
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
