import type {
  Metadata,
} from "next";
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

type CustomerPackageBookingPageProps = {
  params: Promise<{
    packageId: string;
  }>;
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

  const {
    packageId,
  } = await params;

  /*
   * Build the trusted customer booking destination ourselves.
   * encodeURIComponent prevents the document ID from altering
   * the route structure.
   */
  const bookingPath =
    `/customer/packages/${encodeURIComponent(
      packageId,
    )}/book`;

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

  const eventServices =
    await getPublicEventServices(
      detail.provider.id,
    );

  return (
    <EventCustomizationExperience
      detail={detail}
      eventServices={
        eventServices.services
      }
    />
  );
}