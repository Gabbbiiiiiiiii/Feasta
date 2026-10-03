"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function ProviderAvailabilityError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <section
      className="rounded-card border border-border bg-card"
      aria-label="Provider availability error"
    >
      <ApplicationErrorState
        kind="load"
        description="Your availability settings could not be loaded. Please try again."
        onRetry={reset}
      />
    </section>
  );
}
