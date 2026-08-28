import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Mail,
  MapPin,
  Store,
} from "lucide-react";

const footerLinkClassName = [
  "inline-flex w-fit items-center rounded-md",
  "text-sm text-white/68",
  "transition-colors duration-fast",
  "hover:text-white",
  "focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-primary focus-visible:ring-offset-2",
  "focus-visible:ring-offset-[#241d1a]",
].join(" ");

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#241d1a] text-white">
      {/* Decorative brand glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-40 size-[30rem] rounded-full bg-primary/10 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-40 size-[26rem] rounded-full bg-primary/5 blur-3xl"
      />

      {/* ================================================================
          PRE-FOOTER CTA
         ================================================================ */}

      <section className="relative border-b border-white/10">
        <div className="feasta-container-wide py-10 sm:py-12 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
                Your celebration starts here
              </p>

              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-white sm:text-4xl lg:text-[44px] lg:leading-[1.05]">
                Bring your event together with Feasta.
              </h2>

              <p className="mt-4 max-w-xl text-base leading-7 text-white/68">
                Discover trusted local event providers, compare services,
                and keep your celebration planning organized in one place.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link
                href="/customer/providers"
                className={[
                  "group inline-flex min-h-12 items-center justify-center",
                  "gap-2 rounded-full bg-primary px-6",
                  "text-sm font-bold text-primary-foreground",
                  "shadow-brand",
                  "transition-[transform,background-color,box-shadow]",
                  "duration-normal",
                  "hover:-translate-y-0.5 hover:bg-primary-hover",
                  "hover:shadow-brand-strong",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-[#241d1a]",
                  "motion-reduce:transform-none",
                ].join(" ")}
              >
                Explore Marketplace

                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </Link>

              <Link
                href="/become-a-provider"
                className={[
                  "inline-flex min-h-12 items-center justify-center",
                  "gap-2 rounded-full border border-white/18 px-6",
                  "text-sm font-bold text-white",
                  "transition-colors duration-fast",
                  "hover:border-white/30 hover:bg-white/7",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-[#241d1a]",
                ].join(" ")}
              >
                <Store
                  aria-hidden="true"
                  className="size-4 text-primary"
                />

                Become a Provider
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          MAIN FOOTER
         ================================================================ */}

      <div className="feasta-container-wide relative py-12 sm:py-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.45fr_0.8fr_0.9fr_0.7fr] lg:gap-14">
          {/* ============================================================
              BRAND
             ============================================================ */}

          <div className="max-w-md">
            <Link
              href="/"
              aria-label="FEASTA home"
              className={[
                "inline-flex items-center gap-2.5 rounded-lg",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "focus-visible:ring-offset-[#241d1a]",
              ].join(" ")}
            >
              <Image
                src="/images/feasta_logo.svg"
                alt="Feasta"
                width={586}
                height={202}
                className="h-8 w-auto object-contain"
              />
            </Link>

            <p className="mt-5 max-w-sm text-lg font-bold leading-7 text-white">
              Your event, built in one place.
            </p>

            <p className="mt-3 max-w-sm text-sm leading-6 text-white/65">
              Feasta brings local event services together around one
              celebration, helping customers discover providers, compare
              options, and manage their booking journey.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 text-sm text-white/65">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />

                <span>Serving customers and event providers in Ormoc City</span>
              </div>

              <div className="flex items-start gap-3 text-sm text-white/65">
                <Mail
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />

                <span>Plan, compare, book, and follow your event journey</span>
              </div>
            </div>
          </div>

          {/* ============================================================
              DISCOVER
             ============================================================ */}

          <nav aria-labelledby="footer-discover-title">
            <h2
              id="footer-discover-title"
              className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary"
            >
              Discover
            </h2>

            <ul className="mt-5 space-y-3.5">
              <li>
                <Link href="/" className={footerLinkClassName}>
                  Home
                </Link>
              </li>

              <li>
                <Link href="/services" className={footerLinkClassName}>
                  Event Services
                </Link>
              </li>

              <li>
                <Link
                  href="/customer/providers"
                  className={footerLinkClassName}
                >
                  Browse Providers
                </Link>
              </li>

              <li>
                <Link href="/how-it-works" className={footerLinkClassName}>
                  How It Works
                </Link>
              </li>

              <li>
                <Link href="/about" className={footerLinkClassName}>
                  About Feasta
                </Link>
              </li>
            </ul>
          </nav>

          {/* ============================================================
              ACCOUNT / PROVIDERS
             ============================================================ */}

          <nav aria-labelledby="footer-account-title">
            <h2
              id="footer-account-title"
              className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary"
            >
              Account &amp; Providers
            </h2>

            <ul className="mt-5 space-y-3.5">
              <li>
                <Link href="/login" className={footerLinkClassName}>
                  Log in
                </Link>
              </li>

              <li>
                <Link href="/register" className={footerLinkClassName}>
                  Create Account
                </Link>
              </li>

              <li>
                <Link
                  href="/customer/favorites"
                  className={footerLinkClassName}
                >
                  <span className="inline-flex items-center gap-2">
                    <Heart
                      aria-hidden="true"
                      className="size-3.5"
                    />

                    Favorites
                  </span>
                </Link>
              </li>

              <li>
                <Link
                  href="/become-a-provider"
                  className={footerLinkClassName}
                >
                  Become a Provider
                </Link>
              </li>

              <li>
                <Link
                  href="/provider-login"
                  className={footerLinkClassName}
                >
                  Provider Login
                </Link>
              </li>
            </ul>
          </nav>

          {/* ============================================================
              LEGAL
             ============================================================ */}

          <nav aria-labelledby="footer-legal-title">
            <h2
              id="footer-legal-title"
              className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary"
            >
              Legal
            </h2>

            <ul className="mt-5 space-y-3.5">
              <li>
                <Link href="/privacy" className={footerLinkClassName}>
                  Privacy
                </Link>
              </li>

              <li>
                <Link href="/terms" className={footerLinkClassName}>
                  Terms
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* ================================================================
            FOOTER BOTTOM
           ================================================================ */}

        <div className="mt-12 border-t border-white/10 pt-6 sm:mt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/48">
              &copy; {new Date().getFullYear()} FEASTA. All rights reserved.
            </p>

            <p className="text-sm text-white/48">
              Built around celebrations in Ormoc City.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
