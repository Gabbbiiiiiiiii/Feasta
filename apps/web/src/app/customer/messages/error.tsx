"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function CustomerMessagesError({reset}: {reset: () => void}) {
  return (
    <section
      aria-label="Customer messages error"
      className="rounded-card border border-border bg-card"
    >
      <ApplicationErrorState
        kind="load"
        description="Your conversations could not be loaded. Please try again."
        onRetry={reset}
      />
    </section>
  );
}
