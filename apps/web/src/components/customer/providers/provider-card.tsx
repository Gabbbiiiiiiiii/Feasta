import {CalendarClock, MapPin, Store} from "lucide-react";

import {Badge} from "@/components/ui/badge";
import {
  humanizeProviderValue,
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";

export function ProviderCard({provider}: {provider: PublicProvider}) {
  const imageUrl = provider.coverImageUrl ?? provider.logoUrl;
  const imageKind = provider.coverImageUrl ? "cover image" : "logo";
  const category = provider.primaryCategory ?? provider.categories[0] ?? null;
  const guestRange = provider.minimumGuests && provider.maximumGuests
    ? `${provider.minimumGuests.toLocaleString("en-PH")}–${provider.maximumGuests.toLocaleString("en-PH")} guests`
    : provider.maximumGuests
      ? `Up to ${provider.maximumGuests.toLocaleString("en-PH")} guests`
      : provider.minimumGuests
        ? `From ${provider.minimumGuests.toLocaleString("en-PH")} guests`
        : null;

  return (
    <article className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card">
      <div className="grid aspect-[16/8] place-items-center overflow-hidden bg-secondary">
        {imageUrl ? (
          // Media URLs are restricted to verified FEASTA Cloudinary public IDs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${provider.businessName} ${imageKind}`}
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Store aria-hidden="true" className="size-12 text-muted-foreground" />
        )}
      </div>
      <div className="grid gap-4 p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-xl font-black">{provider.businessName}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {category
                ? providerCategoryLabel(category)
                : providerServiceTypeLabel(provider.serviceType)}
            </p>
          </div>
          <Badge tone="success">{provider.approvalLabel}</Badge>
        </div>
        {provider.description ? (
          <p className="line-clamp-3 break-words text-sm text-muted-foreground">
            {provider.description}
          </p>
        ) : null}
        <dl className="grid gap-2 text-sm">
          {provider.location ? (
            <div className="flex min-w-0 items-start gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-strong" />
              <dt className="sr-only">Location</dt>
              <dd className="break-words">{provider.location}</dd>
            </div>
          ) : null}
          {provider.bookingLeadTimeDays !== null ? (
            <div className="flex min-w-0 items-start gap-2">
              <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-strong" />
              <dt className="sr-only">Booking lead time</dt>
              <dd>{provider.bookingLeadTimeDays} day booking lead time</dd>
            </div>
          ) : null}
          {guestRange ? (
            <div className="flex min-w-0 items-start gap-2">
              <Store aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-strong" />
              <dt className="sr-only">Event capacity</dt>
              <dd>{guestRange}</dd>
            </div>
          ) : null}
        </dl>
        {provider.operatingDays.length > 0 ? (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Operating days: {provider.operatingDays.map(humanizeProviderValue).join(", ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}
