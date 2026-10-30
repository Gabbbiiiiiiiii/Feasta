"use server";

import {
  getProviderBooking,
  getProviderBookingPage,
  getProviderBookingTimeline,
} from "@/lib/provider/bookings/provider-booking-service";
import type {
  ProviderBooking,
  ProviderBookingFilters,
  ProviderBookingPage,
  ProviderBookingTimeline,
} from "@/lib/provider/bookings/provider-booking-types";

export async function loadProviderBookingsAction(
  filters: ProviderBookingFilters,
): Promise<ProviderBookingPage> {
  return await getProviderBookingPage(filters);
}

export async function loadProviderBookingAction(
  providerRequestId: string,
): Promise<ProviderBooking> {
  return await getProviderBooking(providerRequestId);
}

export async function loadProviderBookingTimelineAction(
  providerRequestId: string,
): Promise<ProviderBookingTimeline> {
  return await getProviderBookingTimeline(providerRequestId);
}
