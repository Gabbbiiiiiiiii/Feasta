"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function ProviderPaymentsError({reset}: {reset: () => void}) {
  return (
    <section
      className="rounded-card border border-border bg-card"
      aria-label="Provider booking payments error"
    >
      <ApplicationErrorState
        kind="load"
        description="Your booking payment activity could not be loaded. Please try again."
        onRetry={reset}
      />
    </section>
  );
}
