import {LoadingSkeleton} from "@/components/feedback/loading";

export default function CustomerBookingDetailLoading() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true" aria-label="Loading booking details">
      <h1 className="sr-only">Booking details</h1>
      <LoadingSkeleton className="h-10 w-44" label="Loading back navigation" />
      <header className="grid gap-3 border-b border-border pb-6">
        <LoadingSkeleton className="h-4 w-36" label="Loading page category" />
        <LoadingSkeleton className="h-10 w-full max-w-sm" label="Loading page title" />
        <LoadingSkeleton className="h-5 w-full max-w-lg" label="Loading booking code" />
      </header>
      <LoadingSkeleton className="h-36 w-full rounded-card" label="Loading booking status" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
        <div className="grid gap-6">
          <LoadingSkeleton className="h-64 w-full rounded-card" label="Loading event details" />
          <LoadingSkeleton className="h-48 w-full rounded-card" label="Loading pricing details" />
          <LoadingSkeleton className="h-72 w-full rounded-card" label="Loading provider requests" />
        </div>
        <LoadingSkeleton className="h-96 w-full rounded-card" label="Loading booking timeline" />
      </div>
    </div>
  );
}
