import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Store,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import {ProviderFavoriteControl} from "@/components/customer/favorites/provider-favorite-control";
import {Badge} from "@/components/ui/badge";
import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";
import {
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";
import {
  serviceCategoryName,
  type ServiceCategoryOption,
} from "@/lib/service-categories/service-category-types";
import {cn} from "@/lib/utils";

type ProviderLogoCardProps = {
  provider: PublicProvider;
  marketplaceHref?: string;
  serviceCategoryOptions?: readonly ServiceCategoryOption[];
  favoriteState?: {
    authenticated: boolean;
    favorited: boolean;
  };
  availability?: CustomerProviderAvailability | null;
  availabilityLoading?: boolean;
};

export function ProviderLogoCard({
  provider,
  marketplaceHref,
  favoriteState,
  availability = null,
  availabilityLoading = false,
  serviceCategoryOptions = [],
}: ProviderLogoCardProps) {
  const profileHref = providerProfileHref(
    provider.id,
    marketplaceHref,
  );

  const category =
    provider.primaryCategory ??
    provider.categories[0] ??
    null;

  /*
   * The industry discovery experience intentionally prioritizes
   * the provider logo. The cover image is only a fallback when the
   * provider does not have a verified logo.
   */
  const imageUrl =
    provider.logoUrl ??
    provider.coverImageUrl;

  const usingLogo = Boolean(provider.logoUrl);

  const categoryLabel = category
    ? serviceCategoryName(
        category,
        serviceCategoryOptions,
      )
    : providerServiceTypeLabel(
        provider.serviceType,
      );

  const description =
    provider.description ??
    `${provider.businessName} is an approved FEASTA event service provider.`;

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

  return (
    <article
      aria-label={`${provider.businessName}, approved event service provider`}
      className="group relative h-full min-w-0"
    >
      {favoriteState ? (
        <ProviderFavoriteControl
          providerId={provider.id}
          providerName={provider.businessName}
          initialFavorited={favoriteState.favorited}
          authenticated={favoriteState.authenticated}
          loginReturnTo={profileHref}
          className={[
            "absolute left-2.5 top-2.5 z-30",
            "size-10 border border-white/80",
            "bg-white/95 p-0 shadow-sm backdrop-blur",
          ].join(" ")}
        />
      ) : null}

      <Link
        href={profileHref}
        aria-label={`View ${provider.businessName} public provider profile`}
        className={[
          "relative flex h-full min-w-0 flex-col",
          "rounded-[22px] border border-feasta-border-soft bg-white",
          "shadow-[0_4px_18px_rgb(43_33_29/0.035)]",
          "outline-none",
          "transition-[transform,border-color,box-shadow]",
          "duration-normal",
          "hover:-translate-y-1",
          "hover:border-primary/25",
          "hover:shadow-[0_16px_38px_rgb(43_33_29/0.10)]",
          "focus-visible:ring-2",
          "focus-visible:ring-primary",
          "focus-visible:ring-offset-2",
          "motion-reduce:transform-none",
        ].join(" ")}
      >
        {/* ================================================================
            LOGO
           ================================================================ */}

        <div
          className={[
            "relative grid aspect-square w-full shrink-0",
            "place-items-center overflow-hidden",
            "rounded-t-[21px]",
            "bg-feasta-canvas",
          ].join(" ")}
        >
          {imageUrl ? (
            // Verified public FEASTA media URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`${provider.businessName} ${
                usingLogo ? "logo" : "provider image"
              }`}
              loading="lazy"
              decoding="async"
              className={cn(
                "absolute inset-0 size-full",
                "transition-transform duration-slow",
                "motion-reduce:transform-none",
                usingLogo
                  ? "object-contain p-6 sm:p-7"
                  : "object-cover group-hover:scale-[1.035]",
              )}
            />
          ) : (
            <div className="grid justify-items-center gap-2 text-feasta-text-tertiary">
              <span
                className={[
                  "grid size-16 place-items-center",
                  "rounded-[20px] bg-white",
                  "shadow-sm",
                ].join(" ")}
              >
                <Store
                  aria-hidden="true"
                  className="size-8"
                />
              </span>

              <span className="text-xs font-bold">
                {provider.businessName}
              </span>
            </div>
          )}

          <Badge
            tone="success"
            className={[
              "absolute right-2.5 top-2.5 z-20",
              "border border-white/80",
              "bg-white/95 px-2 py-1",
              "text-[10px] font-extrabold text-success",
              "shadow-sm backdrop-blur",
            ].join(" ")}
          >
            Approved
          </Badge>

          <AvailabilityPill
            availability={availability}
            loading={availabilityLoading}
          />
        </div>

        {/* ================================================================
            PROVIDER NAME
           ================================================================ */}

        <div className="flex min-w-0 flex-1 flex-col p-3.5 text-center">
          <p
            className={[
              "line-clamp-1 text-[10px] font-extrabold",
              "uppercase tracking-[0.11em]",
              "text-primary-strong",
            ].join(" ")}
          >
            {categoryLabel}
          </p>

          <h3
            className={[
              "mt-1.5 line-clamp-2 min-h-10",
              "break-words text-sm font-extrabold",
              "leading-5 tracking-[-0.02em]",
              "text-foreground",
              "transition-colors",
              "group-hover:text-primary-strong",
            ].join(" ")}
          >
            {provider.businessName}
          </h3>

          {provider.location ? (
            <p
              className={[
                "mt-1.5 flex items-center justify-center",
                "gap-1 text-xs text-feasta-text-secondary",
              ].join(" ")}
            >
              <MapPin
                aria-hidden="true"
                className="size-3.5 shrink-0 text-primary"
              />

              <span className="line-clamp-1 min-w-0">
                {provider.location}
              </span>
            </p>
          ) : null}

          <span
            className={[
              "mt-3 inline-flex items-center",
              "justify-center gap-1",
              "border-t border-feasta-divider pt-3",
              "text-xs font-extrabold",
              "text-primary-strong",
            ].join(" ")}
          >
            View profile

            <ArrowUpRight
              aria-hidden="true"
              className={[
                "size-3.5",
                "transition-transform",
                "group-hover:-translate-y-0.5",
                "group-hover:translate-x-0.5",
              ].join(" ")}
            />
          </span>
        </div>
      </Link>

      {/* ================================================================
          DESKTOP HOVER / KEYBOARD QUICK SUMMARY

          Mobile keeps the visible logo/name card and opens the full
          provider profile on tap. Desktop receives this richer preview.
         ================================================================ */}

      <div
        className={[
          "pointer-events-none absolute",
          "left-1/2 top-[calc(100%-0.35rem)]",
          "z-50 hidden",
          "w-[min(20rem,calc(100vw-2rem))]",
          "-translate-x-1/2 translate-y-2",
          "rounded-[20px]",
          "border border-feasta-border-soft",
          "bg-white p-4",
          "text-left",
          "opacity-0 invisible",
          "shadow-[0_20px_55px_rgb(43_33_29/0.16)]",
          "transition-[opacity,transform,visibility]",
          "duration-normal",
          "md:block",
          "md:group-hover:visible",
          "md:group-hover:translate-y-0",
          "md:group-hover:opacity-100",
          "md:group-focus-within:visible",
          "md:group-focus-within:translate-y-0",
          "md:group-focus-within:opacity-100",
          "motion-reduce:transform-none",
        ].join(" ")}
        aria-hidden="true"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={[
                "text-[10px] font-extrabold uppercase",
                "tracking-[0.11em] text-primary-strong",
              ].join(" ")}
            >
              {categoryLabel}
            </p>

            <p className="mt-1 break-words text-base font-extrabold text-foreground">
              {provider.businessName}
            </p>
          </div>

          <ArrowUpRight
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-primary"
          />
        </div>

        {provider.location ? (
          <p className="mt-2 flex items-start gap-2 text-xs font-semibold text-feasta-text-secondary">
            <MapPin
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
            />

            <span className="break-words">
              {provider.location}
            </span>
          </p>
        ) : null}

        <p
          className={[
            "mt-3 line-clamp-3",
            "text-sm leading-6",
            "text-feasta-text-secondary",
          ].join(" ")}
        >
          {description}
        </p>

        {guestRange ||
        provider.bookingLeadTimeDays !== null ? (
          <dl
            className={[
              "mt-3 grid gap-2",
              "border-t border-feasta-divider pt-3",
            ].join(" ")}
          >
            {guestRange ? (
              <div className="flex items-start gap-2">
                <UsersRound
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />

                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-feasta-text-tertiary">
                    Capacity
                  </dt>

                  <dd className="text-xs font-bold text-foreground">
                    {guestRange}
                  </dd>
                </div>
              </div>
            ) : null}

            {provider.bookingLeadTimeDays !== null ? (
              <div className="flex items-start gap-2">
                <CalendarClock
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />

                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-feasta-text-tertiary">
                    Booking notice
                  </dt>

                  <dd className="text-xs font-bold text-foreground">
                    {provider.bookingLeadTimeDays === 0
                      ? "Same-day requests accepted"
                      : `${provider.bookingLeadTimeDays} ${
                          provider.bookingLeadTimeDays === 1
                            ? "day"
                            : "days"
                        } in advance`}
                  </dd>
                </div>
              </div>
            ) : null}
          </dl>
        ) : null}

        {availability ? (
          <div
            className={cn(
              "mt-3 rounded-xl border px-3 py-2.5",
              "text-xs font-semibold leading-5",
              availability.available
                ? "border-success/20 bg-success/5 text-success"
                : "border-warning/25 bg-warning/5 text-foreground",
            )}
          >
            {availability.message}
          </div>
        ) : null}

        <p
          className={[
            "mt-3 border-t border-feasta-divider pt-3",
            "text-xs font-extrabold text-primary-strong",
          ].join(" ")}
        >
          Click to view full profile, menus and packages
        </p>
      </div>
    </article>
  );
}

function AvailabilityPill({
  availability,
  loading,
}: {
  availability: CustomerProviderAvailability | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span
        role="status"
        className={[
          "absolute bottom-2.5 left-1/2",
          "inline-flex -translate-x-1/2",
          "items-center gap-1.5 whitespace-nowrap",
          "rounded-full border border-white/80",
          "bg-white/95 px-2.5 py-1",
          "text-[10px] font-extrabold",
          "text-feasta-text-secondary",
          "shadow-sm backdrop-blur",
        ].join(" ")}
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-3 animate-spin motion-reduce:animate-none"
        />

        Checking
      </span>
    );
  }

  if (!availability) {
    return null;
  }

  return (
    <span
      className={cn(
        "absolute bottom-2.5 left-1/2",
        "inline-flex -translate-x-1/2",
        "items-center gap-1.5 whitespace-nowrap",
        "rounded-full border px-2.5 py-1",
        "text-[10px] font-extrabold",
        "shadow-sm backdrop-blur",
        availability.available
          ? "border-success/20 bg-white/95 text-success"
          : "border-warning/25 bg-white/95 text-foreground",
      )}
    >
      {availability.available ? (
        <CheckCircle2
          aria-hidden="true"
          className="size-3"
        />
      ) : (
        <TriangleAlert
          aria-hidden="true"
          className="size-3 text-warning"
        />
      )}

      {availability.available
        ? "Available"
        : "Unavailable"}
    </span>
  );
}