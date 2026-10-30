"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function ProviderRefundPolicyError({reset}: {reset: () => void}) {
  return (
    <section
      className="rounded-card border border-border bg-card"
      aria-label="Provider refund policy error"
    >
      <ApplicationErrorState
        kind="load"
        description="Your refund policy settings could not be loaded. Please try again."
        onRetry={reset}
      />
    </section>
  );
}
