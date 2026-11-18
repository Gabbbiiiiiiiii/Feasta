import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {Suspense} from "react";
import {listWalkInOffers, readWalkInProvider} from "@/lib/provider/bookings/walk-in-booking-service";
import {currentWalkInAgreement} from "@/lib/provider/bookings/walk-in-validation";
import {WalkInForm} from "../walk-in-form";

async function WalkInFormWithCatalog() {
  const catalog = await listWalkInOffers().then(
    (packages) => ({packages, catalogUnavailable: false}),
    () => ({packages: [], catalogUnavailable: true}),
  );
  return <WalkInForm {...catalog} agreementDefaults={currentWalkInAgreement()} />;
}

export default async function NewWalkInPage() {
  await readWalkInProvider();
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <header className="grid gap-1">
        <Link
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href="/provider/bookings/walk-in"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Back to Walk-ins
        </Link>
        <h1 className="text-2xl font-semibold">Add Walk-In Booking</h1>
      </header>
      <Suspense fallback={<p role="status" className="rounded-lg border p-5">Loading published packages and services…</p>}>
        <WalkInFormWithCatalog />
      </Suspense>
    </div>
  );
}
