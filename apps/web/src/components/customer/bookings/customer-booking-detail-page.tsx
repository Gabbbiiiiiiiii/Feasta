import {ArrowLeft, CalendarCheck2} from "lucide-react";
import Link from "next/link";

import {
  bookingNextStep,
  bookingStatusLabel,
  boundedText,
} from "@/components/customer/bookings/booking-formatters";
import {CustomerBookingDetailContent} from "@/components/customer/bookings/customer-booking-detail-content";
import {CustomerBookingTimeline} from "@/components/customer/bookings/customer-booking-timeline";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {CustomerBookingDetailPageResult} from "@/lib/customer/bookings/customer-booking-types";

type CustomerBookingDetailPageProps = {
  result: CustomerBookingDetailPageResult;
};

function CustomerBookingDetailPage({result}: CustomerBookingDetailPageProps) {
  const {booking} = result.details;

  return (
    <div className="grid min-w-0 gap-6">
      <Button asChild variant="ghost" size="compact" className="w-fit">
        <Link href="/customer/bookings">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to bookings
        </Link>
      </Button>

      <PageHeading
        eyebrow="Your celebrations"
        title="Booking details"
        description={`Booking ${boundedText(booking.bookingCode, booking.id, 80)}`}
      />

      <section
        aria-labelledby="customer-booking-current-state-heading"
        className="rounded-card border border-primary/15 bg-primary-tint p-5 shadow-card sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <CalendarCheck2 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="customer-booking-current-state-heading" className="text-lg font-black">
                Current booking state
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground">
                {bookingNextStep(booking)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={booking.status} label={bookingStatusLabel(booking.status)} />
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)] xl:items-start">
        <CustomerBookingDetailContent details={result.details} />
        <div className="min-w-0 xl:sticky xl:top-6">
          <CustomerBookingTimeline timeline={result.timeline} />
        </div>
      </div>
    </div>
  );
}

export {CustomerBookingDetailPage, type CustomerBookingDetailPageProps};
