import {CustomerBookingExperience} from "@/components/customer/bookings/customer-booking-experience";
import {CustomerBookingStanding} from "@/components/customer/bookings/customer-booking-standing";
import {getCustomerBookingPage} from "@/lib/customer/bookings/customer-booking-service";

export default async function CustomerBookingsPage() {
  // The service owns the customer authorization boundary and scopes every read
  // to the authenticated customer's uid.
  const initialPage = await getCustomerBookingPage({
    search: "",
    status: "all",
    pageSize: 10,
    cursor: null,
  });

  return (
    <div className="grid min-w-0 gap-4">
      <CustomerBookingStanding />
      <CustomerBookingExperience initialPage={initialPage} />
    </div>
  );
}
