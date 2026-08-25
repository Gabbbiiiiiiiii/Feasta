"use client";

import {Menu} from "lucide-react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useMemo, useState} from "react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {cn} from "@/lib/utils";

type MobileNavigationProps = {
  role: ShellRole;
  providerContext?: ProviderNavigationContext;
};

function MobileNavigation({
  role,
  providerContext,
}: MobileNavigationProps) {
  const pathname = usePathname();
  const navigation = useMemo(
    () => getRoleNavigation(role, providerContext),
    [role, providerContext],
  );

  if (role === "provider") {
    return (
      <ProviderMobileNavigation
        navigation={navigation}
        pathname={pathname}
      />
    );
  }

  const links = navigation.filter(isNavigationLink);

  return (
    <nav
      aria-label={`${roleLabels[role]} mobile navigation`}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
    >
      <ul className="grid grid-flow-col auto-cols-fr gap-1">
        {links.map((item) => (
          <MobileNavigationLink
            key={item.href}
            item={item}
            active={isNavigationItemActive(pathname, item)}
          />
        ))}
      </ul>
    </nav>
  );
}

function ProviderMobileNavigation({
  navigation,
  pathname,
}: {
  navigation: ReturnType<typeof getRoleNavigation>;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const links = useMemo(
    () => navigation.filter(isNavigationLink),
    [navigation],
  );
  const primaryLinks = useMemo(
    () => selectProviderPrimaryLinks(links),
    [links],
  );
  const groups = useMemo(
    () => groupNavigationItems(navigation),
    [navigation],
  );
  const secondaryRouteActive = links.some(
    (item) =>
      !primaryLinks.includes(item) &&
      isNavigationItemActive(pathname, item),
  );

  if (links.length <= 3) {
    return (
      <nav
        aria-label="Provider mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      >
        <ul className="grid grid-flow-col auto-cols-fr gap-1">
          {links.map((item) => (
            <MobileNavigationLink
              key={item.href}
              item={item}
              active={isNavigationItemActive(pathname, item)}
            />
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <nav
        aria-label="Provider mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      >
        <ul className="grid grid-flow-col auto-cols-fr gap-1">
          {primaryLinks.map((item) => (
            <MobileNavigationLink
              key={item.href}
              item={item}
              active={isNavigationItemActive(pathname, item)}
            />
          ))}

          <li className="min-w-0">
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="More provider navigation"
                className={cn(
                  "flex min-h-14 min-w-12 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  secondaryRouteActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground active:bg-secondary",
                )}
              >
                <Menu aria-hidden="true" className="size-5" />
                <span>More</span>
              </button>
            </DialogTrigger>
          </li>
        </ul>
      </nav>

      <DialogContent className="inset-y-0 right-0 left-auto top-0 h-dvh max-h-dvh w-[min(100vw,24rem)] max-w-[100vw] translate-x-0 translate-y-0 content-start overflow-x-hidden rounded-none border-y-0 border-r-0 p-0 sm:rounded-l-dialog">
        <DialogHeader className="border-b border-border p-5 pr-16">
          <DialogTitle>Provider navigation</DialogTitle>
          <DialogDescription>
            Access your FEASTA provider workspace.
          </DialogDescription>
        </DialogHeader>

        <nav
          aria-label="Provider complete mobile navigation"
          className="min-h-0 overflow-y-auto px-4 py-5"
        >
          <div className="space-y-6">
            {groups.map((group, groupIndex) => {
              const headingId = `provider-mobile-navigation-group-${groupIndex}`;

              return (
                <section
                  key={`${group.label ?? "primary"}-${groupIndex}`}
                  aria-labelledby={group.label ? headingId : undefined}
                >
                  {group.label ? (
                    <h2
                      id={headingId}
                      className="mb-2 px-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-slate-400"
                    >
                      {group.label}
                    </h2>
                  ) : null}

                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      item.kind === "link" ? (
                        <ProviderDrawerLink
                          key={item.href}
                          item={item}
                          active={isNavigationItemActive(pathname, item)}
                          onSelect={() => setOpen(false)}
                        />
                      ) : (
                        <ProviderDrawerDisabledItem
                          key={`${item.section}-${item.label}`}
                          item={item}
                        />
                      )
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </nav>
      </DialogContent>
    </Dialog>
  );
}

function MobileNavigationLink({
  item,
  active,
}: {
  item: NavigationLinkItem;
  active: boolean;
}) {
  const Icon = item.icon;

  return (
    <li className="min-w-0">
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
        <span className="w-full truncate text-center" aria-hidden="true">
          {item.label}
        </span>
      </Link>
    </li>
  );
}

function ProviderDrawerLink({
  item,
  active,
  onSelect,
}: {
  item: NavigationLinkItem;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6500]/40",
          active
            ? "bg-[#FFF0E7] text-[#E95700]"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
        )}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

function ProviderDrawerDisabledItem({
  item,
}: {
  item: NavigationDisabledItem;
}) {
  const Icon = item.icon;

  return (
    <li>
      <div
        aria-disabled="true"
        aria-label={`${item.label} - ${item.disabledReason}`}
        className="flex min-h-12 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-400"
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.625rem] font-semibold text-slate-500">
          {item.disabledReason}
        </span>
      </div>
    </li>
  );
}

function isNavigationLink(
  item: ReturnType<typeof getRoleNavigation>[number],
): item is NavigationLinkItem {
  return item.kind === "link";
}

function selectProviderPrimaryLinks(
  links: readonly NavigationLinkItem[],
): readonly NavigationLinkItem[] {
  const preferredHrefs = [
    "/provider",
    "/provider/requests",
    "/provider/calendar",
  ];
  const preferred = preferredHrefs.flatMap((href) => {
    const item = links.find((candidate) => candidate.href === href);
    return item ? [item] : [];
  });

  return preferred.length > 0 ? preferred : links.slice(0, 3);
}

export {MobileNavigation};
