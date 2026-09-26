"use client";

import {
  CalendarDays,
  Eye,
  MapPin,
  Users,
} from "lucide-react";

import {
  BookingStatusBadge,
} from "@/components/admin/bookings/booking-status-badge";
import { Button } from "@/components/ui/button";
import type {
  AdminBooking,
} from "@/lib/admin/bookings/admin-booking-types";

type BookingMobileCardProps = {
  booking: AdminBooking;
  onView: (booking: AdminBooking) => void;
  loading?: boolean;
};

const dateFormatter =
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  });

const currencyFormatter =
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });

function BookingMobileCard({
  booking,
  onView,
  loading = false,
}: BookingMobileCardProps) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-primary-strong">
            {booking.reference}
          </p>

          <h2 className="mt-1 truncate text-lg font-black">
            {booking.customer.fullName}
          </h2>

          <p className="mt-1 truncate text-sm text-muted-foreground">
            {booking.eventType}
          </p>
        </div>

        <BookingStatusBadge
          status={booking.status}
          className="shrink-0"
        />
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          <CalendarDays
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />

          <dt className="sr-only">
            Event date
          </dt>

          <dd className="min-w-0 truncate">
            {formatDate(booking.eventDate)}

            {booking.eventTime
              ? ` · ${booking.eventTime}`
              : ""}
          </dd>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <MapPin
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />

          <dt className="sr-only">
            Venue
          </dt>

          <dd className="min-w-0 truncate">
            {booking.venueName ||
              booking.venueAddress ||
              "Venue not provided"}
          </dd>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <Users
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />

          <dt className="sr-only">
            Guests and providers
          </dt>

          <dd className="min-w-0 truncate">
            {booking.guestCount.toLocaleString(
              "en-PH",
            )}{" "}
            guests ·{" "}
            {booking.providerRequestCount.toLocaleString(
              "en-PH",
            )}{" "}
            providers
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            Estimated total
          </p>

          <p className="mt-1 truncate text-base font-black">
            {currencyFormatter.format(
              booking.totalAmount,
            )}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            Payment
          </p>

          <BookingStatusBadge
            status={booking.paymentStatus}
            className="mt-1"
          />
        </div>
      </div>

      <Button
        variant="secondary"
        size="compact"
        fullWidth
        disabled={loading}
        onClick={() => onView(booking)}
      >
        <Eye
          aria-hidden="true"
          className="size-4"
        />
        View booking
      </Button>
    </article>
  );
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Date not provided";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date not provided"
    : dateFormatter.format(date);
}

export {
  BookingMobileCard,
  type BookingMobileCardProps,
};