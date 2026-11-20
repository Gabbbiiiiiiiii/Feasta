import {CalendarDays, UsersRound} from "lucide-react";
import {notFound} from "next/navigation";

import {DetailFact, packageGuestRange, PackageBackLink, PackageHero, PackageInclusions, PackageProvider, packageRequestClassName} from "@/components/customer/packages/package-detail-sections";
import {MediaPackageBooking} from "@/components/customer/providers/media-package-booking";
import {freelanceServiceInclusions, FreelanceServiceSummary} from "@/components/shared/freelance-service-summary";
import {PriceDisplay} from "@/components/shared/price-display";
import {getOptionalAccountContext} from "@/lib/auth/session";
import {getActiveOccasionOptions} from "@/lib/customer/planning/active-occasion-options-service";
import {humanizeProviderValue} from "@/lib/customer/providers/provider-catalog";
import {getPublicMediaPackage} from "@/lib/customer/providers/provider-detail-service";
import {mediaPackageHref, PUBLIC_PACKAGE_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";
import {getServiceCategoryOptions} from "@/lib/service-categories/service-category-service";

export default async function MediaPackagePage({params}: {
  params: Promise<{providerId: string; serviceId: string}>;
}) {
  const {providerId, serviceId} = await params;
  const detail = await getPublicMediaPackage(providerId, serviceId);
  if (!detail) notFound();

  const {provider, service} = detail;
  const bookable = service.pricingType === "fixed" && service.price !== undefined &&
    service.price > 0 && service.revision !== undefined;
  const [account, occasions, serviceCategoryOptions] = await Promise.all([
    bookable ? getOptionalAccountContext() : null,
    bookable ? getActiveOccasionOptions() : [],
    getServiceCategoryOptions(),
  ]);

  const photos = service.portfolio?.photos ?? [];
  const coverId = service.portfolio?.coverAssetId;
  const images = [...photos.filter(({id}) => id === coverId), ...photos.filter(({id}) => id !== coverId)]
    .map(({url, altText}, index) => ({url, title: altText || `${service.name} - image ${index + 1}`}));
  const inclusions = service.freelanceDetails ? freelanceServiceInclusions(service.freelanceDetails) : [];
  const eventTypes = provider.eventTypes.map(humanizeProviderValue);
  const guestCapacity = packageGuestRange(provider);
  const priceUnit = service.pricingType === "per_hour" ? "per hour"
    : service.pricingType === "per_guest" ? "per guest"
      : service.pricingType === "per_unit" ? "per unit" : undefined;

  return (
    <article className="grid min-w-0 gap-5 [overflow-wrap:anywhere] sm:gap-6">
      <PackageBackLink href={PUBLIC_PACKAGE_MARKETPLACE_PATH} />
      <PackageHero name={service.name} description={service.description} provider={provider} images={images} booking={
        <>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-feasta-text-tertiary">Package price</p>
          {service.price !== undefined ? (
            <div className="mt-2">
              <PriceDisplay amount={service.price} />
              {priceUnit && <p className="text-xs text-feasta-text-secondary">{priceUnit}</p>}
            </div>
          ) : <p className="mt-2 font-bold">{service.pricingType === "custom_quote" ? "Request a quote" : "Price unavailable"}</p>}
          {bookable && service.revision !== undefined && (
            <>
              <p className="mt-3 inline-flex rounded-full border border-feasta-border-soft bg-secondary px-2.5 py-1 text-xs font-semibold">
                Full payment
              </p>
              <MediaPackageBooking providerId={provider.id} serviceId={service.id} serviceName={service.name}
                revision={service.revision} defaultLocation={provider.location?.slice(0, 180) ?? ""}
                guestCapacity={guestCapacity} providerName={provider.businessName} occasions={occasions}
                authenticated={account?.role === "customer" && account.emailVerified}
                returnTo={mediaPackageHref(provider.id, service.id)} requestClassName={packageRequestClassName} />
              <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">
                The provider reviews your request first. Payment is available after acceptance.
              </p>
            </>
          )}
        </>
      } />
      {(eventTypes.length > 0 || guestCapacity) && (
        <section aria-label="Event fit" className="rounded-[24px] border border-feasta-border-soft bg-white p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {eventTypes.length > 0 && <DetailFact icon={<CalendarDays aria-hidden="true" />} label="Event types" value={eventTypes.join(", ")} />}
            {guestCapacity && <DetailFact icon={<UsersRound aria-hidden="true" />} label="Guest capacity" value={guestCapacity} />}
          </div>
        </section>
      )}
      {service.freelanceDetails && (
        <PackageInclusions inclusionGroups={inclusions.length ? [{label: "Service inclusions", items: [...new Set(inclusions)]}] : []}>
          <FreelanceServiceSummary details={service.freelanceDetails} showInclusions={false} />
        </PackageInclusions>
      )}
      <PackageProvider provider={provider} serviceCategoryOptions={serviceCategoryOptions} />
    </article>
  );
}
