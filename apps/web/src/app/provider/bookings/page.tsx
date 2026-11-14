import {getProviderBookingPage} from "@/lib/provider/bookings/provider-booking-service";
import type {ProviderBookingFilter} from "@/lib/provider/bookings/provider-booking-types";
import {bookingView} from "@/lib/provider/bookings/provider-booking-projection";
import {dashboardView} from "@/lib/provider/dashboard/provider-dashboard-projection";

import {ProviderBookingsClient} from "./provider-bookings-client";

type ProviderBookingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const operationalFilters: readonly ProviderBookingFilter[] = [
  "waiting_payment",
  "past",
  "all",
  "accepted",
  "confirmed",
  "upcoming",
  "in_progress",
  "completed",
  "cancelled",
];

export default async function ProviderBookingsPage({
  searchParams,
}: ProviderBookingsPageProps) {
  const values = await searchParams;
  const requestedStatus = Array.isArray(values.status)
    ? values.status[0]
    : values.status;
  const status = operationalFilters.includes(
    requestedStatus as ProviderBookingFilter,
  )
    ? bookingView(requestedStatus as ProviderBookingFilter)
    : "upcoming";
  const dashboard = dashboardView(values.dashboard);
  const initialFilters = {
    search: typeof values.search === "string" ? values.search.slice(0, 160) : "",
    dashboard,
    status: dashboard === "payment" ? "waiting_payment" : dashboard === "completed" ? "past" : dashboard === "upcoming" ? "upcoming" : status,
    secondary: requestedStatus === "completed" || dashboard === "completed" ? "completed" : requestedStatus === "cancelled" ? "cancelled" : ["completed", "cancelled", "refunded", "disputed"].includes(String(values.secondary)) ? values.secondary as "completed" | "cancelled" | "refunded" | "disputed" : "all",
    pageSize: 10,
    cursor: null,
  } as const;
  const initialPage = await getProviderBookingPage(initialFilters);

  return (
    <ProviderBookingsClient
      key={`${initialFilters.dashboard ?? "all"}:${status}:${typeof values.request === "string" ? values.request : "list"}`}
      initialRequestId={typeof values.request === "string" ? values.request : undefined}
      initialFilters={initialFilters}
      initialPage={initialPage}
    />
  );
}
