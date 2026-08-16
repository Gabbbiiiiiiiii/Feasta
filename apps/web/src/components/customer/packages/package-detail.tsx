import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  Store,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type {ReactNode} from "react";

import {PriceDisplay} from "@/components/shared/price-display";
import type {
  PublicPackageDetail,
} from "@/lib/customer/discovery/marketplace-types";
import {
  humanizeProviderValue,
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import {
  PUBLIC_PACKAGE_MARKETPLACE_PATH,
} from "@/lib/customer/providers/provider-route-policy";

export function PackageDetail({
  detail,
}: {
  detail: PublicPackageDetail;
}) {
  const {
    packageRecord,
    provider,
  } = detail;

  const guestRange =
    packageGuestRange(packageRecord);

  const bookingHref =
    `/customer/packages/${encodeURIComponent(
      packageRecord.id,
    )}/book`;

  return (
    <article className="grid min-w-0 gap-5 sm:gap-6">
      {/* ================================================================
          BACK NAVIGATION
         ================================================================ */}

      <Link
        href={PUBLIC_PACKAGE_MARKETPLACE_PATH}
        className={[
          "group inline-flex min-h-11 w-fit items-center gap-2",
          "rounded-full px-1",
          "text-sm font-bold text-primary-strong",
          "transition-colors",
          "hover:text-primary",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary focus-visible:ring-offset-2",
        ].join(" ")}
      >
        <ArrowLeft
          aria-hidden="true"
          className="size-4 transition-transform duration-normal group-hover:-translate-x-0.5 motion-reduce:transform-none"
        />

        Back to packages
      </Link>

      {/* ================================================================
          PACKAGE HERO
         ================================================================ */}

      <section className="overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white shadow-[0_14px_42px_rgb(43_33_29/0.065)]">
        <div className="relative grid aspect-[16/7] min-h-[240px] place-items-center overflow-hidden bg-feasta-surface-muted">
          {packageRecord.imageUrl ? (
            // Public package image URLs are normalized before reaching this component.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={packageRecord.imageUrl}
              alt={`${packageRecord.name} package from ${packageRecord.providerName}`}
              className="size-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          ) : (
            <div className="grid justify-items-center gap-3 text-feasta-text-tertiary">
              <span className="grid size-16 place-items-center rounded-[18px] bg-white/80 shadow-sm">
                <PackageOpen
                  aria-hidden="true"
                  className="size-7"
                />
              </span>

              <span className="text-sm font-semibold">
                Package image
              </span>
            </div>
          )}

          {packageRecord.imageUrl ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
            />
          ) : null}

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              {packageRecord.eventType ? (
                <span className="rounded-full border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-extrabold text-primary-strong shadow-sm backdrop-blur">
                  {humanizeProviderValue(
                    packageRecord.eventType,
                  )}
                </span>
              ) : null}

              <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
                Published package
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:p-8">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Event package
            </p>

            <h1 className="mt-2 break-words text-3xl font-extrabold tracking-[-0.045em] text-foreground sm:text-4xl lg:text-[48px] lg:leading-[1.03]">
              {packageRecord.name}
            </h1>

            <p className="mt-3 text-sm text-feasta-text-secondary sm:text-base">
              By{" "}
              <Link
                href={providerProfileHref(
                  provider.id,
                  PUBLIC_PACKAGE_MARKETPLACE_PATH,
                )}
                className="font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {provider.businessName}
              </Link>
            </p>

            {provider.location ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-feasta-text-secondary">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />

                <span className="break-words">
                  {provider.location}
                </span>
              </p>
            ) : null}

            {packageRecord.description ? (
              <p className="mt-5 max-w-3xl whitespace-pre-line break-words text-sm leading-7 text-feasta-text-secondary sm:text-base">
                {packageRecord.description}
              </p>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-feasta-border-strong bg-feasta-canvas p-4 text-sm leading-6 text-feasta-text-secondary">
                This package does not currently have a public description.
              </p>
            )}
          </div>

          <aside className="rounded-[20px] border border-feasta-border-soft bg-feasta-canvas p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">
              Package price
            </p>

            <PriceDisplay
              amount={packageRecord.price}
              className="mt-2"
            />

            <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">
              Review the package details and provider information before
              deciding whether this option fits your event.
            </p>

            <Link
              href={bookingHref}
              className={[
                "group mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2",
                "rounded-full bg-primary px-5",
                "text-sm font-bold text-white",
                "shadow-[0_8px_20px_rgb(255_99_51/0.18)]",
                "transition-[transform,background-color,box-shadow]",
                "hover:-translate-y-0.5 hover:bg-primary-hover",
                "hover:shadow-[0_10px_24px_rgb(255_99_51/0.22)]",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "motion-reduce:transform-none",
              ].join(" ")}
            >
              Customize & request

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </Link>
          </aside>
        </div>
      </section>

      {/* ================================================================
          EVENT FIT
         ================================================================ */}

      <section
        aria-labelledby="package-event-fit"
        className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(43_33_29/0.035)] sm:p-6 lg:p-7"
      >
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Event fit
        </p>

        <h2
          id="package-event-fit"
          className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
        >
          See whether this package matches your celebration.
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {packageRecord.eventType ? (
            <DetailFact
              icon={
                <CalendarDays
                  aria-hidden="true"
                />
              }
              label="Event type"
              value={humanizeProviderValue(
                packageRecord.eventType,
              )}
              description="The event category this package is published for."
            />
          ) : null}

          {guestRange ? (
            <DetailFact
              icon={
                <UsersRound
                  aria-hidden="true"
                />
              }
              label="Guest capacity"
              value={guestRange}
              description="The published guest range for this package."
            />
          ) : null}
        </div>
      </section>

      {/* ================================================================
          INCLUSIONS
         ================================================================ */}

      <section
        aria-labelledby="package-inclusions"
        className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(43_33_29/0.035)] sm:p-6 lg:p-7"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Package inclusions
          </p>

          <h2
            id="package-inclusions"
            className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
          >
            What comes with this package.
          </h2>

          <p className="mt-3 text-sm leading-6 text-feasta-text-secondary sm:text-base sm:leading-7">
            Review the public inclusions published for this package before
            comparing it with other FEASTA options.
          </p>
        </div>

        {packageRecord.inclusions.length > 0 ? (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {packageRecord.inclusions.map((inclusion) => (
              <li
                key={inclusion}
                className="flex min-w-0 items-start gap-3 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas px-4 py-4"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary-strong">
                  <Check
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>

                <span className="min-w-0 break-words text-sm font-semibold leading-6 text-feasta-text-secondary">
                  {inclusion}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-[18px] border border-dashed border-feasta-border-strong bg-feasta-canvas p-5">
            <p className="text-sm leading-6 text-feasta-text-secondary">
              No public package inclusions are currently listed.
            </p>
          </div>
        )}
      </section>

      {/* ================================================================
          PROVIDER CONTEXT
         ================================================================ */}

      <section
        aria-labelledby="package-provider"
        className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(43_33_29/0.035)] sm:p-6 lg:p-7"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                <Store
                  aria-hidden="true"
                  className="size-5"
                />
              </span>

              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                  Package provider
                </p>

                <h2
                  id="package-provider"
                  className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
                >
                  {provider.businessName}
                </h2>

                <p className="mt-2 text-sm font-semibold text-feasta-text-secondary">
                  {providerServiceTypeLabel(
                    provider.serviceType,
                  )}
                </p>
              </div>
            </div>

            {provider.categories.length > 0 ? (
              <ul className="mt-5 flex flex-wrap gap-2">
                {provider.categories.map((category) => (
                  <li key={category}>
                    <span className="inline-flex rounded-full border border-primary/10 bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong">
                      {providerCategoryLabel(category)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {provider.location ? (
              <p className="mt-4 flex items-start gap-2 text-sm text-feasta-text-secondary">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />

                <span>
                  {provider.location}
                </span>
              </p>
            ) : null}
          </div>

          <Link
            href={providerProfileHref(
              provider.id,
              PUBLIC_PACKAGE_MARKETPLACE_PATH,
            )}
            className={[
              "group inline-flex min-h-12 items-center justify-center gap-2",
              "rounded-full border border-feasta-border-strong bg-white px-5",
              "text-sm font-bold text-foreground",
              "transition-[transform,border-color,background-color,color]",
              "hover:-translate-y-0.5 hover:border-primary/25",
              "hover:bg-secondary hover:text-primary-strong",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary focus-visible:ring-offset-2",
              "motion-reduce:transform-none",
            ].join(" ")}
          >
            View provider

            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
            />
          </Link>
        </div>
      </section>

      {/* ================================================================
          TRUST / PUBLIC STATUS
         ================================================================ */}

      <section className="grid gap-4 rounded-[24px] border border-feasta-border-soft bg-feasta-canvas p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:p-6">
        <span className="grid size-11 place-items-center rounded-[14px] bg-white text-primary-strong shadow-sm">
          <ShieldCheck
            aria-hidden="true"
            className="size-5"
          />
        </span>

        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary-strong">
            Public marketplace listing
          </p>

          <h2 className="mt-1.5 text-xl font-extrabold tracking-[-0.025em] text-foreground">
            Published through FEASTA&apos;s public package marketplace.
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-feasta-text-secondary">
            This package is being shown through FEASTA&apos;s public
            discovery experience together with its associated provider
            information.
          </p>
        </div>
      </section>

      {/* ================================================================
          BOOKING CTA
        ================================================================ */}

      <section
        aria-labelledby="package-next-step"
        className="relative overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white shadow-[0_10px_34px_rgb(43_33_29/0.055)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-36 size-80 rounded-full bg-primary/[0.07] blur-3xl"
        />

        <div className="relative grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:p-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                <Sparkles
                  aria-hidden="true"
                  className="size-5"
                />
              </span>

              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                Plan your event
              </p>
            </div>

            <h2
              id="package-next-step"
              className="mt-5 text-2xl font-extrabold tracking-[-0.04em] text-foreground sm:text-3xl"
            >
              Ready to build your event around this package?
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-feasta-text-secondary sm:text-base">
              Continue to enter your event details,
              customize the package, choose optional
              FEASTA event services, and review your
              complete request before submitting it
              to the selected providers.
            </p>

            <div className="mt-5 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas px-4 py-3.5">
              <p className="text-xs leading-5 text-feasta-text-secondary">
                Continuing does not immediately
                confirm your booking or charge you.
                Your request is submitted to the
                selected providers for review first.
                Payment becomes available only when
                the applicable provider requests
                reach the required acceptance stage.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col">
            <Link
              href={bookingHref}
              className={[
                "group inline-flex min-h-12 items-center justify-center gap-2",
                "rounded-full bg-primary px-5",
                "text-sm font-bold text-white",
                "shadow-[0_8px_20px_rgb(255_99_51/0.18)]",
                "transition-[transform,background-color,box-shadow]",
                "hover:-translate-y-0.5 hover:bg-primary-hover",
                "hover:shadow-[0_10px_24px_rgb(255_99_51/0.22)]",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "motion-reduce:transform-none",
              ].join(" ")}
            >
              Customize & request

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </Link>

            <Link
              href={PUBLIC_PACKAGE_MARKETPLACE_PATH}
              className={[
                "inline-flex min-h-12 items-center justify-center",
                "rounded-full border border-feasta-border-strong bg-white px-5",
                "text-sm font-bold text-foreground",
                "transition-[transform,border-color,background-color,color]",
                "hover:-translate-y-0.5 hover:border-primary/25",
                "hover:bg-secondary hover:text-primary-strong",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "motion-reduce:transform-none",
              ].join(" ")}
            >
              Compare packages
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}

function DetailFact({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[18px] border border-feasta-border-soft bg-feasta-canvas p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-strong shadow-sm [&_svg]:size-[18px]">
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-extrabold text-foreground">
          {value}
        </p>

        <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
          {description}
        </p>
      </div>
    </div>
  );
}

function packageGuestRange(
  packageRecord: PublicPackageDetail["packageRecord"],
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