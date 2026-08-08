"use server";

import {
  getCustomerBookingDetails,
  getCustomerBookingPage,
} from "@/lib/customer/bookings/customer-booking-service";
import type {
  CustomerBookingDetailsResult,
  CustomerBookingFilters,
  CustomerBookingPage,
} from "@/lib/customer/bookings/customer-booking-types";
import {
  requireCustomer,
} from "@/lib/auth/session";

export async function loadCustomerBookingsAction(
  filters: CustomerBookingFilters,
): Promise<CustomerBookingPage> {
  await requireCustomer();

  return getCustomerBookingPage(filters);
}

export async function loadCustomerBookingDetailsAction(
  bookingId: string,
): Promise<CustomerBookingDetailsResult> {
  await requireCustomer();

  return getCustomerBookingDetails(bookingId);
}