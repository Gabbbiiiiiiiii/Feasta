"use client";

import {PanelLeftClose, PanelLeftOpen} from "lucide-react";
import Link from "next/link";
import {usePathname} from "next/navigation";

import {Brand} from "@/components/layout/application-header";
import {
  isNavigationItemActive,
  roleLabels,
  roleNavigation,
  type ShellRole,
} from "@/components/layout/navigation";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

type ApplicationSidebarProps = {
  role: ShellRole;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

function ApplicationSidebar({role, collapsed, onCollapsedChange}: ApplicationSidebarProps) {
  const pathname = usePathname();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col overflow-x-hidden border-r border-border bg-card transition-[width] duration-normal md:flex",
        collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-expanded)]",
      )}
      aria-label={`${roleLabels[role]} sidebar`}
    >
      <div className={cn("flex min-h-16 items-center border-b border-border px-3", collapsed ? "justify-center" : "justify-between")}>
        {collapsed ? (
          <Link href={`/${role}`} className="grid size-12 place-items-center rounded-lg bg-primary text-xl font-black text-primary-foreground" aria-label={`FEASTA ${roleLabels[role]} home`}>
            F
          </Link>
        ) : (
          <Brand role={role} />
        )}
      </div>
      <nav aria-label={`${roleLabels[role]} primary navigation`} className="flex-1 overflow-y-auto p-3">
        <ul className="grid gap-2">
          {roleNavigation[role].map((item) => {
            const active = isNavigationItemActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex min-h-12 items-center rounded-lg font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed ? "justify-center px-3" : "gap-3 px-4",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "compact"}
          fullWidth={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          {!collapsed ? <span>Collapse</span> : null}
        </Button>
      </div>
    </aside>
  );
}

export {ApplicationSidebar, type ApplicationSidebarProps};
