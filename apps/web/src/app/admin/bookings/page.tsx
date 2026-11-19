import {
  BookingMonitoringClient,
} from "@/components/admin/bookings/booking-monitoring-client";
import {
  getAdminBookingPage,
} from "@/lib/admin/bookings/admin-booking-service";
import {getAdminCancellationQueue} from "@/lib/admin/cancellations/admin-cancellation-service";
import {todayPhilippineDateKey} from "@/lib/dates/philippine-date";

export default async function AdminBookingsPage() {
  const defaultEventDate = todayPhilippineDateKey();
  const [initialPage, initialCancellationQueue] = await Promise.all([
    getAdminBookingPage({
      search: "",
      status: "all",
      paymentStatus: "all",
      eventDateFrom: defaultEventDate,
      eventDateTo: defaultEventDate,
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
      initialEventDateFrom={defaultEventDate}
      initialEventDateTo={defaultEventDate}
      initialCancellationQueue={initialCancellationQueue}
    />
  );
}
