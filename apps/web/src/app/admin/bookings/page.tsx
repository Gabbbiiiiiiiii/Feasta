import {
  BookingMonitoringClient,
} from "@/components/admin/bookings/booking-monitoring-client";
import {
  getAdminBookingPage,
} from "@/lib/admin/bookings/admin-booking-service";
import {getAdminCancellationQueue} from "@/lib/admin/cancellations/admin-cancellation-service";

type AdminBookingsPageProps = {
  searchParams?: Promise<{search?: string | string[]}>;
};

export default async function AdminBookingsPage({
  searchParams,
}: AdminBookingsPageProps = {}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const rawSearch = Array.isArray(resolvedParams?.search)
    ? resolvedParams.search[0]
    : resolvedParams?.search;
  const initialSearch = typeof rawSearch === "string" ? rawSearch.trim() : "";

  const [initialPage, initialCancellationQueue] = await Promise.all([
    getAdminBookingPage({
      search: initialSearch,
      status: "all",
      paymentStatus: "all",
      eventDateFrom: "",
      eventDateTo: "",
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
      initialSearch={initialSearch}
      initialEventDateFrom=""
      initialEventDateTo=""
      initialCancellationQueue={initialCancellationQueue}
    />
  );
}
