import {
  ArrowUpRight,
  CalendarDays,
  Check,
  PackageOpen,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import {PriceDisplay} from "@/components/shared/price-display";
import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";
import {humanizeProviderValue} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import {
  customerEventContextFromHref,
  customerEventContextQuery,
} from "@/lib/customer/planning/event-planning-context";

export function PublicPackageCard({
  packageRecord,
  marketplaceHref,
  headingLevel = "h2",
  showProvider = true,
  compactPreview = false,
}: {
  packageRecord: PublicPackage;
  marketplaceHref: string;
  headingLevel?: "h2" | "h3";
  showProvider?: boolean;
  compactPreview?: boolean;
}) {
  const eventContextQuery = customerEventContextQuery(
    // Preserve supplied context across hydration; destination queries validate dates.
    customerEventContextFromHref(marketplaceHref, ""),
  );
  const packagePath = `/customer/packages/${encodeURIComponent(packageRecord.id)}`;
  const packageHref = eventContextQuery
    ? `${packagePath}?${eventContextQuery}`
    : packagePath;
  const Heading = headingLevel;
  const guestRange = packageGuestRange(packageRecord);
  const inclusionLimit = compactPreview ? 2 : 3;

  return (
    <article
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
      {/* Package image */}

      <div className={`relative grid ${compactPreview ? "aspect-[2/1]" : "aspect-[16/9]"} place-items-center overflow-hidden bg-feasta-surface-muted`}>
        {packageRecord.imageUrl ? (
          // Package image URLs are HTTPS-only values from the public package boundary.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={packageRecord.imageUrl}
            alt={`${packageRecord.name} package from ${packageRecord.providerName}`}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-slow group-hover:scale-[1.035] motion-reduce:transform-none"
          />
        ) : (
          <div className="grid justify-items-center gap-2 text-feasta-text-tertiary">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/75 shadow-sm">
              <PackageOpen
                aria-hidden="true"
                className="size-6"
              />
            </span>

            <span className="text-xs font-semibold">
              Package image
            </span>
          </div>
        )}

        {packageRecord.imageUrl ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent"
          />
        ) : null}

        {packageRecord.eventType ? (
          <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/95 px-3 py-1.5 text-[11px] font-extrabold text-primary-strong shadow-sm backdrop-blur">
            {humanizeProviderValue(packageRecord.eventType)}
          </span>
        ) : null}
      </div>

      {/* Package content */}

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <Heading aria-label={packageRecord.name} className="min-w-0 break-words text-lg font-extrabold leading-tight tracking-[-0.025em] text-foreground transition-colors group-hover:text-primary-strong">
              <Link
                href={packageHref}
                aria-label={`View ${packageRecord.name} package details`}
                className={[
                  "before:absolute before:inset-0 before:rounded-[22px]",
                  "focus-visible:outline-none",
                  "focus-visible:before:ring-2",
                  "focus-visible:before:ring-primary",
                  "focus-visible:before:ring-offset-3",
                  "focus-visible:before:ring-offset-feasta-canvas",
                ].join(" ")}
              >
                {packageRecord.name}
              </Link>
            </Heading>

            <ArrowUpRight
              aria-hidden="true"
              className="mt-0.5 size-[18px] shrink-0 text-feasta-text-tertiary transition-[color,transform] duration-normal group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </div>

          {showProvider ? (
            <p className="mt-2 text-sm text-feasta-text-secondary">
              By{" "}
              <Link
                href={providerProfileHref(
                  packageRecord.providerId,
                  marketplaceHref,
                )}
                className="relative z-10 font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {packageRecord.providerName}
              </Link>
            </p>
          ) : null}
        </div>

        {!compactPreview && packageRecord.description ? (
          <p className="mt-3 line-clamp-3 break-words text-sm leading-5 text-feasta-text-secondary">
            {packageRecord.description}
          </p>
        ) : null}

        {/* Planning information */}

        {(!compactPreview && packageRecord.eventType) || guestRange ? (
          <dl className={`mt-3 grid min-w-0 gap-3 border-t border-feasta-divider pt-3 ${compactPreview ? "" : "sm:grid-cols-2"}`}>
            {!compactPreview && packageRecord.eventType ? (
              <div className="flex min-w-0 items-start gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary-strong">
                  <CalendarDays
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>

                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
                    Event
                  </dt>

                  <dd className="mt-0.5 break-words text-xs font-bold leading-5 text-foreground">
                    {humanizeProviderValue(
                      packageRecord.eventType,
                    )}
                  </dd>
                </div>
              </div>
            ) : null}

            {guestRange ? (
              <div className="flex min-w-0 items-start gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary-strong">
                  <UsersRound
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>

                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-feasta-text-tertiary">
                    Guests
                  </dt>

                  <dd className="mt-0.5 break-words text-xs font-bold leading-5 text-foreground">
                    {guestRange}
                  </dd>
                </div>
              </div>
            ) : null}
          </dl>
        ) : null}

        {/* Inclusion highlights */}

        {packageRecord.inclusions.length > 0 ? (
          <div className="mt-3 border-t border-feasta-divider pt-3">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">
              What&apos;s included
            </p>

            <ul className={`mt-2 grid min-w-0 gap-1.5 text-sm ${compactPreview ? "grid-cols-2" : ""}`}>
              {packageRecord.inclusions
                .slice(0, inclusionLimit)
                .map((inclusion) => (
                  <li
                    key={inclusion}
                    className="flex min-w-0 items-start gap-2"
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                      <Check
                        aria-hidden="true"
                        className="size-3"
                      />
                    </span>

                    <span className={`min-w-0 break-words leading-5 text-feasta-text-secondary ${compactPreview ? "line-clamp-2" : ""}`}>
                      {inclusion}
                    </span>
                  </li>
                ))}
            </ul>

            {packageRecord.inclusions.length > inclusionLimit ? (
              <p className="mt-2 pl-7 text-xs font-semibold text-feasta-text-tertiary">
                +{packageRecord.inclusions.length - inclusionLimit} more
                {compactPreview ? <span className="sr-only"> inclusions</span> : packageRecord.inclusions.length - inclusionLimit === 1 ? " inclusion" : " inclusions"}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Price */}

        <div className="mt-auto pt-3">
          <div className="flex items-end justify-between gap-4 border-t border-feasta-divider pt-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                Package price
              </p>

              <PriceDisplay
                amount={packageRecord.price}
                className="mt-1"
              />
            </div>

            <span
              aria-hidden="true"
              className="inline-flex items-center gap-1 text-xs font-extrabold text-primary-strong"
            >
              View package

              <ArrowUpRight
                aria-hidden="true"
                className="size-3.5 transition-transform duration-normal group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function packageGuestRange(
  packageRecord: PublicPackage,
): string | null {
  const {
    minimumGuests,
    maximumGuests,
  } = packageRecord;

  if (
    minimumGuests !== null &&
    maximumGuests !== null
  ) {
    return minimumGuests === maximumGuests
      ? `${minimumGuests.toLocaleString("en-PH")} guests`
      : `${minimumGuests.toLocaleString(
          "en-PH",
        )}–${maximumGuests.toLocaleString(
          "en-PH",
        )} guests`;
  }

  if (maximumGuests !== null) {
    return `Up to ${maximumGuests.toLocaleString(
      "en-PH",
    )} guests`;
  }

  return minimumGuests !== null
    ? `From ${minimumGuests.toLocaleString(
        "en-PH",
      )} guests`
    : null;
}
