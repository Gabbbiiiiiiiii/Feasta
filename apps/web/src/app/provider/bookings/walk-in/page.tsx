import Link from "next/link";
import {ArrowLeft, Plus} from "lucide-react";

import {Button} from "@/components/ui/button";
import {WalkInBookingRecords, type WalkInSearch} from "./walk-in-booking-records";

export default async function WalkInBookingsPage({searchParams}: {searchParams: Promise<WalkInSearch>}) {
  const filters = await searchParams;
  return (
    <div className="grid min-w-0 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          {filters.reference && <Link className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
            href="/provider/bookings/walk-in">
            <ArrowLeft aria-hidden="true" className="size-3.5" /> Back to Walk-ins
          </Link>}
          <h1 className="text-2xl font-semibold">{filters.reference ? "Walk-in booking details" : "Walk-in Bookings"}</h1>
          {!filters.reference && <p className="text-muted-foreground">View and manage bookings arranged outside FEASTA.</p>}
        </div>
        {!filters.reference && <Button asChild size="compact">
          <Link href="/provider/bookings/walk-in/new"><Plus aria-hidden="true" className="size-4" /> New Walk-in</Link>
        </Button>}
      </header>
      <WalkInBookingRecords filters={filters} />
    </div>
  );
}
