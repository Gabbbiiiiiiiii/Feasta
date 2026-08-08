import {
  CakeSlice,
  Camera,
  Car,
  Flower2,
  MapPinned,
  Mic2,
  PartyPopper,
  Store,
  Utensils,
} from "lucide-react";
import Link from "next/link";

import {
  PROVIDER_CATEGORY_OPTIONS,
} from "@/lib/customer/providers/provider-catalog";
import type {
  PublicProvider,
} from "@/lib/customer/providers/provider-types";

const categoryIcons = [
  Utensils,
  CakeSlice,
  PartyPopper,
  Camera,
  Mic2,
  Flower2,
  Car,
  MapPinned,
] as const;

const fallbackTones = [
  "bg-[#F1DED6]",
  "bg-[#FEE2DB]",
  "bg-[#F8DDD5]",
  "bg-[#FFF1ED]",
] as const;

export function ProviderCategoryGrid({
  providers = [],
}: {
  providers?: readonly PublicProvider[];
}) {
  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="marketplace-categories-title"
    >
      <div
        className="
          flex items-end
          justify-between gap-4
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
            Services for every celebration
          </p>

          <h2
            id="marketplace-categories-title"
            className="
              mt-1
              text-2xl font-black
              tracking-[-0.025em]
              text-[#261814]
              sm:text-3xl
            "
          >
            Find everything your event needs
          </h2>

          <p
            className="
              mt-2 max-w-2xl
              text-sm leading-6
              text-[#695C56]
            "
          >
            Browse verified local event professionals by
            service category.
          </p>
        </div>

        <Link
          href="/customer/providers"
          className="
            hidden shrink-0
            items-center gap-1
            text-sm font-bold
            text-[#B02F00]
            transition-colors
            hover:text-[#862200]
            hover:underline
            sm:inline-flex
          "
        >
          View all services
        </Link>
      </div>

      <div
        className="
          flex snap-x snap-mandatory
          gap-3 overflow-x-auto
          pb-3
          [scrollbar-width:thin]
          [scrollbar-color:#E2BFB5_transparent]
          sm:gap-4
        "
      >
        {PROVIDER_CATEGORY_OPTIONS.map(
          (category, index) => {
            const Icon =
              categoryIcons[
                index % categoryIcons.length
              ] ?? Store;

            const matchingProvider =
              providers.find(
                (provider) =>
                  provider.coverImageUrl !== null &&
                  (
                    provider.primaryCategory ===
                      category.value ||
                    provider.categories.includes(
                      category.value,
                    )
                  ),
              ) ??
              providers.find(
                (provider) =>
                  provider.logoUrl !== null &&
                  (
                    provider.primaryCategory ===
                      category.value ||
                    provider.categories.includes(
                      category.value,
                    )
                  ),
              ) ??
              null;

            const imageUrl =
              matchingProvider?.coverImageUrl ??
              matchingProvider?.logoUrl ??
              null;

            const fallbackTone =
              fallbackTones[
                index % fallbackTones.length
              ] ?? "bg-[#F1DED6]";

            return (
              <Link
                key={category.value}
                href={
                  `/customer/providers?category=${
                    encodeURIComponent(
                      category.value,
                    )
                  }`
                }
                className="
                  group relative
                  grid min-h-40
                  min-w-36
                  max-w-36
                  snap-start
                  overflow-hidden
                  rounded-2xl
                  border border-[#E2BFB5]/70
                  bg-white
                  shadow-[0_4px_12px_rgba(38,24,20,0.05)]
                  transition
                  duration-200
                  hover:-translate-y-1
                  hover:border-[#B02F00]/40
                  hover:shadow-[0_10px_24px_rgba(38,24,20,0.10)]
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#B02F00]/40
                  sm:min-w-40
                  sm:max-w-40
                "
              >
                <span
                  className={`
                    relative grid
                    h-24 place-items-center
                    overflow-hidden
                    ${fallbackTone}
                  `}
                >
                  {imageUrl ? (
                    // Public media URLs have already been
                    // validated during marketplace normalization.
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
                    <Icon
                      aria-hidden="true"
                      className="
                        size-9
                        text-[#B02F00]
                      "
                    />
                  )}

                  {imageUrl ? (
                    <span
                      aria-hidden="true"
                      className="
                        absolute inset-0
                        bg-gradient-to-t
                        from-black/20
                        to-transparent
                      "
                    />
                  ) : null}
                </span>

                <span
                  className="
                    flex min-h-16
                    items-center
                    px-3 py-3
                    text-sm font-black
                    leading-tight
                    text-[#261814]
                    transition-colors
                    group-hover:text-[#B02F00]
                  "
                >
                  {category.label}
                </span>
              </Link>
            );
          },
        )}

        <Link
          href="/customer/providers"
          className="
            group grid min-h-40
            min-w-32 snap-start
            place-items-center
            rounded-2xl
            border border-dashed
            border-[#B02F00]/40
            bg-[#FFF1ED]
            px-4 text-center
            shadow-[0_4px_12px_rgba(38,24,20,0.04)]
            transition
            hover:-translate-y-1
            hover:border-[#B02F00]
            hover:bg-[#FEE2DB]
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#B02F00]/40
          "
        >
          <span>
            <span
              aria-hidden="true"
              className="
                mx-auto grid size-10
                place-items-center
                rounded-full
                bg-white
                text-xl font-bold
                text-[#B02F00]
                shadow-sm
              "
            >
              →
            </span>

            <span
              className="
                mt-3 block
                text-sm font-black
                text-[#B02F00]
              "
            >
              View all
            </span>
          </span>
        </Link>
      </div>

      <Link
        href="/customer/providers"
        className="
          inline-flex min-h-11
          items-center justify-center
          rounded-xl
          border border-[#E2BFB5]
          bg-white
          px-4
          text-sm font-bold
          text-[#B02F00]
          sm:hidden
        "
      >
        Browse all event services
      </Link>
    </section>
  );
}