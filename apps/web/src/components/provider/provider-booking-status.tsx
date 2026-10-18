"use client";
import {StatusBadge} from "@/components/shared/status-badge";
import {useLifecycleNow} from "@/components/shared/booking-lifecycle-status";
import {lifecycleLabel, type LifecycleEvidence} from "@/lib/presentation/booking-lifecycle";
import {scheduledEventWindow} from "@/lib/presentation/scheduled-event-window";
import type {ProviderBooking} from "@/lib/provider/bookings/provider-booking-types";

function evidence(booking: ProviderBooking): LifecycleEvidence {
  return booking.lifecycle ?? {cancellation: booking.refundEligibility?.activeCancellationLocked ?? false,
    reconciliation: booking.refundEligibility?.reconciliationLocked === true || booking.bookingPolicy?.state === "review",
    end: scheduledEventWindow({...booking, eventStartAt: booking.bookingPolicy?.eventAt})?.end ?? null};
}
export function useProviderBookingPresentation(booking: ProviderBooking | null) {
  const data = booking ? evidence(booking) : undefined;
  const now = useLifecycleNow(data?.end);
  const policy = booking?.bookingPolicy;
  if (!booking || !policy) return booking;
  const status = ["completed", "cancelled", "expired"].includes(booking.mainEventStatus) ? booking.mainEventStatus : booking.providerRequestStatus;
  const label = lifecycleLabel(status, data, now);
  if (!label) return booking;
  return {...booking, bookingPolicy: {...policy,
    state: label === "Booking review required" ? "review" as const : "awaiting_completion" as const,
    label, endedReview: label === "Booking review required" && data?.end != null && now != null && now >= data.end,
    readyToComplete: label === "Awaiting completion" && booking.canCompleteEvent !== false}};
}
export function ProviderBookingStatus({booking}: {booking: ProviderBooking; detailed?: boolean}) {
  const data = evidence(booking);
  const now = useLifecycleNow(data.end);
  const status = ["completed", "cancelled", "expired"].includes(booking.mainEventStatus) ? booking.mainEventStatus : booking.providerRequestStatus;
  return <StatusBadge status={status} label={lifecycleLabel(status, data, now) ?? (status === "pending" ? "Pending request" : undefined)} />;
}
