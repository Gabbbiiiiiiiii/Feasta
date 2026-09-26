import {
  BookingMonitoringClient,
} from "@/components/admin/bookings/booking-monitoring-client";
import {CancellationManagementClient} from "@/components/admin/bookings/cancellation-management-client";
import {
  getAdminBookingPage,
} from "@/lib/admin/bookings/admin-booking-service";
import {getAdminCancellationQueue} from "@/lib/admin/cancellations/admin-cancellation-service";

export default async function AdminBookingsPage() {
  const [initialPage, initialCancellationQueue] = await Promise.all([
    getAdminBookingPage({
      search: "",
      status: "all",
      paymentStatus: "all",
      date: "all",
      sortField: "createdAt",
      sortDirection: "descending",
      pageSize: 10,
      cursor: null,
    }),
    getAdminCancellationQueue(),
  ]);

  return (
    <BookingMonitoringClient
      initialPage={initialPage}
      supplementalContent={(
        <CancellationManagementClient initialQueue={initialCancellationQueue} />
      )}
    />
  );
}
