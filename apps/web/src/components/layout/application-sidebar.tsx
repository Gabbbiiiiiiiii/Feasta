"use client";

import {
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Brand } from "@/components/layout/application-header";
import {
  isNavigationItemActive,
  roleLabels,
  roleNavigation,
  type ShellRole,
} from "@/components/layout/navigation";
import { cn } from "@/lib/utils";

type ApplicationSidebarProps = {
  role: ShellRole;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

function ApplicationSidebar({
  role,
  collapsed,
  onCollapsedChange,
}: ApplicationSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden",
        "rounded-br-3xl border-r border-border bg-white",
        "shadow-[8px_0_24px_rgba(15,23,42,0.05)]",
        "transition-[width] duration-300 ease-in-out md:flex",
        collapsed
          ? "w-[var(--sidebar-collapsed)]"
          : "w-[var(--sidebar-expanded)]",
      )}
      aria-label={`${roleLabels[role]} sidebar`}
    >
      <header
        className={cn(
          "flex min-h-[88px] items-center px-4",
          collapsed
            ? "justify-center"
            : "justify-between gap-3",
        )}
      >
        {collapsed ? (
          <Brand role={role} compact />
        ) : (
          <div className="min-w-0 flex-1">
            <Brand role={role} />
          </div>
        )}

        {!collapsed ? (
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            aria-label="Collapse sidebar"
            aria-expanded="true"
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl",
              "text-slate-500 transition-colors",
              "hover:bg-slate-100 hover:text-slate-900",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6500]",
            )}
          >
            <PanelLeftClose
              aria-hidden="true"
              className="size-5"
            />
          </button>
        ) : null}
      </header>

      <nav
        aria-label={`${roleLabels[role]} primary navigation`}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        <ul className="grid gap-3">
          {roleNavigation[role].map((item) => {
            const active = isNavigationItemActive(
              pathname,
              item.href,
            );

            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex min-h-[64px] items-center overflow-hidden rounded-2xl",
                    "transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6500]",
                    collapsed
                      ? "justify-center px-2"
                      : "gap-4 px-4",
                    active
                      ? "bg-[#FFF1E8] text-slate-900"
                      : "text-slate-600 hover:bg-[#FFF7F2] hover:text-slate-900",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-xl",
                      "transition-colors duration-200",
                      active
                        ? "bg-[#FFE7D8] text-[#FF6500]"
                        : "bg-slate-50 text-slate-500 group-hover:bg-[#FFEFE5] group-hover:text-[#FF6500]",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-5"
                    />
                  </span>

                  <span
                    className={cn(
                      "min-w-0 flex-1 text-base font-medium leading-6",
                      collapsed && "sr-only",
                    )}
                  >
                    {item.label}
                  </span>

                  {active && !collapsed ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-[18px] right-0 w-1 rounded-l-full bg-[#FF6500]"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="border-t border-border/70 p-4">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={
            collapsed
              ? "Expand sidebar"
              : "Collapse sidebar"
          }
          aria-expanded={!collapsed}
          className={cn(
            "flex min-h-11 w-full items-center rounded-xl",
            "text-sm font-medium text-slate-500 transition-colors",
            "hover:bg-slate-100 hover:text-slate-900",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6500]",
            collapsed
              ? "justify-center px-2"
              : "gap-3 px-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen
              aria-hidden="true"
              className="size-5"
            />
          ) : (
            <PanelLeftClose
              aria-hidden="true"
              className="size-5"
            />
          )}

          {!collapsed ? (
            <span>Collapse sidebar</span>
          ) : null}
        </button>
      </footer>
    </aside>
  );
}

export {
  ApplicationSidebar,
  type ApplicationSidebarProps,
};