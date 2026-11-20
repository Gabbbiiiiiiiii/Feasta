import type {Metadata} from "next";
import {notFound} from "next/navigation";

import {CustomerBookingDetailPage} from "@/components/customer/bookings/customer-booking-detail-page";
import {
  getCustomerBookingDetailsWithTimeline,
  isCustomerBookingUnavailableError,
} from "@/lib/customer/bookings/customer-booking-service";
import type {
  CustomerBookingDetailPageResult,
} from "@/lib/customer/bookings/customer-booking-types";

export const metadata: Metadata = {
  title: "Booking Details",
  description: "Review your FEASTA booking and its trusted activity timeline.",
};

export default async function CustomerBookingDetailRoute({
  params,
}: {
  params: Promise<{bookingId: string}>;
}) {
  const {bookingId} = await params;
  const result = await loadCustomerBookingDetailPage(bookingId);

  return <CustomerBookingDetailPage result={result} />;
}

async function loadCustomerBookingDetailPage(
  bookingId: string,
): Promise<CustomerBookingDetailPageResult> {
  try {
    return await getCustomerBookingDetailsWithTimeline(bookingId);
  } catch (error: unknown) {
    if (isCustomerBookingUnavailableError(error)) {
      notFound();
    }

    throw error;
  }
}