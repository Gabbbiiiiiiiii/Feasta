"use client";
import {StatusBadge} from "@/components/shared/status-badge";
import {useLifecycleNow} from "@/components/shared/booking-lifecycle-status";
import {AWAITING_COMPLETION_LABEL, BOOKING_REVIEW_MESSAGE, COMPLETION_ON_HOLD_LABEL, ENDED_REVIEW_MESSAGE, lifecycleLabel, type LifecycleEvidence} from "@/lib/presentation/booking-lifecycle";
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
  const awaiting = label === AWAITING_COMPLETION_LABEL;
  if (awaiting && (policy.state === "review" || policy.state === "hold")) return booking;
  const completionHold = label === COMPLETION_ON_HOLD_LABEL;
  const endedReview = !awaiting && data?.end != null && now != null && now >= data.end;
  return {...booking, bookingPolicy: {...policy,
    state: awaiting ? "awaiting_completion" as const : "review" as const,
    label, completionHold, endedReview, explanation: endedReview ? completionHold ? ENDED_REVIEW_MESSAGE : BOOKING_REVIEW_MESSAGE : undefined,
    readyToComplete: awaiting && booking.canCompleteEvent !== false}};
}
export function ProviderBookingStatus({booking}: {booking: ProviderBooking; detailed?: boolean}) {
  const data = evidence(booking);
  const now = useLifecycleNow(data.end);
  const status = ["completed", "cancelled", "expired"].includes(booking.mainEventStatus) ? booking.mainEventStatus : booking.providerRequestStatus;
  return <StatusBadge status={status} label={lifecycleLabel(status, data, now) ?? (status === "pending" ? "Pending request" : undefined)} />;
}
