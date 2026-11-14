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
  getPublicEventServices,
} from "@/lib/customer/discovery/event-service-discovery-service";
import {
  getPublicPackageDetail,
} from "@/lib/customer/discovery/package-detail-service";
import {
  readPublishedProviderSetups,
} from "@/lib/provider/provider-setup-gallery-service";
import {
  customerEventContextQuery,
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
  const routingQuery = new URLSearchParams(customerEventContextQuery(initialEventContext));
  if (editProvider) routingQuery.set("eventListProvider", editProvider);
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

  const [eventServices, publishedSetups] = await Promise.all([
    getPublicEventServices(
      detail.provider.id,
    ),
    readPublishedProviderSetups(detail.provider.id),
  ]);

  return (
    <div className="grid gap-4">
      <CustomerBookingStanding />
      <EventCustomizationExperience
        key={`${account.uid}:${packageId}:${eventContextQuery}`}
        draftOwner={`customer:${account.uid}`}
        eventListEditProviderId={editProvider}
        detail={detail}
        eventServices={
          eventServices.services
        }
        initialEventContext={initialEventContext}
        publishedSetups={publishedSetups}
      />
    </div>
  );
}
