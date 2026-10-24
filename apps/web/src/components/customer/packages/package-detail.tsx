import {ImageGallery} from "@/components/customer/discovery/image-gallery";
import {ExpandablePackageDescription} from "@/components/customer/packages/expandable-package-description";
import {VisualStyleImageCarousel} from "@/components/customer/packages/visual-style-image-carousel";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  PackageOpen,
  Store,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type {ReactNode} from "react";

import {PackageEventListAction} from "@/components/customer/event-list/package-event-list-action";
import {CustomerAuthLink} from "@/components/customer/layout/customer-auth-provider";
import {PackagePaymentTerms} from "@/components/shared/package-payment-terms";
import {PriceDisplay} from "@/components/shared/price-display";
import {
  CATERING_PACKAGE_SERVICE_TIERS,
  cateringPackageServiceTierDescription,
  cateringPackageServiceTierLabel,
} from "@/lib/catering/catering-service-tier";
import type {
  PublicPackageDetail,
} from "@/lib/customer/discovery/marketplace-types";
import {
  humanizeProviderValue,
  providerServiceTypeLabel,
} from "@/lib/customer/providers/provider-catalog";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import {
  PUBLIC_PACKAGE_MARKETPLACE_PATH,
} from "@/lib/customer/providers/provider-route-policy";
import {
  customerEventContextQuery,
  type CustomerEventContext,
} from "@/lib/customer/planning/event-planning-context";
import {
  serviceCategoryName,
  type ServiceCategoryOption,
} from "@/lib/service-categories/service-category-types";

export function PackageDetail({
  detail,
  eventContext = null,
  serviceCategoryOptions = [],
}: {
  detail: PublicPackageDetail;
  eventContext?: CustomerEventContext | null;
  serviceCategoryOptions?: readonly ServiceCategoryOption[];
}) {
  const {
    packageRecord,
    provider,
  } = detail;

  const guestRange =
    packageGuestRange(packageRecord);

  const packageImages = packageRecord.imageUrls?.length ? packageRecord.imageUrls : packageRecord.imageUrl ? [packageRecord.imageUrl] : [];
  const inclusionGroups = [
    {label: "Food inclusions", items: detail.customization.foods},
    {label: "Decor inclusions", items: detail.customization.decorations},
    {label: "Furniture inclusions", items: detail.customization.furniture},
    {label: "Service inclusions", items: detail.customization.services},
  ].filter((group) => group.items.length > 0);
  const serviceOptions =
    CATERING_PACKAGE_SERVICE_TIERS.flatMap(
      (tier) => {
        const option =
          packageRecord.serviceOptions?.[tier];
        return option ? [{tier, option}] : [];
      },
    );
  const themeOptions =
    packageRecord.themeOptions ?? [];

  const bookingPath = `/customer/packages/${encodeURIComponent(
    packageRecord.id,
  )}/book`;
  const eventContextQuery = customerEventContextQuery(eventContext);
  const bookingHref = eventContextQuery
    ? `${bookingPath}?${eventContextQuery}`
    : bookingPath;

  return (
    <article className="grid min-w-0 gap-5 [overflow-wrap:anywhere] sm:gap-6">
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

      <section className="overflow-hidden rounded-[28px] border border-feasta-border-soft bg-white shadow-[0_14px_42px_rgb(0_75_59/0.065)]">
        <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Event package
            </p>

            <h1 className="mt-2 break-words text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl">
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
              <ExpandablePackageDescription
                description={packageRecord.description}
              />
            ) : null}
          </div>

          <aside aria-label="Price and booking" className="min-w-0 rounded-[20px] border border-feasta-border-soft bg-feasta-canvas p-4 [overflow-wrap:anywhere]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">
              {serviceOptions.length > 0
                ? "Starting from"
                : "Package price"}
            </p>

            <PriceDisplay
              amount={packageRecord.price}
              className="mt-2"
            />

            <div className="mt-3"><PackagePaymentTerms source={packageRecord} /></div>

            <CustomerAuthLink returnTo={bookingHref}
              href={bookingHref}
              className={[
                "group mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2",
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
              Customize & request

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </CustomerAuthLink>
            <PackageEventListAction packageRecord={packageRecord} />
            <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">
              Requesting does not confirm a booking or charge you. The provider
              reviews your request first; payment is available after acceptance.
            </p>
          </aside>
        </div>
        {packageImages.length > 0 ? (
          <div className="border-t border-feasta-divider p-5 sm:p-6">
            <ImageGallery featured label="Package images" images={packageImages.map((url, index) => ({url, title: `${packageRecord.name} - image ${index + 1}`}))} />
          </div>
        ) : (
          <div className="mx-5 mb-5 flex items-center gap-3 rounded-xl bg-feasta-canvas px-4 py-3 text-sm text-feasta-text-tertiary sm:mx-6 sm:mb-6">
            <PackageOpen aria-hidden="true" className="size-5 shrink-0" />
            No package images available
          </div>
        )}
      </section>

      {/* ================================================================
          EVENT FIT
         ================================================================ */}

      {packageRecord.eventType || guestRange ? <section aria-label="Event fit" className="rounded-[24px] border border-feasta-border-soft bg-white p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
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
            />
          ) : null}
        </div>
      </section> : null}

      {serviceOptions.length > 0 ? (
        <section
          aria-labelledby="package-service-options"
          className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(0_75_59/0.035)] sm:p-6"
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Catering service tiers
          </p>
          <h2
            id="package-service-options"
            className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
          >
            Available service levels
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-feasta-text-secondary">
            Choose your service tier when customizing your request.
          </p>

          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
            {serviceOptions.map(({tier, option}) => (
              <article
                key={tier}
                className="min-w-0 rounded-[20px] border border-feasta-border-soft bg-feasta-canvas p-4"
              >
                <h3 className="text-lg font-extrabold text-foreground">
                  {cateringPackageServiceTierLabel(tier)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
                  {cateringPackageServiceTierDescription(tier)}
                </p>
                <PriceDisplay
                  amount={option.price}
                  className="mt-3 border-t border-feasta-divider pt-3"
                />
                {option.includedServices.length > 0 ? (
                  <ul className="mt-4 grid gap-2">
                    {option.includedServices.map((service) => (
                      <li
                        key={service}
                        className="flex items-start gap-2 text-sm text-feasta-text-secondary"
                      >
                        <Check
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-primary"
                        />
                        <span>{service}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {themeOptions.length > 0 ? (
        <section
          aria-labelledby="package-theme-options"
          className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(0_75_59/0.035)] sm:p-6"
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Theme options
          </p>
          <h2
            id="package-theme-options"
            className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
          >
            Explore the available visual styles
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {themeOptions.map((theme) => (
              <article
                key={theme.id}
                className="overflow-hidden rounded-[20px] border border-feasta-border-soft bg-feasta-canvas"
              >
                <VisualStyleImageCarousel
                  imageUrls={theme.imageUrls}
                  styleName={theme.name}
                />
                <div className="p-5">
                  <h3 className="break-words text-base font-extrabold text-foreground">
                    {theme.name}
                  </h3>
                  {theme.description ? (
                    <p className="mt-3 break-words text-sm leading-6 text-feasta-text-secondary">
                      {theme.description}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* ================================================================
          INCLUSIONS
         ================================================================ */}

      {inclusionGroups.length > 0 ? <section
        aria-labelledby="package-inclusions"
        className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(0_75_59/0.035)] sm:p-6"
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

        </div>

        {inclusionGroups.map((group) => <div key={group.label} className="mt-6">
          <h3 className="text-base font-bold">{group.label}</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {group.items.map((inclusion) => (
              <li
                key={inclusion}
                className="flex min-w-0 items-start gap-2 py-1"
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
        </div>)}
      </section> : null}

      {/* ================================================================
          PROVIDER CONTEXT
         ================================================================ */}

      <section
        aria-labelledby="package-provider"
        className="rounded-[24px] border border-feasta-border-soft bg-white p-5 shadow-[0_6px_22px_rgb(0_75_59/0.035)] sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
                  className="mt-1 break-words text-lg font-extrabold text-foreground"
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
              <ul className="mt-3 flex flex-wrap gap-2">
                {provider.categories.map((category) => (
                  <li key={category}>
                    <span className="inline-flex rounded-full border border-primary/10 bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong">
                      {serviceCategoryName(category, serviceCategoryOptions)}
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

    </article>
  );
}

function DetailFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
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
