import Image from "next/image";
import Link from "next/link";
import {PUBLIC_PROVIDER_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";
import {
  Mail,
  MapPin,
} from "lucide-react";

const footerLinkClassName = [
  "inline-flex w-fit items-center rounded-md",
  "text-sm text-white/90",
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

            <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">
              Feasta brings local event services together around one
              celebration, helping customers discover providers, compare
              options, and manage their booking journey.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 text-sm text-white/70">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />

                <span>Serving customers and event providers in Ormoc City</span>
              </div>

              <div className="flex items-start gap-3 text-sm text-white/70">
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
              className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/80"
            >
              Discover
            </h2>

            <ul className="mt-5 space-y-3.5">
              {/* <li>
                <Link href="/services" className={footerLinkClassName}>
                  Event Services
                </Link>
              </li> */}

              <li>
                <Link
                  href={PUBLIC_PROVIDER_MARKETPLACE_PATH}
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
              className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/80"
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
                  href="/become-a-provider"
                  className={footerLinkClassName}
                >
                  Become a Provider
                </Link>
              </li>

              {/* <li>
                <Link
                  href="/provider-login"
                  className={footerLinkClassName}
                >
                  Provider Login
                </Link>
              </li> */}
            </ul>
          </nav>

          {/* ============================================================
              LEGAL
             ============================================================ */}

          <nav aria-labelledby="footer-legal-title">
            <h2
              id="footer-legal-title"
              className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/80"
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
            <p className="text-sm text-white/60">
              &copy; {new Date().getFullYear()} FEASTA. All rights reserved.
            </p>

            <p className="text-sm text-white/60">
              Built around celebrations in Ormoc City.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
