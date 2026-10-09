"use server";

import {
  getCustomerBookingDetails,
  getCustomerBookingResults,
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

export async function loadCustomerBookingDetailsAction(
  bookingId: string,
): Promise<CustomerBookingDetailsResult> {
  return getCustomerBookingDetails(bookingId);
}
