"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  Heart,
  MapPin,
  Search,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import {LogoutButton} from "@/components/auth/logout-button";
import {NotificationMenu} from "@/components/layout/notification-menu";
import {isNavigationItemActive} from "@/components/layout/navigation";
import {
  PUBLIC_PACKAGE_MARKETPLACE_PATH,
  PUBLIC_PROVIDER_MARKETPLACE_PATH,
  isPublicMarketplaceReturnPath,
} from "@/lib/customer/providers/provider-route-policy";
import {cn} from "@/lib/utils";

export function CustomerMarketplaceHeader({
  accountLabel = null,
  authReturnTo = PUBLIC_PROVIDER_MARKETPLACE_PATH,
}: {
  accountLabel?: string | null;
  authReturnTo?: string;
}) {
  const pathname = usePathname();
  const accountDetails = useRef<HTMLDetailsElement>(null);
  const accountSummary = useRef<HTMLElement>(null);
  const authenticated = Boolean(accountLabel?.trim());
  const safeReturnTo = isPublicMarketplaceReturnPath(authReturnTo)
    ? authReturnTo
    : PUBLIC_PROVIDER_MARKETPLACE_PATH;

  useEffect(() => {
    if (!authenticated) return;

    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountDetails.current?.contains(event.target)
      ) {
        accountDetails.current?.removeAttribute("open");
      }
    };

    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [authenticated]);

  return (
    <header className="sticky top-0 z-40 border-b border-feasta-border-soft bg-white/95 shadow-[0_6px_24px_rgb(43_33_29/0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-8">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <MarketplaceBrand pathname={pathname} />

          <MarketplaceEventLocation />

          {authenticated && accountLabel ? (
            <div className="col-start-2 row-start-1 ml-auto flex min-h-[72px] shrink-0 items-center gap-1 md:col-start-3">
              <Link
                href="/customer/favorites"
                aria-label="Favorites"
                aria-current={
                  isNavigationItemActive(
                    pathname,
                    "/customer/favorites",
                  )
                    ? "page"
                    : undefined
                }
                className="hidden size-10 items-center justify-center rounded-full text-feasta-text-secondary transition-colors hover:bg-feasta-surface-soft hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
              >
                <Heart
                  aria-hidden="true"
                  className={cn(
                    "size-[19px]",
                    isNavigationItemActive(
                      pathname,
                      "/customer/favorites",
                    ) && "fill-current text-primary-strong",
                  )}
                />
              </Link>

              <NotificationMenu role="customer" />

              <CustomerAccountMenu
                accountLabel={accountLabel}
                detailsRef={accountDetails}
                summaryRef={accountSummary}
              />
            </div>
          ) : (
            <GuestAccountActions returnTo={safeReturnTo} />
          )}

          <div className="col-span-2 row-start-2 grid min-h-[68px] min-w-0 grid-cols-1 items-center gap-3 border-t border-feasta-divider py-3 sm:grid-cols-[auto_minmax(0,1fr)] md:col-span-3 md:grid-cols-[auto_minmax(18rem,1fr)] md:gap-6 md:py-0">
            <MarketplaceSectionNavigation pathname={pathname} />

            <MarketplaceHeaderSearch className="md:ml-auto md:max-w-3xl" />
          </div>
        </div>
      </div>
    </header>
  );
}

function MarketplaceBrand({
  pathname,
}: {
  pathname: string;
}) {
  const active = isNavigationItemActive(
    pathname,
    PUBLIC_PROVIDER_MARKETPLACE_PATH,
  );

  return (
    <Link
      href="/"
      aria-label="FEASTA home"
      aria-current={active ? "page" : undefined}
      className="group inline-flex min-h-[72px] min-w-0 shrink-0 items-center gap-2.5 rounded-lg pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Image
        src="/images/feasta_logo.png"
        alt=""
        width={42}
        height={42}
        priority
        className="size-10 shrink-0 object-contain transition-transform duration-normal group-hover:scale-[1.03] motion-reduce:transform-none sm:size-11"
      />

      <span className="min-w-0 text-[20px] font-extrabold tracking-[-0.04em] text-primary sm:text-[22px]">
        Feasta
      </span>
    </Link>
  );
}

function MarketplaceEventLocation() {
  return (
    <div
      aria-label="Marketplace location context. Results currently use provider-listed locations."
      className="col-span-2 row-start-3 mb-2 flex min-w-0 items-center gap-2.5 px-1 py-1.5 text-left md:col-span-1 md:col-start-2 md:row-start-1 md:mb-0 md:ml-7 md:max-w-72"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
        <MapPin
          aria-hidden="true"
          className="size-4"
        />
      </div>

      <span className="min-w-0">
        <span className="block text-[0.65rem] font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Marketplace location
        </span>

        <span className="block truncate text-sm font-semibold text-feasta-text-secondary">
          Provider-listed locations
        </span>
      </span>
    </div>
  );
}

function MarketplaceHeaderSearch({
  className,
}: {
  className?: string;
}) {
  return (
    <form
      action={PUBLIC_PROVIDER_MARKETPLACE_PATH}
      method="get"
      role="search"
      aria-label="Marketplace provider search"
      className={cn(
        "w-full min-w-0 max-w-2xl",
        className,
      )}
    >
      <label
        className="sr-only"
        htmlFor="marketplace-header-search"
      >
        Search providers or services
      </label>

      <div className="flex h-12 min-w-0 items-center rounded-full border border-feasta-border-soft bg-feasta-canvas px-1.5 shadow-[0_2px_8px_rgb(43_33_29/0.025)] transition-[border-color,box-shadow,background-color] focus-within:border-primary/35 focus-within:bg-white focus-within:shadow-[0_5px_16px_rgb(43_33_29/0.05)] focus-within:ring-4 focus-within:ring-primary/[0.07]">
        <Search
          aria-hidden="true"
          className="ml-3 size-[18px] shrink-0 text-feasta-text-tertiary"
        />

        <input
          id="marketplace-header-search"
          type="search"
          name="q"
          minLength={2}
          maxLength={80}
          placeholder="Search providers or event services"
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-medium text-foreground outline-none placeholder:text-feasta-text-tertiary"
        />

        <button
          type="submit"
          aria-label="Search marketplace"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-[background-color,transform] duration-fast hover:scale-[1.03] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
        >
          <Search
            aria-hidden="true"
            className="size-4"
          />
        </button>
      </div>
    </form>
  );
}

function MarketplaceSectionNavigation({
  pathname,
}: {
  pathname: string;
}) {
  const items = [
    {
      label: "Event Services",
      href: PUBLIC_PROVIDER_MARKETPLACE_PATH,
    },
    {
      label: "Packages",
      href: PUBLIC_PACKAGE_MARKETPLACE_PATH,
    },
  ] as const;

  return (
    <nav
      aria-label="Marketplace sections"
      className="flex min-w-0 self-stretch overflow-x-auto"
    >
      {items.map((item) => {
        const active = isNavigationItemActive(
          pathname,
          item.href,
        );

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-secondary text-primary-strong"
                : "text-feasta-text-secondary hover:bg-feasta-surface-soft hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function GuestAccountActions({returnTo}: {returnTo: string}) {
  const encodedReturnTo = encodeURIComponent(returnTo);

  return (
    <nav
      aria-label="Guest marketplace account"
      className="col-start-2 row-start-1 ml-auto flex min-h-16 shrink-0 items-center gap-1 sm:gap-2 md:col-start-3"
    >
      <Link
        href={`/login?next=${encodedReturnTo}`}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-transparent px-3 text-sm font-bold text-primary-strong transition-colors hover:border-border hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
      >
        Log in
      </Link>
      <Link
        href={`/register?next=${encodedReturnTo}`}
        className="hidden min-h-11 cursor-pointer items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-bold text-primary-foreground shadow-card transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
      >
        Sign up
      </Link>
    </nav>
  );
}

function CustomerAccountMenu({
  accountLabel,
  detailsRef,
  summaryRef,
}: {
  accountLabel: string;
  detailsRef: RefObject<HTMLDetailsElement | null>;
  summaryRef: RefObject<HTMLElement | null>;
}) {
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
        className="flex min-h-11 max-w-48 cursor-pointer list-none items-center gap-1.5 rounded-[10px] px-1.5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-[10px] bg-primary text-xs font-black uppercase text-primary-foreground"
        >
          {accountLabel.trim().charAt(0).toLocaleUpperCase("en-PH") || "F"}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-semibold xl:block">
          {accountLabel}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="hidden size-3.5 transition-transform group-open:rotate-180 sm:block"
        />
      </summary>

      <div
        role="menu"
        className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-72 gap-1 rounded-[12px] border border-[#E2BFB5] bg-white p-2 shadow-floating"
      >
        <div className="min-w-0 border-b border-[#E2BFB5] px-3 py-3">
          <p className="truncate text-sm font-bold text-[#261814]">
            {accountLabel}
          </p>
          <p className="text-xs text-[#695C56]">Customer account</p>
        </div>
        <CustomerMenuLink
          href="/customer/account"
          label="Account settings"
          icon={<Settings aria-hidden="true" />}
          detailsRef={detailsRef}
        />
        <CustomerMenuLink
          href="/customer/favorites"
          label="Favorites"
          icon={<Heart aria-hidden="true" />}
          detailsRef={detailsRef}
        />
        <CustomerMenuLink
          href="/customer/bookings"
          label="Bookings"
          icon={<CalendarDays aria-hidden="true" />}
          detailsRef={detailsRef}
        />
        <CustomerMenuLink
          href="/customer/notifications"
          label="Notifications"
          icon={<Bell aria-hidden="true" />}
          detailsRef={detailsRef}
        />
        <LogoutButton destination="/login" />
      </div>
    </details>
  );
}

function CustomerMenuLink({
  href,
  label,
  icon,
  detailsRef,
}: {
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
      <span className="text-[#695C56] [&_svg]:size-5">{icon}</span>
      {label}
    </Link>
  );
}
