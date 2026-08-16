import {
  ArrowUpRight,
  CalendarClock,
  MapPin,
  Store,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import {ProviderFavoriteControl} from "@/components/customer/favorites/provider-favorite-control";
import {Badge} from "@/components/ui/badge";
import {
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";
import {cn} from "@/lib/utils";

export function ProviderCard({
  provider,
  marketplaceHref,
  favoriteState,
}: {
  provider: PublicProvider;
  marketplaceHref?: string;
  favoriteState?: {
    authenticated: boolean;
    favorited: boolean;
  };
}) {
  const imageUrl = provider.coverImageUrl ?? provider.logoUrl;
  const isLogoOnly =
    !provider.coverImageUrl && Boolean(provider.logoUrl);

  const category =
    provider.primaryCategory ??
    provider.categories[0] ??
    null;

  const guestRange =
    provider.minimumGuests &&
    provider.maximumGuests &&
    provider.minimumGuests <= provider.maximumGuests
      ? `${provider.minimumGuests.toLocaleString(
          "en-PH",
        )}–${provider.maximumGuests.toLocaleString(
          "en-PH",
        )} guests`
      : provider.maximumGuests
        ? `Up to ${provider.maximumGuests.toLocaleString(
            "en-PH",
          )} guests`
        : provider.minimumGuests
          ? `From ${provider.minimumGuests.toLocaleString(
              "en-PH",
            )} guests`
          : null;

  const hasLeadTime =
    provider.bookingLeadTimeDays !== null;

  const profileHref = providerProfileHref(
    provider.id,
    marketplaceHref,
  );

  return (
    <article
      aria-label={`${provider.businessName}, approved event service provider`}
      className={[
        "group relative flex h-full min-w-0 flex-col overflow-hidden",
        "rounded-[22px] border border-feasta-border-soft bg-white",
        "shadow-[0_4px_18px_rgb(43_33_29/0.035)]",
        "transition-[transform,border-color,box-shadow]",
        "duration-normal",
        "hover:-translate-y-1 hover:border-primary/20",
        "hover:shadow-[0_16px_36px_rgb(43_33_29/0.085)]",
        "motion-reduce:transform-none",
      ].join(" ")}
    >
      {/* ================================================================
          PROVIDER MEDIA
         ================================================================ */}

      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-feasta-surface-muted">
        {imageUrl ? (
          // Media URLs are restricted to verified FEASTA Cloudinary public IDs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${provider.businessName} ${
              isLogoOnly ? "logo" : "cover image"
            }`}
            loading="lazy"
            decoding="async"
            className={cn(
              "size-full transition-transform duration-slow motion-reduce:transform-none",
              isLogoOnly
                ? "bg-feasta-canvas object-contain p-9"
                : "object-cover group-hover:scale-[1.035]",
            )}
          />
        ) : (
          <div className="grid justify-items-center gap-2 text-feasta-text-tertiary">
            <span className="grid size-14 place-items-center rounded-2xl bg-white/75 shadow-sm">
              <Store
                aria-hidden="true"
                className="size-6"
              />
            </span>

            <span className="text-xs font-semibold">
              Provider image
            </span>
          </div>
        )}

        {/* Soft readability gradient */}
        {!isLogoOnly && imageUrl ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/12 via-transparent to-transparent"
          />
        ) : null}

        {/* Favorite */}
        {favoriteState ? (
          <ProviderFavoriteControl
            providerId={provider.id}
            providerName={provider.businessName}
            initialFavorited={favoriteState.favorited}
            authenticated={favoriteState.authenticated}
            loginReturnTo={profileHref}
            className="absolute left-3 top-3 z-20 size-10 border border-white/70 bg-white/95 p-0 shadow-sm backdrop-blur"
          />
        ) : null}

        {/* Approval */}
        <Badge
          tone="success"
          className="absolute right-3 top-3 z-10 border border-white/80 bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-success shadow-sm backdrop-blur"
        >
          {provider.approvalLabel}
        </Badge>
      </div>

      {/* ================================================================
          PROVIDER INFORMATION
         ================================================================ */}

      <div className="flex flex-1 flex-col p-5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.11em] text-primary-strong">
                {category
                  ? providerCategoryLabel(category)
                  : providerServiceTypeLabel(
                      provider.serviceType,
                    )}
              </p>

              <h3
                aria-label={provider.businessName}
                className="mt-1.5 break-words text-lg font-extrabold tracking-[-0.025em] text-foreground transition-colors group-hover:text-primary-strong"
              >
                <Link
                  href={profileHref}
                  aria-label={`View ${provider.businessName} public provider profile`}
                  className={[
                    "before:absolute before:inset-0 before:rounded-[22px]",
                    "focus-visible:outline-none",
                    "focus-visible:before:ring-2",
                    "focus-visible:before:ring-primary",
                    "focus-visible:before:ring-offset-3",
                    "focus-visible:before:ring-offset-feasta-canvas",
                  ].join(" ")}
                >
                  {provider.businessName}
                </Link>
              </h3>
            </div>

            <ArrowUpRight
              aria-hidden="true"
              className="mt-1 size-[18px] shrink-0 text-feasta-text-tertiary transition-[color,transform] duration-normal group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </div>

          {provider.location ? (
            <p
              aria-label={`Location: ${provider.location}`}
              className="mt-3 flex min-w-0 items-start gap-2 text-sm text-feasta-text-secondary"
            >
              <MapPin
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />

              <span className="min-w-0 break-words">
                {provider.location}
              </span>
            </p>
          ) : null}
        </div>

        {/* ==============================================================
            PLANNING DETAILS
           ============================================================== */}

        {guestRange || hasLeadTime ? (
          <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,7.5rem),1fr))] gap-3 border-t border-feasta-divider pt-4">
            {guestRange ? (
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary-strong">
                  <UsersRound
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>

                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
                    Capacity
                  </dt>

                  <dd className="mt-0.5 break-words text-xs font-bold leading-5 text-foreground">
                    {guestRange}
                  </dd>
                </div>
              </div>
            ) : null}

            {hasLeadTime ? (
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary-strong">
                  <CalendarClock
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>

                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
                    Lead time
                  </dt>

                  <dd className="mt-0.5 text-xs font-bold leading-5 text-foreground">
                    {provider.bookingLeadTimeDays}{" "}
                    {provider.bookingLeadTimeDays === 1
                      ? "day"
                      : "days"}
                  </dd>
                </div>
              </div>
            ) : null}
          </dl>
        ) : null}

        {/* ==============================================================
            CARD FOOTER
           ============================================================== */}

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between gap-3 border-t border-feasta-divider pt-4">
            <span className="text-xs font-semibold text-feasta-text-tertiary">
              View services and details
            </span>

            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-primary-strong">
              View provider

              <ArrowUpRight
                aria-hidden="true"
                className="size-3.5"
              />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}