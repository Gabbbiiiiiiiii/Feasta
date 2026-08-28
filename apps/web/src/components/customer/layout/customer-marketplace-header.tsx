"use client";

import {
  CalendarDays,
  ChevronDown,
  Heart,
  LayoutGrid,
  MapPin,
  Search,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {usePathname, useSearchParams} from "next/navigation";
import {useEffect, useRef, type ReactNode, type RefObject} from "react";

import {LogoutButton} from "@/components/auth/logout-button";
import {NotificationMenu} from "@/components/layout/notification-menu";
import {isNavigationItemActive} from "@/components/layout/navigation";
import {PROVIDER_CATEGORY_OPTIONS} from "@/lib/customer/providers/provider-catalog";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import {
  PUBLIC_PACKAGE_MARKETPLACE_PATH,
  PUBLIC_PROVIDER_MARKETPLACE_PATH,
  isPublicMarketplaceReturnPath,
} from "@/lib/customer/providers/provider-route-policy";
import {cn} from "@/lib/utils";

const CUSTOMER_HOME_PATH = "/customer";
const CUSTOMER_FAVORITES_PATH = "/customer/favorites";
const CUSTOMER_BOOKINGS_PATH = "/customer/bookings";

const MARKETPLACE_CATEGORIES = PROVIDER_CATEGORY_OPTIONS.map((category) => ({
  ...category,
  href: providerDiscoveryHref({
    search: "",
    serviceType: "all",
    category: category.value,
    cursor: null,
  }),
}));

export function CustomerMarketplaceHeader({
  accountLabel = null,
  accountFirstName = "",
  accountLastName = "",
  accountEmail = "",
  authReturnTo = PUBLIC_PROVIDER_MARKETPLACE_PATH,
}: {
  accountLabel?: string | null;
  accountFirstName?: string;
  accountLastName?: string;
  accountEmail?: string;
  authReturnTo?: string;
}) {
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const accountDetails = useRef<HTMLDetailsElement>(null);
  const accountSummary = useRef<HTMLElement>(null);
  const categoryDetails = useRef<HTMLDetailsElement>(null);
  const categorySummary = useRef<HTMLElement>(null);
  const authenticated = Boolean(accountLabel?.trim());
  const safeReturnTo = isPublicMarketplaceReturnPath(authReturnTo)
    ? authReturnTo
    : PUBLIC_PROVIDER_MARKETPLACE_PATH;
  const requestedCategory = searchParameters.get("category");
  const activeCategory = MARKETPLACE_CATEGORIES.some(
    (category) => category.value === requestedCategory,
  ) ? requestedCategory : null;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!accountDetails.current?.contains(event.target)) {
        accountDetails.current?.removeAttribute("open");
      }
      if (!categoryDetails.current?.contains(event.target)) {
        categoryDetails.current?.removeAttribute("open");
      }
    };

    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-feasta-border-soft bg-white/95 shadow-[0_6px_24px_rgb(43_33_29/0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[4.25rem] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2 md:grid-cols-[auto_auto_minmax(12rem,1fr)_auto] md:gap-x-4 md:py-0">
          <MarketplaceBrand pathname={pathname} />
          <MarketplaceEventLocation />
          <MarketplaceHeaderSearch className="col-span-3 row-start-2 mt-2 md:col-span-1 md:col-start-3 md:row-start-1 md:mt-0" />

          {authenticated && accountLabel ? (
            <div className="col-start-3 row-start-1 ml-auto flex shrink-0 items-center gap-1 md:col-start-4">
              <Link
                href={CUSTOMER_FAVORITES_PATH}
                aria-label="Favorites"
                aria-current={isNavigationItemActive(pathname, CUSTOMER_FAVORITES_PATH) ? "page" : undefined}
                className="hidden size-10 items-center justify-center rounded-full text-feasta-text-secondary transition-colors duration-200 hover:bg-feasta-surface-soft hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none md:inline-flex"
              >
                <Heart
                  aria-hidden="true"
                  className={cn(
                    "size-[19px]",
                    isNavigationItemActive(pathname, CUSTOMER_FAVORITES_PATH) && "fill-current text-primary-strong",
                  )}
                />
              </Link>
              <NotificationMenu role="customer" />
              <CustomerAccountMenu
                accountLabel={accountLabel}
                firstName={accountFirstName}
                lastName={accountLastName}
                email={accountEmail}
                detailsRef={accountDetails}
                summaryRef={accountSummary}
              />
            </div>
          ) : (
            <GuestAccountActions returnTo={safeReturnTo} />
          )}
        </div>

        <MarketplaceSectionNavigation
          pathname={pathname}
          activeCategory={activeCategory}
          categoryDetailsRef={categoryDetails}
          categorySummaryRef={categorySummary}
        />
      </div>
    </header>
  );
}

function MarketplaceBrand({pathname}: {pathname: string}) {
  return (
    <Link
      href={CUSTOMER_HOME_PATH}
      aria-label="FEASTA home"
      aria-current={pathname === CUSTOMER_HOME_PATH ? "page" : undefined}
      className="group col-start-1 row-start-1 inline-flex min-h-12 min-w-0 shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Image
        src="/images/feasta_logo.svg"
        alt="Feasta"
        width={586}
        height={202}
        priority
        className="h-[34px] w-auto shrink-0 object-contain transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none"
      />
    </Link>
  );
}

function MarketplaceEventLocation() {
  return (
    <div
      aria-label="Event location: Ormoc City, Leyte"
      title="Event location: Ormoc City, Leyte"
      className="col-start-2 row-start-1 hidden min-w-0 items-center gap-2.5 md:flex md:max-w-52"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
        <MapPin aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Event location
        </span>
        <span className="block truncate text-sm font-semibold text-feasta-text-secondary">
          Ormoc City, Leyte
        </span>
      </span>
    </div>
  );
}

function MarketplaceHeaderSearch({className}: {className?: string}) {
  return (
    <form
      action={PUBLIC_PROVIDER_MARKETPLACE_PATH}
      method="get"
      role="search"
      aria-label="Search event services"
      className={cn("w-full min-w-0", className)}
    >
      <label className="sr-only" htmlFor="marketplace-header-search">
        Search event services
      </label>
      <div className="flex h-11 min-w-0 items-center rounded-full border border-feasta-border-soft bg-feasta-canvas px-1.5 shadow-[0_2px_8px_rgb(43_33_29/0.025)] transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-primary/45 focus-within:bg-white focus-within:shadow-[0_5px_16px_rgb(43_33_29/0.06)] focus-within:ring-2 focus-within:ring-primary/15 motion-reduce:transition-none">
        <Search aria-hidden="true" className="ml-3 size-[18px] shrink-0 text-feasta-text-tertiary" />
        <input
          id="marketplace-header-search"
          type="search"
          name="q"
          minLength={2}
          maxLength={80}
          placeholder="Search event services"
          className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent px-3 text-sm font-medium text-foreground outline-none ring-0 placeholder:text-feasta-text-tertiary focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        />
        <button
          type="submit"
          aria-label="Search marketplace"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-[background-color,transform] duration-200 hover:scale-[1.03] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
      </div>
    </form>
  );
}

function MarketplaceSectionNavigation({
  pathname,
  activeCategory,
  categoryDetailsRef,
  categorySummaryRef,
}: {
  pathname: string;
  activeCategory: string | null;
  categoryDetailsRef: RefObject<HTMLDetailsElement | null>;
  categorySummaryRef: RefObject<HTMLElement | null>;
}) {
  const items = [
    {label: "Event Services", href: PUBLIC_PROVIDER_MARKETPLACE_PATH},
    {label: "Packages", href: PUBLIC_PACKAGE_MARKETPLACE_PATH},
  ] as const;

  return (
    <nav aria-label="Marketplace sections" className="hidden min-h-12 items-center gap-1 border-t border-feasta-divider md:flex">
      {items.map((item) => {
        const active = item.href === PUBLIC_PROVIDER_MARKETPLACE_PATH
          ? isNavigationItemActive(pathname, item.href) && !activeCategory
          : isNavigationItemActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={marketplaceNavigationClass(active)}>
            {item.label}
          </Link>
        );
      })}

      <details
        ref={categoryDetailsRef}
        className="group relative"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !categoryDetailsRef.current?.open) return;
          event.preventDefault();
          categoryDetailsRef.current.removeAttribute("open");
          categorySummaryRef.current?.focus();
        }}
      >
        <summary
          ref={categorySummaryRef}
          aria-haspopup="menu"
          aria-current={activeCategory ? "page" : undefined}
          className={cn(marketplaceNavigationClass(Boolean(activeCategory)), "cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden")}
        >
          <LayoutGrid aria-hidden="true" className="size-4" />
          Categories
          <ChevronDown aria-hidden="true" className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div
          role="menu"
          aria-label="Event service categories"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 grid max-h-[min(65vh,30rem)] w-[min(90vw,34rem)] grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-feasta-border-soft bg-white p-2 shadow-floating sm:grid-cols-2"
        >
          {MARKETPLACE_CATEGORIES.map((category) => (
            <Link
              key={category.value}
              role="menuitem"
              href={category.href}
              aria-current={activeCategory === category.value ? "page" : undefined}
              onClick={() => categoryDetailsRef.current?.removeAttribute("open")}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                activeCategory === category.value
                  ? "bg-secondary text-primary-strong"
                  : "text-feasta-text-secondary hover:bg-feasta-surface-soft hover:text-foreground",
              )}
            >
              {category.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

function marketplaceNavigationClass(active: boolean): string {
  return cn(
    "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
    active
      ? "bg-secondary text-primary-strong"
      : "text-feasta-text-secondary hover:bg-feasta-surface-soft hover:text-foreground",
  );
}

function GuestAccountActions({returnTo}: {returnTo: string}) {
  const encodedReturnTo = encodeURIComponent(returnTo);
  return (
    <nav aria-label="Guest marketplace account" className="col-start-3 row-start-1 ml-auto flex shrink-0 items-center gap-1 md:col-start-4 sm:gap-2">
      <Link
        href={`/login?next=${encodedReturnTo}`}
        className="inline-flex min-h-10 items-center justify-center rounded-[10px] px-3 text-sm font-bold text-primary-strong transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        Log in
      </Link>
      <Link
        href={`/register?next=${encodedReturnTo}`}
        className="hidden min-h-10 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-bold text-primary-foreground shadow-card transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none sm:inline-flex"
      >
        Sign up
      </Link>
    </nav>
  );
}

function CustomerAccountMenu({
  accountLabel,
  firstName,
  lastName,
  email,
  detailsRef,
  summaryRef,
}: {
  accountLabel: string;
  firstName: string;
  lastName: string;
  email: string;
  detailsRef: RefObject<HTMLDetailsElement | null>;
  summaryRef: RefObject<HTMLElement | null>;
}) {
  const trustedFirstName = firstName.trim();
  const trustedLastName = lastName.trim();
  const trustedEmail = email.trim() || (/^[^@\s]+@[^@\s]+$/u.test(accountLabel.trim()) ? accountLabel.trim() : "");
  const triggerLabel = trustedFirstName || "Account";
  const displayName = trustedFirstName
    ? `${trustedFirstName}${trustedLastName ? ` ${trustedLastName.charAt(0).toLocaleUpperCase("en-PH")}.` : ""}`
    : "Customer";
  const avatarLabel = trustedFirstName || trustedEmail || accountLabel;

  return (
    <details
      ref={detailsRef}
      className="group relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !detailsRef.current?.open) return;
        event.preventDefault();
        detailsRef.current.removeAttribute("open");
        summaryRef.current?.focus();
      }}
    >
      <summary
        ref={summaryRef}
        aria-haspopup="menu"
        aria-label="Open customer account menu"
        className="flex min-h-10 max-w-44 cursor-pointer list-none items-center gap-1.5 rounded-[10px] px-1 transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-[10px] bg-primary text-xs font-black uppercase text-primary-foreground">
          {avatarLabel.trim().charAt(0).toLocaleUpperCase("en-PH") || "F"}
        </span>
        <span className="hidden max-w-24 truncate text-sm font-semibold xl:block">{triggerLabel}</span>
        <ChevronDown aria-hidden="true" className="hidden size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none sm:block" />
      </summary>

      <div role="menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-72 gap-1 rounded-xl border border-feasta-border-soft bg-white p-2 shadow-floating">
        <div className="min-w-0 border-b border-feasta-divider px-3 py-3">
          <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
          {trustedEmail ? <p className="mt-0.5 truncate text-xs text-feasta-text-secondary">{trustedEmail}</p> : null}
        </div>
        <CustomerMenuLink href="/customer/account" label="Account Settings" icon={<Settings aria-hidden="true" />} detailsRef={detailsRef} />
        <CustomerMenuLink href={CUSTOMER_BOOKINGS_PATH} label="My Bookings" icon={<CalendarDays aria-hidden="true" />} detailsRef={detailsRef} />
        <div className="mt-1 border-t border-feasta-divider pt-1">
          <LogoutButton destination="/login" />
        </div>
      </div>
    </details>
  );
}

function CustomerMenuLink({href, label, icon, detailsRef}: {
  href: string;
  label: string;
  icon: ReactNode;
  detailsRef: RefObject<HTMLDetailsElement | null>;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 font-semibold hover:bg-primary-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => detailsRef.current?.removeAttribute("open")}
    >
      <span className="text-feasta-text-secondary [&_svg]:size-5">{icon}</span>
      {label}
    </Link>
  );
}
