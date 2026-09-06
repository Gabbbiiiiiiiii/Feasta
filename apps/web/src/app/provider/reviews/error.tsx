"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function ProviderReviewsError({reset}: {reset: () => void}) {
  return (
    <section
      className="rounded-card border border-border bg-card"
      aria-label="Provider reviews error"
    >
      <ApplicationErrorState
        kind="load"
        description="Your customer reviews could not be loaded. Please try again."
        onRetry={reset}
      />
    </section>
  );
}
