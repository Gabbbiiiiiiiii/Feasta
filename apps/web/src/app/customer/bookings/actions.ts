"use server";

import {
  getCustomerBookingDetails,
  getCustomerBookingResults,
  getCustomerBookingPage,
  revalidateVisibleCustomerBookings,
} from "@/lib/customer/bookings/customer-booking-service";
import type {
  CustomerBookingDetailsResult,
  CustomerBookingFilters,
  CustomerBookingResults,
} from "@/lib/customer/bookings/customer-booking-types";

export async function loadCustomerBookingsAction(
  filters: CustomerBookingFilters,
): Promise<CustomerBookingResults> {
  return getCustomerBookingResults(filters);
}

export async function revalidateCustomerBookingPageAction(
  filters: CustomerBookingFilters,
  statusChanged: boolean,
  bookingIds?: string[],
) {
  if (bookingIds) return revalidateVisibleCustomerBookings(bookingIds, filters, statusChanged);
  return statusChanged ? getCustomerBookingPage(filters) : getCustomerBookingResults(filters);
}

export async function loadCustomerBookingDetailsAction(
  bookingId: string,
): Promise<CustomerBookingDetailsResult> {
  return getCustomerBookingDetails(bookingId);
}
