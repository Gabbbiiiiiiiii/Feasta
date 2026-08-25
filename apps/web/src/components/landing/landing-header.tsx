"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Heart,
  LogIn,
  Menu,
  Search,
  Store,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  isPublicProviderMarketplaceReturnPath,
} from "@/lib/customer/providers/provider-route-policy";

const publicNavigation = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Event Services",
    href: "/services",
  },
  {
    label: "How It Works",
    href: "/how-it-works",
  },
  {
    label: "About",
    href: "/about",
  },
] as const;

export function LandingHeader({
  authReturnTo,
}: {
  authReturnTo?: string;
} = {}) {
  const pathname = usePathname();

  const [isVisible, setIsVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  const previousScrollY = useRef(0);
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const isMobileMenuOpen = useRef(false);

  const safeAuthReturnTo =
    authReturnTo && isPublicProviderMarketplaceReturnPath(authReturnTo)
      ? authReturnTo
      : null;

  const loginHref = safeAuthReturnTo
    ? `/login?next=${encodeURIComponent(safeAuthReturnTo)}`
    : "/login";

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const previous = previousScrollY.current;

      setIsScrolled(currentScrollY > 12);

      if (isMobileMenuOpen.current) {
        setIsVisible(true);
        previousScrollY.current = currentScrollY;
        return;
      }

      if (currentScrollY < 80) {
        setIsVisible(true);
      } else if (currentScrollY < previous) {
        setIsVisible(true);
      } else if (currentScrollY > previous + 6) {
        setIsVisible(false);
      }

      previousScrollY.current = currentScrollY;
    };

    previousScrollY.current = window.scrollY;

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const closeMobileMenu = () => {
    isMobileMenuOpen.current = false;

    if (mobileMenuRef.current) {
      mobileMenuRef.current.open = false;
    }
  };

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50",
        "transition-[transform,background-color,box-shadow,border-color]",
        "duration-300 ease-out motion-reduce:transition-none",
        isVisible ? "translate-y-0" : "-translate-y-full",
        isScrolled
          ? "border-b border-feasta-border-soft bg-white/92 shadow-[0_8px_32px_rgb(43_33_29/0.06)] backdrop-blur-xl"
          : "border-b border-transparent bg-white/96",
      ].join(" ")}
    >
      <div className="feasta-container-wide">
        <div className="flex h-[72px] items-center">
          {/* ================================================================
              BRAND
             ================================================================ */}

          <Link
            href="/"
            aria-label="FEASTA home"
            className="group inline-flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Image
              src="/images/feasta_logo.png"
              alt=""
              width={44}
              height={44}
              priority
              className="size-11 object-contain transition-transform duration-normal group-hover:scale-[1.04] motion-reduce:transform-none"
            />

            <span className="text-[23px] font-extrabold tracking-[-0.045em] text-primary sm:text-[25px]">
              Feasta
            </span>
          </Link>

          {/* ================================================================
              DESKTOP NAVIGATION
             ================================================================ */}

          <nav
            aria-label="Main navigation"
            className="ml-auto hidden h-full items-center gap-1 xl:flex"
          >
            {publicNavigation.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "relative inline-flex h-10 items-center justify-center",
                    "rounded-full px-4",
                    "text-[14px] font-semibold",
                    "transition-colors duration-fast",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-offset-2",
                    isActive
                      ? "bg-secondary text-primary-strong"
                      : "text-foreground hover:bg-feasta-surface-soft hover:text-primary-strong",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* ================================================================
              DESKTOP ACTIONS
             ================================================================ */}

          <div className="ml-4 hidden items-center gap-1.5 xl:flex">
            <div
              aria-hidden="true"
              className="mx-1.5 h-6 w-px bg-feasta-divider"
            />

            {/* Search */}
            <Link
              href="/customer/providers"
              aria-label="Search event services"
              className={[
                "grid size-10 place-items-center rounded-full",
                "text-feasta-text-secondary",
                "transition-colors duration-fast",
                "hover:bg-feasta-surface-soft hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
              ].join(" ")}
            >
              <Search
                aria-hidden="true"
                className="size-[19px]"
                strokeWidth={2}
              />
            </Link>

            {/* Favorites */}
            <Link
              href="/customer/favorites"
              aria-label="View favorites"
              className={[
                "grid size-10 place-items-center rounded-full",
                "text-feasta-text-secondary",
                "transition-colors duration-fast",
                "hover:bg-feasta-surface-soft hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
              ].join(" ")}
            >
              <Heart
                aria-hidden="true"
                className="size-[19px]"
                strokeWidth={2}
              />
            </Link>

            {/* Login */}
            <Link
              href={loginHref}
              className={[
                "ml-1 inline-flex min-h-10 items-center justify-center",
                "rounded-full px-3.5",
                "text-[14px] font-semibold text-foreground",
                "transition-colors duration-fast",
                "hover:bg-feasta-surface-soft hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
              ].join(" ")}
            >
              Log in
            </Link>

            {/* Main marketplace CTA */}
            <Link
              href="/customer/providers"
              className={[
                "group ml-1 inline-flex min-h-11 items-center justify-center",
                "gap-2 rounded-full bg-primary px-5",
                "text-[14px] font-bold text-primary-foreground",
                "shadow-brand-soft",
                "transition-[transform,background-color,box-shadow]",
                "duration-normal",
                "hover:-translate-y-0.5 hover:bg-primary-hover",
                "hover:shadow-brand",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "motion-reduce:transform-none",
              ].join(" ")}
            >
              Explore Marketplace

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </Link>
          </div>

          {/* ================================================================
              MOBILE / TABLET NAVIGATION
             ================================================================ */}

          <details
            ref={mobileMenuRef}
            className="group relative ml-auto xl:hidden"
            onToggle={(event) => {
              isMobileMenuOpen.current = event.currentTarget.open;

              if (event.currentTarget.open) {
                setIsVisible(true);
              }
            }}
          >
            <summary
              className={[
                "grid size-11 cursor-pointer list-none place-items-center",
                "rounded-full text-foreground marker:hidden",
                "transition-colors duration-fast",
                "hover:bg-secondary hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-ring focus-visible:ring-offset-2",
              ].join(" ")}
            >
              <Menu
                aria-hidden="true"
                className="size-5 group-open:hidden"
              />

              <X
                aria-hidden="true"
                className="hidden size-5 group-open:block"
              />

              <span className="sr-only">
                Toggle navigation menu
              </span>
            </summary>

            <div
              className={[
                "absolute right-0 top-[52px]",
                "max-h-[calc(100vh-6rem)]",
                "w-[min(23rem,calc(100vw-2rem))]",
                "overflow-y-auto",
                "rounded-[24px]",
                "border border-feasta-border-soft",
                "bg-white/98 p-3",
                "shadow-modal backdrop-blur-xl",
              ].join(" ")}
            >
              {/* Mobile brand context */}
              <div className="px-3 pb-3 pt-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-strong">
                  Explore Feasta
                </p>

                <p className="mt-1.5 text-sm leading-6 text-feasta-text-secondary">
                  Plan your celebration and discover local event services.
                </p>
              </div>

              <div className="my-2 h-px bg-feasta-divider" />

              {/* Main mobile navigation */}
              <nav
                aria-label="Mobile navigation"
                className="flex flex-col gap-1"
              >
                {publicNavigation.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={closeMobileMenu}
                      className={[
                        "flex min-h-11 items-center rounded-xl px-4",
                        "text-sm font-semibold",
                        "transition-colors duration-fast",
                        "focus-visible:outline-none focus-visible:ring-2",
                        "focus-visible:ring-primary focus-visible:ring-inset",
                        isActive
                          ? "bg-secondary text-primary-strong"
                          : "text-foreground hover:bg-feasta-surface-soft hover:text-primary-strong",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="my-2 h-px bg-feasta-divider" />

              {/* Discovery actions */}
              <div className="flex flex-col gap-1">
                <Link
                  href="/customer/providers"
                  onClick={closeMobileMenu}
                  className={[
                    "flex min-h-11 items-center gap-3",
                    "rounded-xl px-4",
                    "text-sm font-semibold text-foreground",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft hover:text-primary-strong",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <Search
                    aria-hidden="true"
                    className="size-[18px] text-feasta-text-secondary"
                  />

                  Search Event Services
                </Link>

                <Link
                  href="/customer/favorites"
                  onClick={closeMobileMenu}
                  className={[
                    "flex min-h-11 items-center gap-3",
                    "rounded-xl px-4",
                    "text-sm font-semibold text-foreground",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft hover:text-primary-strong",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <Heart
                    aria-hidden="true"
                    className="size-[18px] text-feasta-text-secondary"
                  />

                  Favorites
                </Link>
              </div>

              <div className="my-2 h-px bg-feasta-divider" />

              {/* Account / provider actions */}
              <div className="flex flex-col gap-1">
                <Link
                  href={loginHref}
                  onClick={closeMobileMenu}
                  className={[
                    "flex min-h-11 items-center gap-3",
                    "rounded-xl px-4",
                    "text-sm font-semibold text-foreground",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft hover:text-primary-strong",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <LogIn
                    aria-hidden="true"
                    className="size-[18px] text-feasta-text-secondary"
                  />

                  Log in
                </Link>

                <Link
                  href="/become-a-provider"
                  onClick={closeMobileMenu}
                  className={[
                    "flex min-h-11 items-center gap-3",
                    "rounded-xl px-4",
                    "text-sm font-semibold text-foreground",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft hover:text-primary-strong",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <Store
                    aria-hidden="true"
                    className="size-[18px] text-feasta-text-secondary"
                  />

                  Become a Provider
                </Link>
              </div>

              {/* Primary mobile CTA */}
              <Link
                href="/customer/providers"
                onClick={closeMobileMenu}
                className={[
                  "group mt-3 flex min-h-12 items-center justify-center",
                  "gap-2 rounded-xl bg-primary px-5",
                  "text-sm font-bold text-primary-foreground",
                  "shadow-brand-soft",
                  "transition-colors duration-fast",
                  "hover:bg-primary-hover",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary focus-visible:ring-offset-2",
                ].join(" ")}
              >
                Explore Marketplace

                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
