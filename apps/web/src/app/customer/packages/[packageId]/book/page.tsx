import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {
  getPublicEventServices,
} from "@/lib/customer/discovery/event-service-discovery-service";

import {EventCustomizationExperience} from "@/components/customer/bookings/event-customization-experience";
import {
  requireCustomer,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {getPublicPackageDetail} from "@/lib/customer/discovery/package-detail-service";

type CustomerPackageBookingPageProps = {
  params: Promise<{
    packageId: string;
  }>;
};

export const metadata: Metadata = {
  title: {
    absolute: "Plan Your Event | FEASTA",
  },
  description:
    "Customize your event details before reviewing and submitting your FEASTA booking request.",
};

export default async function CustomerPackageBookingPage({
  params,
}: CustomerPackageBookingPageProps) {
  requireVerifiedEmail(
    await requireCustomer(),
  );

  const {packageId} = await params;
  const detail =
    await getPublicPackageDetail(packageId);

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