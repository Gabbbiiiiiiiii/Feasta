"use client";

import {
  ChevronDown,
  MapPin,
  Search,
  Settings,
} from "lucide-react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect, useRef, type RefObject} from "react";

import {LogoutButton} from "@/components/auth/logout-button";
import {Brand} from "@/components/layout/application-header";
import {NotificationMenu} from "@/components/layout/notification-menu";
import {
  isNavigationItemActive,
  roleNavigation,
} from "@/components/layout/navigation";
import {cn} from "@/lib/utils";

export function CustomerMarketplaceHeader({
  accountLabel,
}: {
  accountLabel: string;
}) {
  const pathname = usePathname();
  const accountDetails = useRef<HTMLDetailsElement>(null);
  const isMarketplaceHome = pathname === "/customer";

  useEffect(() => {
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
  }, []);

  return (
    <header
        className="
        sticky top-0 z-40
        border-b border-[#E2BFB5]/70
        bg-[#FFF8F6]/95
        shadow-[0_2px_10px_rgba(38,24,20,0.05)]
        backdrop-blur
        supports-[backdrop-filter]:bg-[#FFF8F6]/90
        "
    >
        <div
        className="
            mx-auto flex h-16 w-full max-w-[80rem]
            items-center gap-3
            px-4 sm:px-6 lg:px-8
        "
        >
        <div className="shrink-0">
            <Brand role="customer" />
        </div>

        <Link
            href="/customer/providers"
            aria-label="Browse event services in Ormoc City"
            className="
            inline-flex min-w-0 items-center gap-1.5
            rounded-full px-2 py-1.5
            text-xs font-semibold text-[#5A413A]
            transition-colors
            hover:bg-[#FFF1ED]
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#B02F00]/30
            md:hidden
            "
        >
            <MapPin
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[#B02F00]"
            />
            <span className="truncate">Ormoc City</span>
        </Link>

        {isMarketplaceHome ? <MarketplaceHeaderSearch /> : null}

        <DesktopCustomerNavigation
            pathname={pathname}
            compact={!isMarketplaceHome}
        />

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <NotificationMenu role="customer" />

            <CustomerAccountMenu
            accountLabel={accountLabel}
            detailsRef={accountDetails}
            />
        </div>
        </div>
    </header>
    );
}

function MarketplaceHeaderSearch() {
  return (
    <form
      action="/customer/providers"
      method="get"
      role="search"
      className="hidden min-w-52 max-w-sm flex-1 lg:block"
    >
      <label
        className="
          flex h-10 items-center
          rounded-full
          border border-[#E2BFB5]
          bg-white
          shadow-[0_2px_6px_rgba(38,24,20,0.04)]
          transition
          focus-within:border-[#B02F00]
          focus-within:ring-2
          focus-within:ring-[#B02F00]/15
        "
      >
        <span className="sr-only">
          Search event services in Ormoc City
        </span>

        <span
          className="
            flex shrink-0 items-center gap-1.5
            border-r border-[#E2BFB5]
            px-3 text-xs font-semibold text-[#5A413A]
          "
        >
          <MapPin
            aria-hidden="true"
            className="size-3.5 text-[#B02F00]"
          />
          Ormoc City
        </span>

        <Search
          aria-hidden="true"
          className="ml-3 size-4 shrink-0 text-[#8E7068]"
        />

        <input
          type="search"
          name="q"
          minLength={2}
          maxLength={80}
          placeholder="Search event services"
          className="
            h-full min-w-0 flex-1
            border-0 bg-transparent
            px-2 text-sm text-[#261814]
            outline-none
            placeholder:text-[#8E7068]
            focus:ring-0
          "
        />
      </label>
    </form>
  );
}   

function DesktopCustomerNavigation({
  pathname,
  compact,
}: {
  pathname: string;
  compact: boolean;
}) {
  return (
    <nav
      aria-label="Customer marketplace navigation"
      className={cn(
        "hidden h-full md:block",
        compact ? "mx-auto" : "ml-auto",
      )}
    >
      <ul className="flex h-full items-center gap-0.5">
        {roleNavigation.customer.map((item) => {
          const active = isNavigationItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="h-full">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-full items-center gap-1.5 px-2.5 text-xs font-bold transition-colors lg:px-3 lg:text-sm",
                  active
                    ? "text-[#B02F00]"
                    : "text-[#695C56] hover:text-[#261814]",
                )}
              >
                <Icon aria-hidden="true" className="hidden size-4 xl:block" />
                {item.label}
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-t-full bg-[#B02F00]"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CustomerAccountMenu({
  accountLabel,
  detailsRef,
}: {
  accountLabel: string;
  detailsRef: RefObject<HTMLDetailsElement | null>;
}) {
  return (
    <details ref={detailsRef} className="group relative shrink-0">
      <summary
        aria-haspopup="menu"
        aria-label="Open customer account menu"
        className="flex min-h-10 max-w-48 cursor-pointer list-none items-center gap-2 rounded-full px-1 transition-colors hover:bg-[#FFF1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B02F00]/30 [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-full bg-[#FF6333] text-xs font-black uppercase text-[#3B0A00]"
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
        className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-72 gap-1 rounded-xl border border-[#E2BFB5] bg-white p-2 shadow-floating"
      >
        <div className="min-w-0 border-b border-[#E2BFB5] px-3 py-3">
          <p className="truncate text-sm font-bold text-[#261814]">
            {accountLabel}
          </p>
          <p className="text-xs text-[#695C56]">Customer account</p>
        </div>
        <Link
          role="menuitem"
          href="/customer/account"
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 font-semibold hover:bg-[#FFF1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B02F00]/30"
          onClick={() => detailsRef.current?.removeAttribute("open")}
        >
          <Settings aria-hidden="true" className="size-5 text-[#695C56]" />
          Account settings
        </Link>
        <LogoutButton destination="/login" />
      </div>
    </details>
  );
}
