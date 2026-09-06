import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  MapPin,
  Sparkles,
  Store,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type {ReactNode} from "react";

import {PublicPackageCard} from "@/components/customer/packages/public-package-card";
import {ProviderFavoriteControl} from "@/components/customer/favorites/provider-favorite-control";
import {Badge} from "@/components/ui/badge";
import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";
import {
  humanizeProviderValue,
  providerCategoryLabel,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import type {PublicProviderDetail} from "@/lib/customer/providers/provider-detail-types";
import {parseMarketplaceReturnHref} from "@/lib/customer/providers/provider-query";
import {PUBLIC_PACKAGE_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";

export function ProviderProfile({
  detail,
  backHref = "/customer/providers",
  favoriteState,
}: {
  detail: PublicProviderDetail;
  backHref?: string;
  favoriteState?: {
    authenticated: boolean;
    favorited: boolean;
    loginReturnTo: string;
  };
}) {
  const {provider, packages} = detail;
  const safeBackHref = parseMarketplaceReturnHref(backHref);
  const backLabel = safeBackHref.startsWith(PUBLIC_PACKAGE_MARKETPLACE_PATH)
    ? "Back to packages"
    : "Back to providers";
  const capacity = providerCapacity(provider);
  const hasPlanningInformation = Boolean(
    capacity ||
    provider.bookingLeadTimeDays !== null ||
    provider.operatingDays.length > 0,
  );

  return (
    <article className="grid min-w-0 gap-5 sm:gap-6">
      <Link
        href={safeBackHref}
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

        {backLabel}
      </Link>

      <header className="overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white shadow-[0_16px_44px_rgb(43_33_29/0.08)]">
        {/* Cover */}
        <div className="relative h-[clamp(13rem,30vw,22rem)] overflow-hidden bg-feasta-surface-muted">
          {provider.coverImageUrl ? (
            // Provider media is restricted by the canonical public provider normalizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={provider.coverImageUrl}
              alt={`${provider.businessName} cover image`}
              className="size-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          ) : (
            <div
              aria-hidden="true"
              className="feasta-brand-media-placeholder size-full"
            />
          )}

          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-7 sm:pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone="success"
                className="border border-white/70 bg-white/95 text-success shadow-sm backdrop-blur"
              >
                {provider.approvalLabel} provider
              </Badge>

              <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
                {providerServiceTypeLabel(provider.serviceType)}
              </span>
            </div>
          </div>
        </div>

        {/* Identity */}
        <div className="relative px-5 pb-6 sm:px-7 sm:pb-8 lg:px-9 lg:pb-9">
          <div className="-mt-10 flex flex-col gap-5 sm:-mt-12 sm:flex-row sm:items-end">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[22px] border-4 border-white bg-feasta-canvas shadow-[0_10px_28px_rgb(43_33_29/0.16)] sm:size-28">
              {provider.logoUrl ? (
                // Provider media is restricted by the canonical public provider normalizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={provider.logoUrl}
                  alt={`${provider.businessName} logo`}
                  className="size-full object-contain p-2"
                  decoding="async"
                />
              ) : (
                <Store
                  aria-hidden="true"
                  className="size-10 text-feasta-text-tertiary"
                />
              )}
            </div>

            <div className="min-w-0 flex-1 sm:pb-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-strong">
                Provider profile
              </p>

              <h1 className="mt-2 break-words text-3xl font-extrabold leading-[1.02] tracking-[-0.045em] text-foreground sm:text-4xl lg:text-[48px]">
                {provider.businessName}
              </h1>

              {provider.location ? (
                <p className="mt-3 flex min-w-0 items-start gap-2 text-sm text-feasta-text-secondary sm:text-base">
                  <MapPin
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-primary"
                  />

                  <span className="min-w-0 break-words">
                    {provider.location}
                  </span>
                </p>
              ) : null}
            </div>

            {favoriteState ? (
              <div className="sm:pb-1">
                <ProviderFavoriteControl
                  providerId={provider.id}
                  providerName={provider.businessName}
                  initialFavorited={favoriteState.favorited}
                  authenticated={favoriteState.authenticated}
                  loginReturnTo={favoriteState.loginReturnTo}
                  showLabel
                  className="w-fit"
                />
              </div>
            ) : null}
          </div>

          {/* Categories */}
          {provider.categories.length > 0 ? (
            <ul
              className="mt-5 flex min-w-0 flex-wrap gap-2"
              aria-label="Provider service categories"
            >
              {provider.categories.map((category) => (
                <li key={category}>
                  <span className="inline-flex rounded-full border border-primary/10 bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong">
                    {providerCategoryLabel(category)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Description */}
          {provider.description ? (
            <p className="mt-5 max-w-4xl line-clamp-3 break-words text-sm leading-7 text-feasta-text-secondary sm:text-base">
              {provider.description}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-5 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-5 sm:gap-6">
          {/* ================================================================
              PHASE 3B — ABOUT THE PROVIDER
            ================================================================ */}

          <section className="min-w-0 rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(43_33_29/0.035)] sm:p-6 lg:p-7">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                About this provider
              </p>

              <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground">
                Get to know {provider.businessName}.
              </h2>

              {provider.description ? (
                <p className="mt-4 whitespace-pre-line break-words text-sm leading-7 text-feasta-text-secondary sm:text-base sm:leading-8">
                  {provider.description}
                </p>
              ) : (
                <OptionalEmptyState className="mt-4">
                  This provider has not added a public description yet.
                </OptionalEmptyState>
              )}
            </div>
          </section>

          {/* ================================================================
              PHASE 3B — SERVICES + EVENT FIT
            ================================================================ */}

          <section className="min-w-0 rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(43_33_29/0.035)] sm:p-6 lg:p-7">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                Services for your event
              </p>

              <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground">
                What this provider can bring to your celebration.
              </h2>

              <p className="mt-3 text-sm leading-6 text-feasta-text-secondary sm:text-base sm:leading-7">
                Review the public service categories, supported event types, and
                listed service areas before deciding whether this provider fits
                your plans.
              </p>
            </div>

            {/* ==============================================================
                SERVICE CATEGORIES
              ============================================================== */}

            <div className="mt-6 border-t border-feasta-divider pt-6">
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                  <Sparkles
                    aria-hidden="true"
                    className="size-5"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
                    Service categories
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                    The kinds of event services this provider publicly offers.
                  </p>

                  {provider.categories.length > 0 ? (
                    <ul className="mt-4 flex min-w-0 flex-wrap gap-2">
                      {provider.categories.map((category) => (
                        <li key={category}>
                          <span className="inline-flex rounded-full border border-primary/10 bg-secondary px-3.5 py-2 text-sm font-bold text-primary-strong">
                            {providerCategoryLabel(category)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <OptionalEmptyState className="mt-4">
                      No additional public service categories are listed.
                    </OptionalEmptyState>
                  )}
                </div>
              </div>
            </div>

            {/* ==============================================================
                SUPPORTED EVENT TYPES
              ============================================================== */}

            <div className="mt-6 border-t border-feasta-divider pt-6">
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                  <CalendarDays
                    aria-hidden="true"
                    className="size-5"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
                    Supported event types
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                    Celebrations this provider has chosen to support publicly.
                  </p>

                  {provider.eventTypes.length > 0 ? (
                    <ul className="mt-4 flex min-w-0 flex-wrap gap-2">
                      {provider.eventTypes.map((eventType) => (
                        <li key={eventType}>
                          <span className="inline-flex rounded-full border border-feasta-border-soft bg-feasta-canvas px-3.5 py-2 text-sm font-semibold text-feasta-text-secondary">
                            {humanizeProviderValue(eventType)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <OptionalEmptyState className="mt-4">
                      No supported event types have been publicly listed yet.
                    </OptionalEmptyState>
                  )}
                </div>
              </div>
            </div>

            {/* ==============================================================
                SERVICE AREAS
              ============================================================== */}

            <div className="mt-6 border-t border-feasta-divider pt-6">
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                  <MapPin
                    aria-hidden="true"
                    className="size-5"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold tracking-[-0.02em] text-foreground">
                    Listed service areas
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                    Areas this provider has identified as places they serve.
                  </p>

                  {provider.serviceAreas.length > 0 ? (
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {provider.serviceAreas.map((area) => (
                        <li
                          key={area}
                          className="flex min-w-0 items-start gap-2.5 rounded-xl border border-feasta-border-soft bg-feasta-canvas px-3.5 py-3"
                        >
                          <MapPin
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-primary"
                          />

                          <span className="min-w-0 break-words text-sm font-semibold text-feasta-text-secondary">
                            {area}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <OptionalEmptyState className="mt-4">
                      This provider has not publicly listed additional service areas.
                    </OptionalEmptyState>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="min-w-0 md:sticky md:top-24">
          <section
            aria-labelledby="provider-planning-details"
            className="overflow-hidden rounded-[24px] border border-feasta-border-soft bg-white shadow-[0_8px_26px_rgb(43_33_29/0.045)]"
          >
            {/* ================================================================
                PLANNING HEADER
              ================================================================ */}

            <div className="border-b border-feasta-divider p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-secondary text-primary-strong">
                  <CalendarClock
                    aria-hidden="true"
                    className="size-[18px]"
                  />
                </span>

                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-primary-strong">
                    Event readiness
                  </p>

                  <h2
                    id="provider-planning-details"
                    className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-foreground"
                  >
                    Plan with confidence
                  </h2>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-feasta-text-secondary">
                Review the provider&apos;s published planning details before
                considering them for your event.
              </p>
            </div>

            {/* ================================================================
                PLANNING FACTS
              ================================================================ */}

            {hasPlanningInformation ? (
              <dl className="grid min-w-0">
                {capacity ? (
                  <div className="flex min-w-0 items-start gap-3 border-b border-feasta-divider p-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-feasta-canvas text-primary-strong">
                      <UsersRound
                        aria-hidden="true"
                        className="size-[18px]"
                      />
                    </span>

                    <div className="min-w-0">
                      <dt className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                        Guest capacity
                      </dt>

                      <dd className="mt-1 break-words text-sm font-extrabold leading-5 text-foreground">
                        {capacity}
                      </dd>

                      <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                        Published guest range for this provider.
                      </p>
                    </div>
                  </div>
                ) : null}

                {provider.bookingLeadTimeDays !== null ? (
                  <div className="flex min-w-0 items-start gap-3 border-b border-feasta-divider p-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-feasta-canvas text-primary-strong">
                      <CalendarClock
                        aria-hidden="true"
                        className="size-[18px]"
                      />
                    </span>

                    <div className="min-w-0">
                      <dt className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                        Booking lead time
                      </dt>

                      <dd className="mt-1 break-words text-sm font-extrabold leading-5 text-foreground">
                        {provider.bookingLeadTimeDays}{" "}
                        {provider.bookingLeadTimeDays === 1
                          ? "day"
                          : "days"}
                      </dd>

                      <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                        Minimum advance planning time listed by the provider.
                      </p>
                    </div>
                  </div>
                ) : null}

                {provider.operatingDays.length > 0 ? (
                  <div className="min-w-0 p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-feasta-canvas text-primary-strong">
                        <CalendarDays
                          aria-hidden="true"
                          className="size-[18px]"
                        />
                      </span>

                      <div className="min-w-0 flex-1">
                        <dt className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-feasta-text-tertiary">
                          Operating days
                        </dt>

                        <dd className="mt-3">
                          <ul
                            className="flex min-w-0 flex-wrap gap-1.5"
                            aria-label="Provider operating days"
                          >
                            {provider.operatingDays.map((day) => (
                              <li key={day}>
                                <span className="inline-flex rounded-lg border border-feasta-border-soft bg-feasta-canvas px-2.5 py-1.5 text-xs font-bold text-feasta-text-secondary">
                                  {humanizeProviderValue(day)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    </div>
                  </div>
                ) : null}
              </dl>
            ) : (
              <div className="p-5">
                <OptionalEmptyState>
                  This provider has not added public planning information yet.
                </OptionalEmptyState>
              </div>
            )}

            {/* ================================================================
                PLANNING NOTE
              ================================================================ */}

            <div className="border-t border-feasta-divider bg-feasta-canvas px-5 py-4">
              <p className="text-xs leading-5 text-feasta-text-secondary">
                These details come from the provider&apos;s published FEASTA
                profile and can help you decide whether their service fits your
                celebration.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <PackageSection
        packages={packages}
        providerName={provider.businessName}
        marketplaceHref={safeBackHref}
      />

      <section
        className="relative min-w-0 overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white shadow-[0_10px_34px_rgb(43_33_29/0.055)]"
        aria-labelledby="provider-next-step"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-36 size-80 rounded-full bg-primary/[0.07] blur-3xl"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 size-64 rounded-full bg-secondary/70 blur-3xl"
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
                Continue planning
              </p>
            </div>

            <h2
              id="provider-next-step"
              className="mt-5 max-w-2xl text-2xl font-extrabold tracking-[-0.04em] text-foreground sm:text-3xl"
            >
              Found something that fits your celebration?
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-feasta-text-secondary sm:text-base">
              You&apos;ve reviewed {provider.businessName}&apos;s services,
              supported events, service areas, planning details, and published
              packages. Continue exploring FEASTA to compare the options that
              work best for your event.
            </p>

            <div className="mt-5 rounded-[16px] border border-feasta-border-soft bg-feasta-canvas px-4 py-3.5">
              <p className="text-xs leading-5 text-feasta-text-secondary">
                Booking and provider-request actions are not currently available
                from this public provider profile. FEASTA will only present those
                actions through supported booking flows.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col lg:items-stretch">
            <Link
              href={PUBLIC_PACKAGE_MARKETPLACE_PATH}
              className={[
                "group inline-flex min-h-12 items-center justify-center gap-2",
                "rounded-full bg-primary px-5",
                "text-sm font-bold text-primary-foreground",
                "shadow-brand-soft",
                "transition-[transform,background-color,box-shadow]",
                "hover:-translate-y-0.5 hover:bg-primary-hover",
                "hover:shadow-brand",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary focus-visible:ring-offset-2",
                "motion-reduce:transform-none",
              ].join(" ")}
            >
              Explore packages

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </Link>

            <Link
              href={safeBackHref}
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
              <ArrowLeft
                aria-hidden="true"
                className="size-4 transition-transform duration-normal group-hover:-translate-x-0.5 motion-reduce:transform-none"
              />

              {backLabel}
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}

function PackageSection({
  packages,
  providerName,
  marketplaceHref,
}: {
  packages: readonly PublicPackage[];
  providerName: string;
  marketplaceHref: string;
}) {
  return (
    <section
      className="relative min-w-0 overflow-hidden rounded-[26px] border border-feasta-border-soft bg-white p-5 shadow-[0_8px_28px_rgb(43_33_29/0.04)] sm:p-6 lg:p-7"
      aria-labelledby="provider-packages"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 -top-32 size-72 rounded-full bg-primary/[0.04] blur-3xl"
      />

      <div className="relative">
        {/* ================================================================
            SECTION INTRO
           ================================================================ */}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Packages from this provider
            </p>

            <h2
              id="provider-packages"
              className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl"
            >
              Ready-made starting points for your event.
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-feasta-text-secondary sm:text-base sm:leading-7">
              Review published packages from {providerName}, including
              event type, guest capacity, inclusions, and package price.
            </p>
          </div>

          {packages.length > 0 ? (
            <div className="shrink-0 rounded-xl bg-feasta-canvas px-3.5 py-2.5">
              <p className="text-xs font-semibold text-feasta-text-secondary">
                <span className="font-extrabold text-foreground">
                  {packages.length}
                </span>{" "}
                {packages.length === 1
                  ? "published package"
                  : "published packages"}
              </p>
            </div>
          ) : null}
        </div>

        {/* ================================================================
            PACKAGE RESULTS
           ================================================================ */}

        {packages.length > 0 ? (
          <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {packages.map((packageRecord) => (
              <PublicPackageCard
                key={packageRecord.id}
                packageRecord={packageRecord}
                marketplaceHref={marketplaceHref}
                headingLevel="h3"
                showProvider={false}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid min-h-[250px] place-items-center rounded-[20px] border border-dashed border-feasta-border-strong bg-feasta-canvas px-5 py-8 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-12 place-items-center rounded-[14px] bg-secondary text-primary-strong">
                <Sparkles
                  aria-hidden="true"
                  className="size-5"
                />
              </span>

              <h3 className="mt-4 text-lg font-extrabold tracking-[-0.02em] text-foreground">
                No public packages currently listed.
              </h3>

              <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                You can still review {providerName}&apos;s services,
                supported events, service areas, and planning information
                above.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function OptionalEmptyState({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
  className={`rounded-xl border border-dashed border-feasta-border-strong bg-feasta-canvas p-4 text-sm leading-6 text-feasta-text-secondary ${className}`}
    >
      {children}
    </p>
  );
}

function providerCapacity(
  provider: PublicProviderDetail["provider"],
): string | null {
  const minimum = provider.minimumGuests;
  const maximum = provider.maximumGuests;
  if (minimum && maximum && minimum <= maximum) {
    return `${minimum.toLocaleString("en-PH")}\u2013${maximum.toLocaleString("en-PH")} guests`;
  }
  if (maximum) return `Up to ${maximum.toLocaleString("en-PH")} guests`;
  if (minimum) return `From ${minimum.toLocaleString("en-PH")} guests`;
  return null;
}
