"use client";

import {
  CalendarDays,
  ChevronDown,
  Heart,
  MessageSquareText,
  Search,
  Settings,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {usePathname, useSearchParams} from "next/navigation";
import {
  useEffect,
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
import {cn} from "@/lib/utils";

import {useCustomerAuth} from "./customer-auth-provider";

import {EventFinder} from "./event-finder";

const CUSTOMER_HOME_PATH = "/customer";
const CUSTOMER_FAVORITES_PATH = "/customer/favorites";
const CUSTOMER_BOOKINGS_PATH = "/customer/bookings";
const CUSTOMER_MESSAGES_PATH = "/customer/messages";

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
  const requestAuth = useCustomerAuth();
  const [authMode, setAuthMode] = useState<CustomerAuthMode | null>(null);
  const accountDetails = useRef<HTMLDetailsElement>(null);
  const accountSummary = useRef<HTMLElement>(null);
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
      <header className="sticky top-0 z-40 border-b border-feasta-border-soft bg-white/95 shadow-[0_6px_24px_rgb(43_33_29/0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-8">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[4rem_auto_auto] items-center gap-x-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-rows-[4rem_auto] md:gap-x-4">
            <MarketplaceBrand pathname={pathname} />

            {authenticated && accountLabel ? (
              <div className="col-start-2 row-start-1 ml-auto flex shrink-0 items-center gap-1 md:col-start-3">
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
              <GuestAccountActions
                onLogin={() => openAuth("login")}
                onRegister={() => openAuth("register")}
              />
            )}
            <MarketplaceSectionNavigation pathname={pathname} />
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

function MarketplaceSectionNavigation({pathname}: {pathname: string}) {
  const parameters = useSearchParams();
  const query = parameters.toString();
  // URL changes reset the disclosure and form defaults together.
  return <MarketplaceNavigationContent key={pathname + "?" + query} pathname={pathname} query={query} />;
}

function MarketplaceNavigationContent({pathname, query}: {pathname: string; query: string}) {
  const [open, setOpen] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const items = [
    {label: "Event Services", href: PUBLIC_PROVIDER_MARKETPLACE_PATH},
    {label: "Packages", href: PUBLIC_PACKAGE_MARKETPLACE_PATH},
  ] as const;

  function close() {
    setOpen(false);
    searchButton.current?.focus();
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
      <nav aria-label="Marketplace sections" className="col-span-full row-start-2 flex min-h-11 items-center justify-center gap-1 border-t border-feasta-divider py-0.5 md:col-span-1 md:col-start-2 md:row-start-1 md:border-t-0">
        {items.map((item) => {
          const active = isNavigationItemActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={marketplaceNavigationClass(active)}>
              {item.label}
            </Link>
          );
        })}
        <button
          ref={searchButton}
          type="button"
          aria-label={open ? "Close Event Finder" : "Open Event Finder"}
          title={open ? "Close Event Finder" : "Open Event Finder"}
          aria-expanded={open}
          aria-controls="marketplace-event-finder"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "ml-1 grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
            open ? "bg-feasta-surface-soft text-feasta-text-secondary hover:text-primary-strong" : "text-feasta-text-secondary hover:bg-feasta-surface-soft hover:text-primary-strong",
          )}
        >
          {open ? <X aria-hidden="true" className="size-[18px]" /> : <Search aria-hidden="true" className="size-[18px]" />}
        </button>
      </nav>
      <div
        id="marketplace-event-finder"
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "col-span-full row-start-3 grid min-w-0 transition-[grid-template-rows,opacity,visibility] duration-200 motion-reduce:transition-none md:row-start-2",
          open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        )}
      >
        <div className={cn("min-h-0 overflow-hidden", open && "sm:overflow-visible")}>
          <div className="mx-auto max-h-[calc(100dvh-9rem)] max-w-6xl overflow-y-auto px-1 pb-4 pt-2 sm:overflow-visible sm:pb-3">
            <EventFinder query={query} onFind={close} />
          </div>
        </div>
      </div>
    </>
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
      className="col-start-2 row-start-1 ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:col-start-3"
    >
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
        <CustomerMenuLink href={CUSTOMER_MESSAGES_PATH} label="Messages" icon={<MessageSquareText aria-hidden="true" />} detailsRef={detailsRef} />
        <div className="mt-1 border-t border-feasta-divider pt-1">
          <LogoutButton destination="/customer/providers" />
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
