"use server";

import {
  getAdminBookingDetails,
  getAdminBookingPage,
} from "@/lib/admin/bookings/admin-booking-service";
import {getAdminCancellationQueue} from "@/lib/admin/cancellations/admin-cancellation-service";
import type {AdminCancellationQueue} from "@/lib/admin/cancellations/admin-cancellation-types";
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

export async function loadAdminCancellationQueueAction(): Promise<AdminCancellationQueue> {
  await requireAdmin();
  return getAdminCancellationQueue();
}
