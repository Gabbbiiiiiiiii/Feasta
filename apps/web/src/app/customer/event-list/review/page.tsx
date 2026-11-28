import type {Metadata} from "next";

import {CustomerEventListReview} from "@/components/customer/event-list/customer-event-list-review";
import {CustomerBookingStanding} from "@/components/customer/bookings/customer-booking-standing";
import {getActivePlatformCommissionRateBps} from "@/lib/admin/settings/admin-settings-service";

export const metadata: Metadata = {
  title: {
    absolute: "Review Event List | FEASTA",
  },
  description:
    "Review your selected FEASTA providers, packages, menu items, and event services before booking.",
};

export default async function CustomerEventListReviewPage() {
  const platformCommissionRateBps = await getActivePlatformCommissionRateBps();
  return (
    <div className="grid min-w-0 gap-4">
      <CustomerBookingStanding />
      <CustomerEventListReview platformCommissionRateBps={platformCommissionRateBps} />
    </div>
  );
}
