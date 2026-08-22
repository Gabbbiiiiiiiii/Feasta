import {getProviderBookingPage} from "@/lib/provider/bookings/provider-booking-service";
import type {ProviderBookingFilter} from "@/lib/provider/bookings/provider-booking-types";

import {ProviderBookingsClient} from "./provider-bookings-client";

type ProviderBookingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const operationalFilters: readonly ProviderBookingFilter[] = [
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
    ? requestedStatus as ProviderBookingFilter
    : "all";
  const initialFilters = {
    status,
    pageSize: 10,
    cursor: null,
  } as const;
  const initialPage = await getProviderBookingPage(initialFilters);

  return (
    <ProviderBookingsClient
      initialFilters={initialFilters}
      initialPage={initialPage}
    />
  );
}
