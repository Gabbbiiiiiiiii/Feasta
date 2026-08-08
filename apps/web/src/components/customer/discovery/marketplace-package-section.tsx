import {
  ArrowRight,
  Box,
  CalendarDays,
  Store,
} from "lucide-react";
import Link from "next/link";

import {PriceDisplay} from "@/components/shared/price-display";
import {
  humanizeProviderValue,
} from "@/lib/customer/providers/provider-catalog";
import type {
  PublicPackage,
} from "@/lib/customer/discovery/marketplace-types";
import type {
  PublicProvider,
} from "@/lib/customer/providers/provider-types";

export function MarketplacePackageSection({
  packages,
  providers = [],
}: {
  packages: readonly PublicPackage[];
  providers?: readonly PublicProvider[];
}) {
  if (packages.length === 0) {
    return null;
  }

  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="marketplace-packages-title"
    >
      <div
        className="
          flex flex-col gap-3
          sm:flex-row
          sm:items-end
          sm:justify-between
        "
      >
        <div>
          <p
            className="
              text-xs font-black
              uppercase tracking-[0.16em]
              text-[#B02F00]
              sm:text-sm
            "
          >
            Packages for your event
          </p>

          <h2
            id="marketplace-packages-title"
            className="
              mt-1
              text-2xl font-black
              tracking-[-0.025em]
              text-[#261814]
              sm:text-3xl
            "
          >
            Start with a published package
          </h2>

          <p
            className="
              mt-2 max-w-2xl
              text-sm leading-6
              text-[#695C56]
            "
          >
            Explore real packages published by approved
            FEASTA providers in Ormoc City.
          </p>
        </div>

        <Link
          href="/customer/providers"
          className="
            hidden shrink-0
            items-center gap-2
            text-sm font-bold
            text-[#B02F00]
            transition-colors
            hover:text-[#862200]
            hover:underline
            sm:inline-flex
          "
        >
          Browse event services

          <ArrowRight
            aria-hidden="true"
            className="size-4"
          />
        </Link>
      </div>

      <div
        className="
          grid min-w-0 gap-5
          md:grid-cols-2
          xl:grid-cols-3
        "
      >
        {packages.map((packageRecord) => {
          const matchingProvider =
            providers.find(
              (provider) =>
                provider.businessName.trim().toLocaleLowerCase(
                  "en-PH",
                ) ===
                packageRecord.providerName
                  .trim()
                  .toLocaleLowerCase("en-PH"),
            ) ?? null;

          const imageUrl =
            matchingProvider?.coverImageUrl ??
            matchingProvider?.logoUrl ??
            null;

          return (
            <article
              key={packageRecord.id}
              className="
                group min-w-0
                overflow-hidden
                rounded-2xl
                border border-[#E2BFB5]/70
                bg-white
                shadow-[0_5px_16px_rgba(38,24,20,0.06)]
                transition
                duration-200
                hover:-translate-y-1
                hover:shadow-[0_12px_28px_rgba(38,24,20,0.11)]
              "
            >
              <div
                className="
                  relative grid
                  aspect-[16/9]
                  place-items-center
                  overflow-hidden
                  bg-[#F8DDD5]
                "
              >
                {imageUrl ? (
                  // Provider media has already been restricted
                  // to validated public FEASTA Cloudinary URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="
                      size-full object-cover
                      transition-transform
                      duration-500
                      group-hover:scale-105
                      motion-reduce:transform-none
                    "
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <Box
                    aria-hidden="true"
                    className="
                      size-12
                      text-[#B02F00]
                    "
                  />
                )}

                <div
                  aria-hidden="true"
                  className="
                    absolute inset-0
                    bg-gradient-to-t
                    from-black/30
                    via-transparent
                    to-transparent
                  "
                />

                <span
                  className="
                    absolute left-3 top-3
                    inline-flex items-center gap-1.5
                    rounded-full
                    border border-white/70
                    bg-white/95
                    px-2.5 py-1
                    text-xs font-bold
                    text-[#B02F00]
                    shadow-sm
                    backdrop-blur
                  "
                >
                  <Store
                    aria-hidden="true"
                    className="size-3.5"
                  />

                  Published package
                </span>
              </div>

              <div className="grid gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <h3
                    className="
                      line-clamp-2
                      text-lg font-black
                      leading-tight
                      text-[#261814]
                    "
                  >
                    {packageRecord.name}
                  </h3>

                  <p
                    className="
                      mt-1 truncate
                      text-sm text-[#695C56]
                    "
                  >
                    By{" "}
                    <span className="font-semibold text-[#261814]">
                      {packageRecord.providerName}
                    </span>
                  </p>
                </div>

                {packageRecord.description ? (
                  <p
                    className="
                      line-clamp-3
                      break-words
                      text-sm leading-6
                      text-[#695C56]
                    "
                  >
                    {packageRecord.description}
                  </p>
                ) : null}

                <div
                  className="
                    flex min-w-0
                    flex-wrap items-end
                    justify-between gap-3
                    border-t border-[#E2BFB5]/60
                    pt-4
                  "
                >
                  {packageRecord.eventType ? (
                    <p
                      className="
                        flex min-w-0
                        items-center gap-2
                        text-sm text-[#695C56]
                      "
                    >
                      <CalendarDays
                        aria-hidden="true"
                        className="
                          size-4 shrink-0
                          text-[#B02F00]
                        "
                      />

                      <span className="truncate">
                        {humanizeProviderValue(
                          packageRecord.eventType,
                        )}{" "}
                        events
                      </span>
                    </p>
                  ) : (
                    <span />
                  )}

                  <div className="text-right">
                    <p
                      className="
                        text-xs font-semibold
                        text-[#695C56]
                      "
                    >
                      Package price
                    </p>

                    <div
                      className="
                        mt-0.5
                        font-black
                        text-[#B02F00]
                      "
                    >
                      <PriceDisplay
                        amount={packageRecord.price}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Link
        href="/customer/providers"
        className="
          inline-flex min-h-11
          items-center justify-center gap-2
          rounded-xl
          border border-[#E2BFB5]
          bg-white
          px-4
          text-sm font-bold
          text-[#B02F00]
          sm:hidden
        "
      >
        Browse event services

        <ArrowRight
          aria-hidden="true"
          className="size-4"
        />
      </Link>
    </section>
  );
}