"use client";

import {CalendarDays, Eye, PackageOpen, Users} from "lucide-react";

import {
  bookingNextStep,
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
} from "@/components/customer/bookings/booking-formatters";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {CustomerBooking} from "@/lib/customer/bookings/customer-booking-types";

type CustomerBookingMobileCardProps = {
  booking: CustomerBooking;
  onView: (booking: CustomerBooking) => void;
  loading?: boolean;
};

function CustomerBookingMobileCard({
  booking,
  onView,
  loading = false,
}: CustomerBookingMobileCardProps) {
  return (
    <article className="grid min-w-0 gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-primary-strong">
            {boundedText(booking.bookingCode, "Booking", 80)}
          </p>
          <h2 className="mt-1 truncate text-lg font-black">
            {boundedText(booking.eventType, "Unspecified event", 100)}
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {boundedText(booking.providerName, "Provider unavailable", 100)}
          </p>
        </div>
        <StatusBadge
          status={booking.status}
          label={bookingStatusLabel(booking.status)}
        />
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="flex min-w-0 items-start gap-3">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dt className="sr-only">Event schedule</dt>
          <dd className="min-w-0 break-words">
            {formatBookingDate(booking.eventDate)} · {formatBookingTimeRange(booking.eventTime, booking.eventEndTime)}
          </dd>
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <PackageOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dt className="sr-only">Package</dt>
          <dd className="min-w-0 break-words">
            {boundedText(booking.packageName, "Custom services", 100)}
          </dd>
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <Users aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dt className="sr-only">Guest count</dt>
          <dd>{formatCount(booking.guestCount)} guests</dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Estimated total</p>
          <p className="mt-1 truncate font-black">{formatCurrency(booking.estimatedEventTotal)}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatCurrency(booking.remainingBalance)} remaining
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Payment status</p>
          <StatusBadge status={booking.paymentStatus} />
        </div>
      </div>

      <div className="rounded-card border border-primary/15 bg-primary-tint p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-strong">
          Next step
        </p>
        <p className="mt-1 text-sm leading-5 text-foreground">
          {bookingNextStep(booking)}
        </p>
      </div>

      <Button
        variant="secondary"
        size="compact"
        fullWidth
        disabled={loading}
        onClick={() => onView(booking)}
        aria-label={`View booking ${boundedText(booking.bookingCode, "details", 80)}`}
      >
        <Eye aria-hidden="true" className="size-4" />
        View details
      </Button>
    </article>
  );
}

export {CustomerBookingMobileCard, type CustomerBookingMobileCardProps};
