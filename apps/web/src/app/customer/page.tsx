import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {Suspense} from "react";

import {MarketplaceHomeLoading} from "@/components/customer/discovery/marketplace-home-loading";
import {MarketplacePackageSection} from "@/components/customer/discovery/marketplace-package-section";
import {MarketplaceProviderSection} from "@/components/customer/discovery/marketplace-provider-section";
import {MarketplaceActiveEventStrip} from "@/components/customer/discovery/marketplace-active-event-strip";
import {MarketplaceSearch} from "@/components/customer/discovery/marketplace-search";
import {ProviderCategoryGrid} from "@/components/customer/discovery/provider-category-grid";
import {ApplicationErrorState} from "@/components/feedback/application-states";
import {Button} from "@/components/ui/button";
import {requireRole} from "@/lib/auth/session";
import {getCustomerMarketplaceHome} from "@/lib/customer/discovery/marketplace-home-service";
import {getCustomerFavoriteProviderIds} from "@/lib/customer/favorites/customer-favorite-service";
import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Explore Providers",
};

export default async function CustomerPage() {
  const user = await requireRole(["customer"]);

  return (
    <Suspense fallback={<MarketplaceHomeLoading />}>
      <MarketplaceContent email={user.email} customerId={user.uid} />
    </Suspense>
  );
}

async function MarketplaceContent({
  email,
  customerId,
}: {
  email: string | null;
  customerId: string;
}) {
  const marketplace =
    await getCustomerMarketplaceHome().catch(() => null);

  if (!marketplace) {
    return (
      <section
        className="
          rounded-2xl
          border border-[#E2BFB5]/60
          bg-white
          shadow-sm
        "
      >
        <ApplicationErrorState
          kind="load"
          description="The FEASTA could not be loaded. Please try again."
        />
      </section>
    );
  }

  const heroImageUrl =
    marketplace.providers.find(
      (provider) =>
        provider.coverImageUrl !== null,
    )?.coverImageUrl ?? null;
  const favoriteProviderIds = await getCustomerFavoriteProviderIds(
    customerId,
    marketplace.providers.map((provider) => provider.id),
  ).catch(() => new Set<string>());

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border border-[#E2BFB5]/60
        bg-[#FFF8F6]
        shadow-[0_4px_18px_rgba(38,24,20,0.04)]
      "
    >
      {/* Hero */}
      <section className="bg-[#FFF8F6]">
        <div
          className="
            grid gap-4
            px-4 py-4
            sm:px-6 sm:py-6
            lg:px-8
          "
        >
          <MarketplaceHero
            email={email}
            heroImageUrl={heroImageUrl}
          />

          <Suspense
            fallback={
              <div
                aria-hidden="true"
                className="
                  h-20 animate-pulse
                  rounded-2xl
                  border border-[#E2BFB5]/60
                  bg-white
                  motion-reduce:animate-none
                "
              />
            }
          >
            <MarketplaceActiveEventStrip />
          </Suspense>
        </div>
      </section>

      {/* Categories */}
      <section
        className="
          border-t border-[#E2BFB5]/60
          bg-white
        "
      >
        <div
          className="
            px-4 py-10
            sm:px-6
            lg:px-8 lg:py-14
          "
        >
          <ProviderCategoryGrid
            providers={marketplace.providers}
          />
        </div>
      </section>

      {/* Published packages */}
      <section
        className="
          border-t border-[#E2BFB5]/60
          bg-primary-tint
        "
      >
        <div
          className="
            px-4 py-10
            sm:px-6
            lg:px-8 lg:py-14
          "
        >
          <MarketplacePackageSection
            packages={marketplace.packages}
            providers={marketplace.providers}
          />
        </div>
      </section>

      {/* Approved providers */}
      <section
        className="
          border-t border-[#E2BFB5]/60
          bg-white
        "
      >
        <div
          className="
            px-4 py-10
            sm:px-6
            lg:px-8 lg:py-14
          "
        >
          <MarketplaceProviderSection
            providers={marketplace.providers}
            favoriteProviderIds={favoriteProviderIds}
          />
        </div>
      </section>

      {/* Marketplace trust */}
      <section
        className="
          border-t border-[#E2BFB5]/60
          bg-primary-tint
        "
      >
        <div
          className="
            px-4 py-10
            sm:px-6
            lg:px-8 lg:py-14
          "
        >
          <MarketplaceTrustSection />
        </div>
      </section>
    </div>
  );
}

function MarketplaceHero({
  email,
  heroImageUrl,
}: {
  email: string | null;
  heroImageUrl: string | null;
}) {
  const customerName =
    email?.split("@")[0]
      .replace(/[._-]+/g, " ")
      .trim() || null;

  return (
    <header
      className="
        relative isolate
        overflow-hidden
        rounded-[1.75rem]
        border border-[#E2BFB5]
        bg-[#F1DED6]
        shadow-[0_14px_36px_rgba(38,24,20,0.10)]
      "
    >
      <div
        className="
          grid
          lg:min-h-[32rem]
          lg:grid-cols-[1.05fr_0.95fr]
        "
      >
        <div
          className="
            relative z-10
            flex flex-col justify-center
            px-5 py-9
            sm:px-8 sm:py-12
            lg:px-12 lg:py-14
            xl:px-14
          "
        >
          <p
            className="
              flex items-center gap-2
              text-xs font-black
              uppercase tracking-[0.16em]
              text-primary-strong
              sm:text-sm
            "
          >
            <Sparkles
              aria-hidden="true"
              className="size-4"
            />

            FEASTA
          </p>

          <h1
            className="
              mt-4 max-w-xl
              text-4xl font-black
              leading-[0.98]
              tracking-[-0.045em]
              text-[#261814]
              sm:text-5xl
              xl:text-6xl
            "
          >
            Plan a celebration

            <span className="mt-1 block text-primary">
              worth remembering.
            </span>
          </h1>

          <p
            className="
              mt-5 max-w-xl
              text-base leading-7
              text-[#5A413A]
              sm:text-lg
            "
          >
            {customerName
              ? `Welcome back, ${customerName}. `
              : null}

            Discover verified caterers and event
            professionals in Ormoc City, all in one
            organized marketplace.
          </p>

          <div className="mt-7">
            <MarketplaceSearch />
          </div>

          <div
            className="
              mt-5 flex flex-wrap
              items-center gap-x-6 gap-y-3
              text-xs font-semibold
              text-[#5A413A]
              sm:text-sm
            "
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck
                aria-hidden="true"
                className="size-5 text-primary"
              />

              Approved providers
            </span>

            <span className="inline-flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-5 text-primary"
              />

              Protected payments
            </span>

            <span className="inline-flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-5 text-primary"
              />

              Clear booking statuses
            </span>
          </div>
        </div>

        <div
          className="
            relative min-h-[22rem]
            overflow-hidden
            bg-[#DABFB4]
            lg:m-6
            lg:ml-0
            lg:min-h-0
            lg:rounded-[1.5rem]
          "
        >
          {heroImageUrl ? (
            // Public provider media was validated by
            // marketplace normalization.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImageUrl}
              alt="An event prepared by a FEASTA provider"
              className="
                absolute inset-0
                size-full object-cover
                transition-transform
                duration-700
                hover:scale-[1.03]
                motion-reduce:transform-none
              "
            />
          ) : (
            <div
              className="feasta-brand-media-placeholder absolute inset-0"
            />
          )}

          <div
            className="
              absolute inset-0
              bg-gradient-to-t
              from-black/45
              via-black/5
              to-transparent
            "
          />

          <div
            className="
              absolute inset-x-4 bottom-4
              flex items-center justify-between gap-3
              rounded-xl
              border border-white/25
              bg-black/45
              px-4 py-3
              text-white
              shadow-sm
              backdrop-blur-md
              sm:inset-x-5 sm:bottom-5
            "
          >
            <div>
              <p className="text-xs text-white/70">
                Marketplace location
              </p>

              <p className="mt-0.5 font-bold">
                Ormoc City, Leyte
              </p>
            </div>

            <MapPin
              aria-hidden="true"
              className="size-5 shrink-0"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function MarketplaceTrustSection() {
  return (
    <div
      className="
        grid overflow-hidden
        rounded-[1.75rem]
        bg-primary
        text-primary-foreground
        shadow-brand
        lg:grid-cols-[1fr_auto]
        lg:items-center
      "
      aria-labelledby="marketplace-trust-title"
    >
      <div className="px-6 py-8 sm:px-10 lg:px-12">
        <p
          className="
            text-sm font-black
            uppercase tracking-[0.16em]
            text-primary-foreground/70
          "
        >
          Book with confidence
        </p>

        <h2
          id="marketplace-trust-title"
          className="
            mt-2 text-3xl
            font-black tracking-tight
          "
        >
          Plan your event with trusted local providers
        </h2>

        <p
          className="
            mt-3 max-w-2xl
            leading-7 text-primary-foreground/80
          "
        >
          Browse approved providers, organize your booking
          requests in one place, and continue eligible
          payments through secure PayMongo checkout.
        </p>

        <div
          className="
            mt-6 grid gap-3
            text-sm font-semibold
            text-primary-foreground/90
            sm:grid-cols-3
          "
        >
          <span className="inline-flex items-center gap-2">
            <ShieldCheck
              aria-hidden="true"
              className="size-5"
            />
            Verified identities
          </span>

          <span className="inline-flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="size-5"
            />
            Secure checkout
          </span>

          <span className="inline-flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="size-5"
            />
            Clear booking statuses
          </span>
        </div>
      </div>

      <div className="px-6 pb-8 sm:px-10 lg:p-12">
        <Button
          asChild
          variant="secondary"
          className="
            border-primary-foreground
            bg-primary-foreground
            text-primary
            hover:bg-primary-tint
          "
        >
          <Link href="/customer/providers">
            Explore event services

            <ArrowRight
              aria-hidden="true"
              className="size-4"
            />
          </Link>
        </Button>
      </div>
    </div>
  );
}
