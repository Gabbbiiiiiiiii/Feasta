"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function CustomerPaymentsError({
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  return (
    <div className="rounded-card border border-border bg-card" role="alert">
      <ApplicationErrorState
        kind="load"
        description="Your payments could not be loaded. Your payment records have not been changed."
        onRetry={reset}
      />
    </div>
  );
}