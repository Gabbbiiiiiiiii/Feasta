import {dropOffOrderLimit} from "@feasta/shared-types/provider-package-v2";
import {DetailFact, packageGuestRange, packageRequestClassName, PackageBackLink, PackageHero, PackageInclusions, PackageProvider} from "./package-detail-sections";
import {VisualStyleImageCarousel} from "@/components/customer/packages/visual-style-image-carousel";
import {
  ArrowRight,
  CalendarDays,
  Check,
  UsersRound,
} from "lucide-react";


import {SpecialRequestForm} from "./special-request-form";
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
import {formatPackageOccasionLabels} from "@/lib/customer/discovery/package-occasion-labels";
import {
  humanizeProviderValue,
} from "@/lib/customer/providers/provider-catalog";
import {
  PUBLIC_PACKAGE_MARKETPLACE_PATH,
} from "@/lib/customer/providers/provider-route-policy";
import {
  customerBookingPlanningQuery,
  type CustomerPlanningContext,
  type CustomerEventContext,
} from "@/lib/customer/planning/event-planning-context";
import {
  type ServiceCategoryOption,
} from "@/lib/service-categories/service-category-types";

export function PackageDetail({
  detail,
  eventContext = null,
  planningContext = null,
  bestFitReturnHref,
  serviceCategoryOptions = [],
}: {
  detail: PublicPackageDetail;
  eventContext?: CustomerEventContext | null;
  planningContext?: CustomerPlanningContext | null;
  bestFitReturnHref?: string;
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
    ...(packageRecord.foodChoiceGroups ?? []).map(group => ({label: `${group.title}: choose ${group.selectionCount}`, items: group.options.map(option => option.name)})),
    {label: "Equipment inclusions", items: packageRecord.equipmentInclusions ?? []},
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
        return option ? [{tier, option: {...option, includedServices: [...new Set([...option.includedServices, ...(option.decorInclusions ?? []), ...(option.furnitureInclusions ?? []), ...(option.equipmentInclusions ?? [])])]}}] : [];
      },
    );
  const specialRequestPrice = provider.serviceType === "catering" || provider.serviceType === "both"
    ? serviceOptions.find(({tier}) => tier === "drop_off")?.option.price
    : undefined;
  const themeOptions =
    packageRecord.themeOptions ?? [];

  const bookingPath = `/customer/packages/${encodeURIComponent(
    packageRecord.id,
  )}/book`;
  const bookingQuery = new URLSearchParams(customerBookingPlanningQuery(eventContext, planningContext));
  if (bestFitReturnHref) bookingQuery.set("returnTo", bestFitReturnHref);
  const eventContextQuery = bookingQuery.toString();
  const bookingHref = eventContextQuery
    ? `${bookingPath}?${eventContextQuery}`
    : bookingPath;

  return (
    <article className="grid min-w-0 gap-5 [overflow-wrap:anywhere] sm:gap-6">
      {/* ================================================================
          BACK NAVIGATION
         ================================================================ */}

      <PackageBackLink href={bestFitReturnHref ?? PUBLIC_PACKAGE_MARKETPLACE_PATH}
        label={bestFitReturnHref ? "Back to Best Fit" : undefined} />

      {/* ================================================================
          PACKAGE HERO
         ================================================================ */}

      <PackageHero name={packageRecord.name} description={packageRecord.description}
        provider={provider} images={packageImages.map((url, index) => ({url, title: `${packageRecord.name} - image ${index + 1}`}))} booking={<>
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
              className={packageRequestClassName}
            >
              Customize & request

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-normal group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </CustomerAuthLink>
            {specialRequestPrice != null && specialRequestPrice > 0 && <SpecialRequestForm packageId={packageRecord.id} providerId={provider.id} price={specialRequestPrice}
              maxQuantity={dropOffOrderLimit(packageRecord.pricingModel, packageRecord.maxDropOffOrderQuantity)} />}

            <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">
              Requesting does not confirm a booking or charge you. The provider
              reviews your request first; payment is available after acceptance.
            </p>
        </>} />

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
              value={formatPackageOccasionLabels(
                packageRecord,
                humanizeProviderValue,
                {allLabel: "Fits All Occasions"},
              ).join(", ")}
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
                {packageRecord.pricingModel ? <span className="text-xs">{packageRecord.pricingModel === "per_pax" ? "per guest" : "fixed bundle"}</span> : null}
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

      {inclusionGroups.length > 0 ? <PackageInclusions inclusionGroups={inclusionGroups} /> : null}

      {/* ================================================================
          PROVIDER CONTEXT
         ================================================================ */}

      <PackageProvider provider={provider} serviceCategoryOptions={serviceCategoryOptions} />

    </article>
  );
}
