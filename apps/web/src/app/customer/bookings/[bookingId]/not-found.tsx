import {ArrowLeft, SearchX} from "lucide-react";
import Link from "next/link";

import {Button} from "@/components/ui/button";

export default function CustomerBookingNotFound() {
  return (
    <section
      className="mx-auto grid max-w-2xl justify-items-center gap-5 rounded-card border border-border bg-card px-5 py-12 text-center shadow-card sm:px-8"
      aria-labelledby="customer-booking-not-found-heading"
    >
      <span className="grid size-12 place-items-center rounded-full bg-primary-tint text-primary">
        <SearchX aria-hidden="true" className="size-6" />
      </span>
      <div>
        <h1 id="customer-booking-not-found-heading" className="text-2xl font-black sm:text-3xl">
          Booking not available
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
          This booking could not be found in your account.
        </p>
      </div>
      <Button asChild>
        <Link href="/customer/bookings">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to bookings
        </Link>
      </Button>
    </section>
  );
}
