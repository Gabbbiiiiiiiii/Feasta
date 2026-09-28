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
import {providerServiceTypeLabel} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";
import {
  serviceCategoryName,
  type ServiceCategoryOption,
} from "@/lib/service-categories/service-category-types";
import {cn} from "@/lib/utils";

export function ProviderLogoCard({
  provider,
  marketplaceHref,
  favoriteState,
  availability = null,
  availabilityLoading = false,
  serviceCategoryOptions = [],
}: {
  provider: PublicProvider;
  marketplaceHref?: string;
  serviceCategoryOptions?: readonly ServiceCategoryOption[];
  favoriteState?: {
    authenticated: boolean;
    favorited: boolean;
  };
  availability?: CustomerProviderAvailability | null;
  availabilityLoading?: boolean;
}) {
  const profileHref = providerProfileHref(provider.id, marketplaceHref);
  const category = provider.primaryCategory ?? provider.categories[0] ?? null;
  const imageUrl = provider.logoUrl ?? provider.coverImageUrl;
  const usingLogo = Boolean(provider.logoUrl);
  const categoryLabel = category
    ? serviceCategoryName(category, serviceCategoryOptions)
    : providerServiceTypeLabel(provider.serviceType);
  const guestRange =
    provider.minimumGuests &&
    provider.maximumGuests &&
    provider.minimumGuests <= provider.maximumGuests
      ? `${provider.minimumGuests.toLocaleString("en-PH")}–${provider.maximumGuests.toLocaleString("en-PH")} guests`
      : provider.maximumGuests
        ? `Up to ${provider.maximumGuests.toLocaleString("en-PH")} guests`
        : provider.minimumGuests
          ? `From ${provider.minimumGuests.toLocaleString("en-PH")} guests`
          : null;
  const hasLeadTime = provider.bookingLeadTimeDays !== null;

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
          className="absolute left-2.5 top-2.5 z-30 size-10 border border-white/80 bg-white/95 p-0 shadow-sm backdrop-blur"
        />
      ) : null}

      <Link
        href={profileHref}
        aria-label={`View ${provider.businessName} public provider profile`}
        className={[
          "relative flex h-full min-w-0 flex-col rounded-[22px]",
          "border border-feasta-border-soft bg-white",
          "shadow-[0_4px_18px_rgb(43_33_29/0.035)] outline-none",
          "transition-[transform,border-color,box-shadow] duration-normal",
          "hover:-translate-y-1 hover:border-primary/25",
          "hover:shadow-[0_16px_38px_rgb(43_33_29/0.10)]",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          "motion-reduce:transform-none",
        ].join(" ")}
      >
        <div className="relative grid aspect-square w-full shrink-0 place-items-center overflow-hidden rounded-t-[21px] bg-feasta-canvas">
          {imageUrl ? (
            // Verified public FEASTA media URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`${provider.businessName} ${usingLogo ? "logo" : "cover image"}`}
              loading="lazy"
              decoding="async"
              className={cn(
                "absolute inset-0 size-full transition-transform duration-slow motion-reduce:transform-none",
                usingLogo
                  ? "object-contain p-6 sm:p-7"
                  : "object-cover group-hover:scale-[1.035]",
              )}
            />
          ) : (
            <div className="grid justify-items-center gap-2 px-4 text-center text-feasta-text-tertiary">
              <span className="grid size-16 place-items-center rounded-[20px] bg-white shadow-sm">
                <Store aria-hidden="true" className="size-8" />
              </span>
              <span className="line-clamp-2 break-words text-xs font-bold">
                {provider.businessName}
              </span>
            </div>
          )}

          <Badge
            tone="success"
            className="absolute right-2.5 top-2.5 z-20 border border-white/80 bg-white/95 px-2 py-1 text-[10px] font-extrabold text-success shadow-sm backdrop-blur"
          >
            {provider.approvalLabel}
          </Badge>
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-3.5 text-center">
          {availabilityLoading ? (
            <div
              className="mb-3 flex items-start gap-2 rounded-xl border border-feasta-border-soft bg-feasta-canvas px-3 py-2.5 text-left text-xs font-bold text-feasta-text-secondary"
              role="status"
            >
              <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
              Checking availability…
            </div>
          ) : availability ? (
            <div
              className={cn(
                "mb-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold",
                availability.available
                  ? "border-success/20 bg-success/5 text-success"
                  : "border-warning/25 bg-warning/5 text-foreground",
              )}
              aria-label={availability.available ? "Available" : "Unavailable"}
            >
              {availability.available ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <span>
                <span className="block uppercase tracking-[0.08em]">
                  {availability.available ? "Available" : "Unavailable"}
                </span>
                <span className="mt-0.5 block font-semibold leading-5">{availability.message}</span>
              </span>
            </div>
          ) : null}

          <p className="line-clamp-2 break-words text-[10px] font-extrabold uppercase tracking-[0.11em] text-primary-strong">
            {categoryLabel}
          </p>

          <h3 className="mt-1.5 line-clamp-2 min-h-10 break-words text-sm font-extrabold leading-5 tracking-[-0.02em] text-foreground transition-colors group-hover:text-primary-strong">
            {provider.businessName}
          </h3>

          {provider.location ? (
            <p className="mt-1.5 flex items-center justify-center gap-1 text-xs text-feasta-text-secondary">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
              <span className="line-clamp-2 min-w-0 break-words">{provider.location}</span>
            </p>
          ) : null}

          {guestRange || hasLeadTime ? (
            <dl className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {guestRange ? (
                <div className="flex min-w-0 items-start gap-2 text-left">
                  <UsersRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-strong" />
                  <div className="min-w-0">
                    <dt className="sr-only">Capacity</dt>
                    <dd className="break-words text-xs font-bold leading-5 text-foreground">{guestRange}</dd>
                  </div>
                </div>
              ) : null}
              {hasLeadTime ? (
                <div className="flex min-w-0 items-start gap-2 text-left">
                  <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-strong" />
                  <div className="min-w-0">
                    <dt className="sr-only">Lead time</dt>
                    <dd className="text-xs font-bold leading-5 text-foreground">
                      {provider.bookingLeadTimeDays}{" "}
                      {provider.bookingLeadTimeDays === 1 ? "day" : "days"}
                    </dd>
                  </div>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-feasta-divider pt-3">
            {availability?.available === false ? (
              <span className="min-w-0 text-left text-xs font-semibold text-feasta-text-tertiary">
                Browsing only for this event
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-primary-strong">
              View provider
              <ArrowUpRight aria-hidden="true" className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </span>
          </div>
        </div>
      </Link>

      {provider.description ? (
        <div
          className={[
            "pointer-events-none absolute left-1/2 top-[calc(100%-0.35rem)] z-50 hidden",
            "w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 translate-y-2",
            "rounded-[20px] border border-feasta-border-soft bg-white p-4 text-left",
            "opacity-0 invisible shadow-[0_20px_55px_rgb(43_33_29/0.16)]",
            "transition-[opacity,transform,visibility] duration-normal",
            "md:block md:group-hover:visible md:group-hover:translate-y-0 md:group-hover:opacity-100",
            "md:group-focus-within:visible md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100",
            "motion-reduce:transform-none",
          ].join(" ")}
          aria-hidden="true"
        >
          <p className="line-clamp-3 break-words text-sm leading-6 text-feasta-text-secondary">
            {provider.description}
          </p>
        </div>
      ) : null}
    </article>
  );
}
