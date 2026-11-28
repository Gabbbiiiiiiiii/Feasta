"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function ProviderBookingsError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <section
      className="rounded-card border border-border bg-card"
      aria-label="Provider bookings error"
    >
      <ApplicationErrorState
        kind="load"
        description="Your provider bookings could not be loaded. Please try again."
        onRetry={reset}
      />
    </section>
  );
}
