"use client";

import {ArrowLeft} from "lucide-react";
import Link from "next/link";

import {ApplicationErrorState} from "@/components/feedback/application-states";
import {Button} from "@/components/ui/button";

export default function CustomerBookingDetailError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div className="grid gap-5">
      <Button asChild variant="ghost" size="compact" className="w-fit">
        <Link href="/customer/bookings">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to bookings
        </Link>
      </Button>
      <h1 className="sr-only">Booking details unavailable</h1>
      <section className="rounded-card border border-border bg-card" aria-label="Booking details error">
        <ApplicationErrorState
          kind="load"
          description="Your booking details could not be loaded. Please try again."
          onRetry={reset}
        />
      </section>
    </div>
  );
}
