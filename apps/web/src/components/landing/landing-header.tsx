"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  ChevronDown,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const publicNavigation = [
  // {
  //   label: "Event Services",
  //   href: "/services",
  // },
  {
    label: "How It Works",
    href: "/how-it-works",
  },
  {
    label: "About",
    href: "/about",
  },
] as const;

export function LandingHeader() {
  const pathname = usePathname();

  const [isVisible, setIsVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuExpanded, setIsMobileMenuExpanded] = useState(false);

  const previousScrollY = useRef(0);
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const isMobileMenuOpen = useRef(false);

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
    setIsMobileMenuExpanded(false);

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
        <div className="grid h-[72px] grid-cols-[1fr_auto] items-center">
          {/* ================================================================
              BRAND
             ================================================================ */}

          <Link
            href="/"
            aria-label="FEASTA home"
            className="group col-start-1 inline-flex shrink-0 items-center justify-self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Image
              src="/images/feasta_logo.svg"
              alt="Feasta"
              width={586}
              height={202}
              priority
              className="h-[30px] w-auto object-contain transition-transform duration-normal group-hover:scale-[1.03] sm:h-[32px] lg:h-[34px] motion-reduce:transform-none"            />
          </Link>

          {/* ================================================================
                DESKTOP NAVIGATION + ACTIONS
              ================================================================ */}

            <div className="col-start-2 hidden min-w-0 items-center justify-self-end gap-1 lg:flex xl:gap-2">
              <nav
                aria-label="Main navigation"
                className="flex items-center gap-1"
              >
                {publicNavigation.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={[
                        "relative inline-flex h-10 items-center justify-center",
                        "rounded-full px-3 xl:px-4",
                        "text-[13px] font-semibold xl:text-[14px]",
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

              <details className="group relative ml-1 xl:ml-3">
              <summary
                className={[
                  "inline-flex min-h-10 cursor-pointer list-none items-center justify-center gap-2",
                  "rounded-full bg-primary px-4 xl:px-5",
                  "text-[13px] font-bold text-primary-foreground xl:text-[14px]",
                  "shadow-brand-soft",
                  "transition-[transform,background-color,box-shadow]",
                  "duration-normal",
                  "hover:-translate-y-0.5 hover:bg-primary-hover",
                  "hover:shadow-brand",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary focus-visible:ring-offset-2",
                  "motion-reduce:transform-none",
                  "[&::-webkit-details-marker]:hidden",
                ].join(" ")}
              >
                Join Feasta

                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>

              <div
                className={[
                  "absolute right-0 top-[calc(100%+12px)] z-50",
                  "w-[min(330px,calc(100vw-2rem))] overflow-hidden",
                  "rounded-[20px]",
                  "border border-feasta-border-soft",
                  "bg-white",
                  "p-2",
                  "shadow-modal",
                ].join(" ")}
              >
                <Link
                  href="/register"
                  className={[
                    "group/item flex items-start gap-4 rounded-[14px] px-4 py-4",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid size-11 shrink-0 place-items-center rounded-full",
                      "bg-secondary text-primary-strong",
                    ].join(" ")}
                  >
                    <UserRound
                      aria-hidden="true"
                      className="size-5"
                    />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">
                      Plan an Event
                    </span>

                    <span className="mt-1 block text-sm leading-5 text-feasta-text-secondary">
                      Find trusted local event providers.
                    </span>
                  </span>
                </Link>

                <div className="mx-3 h-px bg-feasta-divider" />

                <Link
                  href="/become-a-provider"
                  className={[
                    "group/item flex items-start gap-4 rounded-[14px] px-4 py-4",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid size-11 shrink-0 place-items-center rounded-full",
                      "bg-secondary text-primary-strong",
                    ].join(" ")}
                  >
                    <BriefcaseBusiness
                      aria-hidden="true"
                      className="size-5"
                    />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">
                      Become a Provider
                    </span>

                    <span className="mt-1 block text-sm leading-5 text-feasta-text-secondary">
                      List your services and grow your business.
                    </span>
                  </span>
                </Link>
              </div>
            </details>
            </div>

          {/* ================================================================
              MOBILE / TABLET NAVIGATION
             ================================================================ */}

          <details
            ref={mobileMenuRef}
            className="group relative col-start-2 justify-self-end lg:hidden"
            onToggle={(event) => {
              const open = event.currentTarget.open;

              isMobileMenuOpen.current = open;
              setIsMobileMenuExpanded(open);

              if (open) {
                setIsVisible(true);
              }
            }}
          >
            <summary
              aria-expanded={isMobileMenuExpanded}
              className={[
                "grid size-11 cursor-pointer list-none place-items-center",
                "rounded-full text-foreground marker:hidden",
                "transition-colors duration-fast",
                "hover:bg-secondary hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-ring focus-visible:ring-offset-2",
              ].join(" ")}
            >
              {isMobileMenuExpanded ? (
                <X
                  aria-hidden="true"
                  className="size-5"
                />
              ) : (
                <Menu
                  aria-hidden="true"
                  className="size-5"
                />
              )}

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
                    pathname === item.href ||
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

              {/* Account / provider actions */}
              <div className="flex flex-col gap-1">
                <p className="px-4 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.14em] text-primary-strong">
                  Join Feasta
                </p>

                <Link
                  href="/register"
                  onClick={closeMobileMenu}
                  className={[
                    "flex min-h-14 items-start gap-3 rounded-xl px-4 py-3",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                    <UserRound
                      aria-hidden="true"
                      className="size-[18px]"
                    />
                  </span>

                  <span>
                    <span className="block text-sm font-bold text-foreground">
                      Plan an Event
                    </span>

                    <span className="mt-0.5 block text-xs leading-5 text-feasta-text-secondary">
                      Find trusted local event providers.
                    </span>
                  </span>
                </Link>

                <Link
                  href="/become-a-provider"
                  onClick={closeMobileMenu}
                  className={[
                    "flex min-h-14 items-start gap-3 rounded-xl px-4 py-3",
                    "transition-colors duration-fast",
                    "hover:bg-feasta-surface-soft",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary focus-visible:ring-inset",
                  ].join(" ")}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                    <BriefcaseBusiness
                      aria-hidden="true"
                      className="size-[18px]"
                    />
                  </span>

                  <span>
                    <span className="block text-sm font-bold text-foreground">
                      Become a Provider
                    </span>

                    <span className="mt-0.5 block text-xs leading-5 text-feasta-text-secondary">
                      List your services and grow your business.
                    </span>
                  </span>
                </Link>
              </div>
              <div className="my-2 h-px bg-feasta-divider" />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
