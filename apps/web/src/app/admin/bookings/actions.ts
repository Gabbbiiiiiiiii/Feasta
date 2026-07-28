"use server";

import {
  getAdminBookingDetails,
  getAdminBookingPage,
} from "@/lib/admin/bookings/admin-booking-service";
import type {
  AdminBookingDetailsResult,
  AdminBookingFilters,
  AdminBookingPage,
} from "@/lib/admin/bookings/admin-booking-types";
import { requireAdmin } from "@/lib/auth/session";

export async function loadAdminBookingsAction(
  filters: AdminBookingFilters,
): Promise<AdminBookingPage> {
  await requireAdmin();

  return getAdminBookingPage(filters);
}

export async function loadAdminBookingDetailsAction(
  bookingId: string,
): Promise<AdminBookingDetailsResult> {
  await requireAdmin();

  return getAdminBookingDetails(bookingId);
}
