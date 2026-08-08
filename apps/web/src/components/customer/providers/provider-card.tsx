import {CalendarClock, MapPin, Store, UsersRound} from "lucide-react";

import {Badge} from "@/components/ui/badge";
import {
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";
import {cn} from "@/lib/utils";

export function ProviderCard({provider}: {provider: PublicProvider}) {
  const imageUrl = provider.coverImageUrl ?? provider.logoUrl;
  const category = provider.primaryCategory ?? provider.categories[0] ?? null;
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
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[#E2BFB5]/80 bg-white shadow-[0_4px_12px_rgba(38,24,20,0.04)] transition duration-fast hover:-translate-y-1 hover:border-[#D79C89] hover:shadow-[0_9px_24px_rgba(38,24,20,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4471C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF9F4] motion-reduce:transform-none"
      tabIndex={0}
      aria-label={`${provider.businessName}, approved event service provider`}
    >
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-[#F8DDD5]">
        {imageUrl ? (
          // Media URLs are restricted to verified FEASTA Cloudinary public IDs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${provider.businessName} public provider media`}
            className="size-full object-cover transition duration-slow group-hover:scale-105 motion-reduce:transform-none"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Store aria-hidden="true" className="size-11 text-[#8E7068]" />
        )}
        <Badge
          tone="success"
          className="absolute right-3 top-3 border border-white/80 bg-white/95 text-[#923313] shadow-sm"
        >
          {provider.approvalLabel}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3
            className="
              line-clamp-2 break-words
              text-base font-black
              text-[#261814]
              transition-colors
              group-hover:text-[#B02F00]
            "
          >
            {provider.businessName}
          </h3>

          <p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#3D2A24]">
            {category
              ? providerCategoryLabel(category)
              : providerServiceTypeLabel(provider.serviceType)}
          </p>

          {provider.location ? (
            <p
              aria-label={`Location: ${provider.location}`}
              className="
                mt-1 flex items-start gap-1.5
                text-sm text-[#695C56]
              "
            >
              <MapPin
                aria-hidden="true"
                className="
                  mt-0.5 size-4 shrink-0
                  text-[#B02F00]
                "
              />

              <span>{provider.location}</span>
            </p>
          ) : null}
        </div>

        {guestRange || hasLeadTime ? (
          <dl className={cn(
            "mt-auto grid grid-cols-1 gap-2 rounded-lg bg-[#FFF1ED] p-3 text-xs",
            guestRange && hasLeadTime && "grid-cols-2",
          )}>
            {guestRange ? (
              <div className="flex min-w-0 items-start gap-2">
                <UsersRound
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[#B02F00]"
                />

                <div className="min-w-0">
                  <dt className="text-[#695C56]">
                    Capacity
                  </dt>

                  <dd
                    className="
                      mt-0.5
                      break-words
                      font-bold text-[#261814]
                    "
                  >
                    {guestRange}
                  </dd>
                </div>
              </div>
            ) : null}

            {hasLeadTime ? (
              <div className={cn(
                "flex min-w-0 items-start gap-2",
                guestRange && "border-l border-[#E2BFB5]/60 pl-3",
              )}>
                <CalendarClock
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[#B02F00]"
                />

                <div className="min-w-0">
                  <dt className="text-[#695C56]">
                    Lead time
                  </dt>

                  <dd
                    className="
                      mt-0.5
                      font-bold text-[#261814]
                    "
                  >
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
      </div>
    </article>
  );
}
