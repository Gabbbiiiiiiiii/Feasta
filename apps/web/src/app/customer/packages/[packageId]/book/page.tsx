import {normalizeCateringPackageServiceTier} from "@/lib/catering/catering-service-tier";
import {parseProviderDirectoryReturnHref} from "@/lib/customer/providers/provider-query";
import type {
  Metadata,
} from "next";
import {CustomerBookingStanding} from "@/components/customer/bookings/customer-booking-standing";
import {
  notFound,
  redirect,
} from "next/navigation";

import {
  EventCustomizationExperience,
} from "@/components/customer/bookings/event-customization-experience";
import {
  requireCustomer,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {
  getActivePlatformCommissionRateBps,
} from "@/lib/admin/settings/admin-settings-service";
import {
  getPublicEventServices,
} from "@/lib/customer/discovery/event-service-discovery-service";
import {
  getPublicPackageDetail,
} from "@/lib/customer/discovery/package-detail-service";
import {
  readPublishedProviderSetups,
} from "@/lib/provider/provider-setup-gallery-service";
import {
  customerBookingPlanningQuery, parseCustomerPlanningContext,
  parseCustomerEventContext,
} from "@/lib/customer/planning/event-planning-context";

type CustomerPackageBookingPageProps = {
  params: Promise<{
    packageId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: {
    absolute:
      "Plan Your Event | FEASTA",
  },
  description:
    "Customize your event details before reviewing and submitting your FEASTA booking request.",
};

export default async function CustomerPackageBookingPage({
  params,
  searchParams,
}: CustomerPackageBookingPageProps) {
  /*
   * Booking requires:
   * 1. authenticated customer
   * 2. verified email
   *
   * Phone verification is checked immediately below
   * because it is specifically required for booking.
   */
  const account =
    requireVerifiedEmail(
      await requireCustomer(),
    );

  const [{packageId}, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}),
  ]);
  const planningContext = parseCustomerPlanningContext(query);
  const initialEventContext = parseCustomerEventContext(query);
  const editProvider = typeof query.eventListProvider === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(query.eventListProvider) ? query.eventListProvider : undefined;

  /*
   * Build the trusted customer booking destination ourselves.
   * encodeURIComponent prevents the document ID from altering
   * the route structure.
   */
  const bookingBasePath = `/customer/packages/${encodeURIComponent(
    packageId,
  )}/book`;
  const routingQuery = new URLSearchParams(customerBookingPlanningQuery(initialEventContext, planningContext));
  const bestFitReturnHref = query.returnTo ? parseProviderDirectoryReturnHref(query.returnTo) : undefined;
  if (bestFitReturnHref) routingQuery.set("returnTo", bestFitReturnHref);
  const initialServiceTier = normalizeCateringPackageServiceTier(query.serviceTier);
  if (initialServiceTier) routingQuery.set("serviceTier", initialServiceTier);
  if (editProvider) routingQuery.set("eventListProvider", editProvider);
  const eventListReviewIntent = Boolean(editProvider) && query.eventListIntent === "review";
  if (eventListReviewIntent) routingQuery.set("eventListIntent", "review");
  const eventContextQuery = routingQuery.toString();
  const bookingPath = eventContextQuery
    ? `${bookingBasePath}?${eventContextQuery}`
    : bookingBasePath;

  /*
   * Do not let an unverified customer begin a multi-step
   * booking draft that would later need to be discarded
   * while leaving for phone verification.
   *
   * The verification page independently sanitizes returnTo,
   * and the Cloud Function independently verifies the
   * Firebase Auth phone state again during submission.
   */
  if (!account.isPhoneVerified) {
    const search =
      new URLSearchParams({
        returnTo:
          bookingPath,
      });

    redirect(
      `/customer/verify-phone?${search.toString()}`,
    );
  }

  const detail =
    await getPublicPackageDetail(
      packageId,
    );

  if (!detail) {
    notFound();
  }

  const [eventServices, publishedSetups, platformCommissionRateBps] = await Promise.all([
    getPublicEventServices(
      detail.provider.id,
    ),
    readPublishedProviderSetups(detail.provider.id),
    getActivePlatformCommissionRateBps(),
  ]);

  return (
    <div className="grid gap-4">
      <CustomerBookingStanding />
      <EventCustomizationExperience
        key={`${account.uid}:${packageId}:${eventContextQuery}`}
        draftOwner={`customer:${account.uid}`}
        eventListEditProviderId={editProvider}
        eventListReviewIntent={eventListReviewIntent}
        detail={detail}
        eventServices={
          eventServices.services
        }
        initialEventContext={initialEventContext}
        initialPlanningContext={planningContext} bestFitReturnHref={bestFitReturnHref} initialServiceTier={initialServiceTier}
        publishedSetups={publishedSetups}
        platformCommissionRateBps={platformCommissionRateBps}
      />
    </div>
  );
}
