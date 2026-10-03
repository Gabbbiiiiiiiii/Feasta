import {CustomerBookingExperience} from "@/components/customer/bookings/customer-booking-experience";
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

  return <CustomerBookingExperience initialPage={initialPage} />;
}
