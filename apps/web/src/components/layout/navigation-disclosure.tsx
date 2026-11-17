"use client";

import {useState} from "react";
import {ChevronDown} from "lucide-react";
import Link from "next/link";
import {isNavigationItemActive, type NavigationDisclosureItem} from "./navigation";
import {cn} from "@/lib/utils";

export function NavigationDisclosure({item, pathname, collapsed = false, onExpand, onSelect}: {
  item: NavigationDisclosureItem;
  pathname: string;
  collapsed?: boolean;
  onExpand?: () => void;
  onSelect?: () => void;
}) {
  const active = item.children.some((child) => isNavigationItemActive(pathname, child));
  const [open, setOpen] = useState(active);
  const Icon = item.icon;
  return <li>
    <button type="button" aria-label={item.label} title={collapsed ? item.label : undefined} aria-expanded={!collapsed && open}
      onClick={() => {if (collapsed) {onExpand?.(); setOpen(true);} else setOpen(!open);}}
      className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",active && "text-primary-strong",collapsed && "justify-center")}>
      <span className="grid size-7 shrink-0 place-items-center"><Icon aria-hidden="true" className="size-4" /></span>
      <span className={cn("min-w-0 flex-1",collapsed && "sr-only")}>{item.label}</span>
      {!collapsed && <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform",open && "rotate-180")} />}
    </button>
    {!collapsed && open && <ul aria-label={`${item.label} submodules`} className="ml-6 mt-1 space-y-1 border-l border-border pl-2">
      {item.children.map((child) => {
        const selected=isNavigationItemActive(pathname,child);
        return <li key={child.href}><Link href={child.href} onClick={onSelect} aria-current={selected?"page":undefined}
          className={cn("flex min-h-10 items-center rounded-lg px-3 py-2 text-sm leading-snug hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",selected && "bg-feasta-sidebar-active font-semibold text-primary-strong")}>{child.label}</Link></li>;
      })}
    </ul>}
  </li>;
}
