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
    <div className="mx-auto grid w-full max-w-[90rem] min-w-0 gap-5">
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
        className="pb-4"
      />

      <section
        aria-labelledby="customer-booking-current-state-heading"
        className="rounded-card border border-primary/15 bg-primary-tint p-4 shadow-none sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <CalendarCheck2 aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-primary">
                What happens next
              </p>
              <h2 id="customer-booking-current-state-heading" className="mt-0.5 text-lg font-black tracking-tight">
                Current booking state
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-foreground">
                {bookingNextStep(booking)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={booking.status} label={bookingStatusLabel(booking.status)} />
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)] lg:items-start xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.7fr)]">
        <CustomerBookingDetailContent details={result.details} />
        <div className="min-w-0 lg:sticky lg:top-6">
          <CustomerBookingTimeline timeline={result.timeline} />
        </div>
      </div>
    </div>
  );
}

export {CustomerBookingDetailPage, type CustomerBookingDetailPageProps};
