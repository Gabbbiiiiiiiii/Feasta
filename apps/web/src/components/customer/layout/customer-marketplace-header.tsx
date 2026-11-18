"use client";

import {
  CalendarDays,
  ChevronDown,
  Heart,
  LogOut,
  MessageSquareText,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {usePathname, useSearchParams} from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {CustomerLoginModal, type CustomerAuthMode} from "@/components/customer/providers/customer-login-modal";
import {LogoutButton} from "@/components/auth/logout-button";
import {NotificationMenu} from "@/components/layout/notification-menu";
import {isNavigationItemActive} from "@/components/layout/navigation";
import {
  PUBLIC_PACKAGE_MARKETPLACE_PATH,
  PUBLIC_PROVIDER_MARKETPLACE_PATH,
  isPublicMarketplaceReturnPath,
} from "@/lib/customer/providers/provider-route-policy";
import type {ServiceCategoryOption} from "@/lib/service-categories/service-category-types";
import type {ActiveOccasionOption} from "@/lib/customer/planning/active-occasion-options-service";
import {cn} from "@/lib/utils";

import {useCustomerAuth} from "./customer-auth-provider";

import {CustomerEventListMenu} from "@/components/customer/event-list/customer-event-list-menu";

import {EventFinder} from "./event-finder";

const CUSTOMER_HOME_PATH = "/customer";
const MARKETPLACE_HEADER_HEIGHT = "--feasta-marketplace-header-height";
const CUSTOMER_FAVORITES_PATH = "/customer/favorites";
const CUSTOMER_BOOKINGS_PATH = "/customer/bookings";
const CUSTOMER_MESSAGES_PATH = "/customer/messages";

export function CustomerMarketplaceHeader({
  accountLabel = null,
  accountFirstName = "",
  accountLastName = "",
  accountEmail = "",
  authReturnTo = PUBLIC_PROVIDER_MARKETPLACE_PATH,
  serviceCategoryOptions = [],
  occasionOptions = [],
}: {
  accountLabel?: string | null;
  accountFirstName?: string;
  accountLastName?: string;
  accountEmail?: string;
  authReturnTo?: string;
  serviceCategoryOptions?: readonly ServiceCategoryOption[];
  occasionOptions?: readonly ActiveOccasionOption[];
}) {
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const requestAuth = useCustomerAuth();
  const [authMode, setAuthMode] = useState<CustomerAuthMode | null>(null);
  const accountDetails = useRef<HTMLDetailsElement>(null);
  const accountSummary = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const authenticated = Boolean(accountLabel?.trim());
  const query = searchParameters.toString();
  const currentReturnTo = pathname + (query ? '?' + query : '');
  const safeReturnTo = isPublicMarketplaceReturnPath(currentReturnTo)
    ? currentReturnTo
    : isPublicMarketplaceReturnPath(authReturnTo) ? authReturnTo : PUBLIC_PROVIDER_MARKETPLACE_PATH;

  function openAuth(mode: CustomerAuthMode) {
    if (requestAuth) requestAuth({mode, returnTo: safeReturnTo});
    else setAuthMode(mode);
  }

  useLayoutEffect(() => {
    const header = headerRef.current;
    const shell = header?.closest<HTMLElement>(
      "[data-customer-marketplace-shell], [data-public-provider-marketplace-shell]",
    );
    if (!header || !shell) return undefined;

    // --feasta-header-height is a static scroll-padding token. The visible
    // marketplace header also includes the section row and, when open, the
    // event-finder row, so consumers follow the measured border box instead.
    const publish = () => {
      shell.style.setProperty(
        MARKETPLACE_HEADER_HEIGHT,
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(publish);
    observer?.observe(header);
    return () => {
      observer?.disconnect();
      shell.style.removeProperty(MARKETPLACE_HEADER_HEIGHT);
    };
  }, []);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!accountDetails.current?.contains(event.target)) {
        accountDetails.current?.removeAttribute("open");
      }
    };

    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-40 border-b border-muted bg-white/95 shadow-[0_6px_24px_rgb(0_75_59/0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-8">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[4rem_auto_auto] items-center gap-x-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)_auto] md:grid-rows-[4rem_auto] md:gap-x-4">
            <MarketplaceBrand pathname={pathname} />

            {authenticated && accountLabel ? (
              <div className="col-start-2 row-start-1 ml-auto flex shrink-0 items-center gap-1 md:col-start-4">
                <CustomerEventListMenu key={accountEmail || accountLabel} authenticated={authenticated} />
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
              <GuestAccountActions
                onLogin={() => openAuth("login")}
                onRegister={() => openAuth("register")}
              />
            )}
            <MarketplaceSectionNavigation
  pathname={pathname}
  serviceCategoryOptions={serviceCategoryOptions}
  occasionOptions={occasionOptions}
/>
          </div>
        </div>
      </header>

      {!requestAuth ? <CustomerLoginModal
        open={authMode !== null}
        initialMode={authMode ?? "login"}
        onClose={() => setAuthMode(null)}
        returnTo={safeReturnTo}
      /> : null}
    </>
  );
}

function MarketplaceBrand({pathname}: {pathname: string}) {
  return (
    <Link
      href="/customer/providers"
      aria-label="FEASTA home"
      aria-current={pathname === CUSTOMER_HOME_PATH ? "page" : undefined}
      className="group col-start-1 row-start-1 inline-flex min-h-12 min-w-0 shrink-0 items-center justify-self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

function MarketplaceSectionNavigation({
  pathname,
  serviceCategoryOptions,
  occasionOptions,
}: {
  pathname: string;
  serviceCategoryOptions: readonly ServiceCategoryOption[];
  occasionOptions: readonly ActiveOccasionOption[];
}) {
  const parameters = useSearchParams();
  const query = parameters.toString();

  const formParameters = new URLSearchParams(query);
  formParameters.delete("q");
  formParameters.delete("cursor");
  formParameters.sort();
  // Keyword and pagination updates keep the open finder and its draft mounted.
  return (
    <MarketplaceNavigationContent
      key={pathname + "?" + formParameters.toString()}
      pathname={pathname}
      query={query}
      serviceCategoryOptions={serviceCategoryOptions}
      occasionOptions={occasionOptions}
    />
  );
}

function MarketplaceNavigationContent({
  pathname,
  query,
  serviceCategoryOptions,
  occasionOptions,
}: {
  pathname: string;
  query: string;
  serviceCategoryOptions: readonly ServiceCategoryOption[];
  occasionOptions: readonly ActiveOccasionOption[];
}) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const providerSearchButton = useRef<HTMLButtonElement>(null);
  const providerSearchInput = useRef<HTMLInputElement>(null);
  const providerSearchParams = new URLSearchParams(
    pathname === PUBLIC_PROVIDER_MARKETPLACE_PATH ? query : "",
  );
  const keyword = providerSearchParams.get("q") ?? "";
  providerSearchParams.delete("q");
  providerSearchParams.delete("cursor");

  useEffect(() => {
    if (searchOpen) providerSearchInput.current?.focus();
  }, [searchOpen]);

  // The marketplace banner and event summary open the shared editor.
  useEffect(() => {
    const openFromMarketplace = () => {
      setSearchOpen(false);
      setOpen(true);
      plannerButton.current?.focus({preventScroll: true});
      plannerButton.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    window.addEventListener("feasta:open-event-finder", openFromMarketplace);
    return () => {
      window.removeEventListener("feasta:open-event-finder", openFromMarketplace);
    };
  }, []);
  const [savedBestFitHref, setSavedBestFitHref] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void import("@/lib/firebase/client").then(async ({auth}) => {
      await auth.authStateReady();
      const uid = auth.currentUser?.uid;
      if (!uid || cancelled) return;
      const href = sessionStorage.getItem(`feasta:best-fit:latest:${uid}`);
      if (href?.startsWith("/customer/providers?")) setSavedBestFitHref(href);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const plannerButton = useRef<HTMLButtonElement>(null);
  const items = [
    {label: "Event Services", href: PUBLIC_PROVIDER_MARKETPLACE_PATH},
    {label: "Packages", href: PUBLIC_PACKAGE_MARKETPLACE_PATH},
  ] as const;

  function close() {
    setSavedBestFitHref(null);
    setOpen(false);
    plannerButton.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  return (
    <>
      <div className="relative col-span-full row-start-2 flex min-w-0 items-center justify-end gap-2 border-t border-feasta-divider md:col-span-2 md:col-start-2 md:row-start-1 md:border-t-0">
        <div inert={searchOpen} className={cn(
          "mr-auto transition-opacity duration-150 motion-reduce:transition-none md:mx-auto",
          searchOpen && "pointer-events-none opacity-0",
        )}>
          <nav aria-label="Marketplace sections" className="flex min-h-11 items-center justify-center gap-0 sm:gap-1">
            {items.map((item) => {
              const active = isNavigationItemActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={marketplaceNavigationClass(active)}>
                  {item.label}
                </Link>
              );
            })}
            <button
              ref={plannerButton}
              type="button"
              aria-label={open ? "Plan your event, close planner" : undefined}
              aria-expanded={open}
              aria-controls="marketplace-event-finder"
              onClick={() => {
                setSearchOpen(false);
                setOpen((current) => !current);
              }}
              className={cn(
                "group inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent bg-primary-strong px-2 text-white shadow-sm sm:px-4 transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                open
                  ? "ring-2 ring-primary/30"
                  : "hover:bg-primary",
              )}
            >
              {open
                ? <X aria-hidden="true" className="size-[18px]" />
                : <Sparkles aria-hidden="true" className="size-[18px] motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:rotate-12 motion-safe:group-hover:scale-110 motion-safe:group-focus-visible:rotate-12 motion-safe:group-focus-visible:scale-110" />}
              <span className="text-xs font-bold sm:text-sm">Plan your event</span>
            </button>
          </nav>
        </div>
          <button
            ref={providerSearchButton}
            type="button"
            aria-label={searchOpen ? "Close provider search" : "Search providers"}
            title={searchOpen ? "Close provider search" : "Search providers"}
            aria-expanded={searchOpen}
            aria-controls="marketplace-provider-search"
            onClick={() => {
              setOpen(false);
              setSearchOpen((current) => !current);
            }}
            className="grid size-10 place-items-center rounded-xl bg-white text-feasta-text-secondary shadow-sm hover:bg-primary-tint hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {searchOpen ? <X aria-hidden="true" className="size-[18px]" /> : <Search aria-hidden="true" className="size-[18px]" />}
          </button>
        <form
          id="marketplace-provider-search"
          role="search"
          aria-label="Marketplace provider search"
          action={PUBLIC_PROVIDER_MARKETPLACE_PATH}
          inert={!searchOpen}
          aria-hidden={!searchOpen}
          className={cn(
            "absolute right-12 top-1/2 z-10 -translate-y-1/2 overflow-hidden transition-[width,opacity,visibility] duration-200 motion-reduce:transition-none",
            searchOpen ? "visible w-[calc(100%-3rem)] opacity-100" : "invisible w-0 opacity-0",
          )}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setSearchOpen(false);
            providerSearchButton.current?.focus();
          }}
        >
          {[...providerSearchParams].map(([name, value], index) => (
            <input key={index} type="hidden" name={name} value={value} />
          ))}
          <div className="flex gap-2 p-0.5">
            <input
              key={keyword}
              ref={providerSearchInput}
              type="search"
              name="q"
              defaultValue={keyword}
              minLength={2}
              maxLength={80}
              aria-label="Search by provider or service name"
              placeholder="Provider or service name"
              className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="submit" className="min-h-10 rounded-xl bg-primary-strong px-4 text-sm font-bold text-white">
              Search
            </button>
          </div>
        </form>
      </div>
      <div
        id="marketplace-event-finder"
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "col-span-full row-start-3 grid min-w-0 transition-[grid-template-rows,opacity,visibility] duration-200 motion-reduce:transition-none md:row-start-2",
          open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mx-auto max-h-[calc(100dvh-9rem)] max-w-6xl overflow-y-auto overscroll-contain px-1 pb-4 pt-2">
            {savedBestFitHref && <Link href={savedBestFitHref} onClick={close}
              className="mb-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-primary-strong">
              Resume Best Fit
            </Link>}
            <EventFinder
              key={savedBestFitHref ?? "current"}
              query={new URLSearchParams(query).has("budgetMax") ? query : savedBestFitHref?.split("?")[1] ?? query}
              onFind={close}
              serviceCategoryOptions={serviceCategoryOptions}
              occasionOptions={occasionOptions}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function marketplaceNavigationClass(active: boolean): string {
  return cn(
    "inline-flex min-h-10 shrink-0 items-center rounded-full border border-transparent px-2 text-xs font-bold sm:px-4 sm:text-sm transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
    active
      ? "bg-primary-tint text-primary-strong shadow-[0_3px_12px_rgba(3,72,52,0.06)]"
      : "bg-white text-foreground hover:bg-primary-tint hover:text-primary-strong",
  );
}

function GuestAccountActions({
  onRegister,
  onLogin,
}: {
  onRegister: () => void;
  onLogin: () => void;
}) {

  return (
    <nav
      aria-label="Guest marketplace account"
      className="col-start-2 row-start-1 ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:col-start-4"
    >
      <CustomerEventListMenu authenticated={false} />
      <button
        type="button"
        onClick={onLogin}
        className="inline-flex min-h-10 items-center justify-center rounded-[10px] px-3 text-sm font-bold text-primary-strong transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        Log in
      </button>

      <button
        type="button"
        onClick={onRegister}
        className="hidden min-h-10 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-bold text-primary-foreground shadow-card transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none sm:inline-flex"
      >
        Sign up
      </button>
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
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
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
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="group relative shrink-0"
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
        if (keys.includes(event.key)) {
          event.preventDefault();
          if (!detailsRef.current) return;
          detailsRef.current.open = true;
          const items = Array.from(detailsRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
          const index = items.indexOf(document.activeElement as HTMLElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : event.key === "ArrowDown" ? (index + 1) % items.length
              : (index <= 0 ? items.length : index) - 1;
          items[next]?.focus();
          return;
        }
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
        aria-expanded={expanded}
        aria-controls="customer-account-menu"
        className="flex min-h-10 max-w-44 cursor-pointer list-none items-center gap-1.5 rounded-[10px] px-1 transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-xs font-black uppercase text-primary-foreground">
          {avatarLabel.trim().charAt(0).toLocaleUpperCase("en-PH") || "F"}
        </span>
        <span className="hidden max-w-24 truncate text-sm font-semibold xl:block">{triggerLabel}</span>
        <ChevronDown aria-hidden="true" className="hidden size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none sm:block" />
      </summary>

      <div id="customer-account-menu" role="menu" aria-label="Customer account" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-2rem)] gap-1 overflow-y-auto rounded-xl border border-feasta-border-soft bg-white p-2 shadow-floating">
        <div role="presentation" className="mb-1 flex min-w-0 items-center gap-3 border-b border-feasta-divider px-3 py-3">
          <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-sm font-bold uppercase text-primary">
            {`${trustedFirstName.charAt(0)}${trustedLastName.charAt(0)}` || avatarLabel.trim().charAt(0) || "F"}
          </span>
          <div className="min-w-0 flex-1">
            <p title={displayName} className="truncate text-sm font-bold text-foreground">{displayName}</p>
            {trustedEmail ? <p title={trustedEmail} className="mt-0.5 truncate text-xs text-feasta-text-secondary">{trustedEmail}</p> : null}
          </div>
        </div>
        {[
          {href: CUSTOMER_BOOKINGS_PATH, label: "My Bookings", icon: <CalendarDays aria-hidden="true" />},
          {href: CUSTOMER_MESSAGES_PATH, label: "Messages", icon: <MessageSquareText aria-hidden="true" />},
          {href: CUSTOMER_FAVORITES_PATH, label: "Favorites", icon: <Heart aria-hidden="true" />},
          {href: "/customer/account", label: "Account Settings", icon: <Settings aria-hidden="true" />},
        ].map((item) => <CustomerMenuLink key={item.href} {...item} active={isNavigationItemActive(pathname, item.href)} detailsRef={detailsRef} />)}
        <div role="separator" className="my-1 border-t border-feasta-divider" />
        <LogoutButton destination="/customer/providers" trigger={
          <button type="button" role="menuitem" className={customerMenuRowClass}>
            <LogOut aria-hidden="true" className="size-[18px] shrink-0 text-feasta-text-secondary" />
            Sign Out
          </button>
        } />
      </div>
    </details>
  );
}

const customerMenuRowClass = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-foreground hover:bg-primary-tint focus-visible:bg-primary-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function CustomerMenuLink({href, label, icon, active, detailsRef}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  detailsRef: RefObject<HTMLDetailsElement | null>;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(customerMenuRowClass, active && "bg-primary-tint text-primary")}
      onClick={() => detailsRef.current?.removeAttribute("open")}
    >
      <span className="shrink-0 text-feasta-text-secondary [&_svg]:size-[18px]">{icon}</span>
      {label}
    </Link>
  );
}
