import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {Suspense} from "react";

import {MarketplaceHomeLoading} from "@/components/customer/discovery/marketplace-home-loading";
import {MarketplacePackageSection} from "@/components/customer/discovery/marketplace-package-section";
import {MarketplaceProviderSection} from "@/components/customer/discovery/marketplace-provider-section";
import {MarketplaceSearch} from "@/components/customer/discovery/marketplace-search";
import {ProviderCategoryGrid} from "@/components/customer/discovery/provider-category-grid";
import {ApplicationErrorState} from "@/components/feedback/application-states";
import {Button} from "@/components/ui/button";
import {requireRole} from "@/lib/auth/session";
import {getCustomerMarketplaceHome} from "@/lib/customer/discovery/marketplace-home-service";

export default async function CustomerPage() {
  const user = await requireRole(["customer"]);

  return (
    <Suspense fallback={<MarketplaceHomeLoading />}>
      <MarketplaceContent email={user.email} />
    </Suspense>
  );
}

async function MarketplaceContent({
  email,
}: {
  email: string | null;
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
          description="The FEASTA marketplace could not be loaded. Please try again."
        />
      </section>
    );
  }

  const heroImageUrl =
    marketplace.providers.find(
      (provider) =>
        provider.coverImageUrl !== null,
    )?.coverImageUrl ?? null;

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
        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <MarketplaceHero
            email={email}
            heroImageUrl={heroImageUrl}
          />
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
          <ProviderCategoryGrid />
        </div>
      </section>

      {/* Published packages */}
      <section
        className="
          border-t border-[#E2BFB5]/60
          bg-[#FFF1ED]
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
          />
        </div>
      </section>

      {/* Marketplace trust */}
      <section
        className="
          border-t border-[#E2BFB5]/60
          bg-[#FFF1ED]
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
  return (
    <header
      className="
        relative isolate
        overflow-hidden
        rounded-[1.75rem]
        border border-[#E2BFB5]
        bg-[#F1DED6]
        shadow-[0_12px_32px_rgba(38,24,20,0.10)]
      "
    >
      <div
        className="
          grid min-h-[31rem]
          lg:grid-cols-[1.08fr_0.92fr]
          lg:items-stretch
        "
      >
        <div
          className="
            flex flex-col justify-center
            px-6 py-10
            sm:px-10
            lg:px-12 lg:py-14
            xl:px-16
          "
        >
          <p
            className="
              flex items-center gap-2
              text-sm font-black
              uppercase tracking-[0.16em]
              text-[#A93613]
            "
          >
            <Sparkles
              aria-hidden="true"
              className="size-4"
            />

            FEASTA marketplace
          </p>

          <h1
            className="
              mt-4 max-w-2xl
              text-4xl font-black
              leading-[1.02]
              tracking-[-0.045em]
              text-[#261814]
              sm:text-5xl
              xl:text-6xl
            "
          >
            Plan a celebration

            <span className="block text-[#B02F00]">
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
            {email
              ? `Welcome back, ${email}. `
              : null}

            Discover approved caterers, venues,
            photographers, stylists, and published event
            packages in Ormoc City.
          </p>

          <div className="mt-7">
            <MarketplaceSearch />
          </div>

          <div
            className="
              mt-5 flex flex-col gap-3
              text-sm font-semibold
              text-[#5A413A]
              sm:flex-row
              sm:items-center
              sm:gap-6
            "
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck
                aria-hidden="true"
                className="size-5 text-[#B02F00]"
              />

              Approved providers
            </span>

            <span className="inline-flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-5 text-[#B02F00]"
              />

              Protected payments
            </span>
          </div>
        </div>

        <div
          className="
            relative min-h-72
            overflow-hidden
            bg-[#DABFB4]
            lg:m-8
            lg:ml-0
            lg:min-h-0
            lg:rounded-[1.5rem]
          "
        >
          {heroImageUrl ? (
            // Public media was validated during marketplace
            // normalization.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImageUrl}
              alt="A celebration prepared by a FEASTA event provider"
              className="
                absolute inset-0
                size-full object-cover
              "
            />
          ) : (
            <div
              className="
                absolute inset-0
                bg-[radial-gradient(circle_at_25%_20%,#FFB08F_0,transparent_28%),radial-gradient(circle_at_75%_70%,#B72E08_0,transparent_30%),linear-gradient(135deg,#F6CFC0,#7A2E1A)]
              "
            />
          )}

          <div
            className="
              absolute inset-0
              bg-gradient-to-t
              from-black/40
              via-black/5
              to-transparent
            "
          />

          <div
            className="
              absolute bottom-5 left-5
              rounded-full
              border border-white/30
              bg-black/45
              px-4 py-2
              text-sm font-bold text-white
              shadow-sm
              backdrop-blur
            "
          >
            Plan confidently with FEASTA
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
        bg-[#B02F00]
        text-white
        shadow-[0_12px_30px_rgba(176,47,0,0.18)]
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
            text-white/70
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
            leading-7 text-white/80
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
            text-white/90
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
            border-white
            bg-white
            text-[#B02F00]
            hover:bg-[#FFF1ED]
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