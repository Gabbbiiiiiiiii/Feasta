"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";

import {
  isNavigationItemActive,
  roleLabels,
  roleNavigation,
  type ShellRole,
} from "@/components/layout/navigation";
import {cn} from "@/lib/utils";

function MobileNavigation({role}: {role: ShellRole}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={`${roleLabels[role]} mobile navigation`}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
    >
      <ul className="grid grid-flow-col auto-cols-fr gap-1">
        {roleNavigation[role].map((item) => {
          const active = isNavigationItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "flex min-h-14 min-w-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground active:bg-secondary",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="w-full truncate text-center" aria-hidden="true">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export {MobileNavigation};
