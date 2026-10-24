"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function ProviderMessagesError({reset}: {reset: () => void}) {
  return (
    <section
      className="rounded-card border border-border bg-card"
      aria-label="Provider messages error"
    >
      <ApplicationErrorState
        kind="load"
        description="Your conversations could not be loaded. Please try again."
        onRetry={reset}
      />
    </section>
  );
}
