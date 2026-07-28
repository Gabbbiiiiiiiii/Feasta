import {
  BookingMonitoringClient,
} from "@/components/admin/bookings/booking-monitoring-client";
import {
  getAdminBookingPage,
} from "@/lib/admin/bookings/admin-booking-service";

export default async function AdminBookingsPage() {
  /*
   * getAdminBookingPage() already calls requireAdmin().
   * Avoid calling requireAdmin() again here so authentication
   * is not unnecessarily checked twice.
   */
  const initialPage =
    await getAdminBookingPage({
      search: "",
      status: "all",
      paymentStatus: "all",
      date: "all",
      sortField: "createdAt",
      sortDirection: "descending",
      pageSize: 10,
      cursor: null,
    });

  return (
    <BookingMonitoringClient
      initialPage={initialPage}
    />
  );
}